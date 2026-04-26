import { NextRequest, NextResponse } from "next/server";
import {
  runFullScanWithCache,
  fetchStockNews,
  getScannerCacheStats,
  getStockSymbols,
  refreshStockList,
  type ScanResult,
  type StockData,
} from "@/lib/scanner-service";
import { filterByScanType } from "@/lib/scanner-filters";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";

const DEFAULT_SCANNER_LIMIT = 350;

function parsePositiveInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasNonZeroPerformance(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function hasPerformanceData(stock: StockData): boolean {
  return [
    stock.momentum1M,
    stock.momentum3M,
    stock.momentum6M,
    stock.momentum1Y,
  ].some(hasNonZeroPerformance);
}

async function getBestCachedScanResult(): Promise<(ScanResult & { fromCache: true; snapshotSource: "full" | "seeded" }) | null> {
  const [fullCached, seededCached] = await Promise.all([
    getCachedScannerResults<ScanResult>(),
    getCachedSeededScannerResults<ScanResult>(),
  ]);

  const candidates = [
    fullCached?.stocks?.length ? { result: fullCached, source: "full" as const } : null,
    seededCached?.stocks?.length ? { result: seededCached, source: "seeded" as const } : null,
  ].filter((candidate): candidate is { result: ScanResult; source: "full" | "seeded" } => Boolean(candidate));

  const withPerformance = candidates.filter((candidate) => candidate.result.stocks.some(hasPerformanceData));
  const pool = withPerformance.length > 0 ? withPerformance : candidates;
  if (pool.length === 0) return null;

  pool.sort((left, right) => right.result.stocks.length - left.result.stocks.length);
  return {
    ...pool[0].result,
    fromCache: true,
    snapshotSource: pool[0].source,
  };
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type") || "all";
  const period = searchParams.get("period");
  const forceRefresh = searchParams.get("refresh") === "true";
  const statsOnly = searchParams.get("stats") === "true";
  const limit = parsePositiveInt(searchParams.get("limit"));

  try {
    // Return only cache stats if requested
    if (statsOnly) {
      const stats = await getScannerCacheStats();
      return NextResponse.json(stats);
    }

    let scanResult: (ScanResult & {
      fromCache: boolean;
      cacheStats?: { redisAvailable: boolean; memoryCacheSize: number };
      snapshotSource?: "full" | "seeded";
    }) | null = !forceRefresh ? await getBestCachedScanResult() : null;

    if (!scanResult) {
      const symbols = await getStockSymbols(forceRefresh, limit ?? DEFAULT_SCANNER_LIMIT);
      scanResult = await runFullScanWithCache({
        useCache: true,
        forceRefresh,
        symbols,
        cacheKey: "seeded",
      });
    }

    // Map legacy scan types to new filter types
    let filterType = type;
    if (type === "momentum" && period) {
      filterType = period; // "1m", "3m", "6m"
    }

    const filteredStocks = filterByScanType(scanResult.stocks, filterType);
    const responseStocks = limit ? filteredStocks.slice(0, limit) : filteredStocks;

    return NextResponse.json({
      stocks: responseStocks,
      scanTime: scanResult.scanTime,
      totalScanned: scanResult.totalScanned,
      fromCache: scanResult.fromCache,
      fromSnapshot: Boolean(scanResult.fromCache),
      snapshotSource: "snapshotSource" in scanResult ? scanResult.snapshotSource : undefined,
      cacheStats: scanResult.cacheStats,
    });
  } catch (error) {
    console.error("Scanner API error:", error);
    return NextResponse.json(
      { error: "Failed to run scan" },
      { status: 500 }
    );
  }
}

// POST endpoint for cache management and news
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, action } = body;

    if (action) {
      switch (action) {
        case "refresh-stock-list":
          const symbols = await refreshStockList();
          return NextResponse.json({
            success: true,
            message: `Refreshed stock list with ${symbols.length} symbols`
          });

        case "get-stats":
          const stats = await getScannerCacheStats();
          return NextResponse.json(stats);

        default:
          return NextResponse.json(
            { error: "Unknown action" },
            { status: 400 }
          );
      }
    }

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }

    const news = await fetchStockNews(symbol);
    return NextResponse.json({ news });
  } catch (error) {
    console.error("Scanner POST API error:", error);
    return NextResponse.json(
      { error: "Failed to process action" },
      { status: 500 }
    );
  }
}
