import { createYahooProxyFetch } from "@/lib/proxy-fetch";
import {
  cacheGet,
  cacheSet,
  getCachedScannerResults,
  getCachedSeededScannerResults,
} from "@/lib/redis-cache";

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
  source: "cache" | "fresh" | "scanner-fallback";
  benchmark: { symbol: "SPY"; m1: number; m3: number; m6: number };
  sectors: SectorRotationRow[];
};

type ScannerStockSnapshot = {
  symbol?: string;
  sector?: string;
  momentum1M?: number;
  momentum3M?: number;
  momentum6M?: number;
};

type ScannerSnapshot = {
  stocks?: ScannerStockSnapshot[];
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
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
const YAHOO_TIMEOUT_MS = 6_000;
const STOOQ_TIMEOUT_MS = 5_000;
const STOOQ_CONCURRENCY = 6;
const MIN_CLOSES_REQUIRED = 80;
const yahooFetch = createYahooProxyFetch();

const ETF_BY_SYMBOL = new Map(SECTOR_ETFS.map((etf) => [etf.symbol, etf] as const));

const SCANNER_SECTOR_TO_ETF: Record<string, string> = {
  "communication services": "XLC",
  "consumer discretionary": "XLY",
  "consumer cyclical": "XLY",
  "consumer staples": "XLP",
  "consumer defensive": "XLP",
  energy: "XLE",
  financials: "XLF",
  "financial services": "XLF",
  "health care": "XLV",
  healthcare: "XLV",
  industrials: "XLI",
  materials: "XLB",
  "basic materials": "XLB",
  "real estate": "XLRE",
  technology: "XLK",
  utilities: "XLU",
};

function toFinite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

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

    return closes.length >= MIN_CLOSES_REQUIRED ? closes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYahooDailyCloses(symbol: string): Promise<number[] | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  const period1 = nowSec - 370 * 24 * 60 * 60;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol.toUpperCase()
  )}?interval=1d&period1=${period1}&period2=${nowSec}&events=div%7Csplit&includePrePost=false&lang=en-US&region=US`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);

  try {
    const response = await yahooFetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;

    const payload = (await response.text()).trim();
    if (!payload.startsWith("{")) return null;

    const chart = JSON.parse(payload) as YahooChartResponse;
    const closesRaw = chart.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closesRaw)) return null;

    const closes = closesRaw
      .map((value) => toFinite(value, NaN))
      .filter((close): close is number => Number.isFinite(close) && close > 0);

    return closes.length >= MIN_CLOSES_REQUIRED ? closes : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isMeaningfulRows(rows: SectorRotationRow[]): boolean {
  if (rows.length === 0) return false;
  const signalRows = rows.filter(
    (row) =>
      Math.abs(row.m1) >= 0.05 ||
      Math.abs(row.m3) >= 0.05 ||
      Math.abs(row.m6) >= 0.05 ||
      Math.abs(row.score) >= 0.05
  );
  return signalRows.length >= Math.min(3, rows.length);
}

function getEtfForSector(sector: string): SectorEtf | null {
  const key = sector.trim().toLowerCase();
  const etfSymbol = SCANNER_SECTOR_TO_ETF[key];
  if (!etfSymbol) return null;
  return ETF_BY_SYMBOL.get(etfSymbol) ?? null;
}

async function getScannerSnapshotStocks(): Promise<ScannerStockSnapshot[]> {
  const [full, seeded] = await Promise.all([
    getCachedScannerResults<ScannerSnapshot>(),
    getCachedSeededScannerResults<ScannerSnapshot>(),
  ]);

  const deduped = new Map<string, ScannerStockSnapshot>();
  for (const list of [full?.stocks, seeded?.stocks]) {
    if (!Array.isArray(list)) continue;
    for (const stock of list) {
      const symbol = (stock.symbol || "").trim().toUpperCase();
      if (!symbol) continue;
      if (!deduped.has(symbol)) deduped.set(symbol, stock);
    }
  }

  return Array.from(deduped.values());
}

function getScannerBenchmark(stocks: ScannerStockSnapshot[]): { m1: number; m3: number; m6: number } | null {
  const spy = stocks.find((stock) => (stock.symbol || "").trim().toUpperCase() === "SPY");
  if (!spy) return null;

  const m1 = toFinite(spy.momentum1M, NaN);
  const m3 = toFinite(spy.momentum3M, NaN);
  const m6 = toFinite(spy.momentum6M, NaN);
  if (!Number.isFinite(m1) || !Number.isFinite(m3) || !Number.isFinite(m6)) {
    return null;
  }

  return { m1, m3, m6 };
}

function buildScannerFallbackRows(
  stocks: ScannerStockSnapshot[],
  benchmark: { m1: number; m3: number; m6: number }
): SectorRotationRow[] {
  const buckets = new Map<
    string,
    {
      etf: SectorEtf;
      count: number;
      m1: number;
      m3: number;
      m6: number;
    }
  >();

  for (const stock of stocks) {
    const sector = (stock.sector || "").trim();
    if (!sector || sector === "Unknown") continue;

    const etf = getEtfForSector(sector);
    if (!etf) continue;

    const m1 = toFinite(stock.momentum1M, NaN);
    const m3 = toFinite(stock.momentum3M, NaN);
    const m6 = toFinite(stock.momentum6M, NaN);
    if (!Number.isFinite(m1) || !Number.isFinite(m3) || !Number.isFinite(m6)) continue;

    const current = buckets.get(etf.symbol) || { etf, count: 0, m1: 0, m3: 0, m6: 0 };
    current.count += 1;
    current.m1 += m1;
    current.m3 += m3;
    current.m6 += m6;
    buckets.set(etf.symbol, current);
  }

  return Array.from(buckets.values())
    .filter((bucket) => bucket.count >= 3)
    .map((bucket) => {
      const m1 = bucket.m1 / bucket.count;
      const m3 = bucket.m3 / bucket.count;
      const m6 = bucket.m6 / bucket.count;
      const relM1 = m1 - benchmark.m1;
      const relM3 = m3 - benchmark.m3;
      const relM6 = m6 - benchmark.m6;
      const score = relM1 * 0.2 + relM3 * 0.5 + relM6 * 0.3;

      return {
        symbol: bucket.etf.symbol,
        sector: bucket.etf.sector,
        name: `${bucket.etf.name} (Scan)`,
        m1,
        m3,
        m6,
        relM1,
        relM3,
        relM6,
        score,
      } satisfies SectorRotationRow;
    })
    .sort((a, b) => b.score - a.score);
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
  if (cached && Array.isArray(cached.sectors) && cached.sectors.length > 0 && isMeaningfulRows(cached.sectors)) {
    return { ...cached, source: "cache" };
  }

  const scannerStocks = await getScannerSnapshotStocks();
  const scannerBenchmark = getScannerBenchmark(scannerStocks);
  const fallbackBenchmark = scannerBenchmark ?? { m1: 0, m3: 0, m6: 0 };
  const scannerFallbackRows = buildScannerFallbackRows(scannerStocks, fallbackBenchmark);
  const scannerRowsUsable = isMeaningfulRows(scannerFallbackRows);

  // Fast path: when scanner data exists, return immediately instead of waiting for slow ETF feeds.
  if (scannerRowsUsable) {
    const response: SectorRotationResponse = {
      fetchedAt: new Date().toISOString(),
      source: "scanner-fallback",
      benchmark: { symbol: "SPY", ...fallbackBenchmark },
      sectors: scannerFallbackRows,
    };
    await cacheSet(CACHE_KEY, response, CACHE_TTL_SECONDS);
    return response;
  }

  const spyYahooCloses = await fetchYahooDailyCloses("SPY");
  const spyStooqCloses = spyYahooCloses ? null : await fetchStooqDailyCloses("SPY");
  const canUseYahoo = Boolean(spyYahooCloses);
  const canUseStooq = !canUseYahoo && Boolean(spyStooqCloses);
  const spyCloses = spyYahooCloses || spyStooqCloses;
  const spy = spyCloses
    ? {
        m1: safePerf(spyCloses, 21),
        m3: safePerf(spyCloses, 63),
        m6: safePerf(spyCloses, 126),
      }
    : fallbackBenchmark;

  const sectorRowsRaw = await mapWithConcurrency(SECTOR_ETFS, STOOQ_CONCURRENCY, async (etf) => {
    let closes: number[] | null = null;
    if (canUseYahoo) {
      closes = await fetchYahooDailyCloses(etf.symbol);
    }
    if (!closes && canUseStooq) {
      closes = await fetchStooqDailyCloses(etf.symbol);
    }

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
      hasData: Boolean(closes),
    };
  });

  const sectorRows = sectorRowsRaw
    .filter((row) => row.symbol && Number.isFinite(row.score))
    .map(
      (row): SectorRotationRow => ({
        symbol: row.symbol,
        sector: row.sector,
        name: row.name,
        m1: row.m1,
        m3: row.m3,
        m6: row.m6,
        relM1: row.relM1,
        relM3: row.relM3,
        relM6: row.relM6,
        score: row.score,
      })
    )
    .sort((a, b) => b.score - a.score);

  const successfulExternalRows = sectorRowsRaw.filter((row) => row.hasData).length;
  const externalRowsUsable = successfulExternalRows >= Math.ceil(SECTOR_ETFS.length / 2) && isMeaningfulRows(sectorRows);

  const source: SectorRotationResponse["source"] = "fresh";
  const sectors = (externalRowsUsable ? sectorRows : [])
    .filter((row) => row.symbol && Number.isFinite(row.score))
    .sort((a, b) => b.score - a.score);

  const response: SectorRotationResponse = {
    fetchedAt: new Date().toISOString(),
    source,
    benchmark: { symbol: "SPY", ...spy },
    sectors,
  };

  const cacheTtl = isMeaningfulRows(sectors) ? CACHE_TTL_SECONDS : 60;
  await cacheSet(CACHE_KEY, response, cacheTtl);
  return response;
}
