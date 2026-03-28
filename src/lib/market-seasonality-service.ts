import { fetchOpenBBHistoricalCandles } from "@/lib/openbb-service";
import { readPersistentSnapshot, writePersistentSnapshot } from "@/lib/persistent-storage";
import { smartCacheGet, smartCacheSet } from "@/lib/redis-cache";
import { getYahooFinance } from "@/lib/yahoo-client";
import bundledSeasonalityHistory from "@/data/seasonality-history.json";
import type { CandleData } from "@/types/scanner";
import type {
  CycleEventStat,
  MarketSeasonalityOverview,
  PresidentialCycleSummary,
  PresidentialCycleYear,
  SeasonalityStatBucket,
} from "@/types/market-seasonality";

const MARKET_SEASONALITY_CACHE_PREFIX = "seasonality:market:v1:";
const MARKET_SEASONALITY_TIMEOUT_MS = 30_000;
const MARKET_SEASONALITY_LOOKBACK_DAYS = 365 * 80;
const STOOQ_TIMEOUT_MS = 15_000;
const MARKET_SEASONALITY_FRESH_TTL_SECONDS = 24 * 60 * 60;
const MARKET_SEASONALITY_STALE_TTL_SECONDS = 30 * 24 * 60 * 60;
const MARKET_SEASONALITY_SNAPSHOT_MAX_AGE_MS = 120 * 24 * 60 * 60 * 1000;

const yahooFinance = getYahooFinance();

type YahooChartQuote = {
  date: string | number | Date;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
};

type DatedCandle = CandleData & {
  date: Date;
};

type ReturnPoint = {
  index: number;
  date: Date;
  returnPct: number;
};

const INDEX_PROXY_SYMBOLS: Record<string, string> = {
  "^GSPC": "SPY",
  "^NDX": "QQQ",
  "^DJI": "DIA",
  "^RUT": "IWM",
};

const BUNDLED_SEASONALITY_HISTORY = bundledSeasonalityHistory as Record<string, CandleData[]>;

const FOMC_MEETING_END_DATES = [
  "2021-01-27", "2021-03-17", "2021-04-28", "2021-06-16", "2021-07-28", "2021-09-22", "2021-11-03", "2021-12-15",
  "2022-01-26", "2022-03-16", "2022-05-04", "2022-06-15", "2022-07-27", "2022-09-21", "2022-11-02", "2022-12-14",
  "2023-02-01", "2023-03-22", "2023-05-03", "2023-06-14", "2023-07-26", "2023-09-20", "2023-11-01", "2023-12-13",
  "2024-01-31", "2024-03-20", "2024-05-01", "2024-06-12", "2024-07-31", "2024-09-18", "2024-11-07", "2024-12-18",
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
];

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
  if (sorted.length % 2 === 0) return (sorted[middle - 1] + sorted[middle]) / 2;
  return sorted[middle];
}

function compoundReturnPct(values: number[]): number {
  if (values.length === 0) return 0;
  const compounded = values.reduce((acc, value) => acc * (1 + value / 100), 1);
  return (compounded - 1) * 100;
}

function calcReturnPct(previousClose: number, close: number): number | null {
  if (!Number.isFinite(previousClose) || !Number.isFinite(close) || previousClose <= 0) return null;
  return ((close / previousClose) - 1) * 100;
}

function normalizeSymbol(symbol: string): string {
  const trimmed = symbol.trim();
  if (!trimmed) return "^GSPC";
  return trimmed.toUpperCase();
}

function getYahooFetchSymbols(symbol: string): string[] {
  const normalized = normalizeSymbol(symbol);
  const alias = INDEX_PROXY_SYMBOLS[normalized];
  return alias ? [normalized, alias] : [normalized];
}

function getStooqSymbol(symbol: string): string | null {
  const normalized = normalizeSymbol(symbol);
  if (normalized === "^GSPC") return "^spx";
  if (normalized === "^NDX") return "^ndx";
  if (normalized === "^DJI") return "^dji";
  if (normalized === "^RUT") return "^rut";
  if (/^[A-Z.-]{1,10}$/.test(normalized)) return `${normalized.toLowerCase()}.us`;
  return null;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quarterKey(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function bucketize(labels: string[], returnsByIndex: number[][]): SeasonalityStatBucket[] {
  return labels.map((label, index) => {
    const values = returnsByIndex[index] || [];
    const positive = values.filter((value) => value > 0).length;
    return {
      label,
      avgReturnPct: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      medianReturnPct: median(values),
      positiveRatePct: values.length > 0 ? (positive / values.length) * 100 : 0,
      sampleSize: values.length,
    };
  });
}

function buildCycleStat(slug: string, label: string, description: string, values: number[]): CycleEventStat {
  const positive = values.filter((value) => value > 0).length;
  return {
    slug,
    label,
    description,
    avgReturnPct: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    medianReturnPct: median(values),
    positiveRatePct: values.length > 0 ? (positive / values.length) * 100 : 0,
    sampleSize: values.length,
  };
}

async function fetchHistoricalCandles(symbol: string, lookbackDays: number): Promise<CandleData[]> {
  const period1 = new Date(Math.max(Date.UTC(1970, 0, 1), Date.now() - lookbackDays * 24 * 60 * 60 * 1000));
  const period2 = new Date();

  for (const yahooSymbol of getYahooFetchSymbols(symbol)) {
    try {
      const historical = await withTimeout(
        yahooFinance.chart(yahooSymbol, {
          period1,
          period2,
          interval: "1d",
        }) as Promise<{ quotes?: YahooChartQuote[] }>,
        MARKET_SEASONALITY_TIMEOUT_MS,
        yahooSymbol
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
      // try alias/fallback symbol
    }
  }

  const openbbCandles = await fetchOpenBBHistoricalCandles(normalizeSymbol(symbol), lookbackDays);
  if (openbbCandles.length >= 250) {
    return openbbCandles;
  }

  const stooqSymbol = getStooqSymbol(symbol);
  const bundledSymbol = INDEX_PROXY_SYMBOLS[normalizeSymbol(symbol)] ?? normalizeSymbol(symbol);
  const bundledCandles = BUNDLED_SEASONALITY_HISTORY[bundledSymbol];
  if (!stooqSymbol) return bundledCandles ?? [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STOOQ_TIMEOUT_MS);
  try {
    const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/csv,*/*;q=0.8",
      },
    });
    if (!response.ok) return [];

    const csv = (await response.text()).trim();
    const lines = csv
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 3) return [];

    const header = lines[0].split(",").map((value) => value.trim().toLowerCase());
    const dateIndex = header.indexOf("date");
    const openIndex = header.indexOf("open");
    const highIndex = header.indexOf("high");
    const lowIndex = header.indexOf("low");
    const closeIndex = header.indexOf("close");
    const volumeIndex = header.indexOf("volume");
    if ([dateIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) return [];

    const candles: CandleData[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const time = (parts[dateIndex] || "").trim();
      const open = Number.parseFloat(parts[openIndex] || "");
      const high = Number.parseFloat(parts[highIndex] || "");
      const low = Number.parseFloat(parts[lowIndex] || "");
      const close = Number.parseFloat(parts[closeIndex] || "");
      const volume = volumeIndex >= 0 ? Number.parseFloat(parts[volumeIndex] || "0") : 0;
      if (!time || !Number.isFinite(close) || close <= 0) continue;
      candles.push({
        time,
        open: Number.isFinite(open) ? open : close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }
    if (candles.length >= 250) {
      return candles;
    }
  } catch {
    // fall through to bundled history
  } finally {
    clearTimeout(timeout);
  }

  return bundledCandles ?? [];
}

function toDatedCandles(candles: CandleData[]): DatedCandle[] {
  return candles
    .map((candle) => {
      const date = new Date(`${candle.time}T00:00:00Z`);
      if (Number.isNaN(date.getTime())) return null;
      return {
        ...candle,
        date,
      };
    })
    .filter((candle): candle is DatedCandle => candle !== null)
    .sort((a, b) => a.time.localeCompare(b.time));
}

function buildDailyReturns(candles: DatedCandle[]): ReturnPoint[] {
  const returns: ReturnPoint[] = [];
  for (let index = 1; index < candles.length; index++) {
    const returnPct = calcReturnPct(candles[index - 1].close, candles[index].close);
    if (returnPct === null) continue;
    returns.push({
      index,
      date: candles[index].date,
      returnPct,
    });
  }
  return returns;
}

function buildMonthlyAndWeekdayStats(returns: ReturnPoint[]) {
  const monthlyReturns = Array.from({ length: 12 }, () => [] as number[]);
  const weekdayReturns = Array.from({ length: 5 }, () => [] as number[]);

  for (const point of returns) {
    const weekday = point.date.getUTCDay();
    if (weekday >= 1 && weekday <= 5) {
      weekdayReturns[weekday - 1].push(point.returnPct);
    }
    monthlyReturns[point.date.getUTCMonth()].push(point.returnPct);
  }

  return {
    monthly: bucketize(["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"], monthlyReturns),
    weekday: bucketize(["Mo", "Di", "Mi", "Do", "Fr"], weekdayReturns),
  };
}

function buildGroupedIndices(candles: DatedCandle[], keyFn: (date: Date) => string): number[][] {
  const groups = new Map<string, number[]>();
  candles.forEach((candle, index) => {
    const key = keyFn(candle.date);
    const current = groups.get(key) || [];
    current.push(index);
    groups.set(key, current);
  });
  return Array.from(groups.values());
}

function returnByIndex(returns: ReturnPoint[]): Map<number, number> {
  return new Map(returns.map((point) => [point.index, point.returnPct]));
}

function compoundIndices(indices: number[], byIndex: Map<number, number>): number | null {
  const values = indices
    .map((index) => byIndex.get(index))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return compoundReturnPct(values);
}

function buildEventCycles(candles: DatedCandle[], returns: ReturnPoint[]): CycleEventStat[] {
  const byIndex = returnByIndex(returns);
  const monthGroups = buildGroupedIndices(candles, monthKey);
  const quarterGroups = buildGroupedIndices(candles, quarterKey);
  const indexByDate = new Map(candles.map((candle, index) => [candle.time, index]));

  const monthStart: number[] = [];
  const monthEnd: number[] = [];
  const turnOfMonth: number[] = [];
  const turnOfQuarter: number[] = [];
  const restOfMonthReturns: number[] = [];
  const firstTradingDayMonth: number[] = [];
  const lastTradingDayMonth: number[] = [];
  const firstWeekMonth: number[] = [];
  const lastWeekMonth: number[] = [];
  const firstHalfMonth: number[] = [];
  const secondHalfMonth: number[] = [];
  const quarterEndWeek: number[] = [];
  const quarterStartWeek: number[] = [];
  const fomcWindow: number[] = [];
  const fomcPreDay: number[] = [];
  const fomcNextDay: number[] = [];
  const fomcPlusTwo: number[] = [];

  for (let index = 0; index < monthGroups.length; index++) {
    const group = monthGroups[index];
    const prev = monthGroups[index - 1];
    const firstThree = group.slice(0, 3);
    const lastThree = group.slice(-3);
    const turnWindow = [...(prev ? prev.slice(-1) : []), ...firstThree];

    const startReturn = compoundIndices(firstThree, byIndex);
    const endReturn = compoundIndices(lastThree, byIndex);
    const turnReturn = compoundIndices(turnWindow, byIndex);
    const firstDayReturn = compoundIndices(group.slice(0, 1), byIndex);
    const lastDayReturn = compoundIndices(group.slice(-1), byIndex);
    const firstWeekReturn = compoundIndices(group.slice(0, 5), byIndex);
    const lastWeekReturn = compoundIndices(group.slice(-5), byIndex);
    const midpoint = Math.ceil(group.length / 2);
    const firstHalfReturn = compoundIndices(group.slice(0, midpoint), byIndex);
    const secondHalfReturn = compoundIndices(group.slice(midpoint), byIndex);

    if (startReturn !== null) monthStart.push(startReturn);
    if (endReturn !== null) monthEnd.push(endReturn);
    if (turnReturn !== null) turnOfMonth.push(turnReturn);
    if (firstDayReturn !== null) firstTradingDayMonth.push(firstDayReturn);
    if (lastDayReturn !== null) lastTradingDayMonth.push(lastDayReturn);
    if (firstWeekReturn !== null) firstWeekMonth.push(firstWeekReturn);
    if (lastWeekReturn !== null) lastWeekMonth.push(lastWeekReturn);
    if (firstHalfReturn !== null) firstHalfMonth.push(firstHalfReturn);
    if (secondHalfReturn !== null) secondHalfMonth.push(secondHalfReturn);

    const excluded = new Set([...firstThree, ...(prev ? prev.slice(-1) : [])]);
    for (const point of returns) {
      if (monthKey(point.date) !== monthKey(candles[group[0]].date)) continue;
      if (!excluded.has(point.index)) {
        restOfMonthReturns.push(point.returnPct);
      }
    }
  }

  for (let index = 1; index < quarterGroups.length; index++) {
    const group = quarterGroups[index];
    const prev = quarterGroups[index - 1];
    const window = [...prev.slice(-3), ...group.slice(0, 3)];
    const quarterReturn = compoundIndices(window, byIndex);
    if (quarterReturn !== null) turnOfQuarter.push(quarterReturn);

    const prevQuarterEndWeek = compoundIndices(prev.slice(-5), byIndex);
    if (prevQuarterEndWeek !== null) quarterEndWeek.push(prevQuarterEndWeek);

    const currentQuarterStartWeek = compoundIndices(group.slice(0, 5), byIndex);
    if (currentQuarterStartWeek !== null) quarterStartWeek.push(currentQuarterStartWeek);
  }

  const santaRally: number[] = [];
  const halloween: number[] = [];
  const summer: number[] = [];
  const januaryMonth: number[] = [];
  const firstFiveJanuary: number[] = [];
  const optionsExpirationWeek: number[] = [];
  const optionsExpirationFriday: number[] = [];
  const optionsExpirationNextWeek: number[] = [];
  const earningsSeasonWindow: number[] = [];
  const tripleWitchingWeek: number[] = [];

  for (const group of monthGroups) {
    if (group.length === 0) continue;
    const firstDate = candles[group[0]]?.date;
    if (!firstDate) continue;

    const monthlyReturn = compoundIndices(group, byIndex);
    if (firstDate.getUTCMonth() === 0) {
      if (monthlyReturn !== null) januaryMonth.push(monthlyReturn);
      const januaryFirstFive = compoundIndices(group.slice(0, 5), byIndex);
      if (januaryFirstFive !== null) firstFiveJanuary.push(januaryFirstFive);
    }

    const opExIndex = group.findIndex((index) => {
      const date = candles[index]?.date;
      if (!date) return false;
      const day = date.getUTCDate();
      const weekday = date.getUTCDay();
      return weekday === 5 && day >= 15 && day <= 21;
    });
    if (opExIndex >= 0) {
      const opExWindow = group.slice(Math.max(0, opExIndex - 4), Math.min(group.length, opExIndex + 1));
      const opExReturn = compoundIndices(opExWindow, byIndex);
      if (opExReturn !== null) optionsExpirationWeek.push(opExReturn);

      const opExFriday = compoundIndices(group.slice(opExIndex, opExIndex + 1), byIndex);
      if (opExFriday !== null) optionsExpirationFriday.push(opExFriday);

      const opExNextWeek = compoundIndices(group.slice(opExIndex + 1, opExIndex + 6), byIndex);
      if (opExNextWeek !== null) optionsExpirationNextWeek.push(opExNextWeek);

      const month = firstDate.getUTCMonth();
      if ([2, 5, 8, 11].includes(month)) {
        if (opExReturn !== null) tripleWitchingWeek.push(opExReturn);
      }
    }

    if ([0, 3, 6, 9].includes(firstDate.getUTCMonth())) {
      const earningsWindow = compoundIndices(group.slice(0, 10), byIndex);
      if (earningsWindow !== null) earningsSeasonWindow.push(earningsWindow);
    }
  }

  const years = Array.from(new Set(candles.map((candle) => candle.date.getUTCFullYear()))).sort((a, b) => a - b);
  for (const year of years) {
    const dec = candles
      .map((candle, index) => ({ candle, index }))
      .filter(({ candle }) => candle.date.getUTCFullYear() === year && candle.date.getUTCMonth() === 11)
      .map(({ index }) => index);
    const jan = candles
      .map((candle, index) => ({ candle, index }))
      .filter(({ candle }) => candle.date.getUTCFullYear() === year + 1 && candle.date.getUTCMonth() === 0)
      .map(({ index }) => index);

    const santaWindow = [...dec.slice(-5), ...jan.slice(0, 2)];
    const santaReturn = compoundIndices(santaWindow, byIndex);
    if (santaReturn !== null) santaRally.push(santaReturn);

    const winterWindow = candles
      .map((candle, index) => ({ candle, index }))
      .filter(({ candle }) => {
        const y = candle.date.getUTCFullYear();
        const month = candle.date.getUTCMonth();
        return (y === year && month >= 10) || (y === year + 1 && month <= 3);
      })
      .map(({ index }) => index);
    const summerWindow = candles
      .map((candle, index) => ({ candle, index }))
      .filter(({ candle }) => {
        const y = candle.date.getUTCFullYear();
        const month = candle.date.getUTCMonth();
        return y === year && month >= 4 && month <= 9;
      })
      .map(({ index }) => index);

    const winterReturn = compoundIndices(winterWindow, byIndex);
    const summerReturn = compoundIndices(summerWindow, byIndex);
    if (winterReturn !== null) halloween.push(winterReturn);
    if (summerReturn !== null) summer.push(summerReturn);
  }

  for (const meetingDate of FOMC_MEETING_END_DATES) {
    const idx = indexByDate.get(meetingDate);
    if (typeof idx !== "number") continue;

    const window = [idx - 1, idx, idx + 1, idx + 2].filter((value) => value > 0 && value < candles.length);
    const preDayWindow = [idx - 1].filter((value) => value > 0 && value < candles.length);
    const nextDayWindow = [idx, idx + 1].filter((value) => value > 0 && value < candles.length);
    const plusTwoWindow = [idx, idx + 1, idx + 2].filter((value) => value > 0 && value < candles.length);

    const fomcReturn = compoundIndices(window, byIndex);
    const fomcPre = compoundIndices(preDayWindow, byIndex);
    const fomcDayPlusOne = compoundIndices(nextDayWindow, byIndex);
    const fomcAfter = compoundIndices(plusTwoWindow, byIndex);

    if (fomcReturn !== null) fomcWindow.push(fomcReturn);
    if (fomcPre !== null) fomcPreDay.push(fomcPre);
    if (fomcDayPlusOne !== null) fomcNextDay.push(fomcDayPlusOne);
    if (fomcAfter !== null) fomcPlusTwo.push(fomcAfter);
  }

  return [
    buildCycleStat("turn-of-month", "Turn of Month", "Letzter Handelstag des Monats plus erste drei Handelstage.", turnOfMonth),
    buildCycleStat("first-trading-day", "Erster Handelstag", "Nur der erste Handelstag jedes Monats.", firstTradingDayMonth),
    buildCycleStat("last-trading-day", "Letzter Handelstag", "Nur der letzte Handelstag jedes Monats.", lastTradingDayMonth),
    buildCycleStat("month-start", "Monatsstart", "Erste drei Handelstage eines Monats.", monthStart),
    buildCycleStat("month-end", "Monatsende", "Letzte drei Handelstage eines Monats.", monthEnd),
    buildCycleStat("first-week", "Erste Woche", "Erste fünf Handelstage jedes Monats.", firstWeekMonth),
    buildCycleStat("last-week", "Letzte Woche", "Letzte fünf Handelstage jedes Monats.", lastWeekMonth),
    buildCycleStat("first-half", "Erste Monatshälfte", "Erste Hälfte der Handelstage eines Monats.", firstHalfMonth),
    buildCycleStat("second-half", "Zweite Monatshälfte", "Zweite Hälfte der Handelstage eines Monats.", secondHalfMonth),
    buildCycleStat("turn-of-quarter", "Turn of Quarter", "Letzte drei Handelstage des Quartals plus erste drei des neuen Quartals.", turnOfQuarter),
    buildCycleStat("quarter-start-week", "Quarter-Start-Woche", "Erste fünf Handelstage eines neuen Quartals.", quarterStartWeek),
    buildCycleStat("quarter-end-week", "Quarter-End Woche", "Letzte fünf Handelstage eines Quartals.", quarterEndWeek),
    buildCycleStat("fomc-window", "FOMC-Fenster", "Handelstag vor der FOMC-Entscheidung bis zwei Handelstage danach.", fomcWindow),
    buildCycleStat("fomc-minus-one", "FOMC -1", "Nur der Handelstag vor der FOMC-Entscheidung.", fomcPreDay),
    buildCycleStat("fomc-day-plus-one", "FOMC +1", "Meeting-Tag plus nächster Handelstag nach der Fed-Entscheidung.", fomcNextDay),
    buildCycleStat("fomc-plus-two", "FOMC +2", "Meeting-Tag plus die nächsten zwei Handelstage nach der Fed-Entscheidung.", fomcPlusTwo),
    buildCycleStat("january-effect", "January Effect", "Kompletter Januar pro Jahr als saisonales Monatsfenster.", januaryMonth),
    buildCycleStat("first-five-january", "Erste 5 Tage Januar", "Erste fünf Handelstage des Jahres.", firstFiveJanuary),
    buildCycleStat("opex-week", "OpEx-Woche", "Handelswoche bis zum monatlichen Verfall am dritten Freitag.", optionsExpirationWeek),
    buildCycleStat("opex-friday", "OpEx-Freitag", "Nur der dritte Freitag des Monats als monatlicher Verfallstag.", optionsExpirationFriday),
    buildCycleStat("opex-next-week", "OpEx-Folgewoche", "Die fünf Handelstage direkt nach dem monatlichen Verfall.", optionsExpirationNextWeek),
    buildCycleStat("triple-witching", "Triple Witching", "Quartalsweiser Verfall in Mrz/Jun/Sep/Dez rund um den dritten Freitag.", tripleWitchingWeek),
    buildCycleStat("earnings-season", "Earnings Season", "Erste zehn Handelstage in Jan/Apr/Jul/Okt als Earnings-Fenster.", earningsSeasonWindow),
    buildCycleStat("santa-rally", "Santa Rally", "Letzte fünf Handelstage im Dezember plus erste zwei im Januar.", santaRally),
    buildCycleStat("nov-apr", "Nov bis Apr", "Halbjahresfenster des Halloween-Effekts.", halloween),
    buildCycleStat("may-oct", "Mai bis Okt", "Sommerhalbjahr als Gegenpol zum Halloween-Effekt.", summer),
    buildCycleStat("rest-of-month", "Rest des Monats", "Normale Tagesrenditen außerhalb des Turn-of-Month-Fensters.", restOfMonthReturns),
  ];
}

function cycleForYear(year: number): PresidentialCycleYear["cycleKey"] {
  const mod = ((year % 4) + 4) % 4;
  if (mod === 0) return "election";
  if (mod === 1) return "post-election";
  if (mod === 2) return "midterm";
  return "pre-election";
}

function cycleLabel(cycle: PresidentialCycleYear["cycleKey"]): string {
  if (cycle === "post-election") return "Post-Election";
  if (cycle === "midterm") return "Midterm";
  if (cycle === "pre-election") return "Pre-Election";
  return "Election";
}

function buildPresidentialCycle(candles: DatedCandle[]): {
  summary: PresidentialCycleSummary[];
  years: PresidentialCycleYear[];
  midtermYears: PresidentialCycleYear[];
} {
  const years = Array.from(new Set(candles.map((candle) => candle.date.getUTCFullYear()))).sort((a, b) => a - b);
  const rows: PresidentialCycleYear[] = [];

  for (const year of years) {
    const inYear = candles
      .map((candle, index) => ({ candle, index }))
      .filter(({ candle }) => candle.date.getUTCFullYear() === year);
    if (inYear.length < 120) continue;

    const firstClose = inYear[0]?.candle.close ?? null;
    const lastClose = inYear[inYear.length - 1]?.candle.close ?? null;
    const annualReturnPct =
      firstClose !== null && lastClose !== null && firstClose > 0
        ? ((lastClose / firstClose) - 1) * 100
        : null;

    let peak = inYear[0].candle.close;
    let troughDate: string | null = null;
    let troughIndex = -1;
    let maxDrawdownPct = 0;

    for (const { candle, index } of inYear) {
      peak = Math.max(peak, candle.close);
      const drawdownPct = peak > 0 ? ((candle.close / peak) - 1) * 100 : 0;
      if (drawdownPct < maxDrawdownPct) {
        maxDrawdownPct = drawdownPct;
        troughDate = candle.time;
        troughIndex = index;
      }
    }

    let forward1yReturnPct: number | null = null;
    if (troughIndex >= 0 && candles[troughIndex + 252]) {
      forward1yReturnPct = calcReturnPct(candles[troughIndex].close, candles[troughIndex + 252].close);
    }

    const cycleKey = cycleForYear(year);
    rows.push({
      year,
      cycleKey,
      cycleLabel: cycleLabel(cycleKey),
      annualReturnPct,
      maxDrawdownPct,
      troughDate,
      forward1yReturnPct,
    });
  }

  const orderedCycles: PresidentialCycleYear["cycleKey"][] = ["post-election", "midterm", "pre-election", "election"];
  const summary = orderedCycles.map((key) => {
    const subset = rows.filter((row) => row.cycleKey === key);
    const annuals = subset
      .map((row) => row.annualReturnPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const drawdowns = subset
      .map((row) => row.maxDrawdownPct)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const positive = annuals.filter((value) => value > 0).length;

    return {
      cycleKey: key,
      label: cycleLabel(key),
      avgReturnPct: annuals.length > 0 ? annuals.reduce((sum, value) => sum + value, 0) / annuals.length : 0,
      medianReturnPct: median(annuals),
      positiveRatePct: annuals.length > 0 ? (positive / annuals.length) * 100 : 0,
      sampleSize: annuals.length,
      avgMaxDrawdownPct: drawdowns.length > 0 ? drawdowns.reduce((sum, value) => sum + value, 0) / drawdowns.length : null,
    };
  });

  return {
    summary,
    years: rows,
    midtermYears: rows.filter((row) => row.cycleKey === "midterm"),
  };
}

export async function fetchMarketSeasonalityOverview(
  symbol: string,
  options: { forceRefresh?: boolean } = {}
): Promise<MarketSeasonalityOverview> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const bundledSymbol = INDEX_PROXY_SYMBOLS[normalizedSymbol] ?? normalizedSymbol;
  const cacheKey = `${MARKET_SEASONALITY_CACHE_PREFIX}${normalizedSymbol}`;
  const cached = await smartCacheGet<MarketSeasonalityOverview>(cacheKey);
  const persistedSnapshotPromise = readPersistentSnapshot<MarketSeasonalityOverview>("market-seasonality", normalizedSymbol, {
    maxAgeMs: MARKET_SEASONALITY_SNAPSHOT_MAX_AGE_MS,
  });

  if (!options.forceRefresh) {
    if (cached.data && !cached.isStale) {
      return cached.data;
    }
  }

  try {
    const fetchedCandles = await fetchHistoricalCandles(normalizedSymbol, MARKET_SEASONALITY_LOOKBACK_DAYS);
    const bundledCandles = BUNDLED_SEASONALITY_HISTORY[bundledSymbol] ?? [];
    const rawCandles = fetchedCandles.length >= 500 ? fetchedCandles : bundledCandles;
    const candles = toDatedCandles(rawCandles);
    if (candles.length < 500) {
      throw new Error(`Not enough history for market seasonality: ${normalizedSymbol}`);
    }

    const returns = buildDailyReturns(candles);
    const { monthly, weekday } = buildMonthlyAndWeekdayStats(returns);
    const eventCycles = buildEventCycles(candles, returns);
    const presidentialCycle = buildPresidentialCycle(candles);

    const overview: MarketSeasonalityOverview = {
      symbol: normalizedSymbol,
      source: normalizedSymbol.startsWith("^") ? "yahoo index history" : "yahoo/openbb daily history",
      fetchedAt: new Date().toISOString(),
      historyYears: Number((candles.length / 252).toFixed(1)),
      tradingDays: candles.length,
      monthly,
      weekday,
      eventCycles,
      presidentialCycle,
      summary: {
        bestMonth: [...monthly].sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null,
        worstMonth: [...monthly].sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0] ?? null,
        bestWeekday: [...weekday].sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null,
        worstWeekday: [...weekday].sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0] ?? null,
        strongestEvent: [...eventCycles].sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null,
        weakestEvent: [...eventCycles].sort((a, b) => a.avgReturnPct - b.avgReturnPct)[0] ?? null,
      },
      sourceLinks: [
        { label: "Yahoo History", url: `https://finance.yahoo.com/quote/${encodeURIComponent(normalizedSymbol)}/history` },
        { label: "TradingView", url: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(normalizedSymbol)}` },
      ],
      disclaimer:
        "Die Zyklen sind statistische Rückblicke auf historische Tagesdaten. Sie helfen beim Kontext, ersetzen aber kein Regime-, News- oder Risikomanagement.",
    };

    await smartCacheSet(cacheKey, overview, {
      freshTtlSeconds: MARKET_SEASONALITY_FRESH_TTL_SECONDS,
      staleTtlSeconds: MARKET_SEASONALITY_STALE_TTL_SECONDS,
    });
    await writePersistentSnapshot("market-seasonality", normalizedSymbol, overview);
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
