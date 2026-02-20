import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";
import { getStockSymbols, runFullScanWithCache, type ScanResult } from "@/lib/scanner-service";
import type { StockData } from "@/types/scanner";

type AlertType = "Breakout" | "RS" | "Volumen" | "Gap Up";

interface AlertItem {
  symbol: string;
  name: string;
  type: AlertType;
  score: number;
  message: string;
  price: number;
  changePercent: number;
  gapPercent: number;
  volumeRatio: number;
  rsRating: number;
  sector?: string;
  industry?: string;
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function computeBreakoutAlert(stock: StockData): AlertItem | null {
  const pivotHigh = stock.prior20DayHigh ?? 0;
  const lastClose = stock.price ?? 0;

  if (!Number.isFinite(pivotHigh) || pivotHigh <= 0) return null;
  if (!Number.isFinite(lastClose) || lastClose <= 0) return null;

  const nearPivot = lastClose >= pivotHigh * 0.995; // within 0.5% (or above)
  const aboveTrend = (stock.sma50 ?? 0) > 0 ? lastClose > (stock.sma50 ?? 0) : false;
  const volOk = (stock.volumeRatio ?? 0) >= 1.5;
  const rsOk = (stock.rsRating ?? 0) >= 70;

  if (!nearPivot || !aboveTrend || !volOk || !rsOk) return null;

  const breakoutPct = ((lastClose / pivotHigh) - 1) * 100;
  const score =
    60 +
    clamp((stock.volumeRatio ?? 0), 0, 6) * 6 +
    clamp((stock.rsRating ?? 50) - 70, 0, 29) * 0.8 +
    clamp(breakoutPct, -1, 3) * 8;

  return {
    symbol: stock.symbol,
    name: stock.name,
    type: "Breakout",
    score: Math.round(clamp(score, 1, 100)),
    message: `Breakout: nahe 20T-Hoch, Vol ${stock.volumeRatio.toFixed(1)}x, RS ${stock.rsRating}`,
    price: stock.price,
    changePercent: stock.changePercent,
    gapPercent: stock.gapPercent,
    volumeRatio: stock.volumeRatio,
    rsRating: stock.rsRating,
    sector: stock.sector,
    industry: stock.industry,
  };
}

function computeRSAlert(stock: StockData): AlertItem | null {
  const rs = stock.rsRating ?? 0;
  if (!Number.isFinite(rs) || rs < 90) return null;
  return {
    symbol: stock.symbol,
    name: stock.name,
    type: "RS",
    score: Math.round(clamp(rs, 1, 100)),
    message: `RS-Staerke: ${rs}`,
    price: stock.price,
    changePercent: stock.changePercent,
    gapPercent: stock.gapPercent,
    volumeRatio: stock.volumeRatio,
    rsRating: stock.rsRating,
    sector: stock.sector,
    industry: stock.industry,
  };
}

function computeVolumeAlert(stock: StockData): AlertItem | null {
  const vr = stock.volumeRatio ?? 0;
  const chg = stock.changePercent ?? 0;
  if (!Number.isFinite(vr) || vr < 3) return null;
  if (!Number.isFinite(chg) || chg < 1) return null;

  const score = clamp(vr * 20 + Math.max(0, chg) * 2, 1, 100);
  return {
    symbol: stock.symbol,
    name: stock.name,
    type: "Volumen",
    score: Math.round(score),
    message: `Volumen-Spike: ${vr.toFixed(1)}x, ${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`,
    price: stock.price,
    changePercent: stock.changePercent,
    gapPercent: stock.gapPercent,
    volumeRatio: stock.volumeRatio,
    rsRating: stock.rsRating,
    sector: stock.sector,
    industry: stock.industry,
  };
}

function computeGapAlert(stock: StockData): AlertItem | null {
  const gap = stock.gapPercent ?? 0;
  const vr = stock.volumeRatio ?? 0;
  if (!Number.isFinite(gap) || gap < 5) return null;
  if (!Number.isFinite(vr) || vr < 1.5) return null;

  const score = clamp(gap * 6 + vr * 10, 1, 100);
  return {
    symbol: stock.symbol,
    name: stock.name,
    type: "Gap Up",
    score: Math.round(score),
    message: `Gap Up: ${gap.toFixed(1)}%, Vol ${vr.toFixed(1)}x`,
    price: stock.price,
    changePercent: stock.changePercent,
    gapPercent: stock.gapPercent,
    volumeRatio: stock.volumeRatio,
    rsRating: stock.rsRating,
    sector: stock.sector,
    industry: stock.industry,
  };
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const limit = parsePositiveInt(params.get("limit"), 18, 60);
  const forceRefresh = params.get("refresh") === "true";
  const cacheOnly = params.get("cacheOnly") === "true";

  try {
    let scanData: ScanResult | null = null;
    let source: "cache" | "cache-seeded" | "seeded-scan" | "fresh-scan" = "cache";

    if (!forceRefresh) {
      scanData = await getCachedScannerResults<ScanResult>();
      if (!scanData || scanData.stocks.length === 0) {
        scanData = await getCachedSeededScannerResults<ScanResult>();
        if (scanData && scanData.stocks.length > 0) {
          source = "cache-seeded";
        }
      }
    }

    if (cacheOnly && (!scanData || scanData.stocks.length === 0)) {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        source: "cache-miss",
        scannedCount: 0,
        alerts: [],
      });
    }

    if (!scanData || scanData.stocks.length === 0 || forceRefresh) {
      const seedSymbols = await getStockSymbols(forceRefresh, 450);
      const scanResult = await runFullScanWithCache({
        useCache: true,
        forceRefresh: true,
        symbols: seedSymbols,
        cacheKey: "seeded",
      });
      scanData = {
        stocks: scanResult.stocks,
        scanTime: scanResult.scanTime,
        totalScanned: scanResult.totalScanned,
      };
      source = forceRefresh ? "fresh-scan" : "seeded-scan";
    }

    const events: AlertItem[] = [];
    for (const stock of scanData.stocks) {
      const rs = computeRSAlert(stock);
      if (rs) events.push(rs);

      const vol = computeVolumeAlert(stock);
      if (vol) events.push(vol);

      const gap = computeGapAlert(stock);
      if (gap) events.push(gap);

      const br = computeBreakoutAlert(stock);
      if (br) events.push(br);
    }

    // Keep best event per symbol to avoid spam
    const bestBySymbol = new Map<string, AlertItem>();
    for (const event of events) {
      const current = bestBySymbol.get(event.symbol);
      if (!current || event.score > current.score) {
        bestBySymbol.set(event.symbol, event);
      }
    }

    const alerts = Array.from(bestBySymbol.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source,
      scannedCount: scanData.totalScanned,
      alerts,
    });
  } catch (error) {
    console.error("Alerts feed API error:", error);
    return NextResponse.json({ error: "Failed to build alerts feed" }, { status: 500 });
  }
}
