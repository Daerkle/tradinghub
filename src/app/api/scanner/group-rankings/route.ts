import { NextRequest, NextResponse } from "next/server";
import { getApprovedDataSources } from "@/lib/data-sources";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { buildGroupRankingRows } from "@/lib/group-rankings";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";
import { smartCacheGet, smartCacheSet } from "@/lib/redis-cache";
import { getStockSymbols, runFullScanWithCache, type ScanResult } from "@/lib/scanner-service";
import { getSecReferenceSnapshot } from "@/lib/sec-reference-service";
import type { GroupRankingResponse } from "@/types/group-rankings";

const GROUP_RANKINGS_CACHE_KEY = "scanner:group-rankings:v4";
const GROUP_RANKINGS_FRESH_TTL_SECONDS = 15 * 60;
const GROUP_RANKINGS_STALE_TTL_SECONDS = 24 * 60 * 60;
const GROUP_RANKINGS_SEEDED_LIMIT = 350;

function hasNonZeroPerformance(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function hasGroupPerformanceData(data: GroupRankingResponse): boolean {
  const groups = [...(data.industries ?? []), ...(data.sectors ?? [])];

  return groups.some((group) => {
    const groupHasPerformance = [
      group.avgMomentum1M,
      group.avgMomentum3M,
      group.avgMomentum6M,
      group.avgMomentum1Y,
    ].some(hasNonZeroPerformance);

    if (groupHasPerformance) return true;

    return (group.members ?? []).some((member) =>
      [
        member.momentum1M,
        member.momentum3M,
        member.momentum6M,
        member.momentum1Y,
      ].some(hasNonZeroPerformance)
    );
  });
}

function hasUsableGroupRankingData(data: GroupRankingResponse | null | undefined): data is GroupRankingResponse {
  if (!data) return false;
  const groupCount = (data.industries?.length ?? 0) + (data.sectors?.length ?? 0);
  return groupCount > 0 && (data.source?.stocks ?? 0) > 0 && hasGroupPerformanceData(data);
}

function hasUsableScanResult(scanResult: ScanResult | null | undefined): scanResult is ScanResult {
  if (!scanResult?.stocks?.length) return false;

  return scanResult.stocks.some((stock) =>
    [
      stock.momentum1M,
      stock.momentum3M,
      stock.momentum6M,
      stock.momentum1Y,
    ].some(hasNonZeroPerformance)
  );
}

async function getBestCachedScanResult(): Promise<(ScanResult & { fromCache?: boolean }) | null> {
  const [fullCached, seededCached] = await Promise.all([
    getCachedScannerResults<ScanResult>(),
    getCachedSeededScannerResults<ScanResult>(),
  ]);

  const candidates = [fullCached, seededCached]
    .filter(hasUsableScanResult)
    .sort((left, right) => right.stocks.length - left.stocks.length);

  const best = candidates[0];
  return best ? { ...best, fromCache: true } : null;
}

async function buildResponseFromScan(
  scanResult: ScanResult & { fromCache?: boolean },
  options: { responseCacheHit: boolean }
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
      responseCacheHit: options.responseCacheHit,
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

function getRequestKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function cachedResponse(data: GroupRankingResponse) {
  return NextResponse.json({
    ...data,
    source: {
      ...data.source,
      responseCacheHit: true,
    },
  });
}

export async function GET(request: NextRequest) {
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const cached = await smartCacheGet<GroupRankingResponse>(GROUP_RANKINGS_CACHE_KEY);

    if (hasUsableGroupRankingData(cached.data) && (!forceRefresh || !cached.isStale)) {
      return cachedResponse(cached.data);
    }

    const rl = scannerRateLimit(getRequestKey(request));
    if (!rl.allowed) {
      if (hasUsableGroupRankingData(cached.data)) {
        return cachedResponse(cached.data);
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Zu viele Anfragen. Bitte gleich erneut versuchen." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        }
      );
    }

    let scanResult = await getBestCachedScanResult();
    let fromCache = Boolean(scanResult?.fromCache);

    if (!scanResult?.stocks?.length) {
      if (!forceRefresh && hasUsableGroupRankingData(cached.data)) {
        return cachedResponse(cached.data);
      }

      const symbols = await getStockSymbols(forceRefresh, GROUP_RANKINGS_SEEDED_LIMIT);
      const seededScan = await runFullScanWithCache({
        useCache: true,
        forceRefresh: true,
        symbols,
        cacheKey: "seeded",
      });
      scanResult = seededScan;
      fromCache = seededScan.fromCache;
    }

    if (!scanResult?.stocks?.length) {
      return NextResponse.json({ error: "Keine Scanner-Daten verfügbar." }, { status: 503 });
    }

    const response = await buildResponseFromScan(
      {
        ...scanResult,
        fromCache,
      },
      { responseCacheHit: false }
    );

    if (!hasUsableGroupRankingData(response)) {
      if (!forceRefresh && hasUsableGroupRankingData(cached.data)) {
        return cachedResponse(cached.data);
      }

      return NextResponse.json({ error: "Keine verwertbaren Gruppen-Daten verfügbar." }, { status: 503 });
    }

    await smartCacheSet(GROUP_RANKINGS_CACHE_KEY, response, {
      freshTtlSeconds: GROUP_RANKINGS_FRESH_TTL_SECONDS,
      staleTtlSeconds: GROUP_RANKINGS_STALE_TTL_SECONDS,
    });

    return NextResponse.json(response);
  } catch (error) {
    const cached = await smartCacheGet<GroupRankingResponse>(GROUP_RANKINGS_CACHE_KEY);
    if (hasUsableGroupRankingData(cached.data)) {
      return cachedResponse(cached.data);
    }
    console.error("Group rankings API error:", error);
    return NextResponse.json({ error: "Top-Gruppen konnten nicht geladen werden." }, { status: 500 });
  }
}
