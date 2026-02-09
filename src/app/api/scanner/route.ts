import { NextRequest, NextResponse } from "next/server";
import {
  runFullScanWithCache,
  fetchStockNews,
  getScannerCacheStats,
  refreshStockList
} from "@/lib/scanner-service";
import { filterByScanType } from "@/lib/scanner-filters";
import { scannerRateLimit } from "@/lib/rate-limiter";

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

  try {
    // Return only cache stats if requested
    if (statsOnly) {
      const stats = await getScannerCacheStats();
      return NextResponse.json(stats);
    }

    // Run scan with caching (uses Redis if available, memory cache as fallback)
    const scanResult = await runFullScanWithCache({
      useCache: !forceRefresh,
      forceRefresh: forceRefresh,
    });

    // Map legacy scan types to new filter types
    let filterType = type;
    if (type === "momentum" && period) {
      filterType = period; // "1m", "3m", "6m"
    }

    const filteredStocks = filterByScanType(scanResult.stocks, filterType);

    return NextResponse.json({
      stocks: filteredStocks,
      scanTime: scanResult.scanTime,
      totalScanned: scanResult.totalScanned,
      fromCache: scanResult.fromCache,
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
