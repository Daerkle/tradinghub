import { smartCacheGet, smartCacheSet } from "@/lib/redis-cache";
import type { SecReferenceSnapshot } from "@/types/data-sources";

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SEC_CACHE_KEY = "reference:sec:company-tickers:v1";
const SEC_FRESH_TTL_SECONDS = 24 * 60 * 60;
const SEC_STALE_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_SEC_USER_AGENT = "TradingHub/1.0 (contact: steffen.goettle@gmail.com)";

type SecTickerPayload = Record<string, { ticker?: string; cik_str?: number; title?: string }>;

async function fetchSecTickerPayload(): Promise<SecTickerPayload> {
  const response = await fetch(SEC_TICKERS_URL, {
    headers: {
      "User-Agent": process.env.SEC_USER_AGENT || DEFAULT_SEC_USER_AGENT,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`SEC ticker fetch failed with status ${response.status}`);
  }

  return response.json() as Promise<SecTickerPayload>;
}

export async function getSecReferenceSnapshot(): Promise<SecReferenceSnapshot> {
  const cached = await smartCacheGet<SecTickerPayload>(SEC_CACHE_KEY);

  if (cached.data && !cached.isStale) {
    return {
      tickerCount: Object.keys(cached.data).length,
      cachedAt: cached.cachedAt ? new Date(cached.cachedAt).toISOString() : null,
      isStale: false,
    };
  }

  try {
    const payload = await fetchSecTickerPayload();
    await smartCacheSet(SEC_CACHE_KEY, payload, {
      freshTtlSeconds: SEC_FRESH_TTL_SECONDS,
      staleTtlSeconds: SEC_STALE_TTL_SECONDS,
    });

    return {
      tickerCount: Object.keys(payload).length,
      cachedAt: new Date().toISOString(),
      isStale: false,
    };
  } catch (error) {
    if (cached.data) {
      return {
        tickerCount: Object.keys(cached.data).length,
        cachedAt: cached.cachedAt ? new Date(cached.cachedAt).toISOString() : null,
        isStale: true,
      };
    }

    console.error("SEC reference snapshot failed:", error);
    return {
      tickerCount: 0,
      cachedAt: null,
      isStale: true,
    };
  }
}
