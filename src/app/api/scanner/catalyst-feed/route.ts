import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";
import { runFullScanWithCache, fetchStockNews, getStockSymbols, type ScanResult } from "@/lib/scanner-service";
import { filterByScanType } from "@/lib/scanner-filters";

interface FeedStockItem {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  gapPercent: number;
  rsRating: number;
  setupScore: number;
  catalystScore: number;
  catalystSignals: string[];
  todayNewsCount: number;
}

interface FeedNewsItem {
  symbol: string;
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
  tags: string[];
  catalystScore: number;
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const stocksLimit = parsePositiveInt(params.get("stocks"), 12, 30);
  const newsLimit = parsePositiveInt(params.get("news"), 20, 60);
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
        stocks: [],
        news: [],
        newsTagCounts: {},
      });
    }

    if (!scanData || scanData.stocks.length === 0 || forceRefresh) {
      const seedSymbols = await getStockSymbols(forceRefresh, 250);
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

    const catalystStocksRaw = filterByScanType(scanData.stocks, "catalyst");
    const fallbackStocksRaw = [...scanData.stocks].sort((a, b) => b.catalystScore - a.catalystScore);
    const selectedBase = (catalystStocksRaw.length > 0 ? catalystStocksRaw : fallbackStocksRaw).slice(0, stocksLimit);

    const stocks: FeedStockItem[] = selectedBase.map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      price: stock.price,
      changePercent: stock.changePercent,
      volumeRatio: stock.volumeRatio,
      gapPercent: stock.gapPercent,
      rsRating: stock.rsRating,
      setupScore: stock.setupScore,
      catalystScore: stock.catalystScore,
      catalystSignals: stock.catalystSignals || [],
      todayNewsCount: stock.todayNewsCount ?? 0,
    }));

    const newsByStock = await Promise.all(
      stocks.slice(0, 8).map(async (stock) => {
        const items = await fetchStockNews(stock.symbol, { todayOnly: true, maxItems: 4 });
        return items.map((item) => ({
          symbol: stock.symbol,
          title: item.title,
          link: item.link,
          publisher: item.publisher,
          publishedAt: new Date(item.publishedAt).toISOString(),
          tags: item.tags || [],
          catalystScore: stock.catalystScore,
        }));
      })
    );

    const dedupLinks = new Set<string>();
    const news: FeedNewsItem[] = newsByStock
      .flat()
      .filter((item) => {
        if (!item.link) return false;
        if (dedupLinks.has(item.link)) return false;
        dedupLinks.add(item.link);
        return true;
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, newsLimit);

    const newsTagCounts = news.reduce<Record<string, number>>((acc, item) => {
      for (const tag of item.tags) {
        acc[tag] = (acc[tag] || 0) + 1;
      }
      return acc;
    }, {});

    const stocksWithNewsCount = stocks.map((stock) => ({
      ...stock,
      todayNewsCount: news.filter((item) => item.symbol === stock.symbol).length,
    }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source,
      scannedCount: scanData.totalScanned,
      stocks: stocksWithNewsCount,
      news,
      newsTagCounts,
    });
  } catch (error) {
    console.error("Catalyst feed API error:", error);
    return NextResponse.json({ error: "Failed to build catalyst feed" }, { status: 500 });
  }
}
