import { getApprovedDataSources } from "@/lib/data-sources";
import { buildGroupRankingRows } from "@/lib/group-rankings";
import { fetchMarketSeasonalityOverview } from "@/lib/market-seasonality-service";
import { fetchOptionsOverview } from "@/lib/options-service";
import { CACHE_TTL, getCachedScannerResults, getCachedSeededScannerResults, smartCacheSet } from "@/lib/redis-cache";
import { getStockSymbols, runFullScanWithCache, type ScanResult } from "@/lib/scanner-service";
import { getSecReferenceSnapshot } from "@/lib/sec-reference-service";
import { fetchSeasonalityOverview } from "@/lib/seasonality-service";
import { getSectorRotation } from "@/lib/sector-rotation";
import type { GroupRankingResponse } from "@/types/group-rankings";

const GROUP_RANKINGS_CACHE_KEY = "scanner:group-rankings:v4";
const GROUP_RANKINGS_FRESH_TTL_SECONDS = 15 * 60;
const GROUP_RANKINGS_STALE_TTL_SECONDS = 24 * 60 * 60;
const SEEDED_LIMIT = 350;
const FULL_LIMIT = 1200;

export type BackgroundRefreshScope = "core" | "full";

function isFreshScanResult(scanResult: ScanResult | null | undefined): scanResult is ScanResult {
  if (!scanResult?.stocks?.length || !scanResult.scanTime) return false;
  const scanTime = new Date(scanResult.scanTime).getTime();
  if (!Number.isFinite(scanTime)) return false;
  return Date.now() - scanTime < CACHE_TTL.SCANNER_DATA * 1000;
}

async function buildGroupRankingResponse(
  scanResult: ScanResult & { fromCache?: boolean }
): Promise<GroupRankingResponse> {
  const [industries, sectors, secReference] = await Promise.all([
    buildGroupRankingRows(scanResult.stocks, "industry"),
    buildGroupRankingRows(scanResult.stocks, "sector"),
    getSecReferenceSnapshot(),
  ]);

  return {
    fetchedAt: new Date().toISOString(),
    source: {
      fromCache: Boolean(scanResult.fromCache),
      responseCacheHit: false,
      totalScanned: scanResult.totalScanned ?? scanResult.stocks.length,
      stocks: scanResult.stocks.length,
    },
    snapshotInfo: industries.snapshotInfo,
    sources: getApprovedDataSources(),
    secReference,
    industries: industries.rows,
    sectors: sectors.rows,
  };
}

async function getBestScanResult(scope: BackgroundRefreshScope, forceRefresh: boolean): Promise<ScanResult & { fromCache?: boolean }> {
  if (!forceRefresh) {
    const fullCached = await getCachedScannerResults<ScanResult>();
    if (isFreshScanResult(fullCached)) {
      return { ...fullCached, fromCache: true };
    }

    const seededCached = await getCachedSeededScannerResults<ScanResult>();
    if (isFreshScanResult(seededCached)) {
      return { ...seededCached, fromCache: true };
    }
  }

  const limit = scope === "full" ? FULL_LIMIT : SEEDED_LIMIT;
  const symbols = await getStockSymbols(forceRefresh, limit);
  return runFullScanWithCache({
    // Even forced background refreshes must write the new snapshot cache.
    // forceRefresh only controls whether stale cache is read before scanning.
    useCache: true,
    forceRefresh,
    symbols,
    cacheKey: scope === "full" ? "full" : "seeded",
  });
}

export async function refreshBackgroundCaches(
  scope: BackgroundRefreshScope = "core",
  options: { forceRefresh?: boolean } = {}
): Promise<{
  scope: BackgroundRefreshScope;
  scanSource: "cache" | "scan";
  scannedCount: number;
  warmed: string[];
}> {
  const forceRefresh = Boolean(options.forceRefresh);
  const scanResult = await getBestScanResult(scope, forceRefresh);

  const warmed = new Set<string>();
  const scanSource = scanResult.fromCache ? "cache" : "scan";

  warmed.add(scope === "full" ? "scanner-full" : "scanner-seeded");

  const groupRankingResponse = await buildGroupRankingResponse(scanResult);
  await smartCacheSet(GROUP_RANKINGS_CACHE_KEY, groupRankingResponse, {
    freshTtlSeconds: GROUP_RANKINGS_FRESH_TTL_SECONDS,
    staleTtlSeconds: GROUP_RANKINGS_STALE_TTL_SECONDS,
  });
  warmed.add("group-rankings");

  await Promise.allSettled([
    getSectorRotation().then(() => warmed.add("sector-rotation")),
    fetchMarketSeasonalityOverview("SPY").then(() => warmed.add("market-seasonality:SPY")),
    fetchMarketSeasonalityOverview("QQQ").then(() => warmed.add("market-seasonality:QQQ")),
    fetchSeasonalityOverview("SPY").then(() => warmed.add("seasonality:SPY")),
    fetchSeasonalityOverview("QQQ").then(() => warmed.add("seasonality:QQQ")),
    fetchOptionsOverview("SPY").then(() => warmed.add("options:SPY")),
    fetchOptionsOverview("QQQ").then(() => warmed.add("options:QQQ")),
  ]);

  if (scope === "full") {
    await Promise.allSettled([
      fetchMarketSeasonalityOverview("IWM").then(() => warmed.add("market-seasonality:IWM")),
      fetchSeasonalityOverview("AAPL").then(() => warmed.add("seasonality:AAPL")),
      fetchOptionsOverview("AAPL").then(() => warmed.add("options:AAPL")),
      fetchOptionsOverview("NVDA").then(() => warmed.add("options:NVDA")),
    ]);
  }

  return {
    scope,
    scanSource,
    scannedCount: scanResult.totalScanned ?? scanResult.stocks.length,
    warmed: [...warmed],
  };
}
