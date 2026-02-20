import { cacheGet, cacheSet } from "@/lib/redis-cache";

type SectorEtf = {
  symbol: string;
  sector: string;
  name: string;
};

export type SectorRotationRow = {
  symbol: string;
  sector: string;
  name: string;
  m1: number;
  m3: number;
  m6: number;
  relM1: number;
  relM3: number;
  relM6: number;
  score: number;
};

export type SectorRotationResponse = {
  fetchedAt: string;
  source: "cache" | "fresh";
  benchmark: { symbol: "SPY"; m1: number; m3: number; m6: number };
  sectors: SectorRotationRow[];
};

const SECTOR_ETFS: SectorEtf[] = [
  { symbol: "XLC", sector: "Communication Services", name: "Communication Services" },
  { symbol: "XLY", sector: "Consumer Discretionary", name: "Consumer Discretionary" },
  { symbol: "XLP", sector: "Consumer Staples", name: "Consumer Staples" },
  { symbol: "XLE", sector: "Energy", name: "Energy" },
  { symbol: "XLF", sector: "Financials", name: "Financials" },
  { symbol: "XLV", sector: "Health Care", name: "Health Care" },
  { symbol: "XLI", sector: "Industrials", name: "Industrials" },
  { symbol: "XLB", sector: "Materials", name: "Materials" },
  { symbol: "XLRE", sector: "Real Estate", name: "Real Estate" },
  { symbol: "XLK", sector: "Technology", name: "Technology" },
  { symbol: "XLU", sector: "Utilities", name: "Utilities" },
];

const CACHE_KEY = "scanner:sector_rotation";
const CACHE_TTL_SECONDS = 10 * 60;
const STOOQ_TIMEOUT_MS = 12_000;
const STOOQ_CONCURRENCY = 6;

function safePerf(closes: number[], lookbackDays: number): number {
  const n = closes.length;
  if (n <= lookbackDays) return 0;
  const current = closes[n - 1];
  const past = closes[n - 1 - lookbackDays];
  if (!Number.isFinite(current) || !Number.isFinite(past) || current <= 0 || past <= 0) return 0;
  return ((current / past) - 1) * 100;
}

async function fetchStooqDailyCloses(symbol: string): Promise<number[] | null> {
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STOOQ_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/csv,*/*;q=0.8",
      },
    });

    if (!response.ok) return null;

    const csv = (await response.text()).trim();
    const lines = csv
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 3) return null;

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const closeIndex = header.indexOf("close");
    const idx = closeIndex >= 0 ? closeIndex : 4;

    const closes: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const close = Number.parseFloat(parts[idx] || "");
      if (Number.isFinite(close) && close > 0) closes.push(close);
    }

    return closes.length >= 80 ? closes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

export async function getSectorRotation(): Promise<SectorRotationResponse> {
  const cached = await cacheGet<SectorRotationResponse>(CACHE_KEY);
  if (cached && Array.isArray(cached.sectors) && cached.sectors.length > 0) {
    return { ...cached, source: "cache" };
  }

  const spyCloses = await fetchStooqDailyCloses("SPY");
  const spy = spyCloses
    ? {
        m1: safePerf(spyCloses, 21),
        m3: safePerf(spyCloses, 63),
        m6: safePerf(spyCloses, 126),
      }
    : { m1: 0, m3: 0, m6: 0 };

  const sectorRows = await mapWithConcurrency(SECTOR_ETFS, STOOQ_CONCURRENCY, async (etf) => {
    const closes = await fetchStooqDailyCloses(etf.symbol);
    const m1 = closes ? safePerf(closes, 21) : 0;
    const m3 = closes ? safePerf(closes, 63) : 0;
    const m6 = closes ? safePerf(closes, 126) : 0;

    const relM1 = m1 - spy.m1;
    const relM3 = m3 - spy.m3;
    const relM6 = m6 - spy.m6;
    const score = relM1 * 0.2 + relM3 * 0.5 + relM6 * 0.3;

    return {
      symbol: etf.symbol,
      sector: etf.sector,
      name: etf.name,
      m1,
      m3,
      m6,
      relM1,
      relM3,
      relM6,
      score,
    } satisfies SectorRotationRow;
  });

  const sectors = sectorRows
    .filter((row) => row.symbol && Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score);

  const response: SectorRotationResponse = {
    fetchedAt: new Date().toISOString(),
    source: "fresh",
    benchmark: { symbol: "SPY", ...spy },
    sectors,
  };

  await cacheSet(CACHE_KEY, response, CACHE_TTL_SECONDS);
  return response;
}

