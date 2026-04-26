import { NextRequest, NextResponse } from "next/server";
import { fetchOptionsOverview } from "@/lib/options-service";
import { symbolRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";
import type { ScanResult } from "@/lib/scanner-service";
import type { OptionsOverview } from "@/types/options";

async function buildScannerFallbackOptions(symbol: string): Promise<OptionsOverview | null> {
  const normalizedSymbol = symbol.toUpperCase();
  const [cachedFull, cachedSeeded] = await Promise.all([
    getCachedScannerResults<ScanResult>(),
    getCachedSeededScannerResults<ScanResult>(),
  ]);

  const stock =
    cachedFull?.stocks.find((entry) => entry.symbol?.toUpperCase() === normalizedSymbol) ??
    cachedSeeded?.stocks.find((entry) => entry.symbol?.toUpperCase() === normalizedSymbol);

  if (!stock) return null;

  return {
    symbol: normalizedSymbol,
    source: "scanner-fallback",
    fetchedAt: new Date().toISOString(),
    underlyingPrice: typeof stock.price === "number" && Number.isFinite(stock.price) ? stock.price : 0,
    currency: "USD",
    availableExpiries: 0,
    trackedExpiries: 0,
    horizonDays: 0,
    nearestExpiry: null,
    bias: "balanced",
    summary: {
      totalCallOi: 0,
      totalPutOi: 0,
      totalCallVolume: 0,
      totalPutVolume: 0,
      putCallOiRatio: null,
      putCallVolumeRatio: null,
      callWall: null,
      putWall: null,
      maxPain: null,
      atmIvPct: null,
      skewPct: null,
      netGexEstimate: null,
      grossGexEstimate: null,
      expectedMoveUsd: null,
      expectedMovePct: null,
      gammaFlipZone: null,
      callOiConcentrationPct: null,
      putOiConcentrationPct: null,
    },
    expiries: [],
    strikeLevels: [],
    hotContracts: [],
    sourceLinks: [
      { label: "Yahoo Options", url: `https://finance.yahoo.com/quote/${normalizedSymbol}/options` },
      { label: "OCC Volume Query", url: "https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query" },
    ],
    disclaimer:
      "Options-Upstream aktuell nicht verfuegbar. Die App zeigt deshalb nur den Basiswert aus dem Scanner-Cache. Fuer volle Walls-, OI- und GEX-Daten braucht ihr einen erfolgreichen Yahoo/OpenBB-Abruf plus Cache.",
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = symbolRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { symbol } = await params;
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const data = await fetchOptionsOverview(symbol, { forceRefresh });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Options API error:", error);
    const fallback = await buildScannerFallbackOptions(symbol);
    if (fallback) {
      return NextResponse.json(fallback);
    }
    const message =
      error instanceof Error && /429|crumb/i.test(error.message)
        ? "Yahoo Options ist aktuell rate-limited. Fuer stabile Optionsdaten bitte Proxy/Caching fuer Yahoo aktivieren."
        : "Failed to fetch options positioning";
    return NextResponse.json(
      { error: message },
      { status: 503 }
    );
  }
}
