import { NextRequest, NextResponse } from "next/server";
import { buildMarketHeatGroups, MARKET_HEAT_DATA_SOURCES } from "@/lib/market-heat";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults, smartCacheGet, smartCacheSet } from "@/lib/redis-cache";
import type { MarketHeatResponse } from "@/types/market-heat";
import type { ScanResult } from "@/types/scanner";

const MARKET_HEAT_CACHE_KEY = "scanner:market-heat:v3";
const MARKET_HEAT_FRESH_TTL_SECONDS = 90;
const MARKET_HEAT_STALE_TTL_SECONDS = 24 * 60 * 60;

function hasUsableMarketHeatData(data: MarketHeatResponse | null | undefined): data is MarketHeatResponse {
  if (!data?.groups || !data.source || data.source.stocks <= 0) return false;
  const groupCount = data.groups.themes.length + data.groups.sectors.length + data.groups.industries.length;
  const memberCount = [...data.groups.themes, ...data.groups.sectors, ...data.groups.industries].reduce(
    (sum, group) => sum + group.members.length,
    0
  );
  return groupCount > 0 && memberCount > 0;
}

function getScanAgeSeconds(scanTime: string | Date | null | undefined): number | null {
  if (!scanTime) return null;
  const timestamp = new Date(scanTime).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

async function getBestScannerSnapshot(): Promise<{ result: ScanResult; source: "full" | "seeded" } | null> {
  const [full, seeded] = await Promise.all([
    getCachedScannerResults<ScanResult>(),
    getCachedSeededScannerResults<ScanResult>(),
  ]);

  const candidates = [
    full?.stocks?.length ? { result: full, source: "full" as const } : null,
    seeded?.stocks?.length ? { result: seeded, source: "seeded" as const } : null,
  ].filter((candidate): candidate is { result: ScanResult; source: "full" | "seeded" } => Boolean(candidate));

  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    const countDiff = (b.result.stocks?.length ?? 0) - (a.result.stocks?.length ?? 0);
    if (countDiff !== 0) return countDiff;
    return new Date(b.result.scanTime).getTime() - new Date(a.result.scanTime).getTime();
  })[0];
}

async function buildResponse(responseCacheHit: boolean): Promise<MarketHeatResponse | null> {
  const snapshot = await getBestScannerSnapshot();
  if (!snapshot) return null;

  const groups = buildMarketHeatGroups(snapshot.result.stocks);
  const scanTime = snapshot.result.scanTime ? new Date(snapshot.result.scanTime).toISOString() : null;

  return {
    fetchedAt: new Date().toISOString(),
    scanTime,
    scanAgeSeconds: getScanAgeSeconds(snapshot.result.scanTime),
    source: {
      responseCacheHit,
      scannerSource: snapshot.source,
      fromCache: Boolean(snapshot.result.fromCache ?? true),
      totalScanned: snapshot.result.totalScanned ?? snapshot.result.stocks.length,
      stocks: snapshot.result.stocks.length,
    },
    groups,
    dataSources: MARKET_HEAT_DATA_SOURCES,
  };
}

function getRequestKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function cachedResponse(data: MarketHeatResponse) {
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
    const cached = await smartCacheGet<MarketHeatResponse>(MARKET_HEAT_CACHE_KEY);

    if (hasUsableMarketHeatData(cached.data) && (!forceRefresh || !cached.isStale)) {
      return cachedResponse(cached.data);
    }

    const rl = scannerRateLimit(getRequestKey(request));
    if (!rl.allowed) {
      if (hasUsableMarketHeatData(cached.data)) {
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

    const response = await buildResponse(false);
    if (hasUsableMarketHeatData(response)) {
      await smartCacheSet(MARKET_HEAT_CACHE_KEY, response, {
        freshTtlSeconds: MARKET_HEAT_FRESH_TTL_SECONDS,
        staleTtlSeconds: MARKET_HEAT_STALE_TTL_SECONDS,
      });
      return NextResponse.json(response);
    }

    if (hasUsableMarketHeatData(cached.data)) {
      return cachedResponse(cached.data);
    }

    return NextResponse.json({ error: "Kein Scanner-Snapshot verfügbar. Bitte Scanner oder Warmer starten." }, { status: 503 });
  } catch (error) {
    const cached = await smartCacheGet<MarketHeatResponse>(MARKET_HEAT_CACHE_KEY);
    if (hasUsableMarketHeatData(cached.data)) {
      return cachedResponse(cached.data);
    }
    console.error("Market heat API error:", error);
    return NextResponse.json({ error: "Market-Heat-Daten konnten nicht geladen werden." }, { status: 500 });
  }
}
