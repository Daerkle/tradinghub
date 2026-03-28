import { fetchOpenBBHistoricalCandles, fetchStooqHistoricalCandles } from "@/lib/openbb-service";
import { readPersistentSnapshot, writePersistentSnapshot } from "@/lib/persistent-storage";
import { smartCacheGet, smartCacheSet } from "@/lib/redis-cache";
import { getYahooFinance } from "@/lib/yahoo-client";
import type { CandleData } from "@/types/scanner";
import type {
  DayOfMonthBucket,
  SeasonalityBucket,
  SeasonalityOverview,
} from "@/types/seasonality";

const SEASONALITY_CACHE_PREFIX = "scanner:seasonality:v1:";
const SEASONALITY_LOOKBACK_DAYS = 365 * 6;
const SEASONALITY_TIMEOUT_MS = 20_000;
const SEASONALITY_FRESH_TTL_SECONDS = 12 * 60 * 60;
const SEASONALITY_STALE_TTL_SECONDS = 7 * 24 * 60 * 60;
const SEASONALITY_SNAPSHOT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const yahooFinance = getYahooFinance();

type YahooChartQuote = {
  date: string | number | Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms${label ? `: ${label}` : ""}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function calcReturnPct(previousClose: number, close: number): number | null {
  if (!Number.isFinite(previousClose) || !Number.isFinite(close) || previousClose <= 0) return null;
  return ((close / previousClose) - 1) * 100;
}

function calcWindowReturn(closes: number[], lookback: number): number | null {
  if (closes.length <= lookback) return null;
  return calcReturnPct(closes[closes.length - 1 - lookback], closes[closes.length - 1]);
}

function bucketize(
  labels: string[],
  returnsByIndex: number[][]
): SeasonalityBucket[] {
  return labels.map((label, index) => {
    const values = returnsByIndex[index] || [];
    const positive = values.filter((value) => value > 0).length;
    return {
      label,
      index,
      avgReturnPct: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      medianReturnPct: median(values),
      positiveRatePct: values.length > 0 ? (positive / values.length) * 100 : 0,
      sampleSize: values.length,
    };
  });
}

async function fetchHistoricalCandles(symbol: string): Promise<CandleData[]> {
  try {
    const historical = await withTimeout(
      yahooFinance.chart(symbol.toUpperCase(), {
        period1: new Date(Date.now() - SEASONALITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
        period2: new Date(),
        interval: "1d",
      }) as Promise<{ quotes?: YahooChartQuote[] }>,
      SEASONALITY_TIMEOUT_MS,
      symbol
    );

    const quotes = Array.isArray(historical.quotes) ? historical.quotes : [];
    const candles = quotes
      .map((quote) => {
        const date = new Date(quote.date);
        if (Number.isNaN(date.getTime())) return null;
        const close = typeof quote.close === "number" ? quote.close : NaN;
        if (!Number.isFinite(close) || close <= 0) return null;
        return {
          time: date.toISOString().slice(0, 10),
          open: quote.open || close,
          high: quote.high || close,
          low: quote.low || close,
          close,
          volume: quote.volume || 0,
        } satisfies CandleData;
      })
      .filter((candle): candle is CandleData => candle !== null);

    if (candles.length >= 250) {
      return candles;
    }
  } catch {
    // fall through to OpenBB fallback
  }

  const openbbCandles = await fetchOpenBBHistoricalCandles(symbol.toUpperCase(), SEASONALITY_LOOKBACK_DAYS);
  if (openbbCandles.length >= 250) {
    return openbbCandles;
  }

  return fetchStooqHistoricalCandles(symbol.toUpperCase(), SEASONALITY_LOOKBACK_DAYS);
}

export async function fetchSeasonalityOverview(
  symbol: string,
  options: { forceRefresh?: boolean } = {}
): Promise<SeasonalityOverview> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  const cacheKey = `${SEASONALITY_CACHE_PREFIX}${normalizedSymbol}`;
  const cached = await smartCacheGet<SeasonalityOverview>(cacheKey);
  const persistedSnapshotPromise = readPersistentSnapshot<SeasonalityOverview>("seasonality", normalizedSymbol, {
    maxAgeMs: SEASONALITY_SNAPSHOT_MAX_AGE_MS,
  });

  if (!options.forceRefresh) {
    if (cached.data && !cached.isStale) {
      return cached.data;
    }
  }

  try {
    const candles = await fetchHistoricalCandles(normalizedSymbol);
    if (candles.length < 260) {
      throw new Error(`Not enough history for seasonality: ${normalizedSymbol}`);
    }

    const monthlyReturns = Array.from({ length: 12 }, () => [] as number[]);
    const weekdayReturns = Array.from({ length: 5 }, () => [] as number[]);
    const dayOfMonthReturns = Array.from({ length: 31 }, () => [] as number[]);

    for (let index = 1; index < candles.length; index++) {
      const current = candles[index];
      const previous = candles[index - 1];
      const returnPct = calcReturnPct(previous.close, current.close);
      if (returnPct === null) continue;

      const date = new Date(`${current.time}T00:00:00Z`);
      const weekday = date.getUTCDay();
      if (weekday >= 1 && weekday <= 5) {
        weekdayReturns[weekday - 1].push(returnPct);
      }
      monthlyReturns[date.getUTCMonth()].push(returnPct);
      dayOfMonthReturns[date.getUTCDate() - 1].push(returnPct);
    }

    const monthLabels = ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
    const weekdayLabels = ["Mo", "Di", "Mi", "Do", "Fr"];
    const monthly = bucketize(monthLabels, monthlyReturns);
    const weekday = bucketize(weekdayLabels, weekdayReturns);
    const dayOfMonth: DayOfMonthBucket[] = dayOfMonthReturns.map((values, index) => ({
      day: index + 1,
      avgReturnPct: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      positiveRatePct: values.length > 0 ? (values.filter((value) => value > 0).length / values.length) * 100 : 0,
      sampleSize: values.length,
    }));

    const now = new Date();
    const closes = candles.map((candle) => candle.close);
    const currentMonthIndex = now.getUTCMonth();
    const utcWeekday = now.getUTCDay();
    const currentWeekdayIndex = utcWeekday >= 1 && utcWeekday <= 5 ? utcWeekday - 1 : -1;
    const summary = {
      bestMonth: [...monthly].sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null,
      worstMonth: [...monthly].sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0] ?? null,
      currentMonthSeasonality: monthly[currentMonthIndex] ?? null,
      bestWeekday: [...weekday].sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null,
      worstWeekday: [...weekday].sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0] ?? null,
      currentWeekdaySeasonality: currentWeekdayIndex >= 0 ? (weekday[currentWeekdayIndex] ?? null) : null,
      strongestDaysOfMonth: [...dayOfMonth]
        .filter((bucket) => bucket.sampleSize >= 3)
        .sort((a, b) => b.avgReturnPct - a.avgReturnPct)
        .slice(0, 5),
      weakestDaysOfMonth: [...dayOfMonth]
        .filter((bucket) => bucket.sampleSize >= 3)
        .sort((a, b) => a.avgReturnPct - b.avgReturnPct)
        .slice(0, 5),
    };

    const overview: SeasonalityOverview = {
      symbol: normalizedSymbol,
      source: candles.length >= 250 ? "yahoo/openbb daily history" : "openbb daily history",
      fetchedAt: new Date().toISOString(),
      historyYears: Number((candles.length / 252).toFixed(1)),
      tradingDays: candles.length,
      trailingReturnPct: {
        month1: calcWindowReturn(closes, 21),
        month3: calcWindowReturn(closes, 63),
        month6: calcWindowReturn(closes, 126),
        year1: calcWindowReturn(closes, 252),
      },
      currentContext: {
        monthIndex: currentMonthIndex,
        monthLabel: monthLabels[currentMonthIndex],
        weekdayIndex: currentWeekdayIndex,
        weekdayLabel: currentWeekdayIndex >= 0 ? (weekdayLabels[currentWeekdayIndex] ?? weekdayLabels[0]) : "Wochenende",
        dayOfMonth: now.getUTCDate(),
      },
      monthly,
      weekday,
      dayOfMonth,
      summary,
      sourceLinks: [
        { label: "Yahoo Chart", url: `https://finance.yahoo.com/quote/${normalizedSymbol}/history` },
        { label: "TradingView", url: `https://www.tradingview.com/chart/?symbol=${normalizedSymbol}` },
      ],
      disclaimer:
        "Seasonality ist nur ein statistischer Kontext aus historischen Tagesrenditen und kein Trade-Signal für sich allein.",
    };

    await smartCacheSet(cacheKey, overview, {
      freshTtlSeconds: SEASONALITY_FRESH_TTL_SECONDS,
      staleTtlSeconds: SEASONALITY_STALE_TTL_SECONDS,
    });
    await writePersistentSnapshot("seasonality", normalizedSymbol, overview);
    return overview;
  } catch (error) {
    if (cached.data) {
      return cached.data;
    }
    const persistedSnapshot = await persistedSnapshotPromise;
    if (persistedSnapshot) {
      return persistedSnapshot;
    }
    throw error;
  }
}
