import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";
import { fetchStockNews, getStockSymbols, runFullScanWithCache, type ScanResult } from "@/lib/scanner-service";

interface GapperStockItem {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  gapPercent: number;
  volumeRatio: number;
  rsRating: number;
  momentum3M: number;
  catalystScore: number;
  earningsDate?: string;
  flags: {
    earningsRelated: boolean;
    guidanceRelated: boolean;
  };
}

interface GapperHeadlineItem {
  symbol: string;
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
  tags: string[];
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((item) => fn(item)));
    results.push(...batchResults);
  }
  return results;
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const stocksLimit = parsePositiveInt(params.get("stocks"), 18, 40);
  const newsPerStock = parsePositiveInt(params.get("news"), 4, 8);
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
        earningsWinners: [],
        topGappers: [],
        headlines: [],
        tagCounts: {},
      });
    }

    if (!scanData || scanData.stocks.length === 0 || forceRefresh) {
      const seedSymbols = await getStockSymbols(forceRefresh, 350);
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

    const candidates = scanData.stocks
      .filter((s) => {
        const gap = s.gapPercent ?? 0;
        const chg = s.changePercent ?? 0;
        const vol = s.volumeRatio ?? 0;
        return gap >= 3 || chg >= 6 || vol >= 2;
      })
      .sort((a, b) => {
        const scoreA =
          (a.gapPercent ?? 0) * 4 +
          (a.changePercent ?? 0) * 2 +
          Math.min(a.volumeRatio ?? 0, 6) * 10 +
          ((a.rsRating ?? 50) - 50) * 0.3 +
          Math.max(0, a.momentum3M ?? 0) * 0.2;
        const scoreB =
          (b.gapPercent ?? 0) * 4 +
          (b.changePercent ?? 0) * 2 +
          Math.min(b.volumeRatio ?? 0, 6) * 10 +
          ((b.rsRating ?? 50) - 50) * 0.3 +
          Math.max(0, b.momentum3M ?? 0) * 0.2;
        return scoreB - scoreA;
      })
      .slice(0, stocksLimit);

    const newsBySymbol = await mapWithConcurrency(candidates, 6, async (stock) => {
      const items = await fetchStockNews(stock.symbol, { todayOnly: true, maxItems: newsPerStock });
      return { symbol: stock.symbol, items };
    });

    const headlines: GapperHeadlineItem[] = [];
    const tagCounts: Record<string, number> = {};
    const perSymbolTags = new Map<string, Set<string>>();

    for (const entry of newsBySymbol) {
      const tags = new Set<string>();
      for (const item of entry.items) {
        const itemTags = item.tags || [];
        for (const tag of itemTags) {
          tags.add(tag);
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      }
      perSymbolTags.set(entry.symbol, tags);

      const top = entry.items[0];
      if (top) {
        headlines.push({
          symbol: entry.symbol,
          title: top.title,
          link: top.link,
          publisher: top.publisher,
          publishedAt: new Date(top.publishedAt).toISOString(),
          tags: top.tags || [],
        });
      }
    }

    const stocks: GapperStockItem[] = candidates.map((stock) => {
      const tags = perSymbolTags.get(stock.symbol) || new Set<string>();
      const earningsRelated = tags.has("Earnings");
      const guidanceRelated = tags.has("Guidance");

      return {
        symbol: stock.symbol,
        name: stock.name,
        price: stock.price,
        changePercent: stock.changePercent,
        gapPercent: stock.gapPercent,
        volumeRatio: stock.volumeRatio,
        rsRating: stock.rsRating,
        momentum3M: stock.momentum3M,
        catalystScore: stock.catalystScore,
        earningsDate: stock.earningsDate,
        flags: {
          earningsRelated,
          guidanceRelated,
        },
      };
    });

    const earningsWinners = [...stocks]
      .filter((s) => s.flags.earningsRelated || s.flags.guidanceRelated)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10);

    const topGappers = [...stocks]
      .sort((a, b) => {
        if (b.gapPercent !== a.gapPercent) return b.gapPercent - a.gapPercent;
        return b.volumeRatio - a.volumeRatio;
      })
      .slice(0, 12);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source,
      scannedCount: scanData.totalScanned,
      earningsWinners,
      topGappers,
      headlines,
      tagCounts,
    });
  } catch (error) {
    console.error("Gappers feed API error:", error);
    return NextResponse.json({ error: "Failed to build gappers feed" }, { status: 500 });
  }
}
