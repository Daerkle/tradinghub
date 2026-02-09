import YahooFinance from 'yahoo-finance2';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  dailyPrices,
  intradayPrices,
  earnings,
  newsEvents,
  backfillProgress,
  NewDailyPrice,
  NewEarnings,
  NewNewsEvent,
} from '../schema';
import { getAllUSStockSymbols } from '@/lib/stock-universe';
import { fetchStockNews as fetchScannerNews } from '@/lib/scanner-service';

const yahooFinance = new YahooFinance({
  queue: { concurrency: 2 },
});

// Keep request pacing conservative for open endpoints
const RATE_LIMIT_DELAY = 200;
const EARNINGS_SYMBOL_LIMIT = Number.parseInt(
  process.env.BACKFILL_EARNINGS_SYMBOL_LIMIT || '1200',
  10
);
const MAX_NEWS_ITEMS_PER_SYMBOL = 120;

interface OpenHistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  changePercent?: number;
  vwap?: number;
}

interface OpenEarnings {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  revenueActual: number | null;
  revenueEstimated: number | null;
  time?: string;
}

interface OpenNews {
  symbol: string;
  publishedDate: string;
  title: string;
  text: string;
  url: string;
  site: string;
  sentiment?: string;
  sentimentScore?: number;
}

interface OpenIntradayPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface YahooQuotePoint {
  date: Date | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
}

type UnknownRecord = Record<string, unknown>;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

function toIsoDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateRangeStart(dateValue: string): Date {
  const date = new Date(`${dateValue}T00:00:00Z`);
  return isValidDate(date) ? date : new Date(dateValue);
}

function parseDateRangeEnd(dateValue: string): Date {
  const date = new Date(`${dateValue}T23:59:59Z`);
  return isValidDate(date) ? date : new Date(dateValue);
}

function toNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'raw' in (value as UnknownRecord)) {
    return toNumeric((value as UnknownRecord).raw);
  }
  return null;
}

function toDateValue(value: unknown): Date | null {
  if (value instanceof Date) {
    return isValidDate(value) ? value : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const millis = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(millis);
    return isValidDate(date) ? date : null;
  }

  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const date = new Date(`${raw}T00:00:00Z`);
      return isValidDate(date) ? date : null;
    }

    const date = new Date(raw);
    return isValidDate(date) ? date : null;
  }

  if (value && typeof value === 'object') {
    const record = value as UnknownRecord;
    if ('raw' in record) {
      const fromRaw = toDateValue(record.raw);
      if (fromRaw) return fromRaw;
    }
    if ('fmt' in record) {
      const fromFmt = toDateValue(record.fmt);
      if (fromFmt) return fromFmt;
    }
  }

  return null;
}

function normalizeTimeOfDay(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().toUpperCase();
  if (!raw) return undefined;
  if (raw.includes('BEFORE') || raw === 'BMO') return 'BMO';
  if (raw.includes('AFTER') || raw === 'AMC') return 'AMC';
  if (raw === 'TNS') return 'TNS';
  return raw.slice(0, 10);
}

function sentimentFromHeadline(title: string): { sentiment?: string; score?: number } {
  const text = title.toLowerCase();
  const positive = /(beat|surge|jumps?|raises?|upgrade|buyback|record|growth|strong|bullish|wins?)/;
  const negative = /(miss|falls?|drops?|cuts?|downgrade|lawsuit|probe|warns?|weak|bearish|plunge)/;

  if (positive.test(text) && !negative.test(text)) {
    return { sentiment: 'positive', score: 0.65 };
  }
  if (negative.test(text) && !positive.test(text)) {
    return { sentiment: 'negative', score: -0.65 };
  }
  return { sentiment: 'neutral', score: 0 };
}

function splitDateRange(from: Date, to: Date, maxDays: number): Array<{ from: Date; to: Date }> {
  const windows: Array<{ from: Date; to: Date }> = [];
  const maxMillis = maxDays * 24 * 60 * 60 * 1000;

  let cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime()) {
    const end = new Date(Math.min(cursor.getTime() + maxMillis, to.getTime()));
    windows.push({ from: new Date(cursor.getTime()), to: end });
    cursor = new Date(end.getTime() + 60 * 1000);
  }

  return windows;
}

function filterByDateRange<T extends { date: string }>(items: T[], fromDate: string, toDate: string): T[] {
  return items.filter((item) => item.date >= fromDate && item.date <= toDate);
}

// ============================================
// Backfill Progress Management
// ============================================

export async function getBackfillProgress(dataType: string) {
  return db.select().from(backfillProgress).where(eq(backfillProgress.dataType, dataType));
}

export async function updateBackfillProgress(
  dataType: string,
  symbol: string | null,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  updates: {
    lastProcessedDate?: string;
    totalRecords?: number;
    processedRecords?: number;
    errorMessage?: string;
  }
) {
  const existing = await db.select()
    .from(backfillProgress)
    .where(and(
      eq(backfillProgress.dataType, dataType),
      symbol ? eq(backfillProgress.symbol, symbol) : sql`${backfillProgress.symbol} IS NULL`
    ));

  if (existing.length > 0) {
    await db.update(backfillProgress)
      .set({
        status,
        ...updates,
        completedAt: status === 'completed' ? new Date() : undefined,
      })
      .where(eq(backfillProgress.id, existing[0].id));
  } else {
    await db.insert(backfillProgress).values({
      dataType,
      symbol,
      status,
      startedAt: new Date(),
      ...updates,
    });
  }
}

// ============================================
// Daily Price Backfill (open sources)
// ============================================

async function fetchDailyPricesFromYahoo(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<OpenHistoricalPrice[]> {
  try {
    const period1 = parseDateRangeStart(fromDate);
    const period2 = parseDateRangeEnd(toDate);

    const chart = await yahooFinance.chart(symbol.toUpperCase(), {
      period1,
      period2,
      interval: '1d',
    });

    const quotes = ((chart as unknown as { quotes?: YahooQuotePoint[] }).quotes || [])
      .map((q) => {
        const date = toDateValue(q.date);
        const open = toNumeric(q.open);
        const high = toNumeric(q.high);
        const low = toNumeric(q.low);
        const close = toNumeric(q.close);
        const volume = toNumeric(q.volume);
        if (!date || close === null || close <= 0) return null;
        return {
          date: toIsoDate(date),
          open: open ?? close,
          high: high ?? close,
          low: low ?? close,
          close,
          volume: volume ?? 0,
        };
      })
      .filter((row): row is { date: string; open: number; high: number; low: number; close: number; volume: number } => row !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    let previousClose: number | null = null;
    const normalized: OpenHistoricalPrice[] = [];
    for (const q of quotes) {
      const changePercent = previousClose && previousClose !== 0
        ? ((q.close - previousClose) / Math.abs(previousClose)) * 100
        : undefined;
      normalized.push({
        ...q,
        changePercent,
      });
      previousClose = q.close;
    }

    return filterByDateRange(normalized, fromDate, toDate);
  } catch (error) {
    console.error(`Yahoo daily API error for ${symbol}:`, error);
    return [];
  }
}

async function fetchDailyPricesFromStooq(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<OpenHistoricalPrice[]> {
  try {
    const stooqSymbol = `${symbol.toLowerCase()}.us`;
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'text/csv,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return [];
    }

    const csv = (await response.text()).trim();
    const lines = csv.split(/\r?\n/);
    if (lines.length <= 1) return [];

    const rows: OpenHistoricalPrice[] = [];
    for (const line of lines.slice(1)) {
      const [date, openRaw, highRaw, lowRaw, closeRaw, volumeRaw] = line.split(',');
      if (!date || date === 'N/D') continue;
      if (date < fromDate || date > toDate) continue;

      const open = Number.parseFloat(openRaw || '');
      const high = Number.parseFloat(highRaw || '');
      const low = Number.parseFloat(lowRaw || '');
      const close = Number.parseFloat(closeRaw || '');
      const volume = Number.parseFloat(volumeRaw || '');
      if (!Number.isFinite(close) || close <= 0) continue;

      rows.push({
        date,
        open: Number.isFinite(open) ? open : close,
        high: Number.isFinite(high) ? high : close,
        low: Number.isFinite(low) ? low : close,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));
    let previousClose: number | null = null;
    for (const row of rows) {
      row.changePercent = previousClose && previousClose !== 0
        ? ((row.close - previousClose) / Math.abs(previousClose)) * 100
        : undefined;
      previousClose = row.close;
    }

    return rows;
  } catch (error) {
    console.error(`Stooq daily API error for ${symbol}:`, error);
    return [];
  }
}

export async function fetchDailyPrices(
  symbol: string,
  fromDate: string,
  toDate: string
): Promise<OpenHistoricalPrice[]> {
  const yahooRows = await fetchDailyPricesFromYahoo(symbol, fromDate, toDate);
  if (yahooRows.length > 0) {
    return yahooRows;
  }

  return fetchDailyPricesFromStooq(symbol, fromDate, toDate);
}

export async function backfillDailyPricesForSymbol(
  symbol: string,
  fromDate: string = '2015-01-01',
  toDate: string = new Date().toISOString().split('T')[0]
): Promise<number> {
  const prices = await fetchDailyPrices(symbol, fromDate, toDate);
  if (prices.length === 0) return 0;

  const records: NewDailyPrice[] = prices.map((p) => ({
    symbol,
    date: p.date,
    open: p.open?.toString(),
    high: p.high?.toString(),
    low: p.low?.toString(),
    close: p.close?.toString(),
    volume: Math.round(p.volume),
    changePercent: p.changePercent?.toString(),
    vwap: p.vwap?.toString(),
  }));

  const batchSize = 1000;
  let inserted = 0;

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    try {
      await db.insert(dailyPrices)
        .values(batch)
        .onConflictDoNothing();
      inserted += batch.length;
    } catch (error) {
      console.error(`Error inserting daily prices batch for ${symbol}:`, error);
    }
  }

  return inserted;
}

export async function backfillAllDailyPrices(
  onProgress?: (current: number, total: number, symbol: string) => void
): Promise<{ processed: number; total: number }> {
  const symbols = getAllUSStockSymbols();
  const total = symbols.length;
  let processed = 0;

  await updateBackfillProgress('daily', null, 'in_progress', { totalRecords: total, processedRecords: 0 });

  for (const symbol of symbols) {
    try {
      await backfillDailyPricesForSymbol(symbol);
      processed++;

      await updateBackfillProgress('daily', null, 'in_progress', {
        processedRecords: processed,
        lastProcessedDate: symbol,
      });

      if (onProgress) {
        onProgress(processed, total, symbol);
      }

      await sleep(RATE_LIMIT_DELAY);
    } catch (error) {
      console.error(`Failed to backfill ${symbol}:`, error);
    }
  }

  await updateBackfillProgress('daily', null, 'completed', {
    processedRecords: processed,
    totalRecords: total,
  });

  return { processed, total };
}

// ============================================
// Earnings Backfill (Yahoo open endpoint)
// ============================================

async function fetchYahooEarningsForSymbol(symbol: string): Promise<OpenEarnings[]> {
  try {
    const summary = await yahooFinance.quoteSummary(symbol.toUpperCase(), {
      modules: ['earningsHistory', 'calendarEvents'],
    });

    const records: OpenEarnings[] = [];
    const summaryRecord = summary as unknown as UnknownRecord;
    const calendarEvents = (summaryRecord.calendarEvents || {}) as UnknownRecord;
    const earningsInfo = (calendarEvents.earnings || {}) as UnknownRecord;
    const callTime = normalizeTimeOfDay(earningsInfo.earningsCallTime);

    const earningsHistory = ((summaryRecord.earningsHistory || {}) as UnknownRecord).history;
    if (Array.isArray(earningsHistory)) {
      for (const item of earningsHistory) {
        const row = item as UnknownRecord;
        const dateValue = toDateValue(row.quarter || row.date || row.earningsDate);
        if (!dateValue) continue;
        records.push({
          symbol,
          date: toIsoDate(dateValue),
          epsActual: toNumeric(row.epsActual),
          epsEstimated: toNumeric(row.epsEstimate ?? row.epsEstimated),
          revenueActual: null,
          revenueEstimated: null,
          time: callTime,
        });
      }
    }

    const earningsDates = earningsInfo.earningsDate;
    if (Array.isArray(earningsDates)) {
      for (const rawDate of earningsDates) {
        const earningsDate = toDateValue(rawDate);
        if (!earningsDate) continue;
        records.push({
          symbol,
          date: toIsoDate(earningsDate),
          epsActual: null,
          epsEstimated: toNumeric(earningsInfo.earningsAverage),
          revenueActual: null,
          revenueEstimated: null,
          time: callTime,
        });
      }
    }

    const deduped = new Map<string, OpenEarnings>();
    for (const record of records) {
      const key = `${record.symbol}|${record.date}`;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, record);
        continue;
      }

      deduped.set(key, {
        ...existing,
        epsActual: existing.epsActual ?? record.epsActual,
        epsEstimated: existing.epsEstimated ?? record.epsEstimated,
        revenueActual: existing.revenueActual ?? record.revenueActual,
        revenueEstimated: existing.revenueEstimated ?? record.revenueEstimated,
        time: existing.time ?? record.time,
      });
    }

    return Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`Yahoo earnings API error for ${symbol}:`, error);
    return [];
  }
}

export async function fetchEarningsCalendar(
  fromDate: string,
  toDate: string
): Promise<OpenEarnings[]> {
  const symbols = getAllUSStockSymbols(Math.max(1, EARNINGS_SYMBOL_LIMIT));
  const allRecords: OpenEarnings[] = [];

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const records = await fetchYahooEarningsForSymbol(symbol);
    allRecords.push(...records.filter((r) => r.date >= fromDate && r.date <= toDate));
    await sleep(RATE_LIMIT_DELAY);
  }

  const deduped = new Map<string, OpenEarnings>();
  for (const record of allRecords) {
    deduped.set(`${record.symbol}|${record.date}`, record);
  }

  return Array.from(deduped.values()).sort((a, b) => (
    a.date === b.date ? a.symbol.localeCompare(b.symbol) : a.date.localeCompare(b.date)
  ));
}

export async function fetchEarningsSurprises(symbol: string): Promise<OpenEarnings[]> {
  const rows = await fetchYahooEarningsForSymbol(symbol);
  return rows.filter((row) => row.epsActual !== null && row.epsEstimated !== null);
}

export async function backfillEarnings(
  fromYear: number = 2015,
  toYear: number = new Date().getFullYear()
): Promise<{ processed: number; total: number }> {
  const fromDate = `${fromYear}-01-01`;
  const toDate = `${toYear}-12-31`;
  const symbols = getAllUSStockSymbols(Math.max(1, EARNINGS_SYMBOL_LIMIT));

  await updateBackfillProgress('earnings', null, 'in_progress', {
    totalRecords: symbols.length,
    processedRecords: 0,
  });

  let processedSymbols = 0;
  let totalInserted = 0;

  for (const symbol of symbols) {
    try {
      const rows = await fetchYahooEarningsForSymbol(symbol);
      const filtered = rows.filter((r) => r.date >= fromDate && r.date <= toDate);
      if (filtered.length > 0) {
        const records: NewEarnings[] = filtered.map((entry) => {
          const epsSurprise = entry.epsActual !== null && entry.epsEstimated !== null && entry.epsEstimated !== 0
            ? ((entry.epsActual - entry.epsEstimated) / Math.abs(entry.epsEstimated)) * 100
            : null;
          const revSurprise = entry.revenueActual !== null && entry.revenueEstimated !== null && entry.revenueEstimated !== 0
            ? ((entry.revenueActual - entry.revenueEstimated) / Math.abs(entry.revenueEstimated)) * 100
            : null;

          return {
            symbol: entry.symbol,
            date: entry.date,
            epsActual: entry.epsActual?.toString(),
            epsEstimated: entry.epsEstimated?.toString(),
            epsSurprisePercent: epsSurprise?.toString(),
            revenueActual: entry.revenueActual ?? null,
            revenueEstimated: entry.revenueEstimated ?? null,
            revenueSurprisePercent: revSurprise?.toString(),
            timeOfDay: entry.time?.toUpperCase(),
          };
        });

        await db.insert(earnings)
          .values(records)
          .onConflictDoNothing();

        totalInserted += records.length;
      }
    } catch (error) {
      console.error(`Error backfilling earnings for ${symbol}:`, error);
    } finally {
      processedSymbols++;
      if (processedSymbols % 10 === 0 || processedSymbols === symbols.length) {
        await updateBackfillProgress('earnings', null, 'in_progress', {
          processedRecords: processedSymbols,
          totalRecords: symbols.length,
          lastProcessedDate: symbol,
        });
      }
      await sleep(RATE_LIMIT_DELAY);
    }
  }

  await updateBackfillProgress('earnings', null, 'completed', {
    processedRecords: totalInserted,
    totalRecords: symbols.length,
  });

  return { processed: totalInserted, total: symbols.length };
}

// ============================================
// News Backfill (Yahoo + Google RSS via scanner service)
// ============================================

export async function fetchStockNews(
  symbol: string,
  fromDate: string,
  toDate: string,
  page: number = 0
): Promise<OpenNews[]> {
  try {
    const fromMs = parseDateRangeStart(fromDate).getTime();
    const toMs = parseDateRangeEnd(toDate).getTime();
    const sourceItems = await fetchScannerNews(symbol, {
      forceRefresh: page === 0,
      todayOnly: false,
      maxItems: MAX_NEWS_ITEMS_PER_SYMBOL,
    });

    const mapped: OpenNews[] = [];
    for (const item of sourceItems) {
      const publishedAt = toDateValue(item.publishedAt);
      if (!publishedAt) continue;

      const timestamp = publishedAt.getTime();
      if (timestamp < fromMs || timestamp > toMs) continue;

      const title = item.title || '';
      const sentiment = sentimentFromHeadline(title);

      const newsItem: OpenNews = {
        symbol: symbol.toUpperCase(),
        publishedDate: publishedAt.toISOString(),
        title,
        text: '',
        url: item.link || '',
        site: item.publisher || 'Yahoo/Google',
      };

      if (sentiment.sentiment !== undefined) {
        newsItem.sentiment = sentiment.sentiment;
      }
      if (sentiment.score !== undefined) {
        newsItem.sentimentScore = sentiment.score;
      }

      mapped.push(newsItem);
    }

    return mapped;
  } catch (error) {
    console.error(`Error fetching news for ${symbol}:`, error);
    return [];
  }
}

export async function fetchPressReleases(
  symbol: string,
  fromDate: string,
  toDate: string,
  page: number = 0
): Promise<OpenNews[]> {
  const allNews = await fetchStockNews(symbol, fromDate, toDate, page);
  const pressReleasePattern = /(press release|announces?|guidance|conference call|investor relations)/i;
  return allNews.filter((item) => pressReleasePattern.test(item.title));
}

export async function backfillNewsForSymbol(
  symbol: string,
  fromDate: string = '2015-01-01',
  toDate: string = new Date().toISOString().split('T')[0]
): Promise<number> {
  const news = await fetchStockNews(symbol, fromDate, toDate);
  const pressReleases = await fetchPressReleases(symbol, fromDate, toDate);
  const allNews = [...news, ...pressReleases];
  if (allNews.length === 0) return 0;

  const deduped = new Map<string, OpenNews>();
  for (const item of allNews) {
    const key = `${item.url}|${item.title}|${item.publishedDate}`.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  const records: NewNewsEvent[] = Array.from(deduped.values()).map((n) => ({
    symbol: n.symbol || symbol.toUpperCase(),
    publishedDate: new Date(n.publishedDate),
    title: n.title,
    content: n.text,
    url: n.url,
    source: n.site,
    sentiment: n.sentiment,
    sentimentScore: n.sentimentScore?.toString(),
  }));

  try {
    await db.insert(newsEvents)
      .values(records)
      .onConflictDoNothing();
    return records.length;
  } catch (error) {
    console.error(`Error inserting news for ${symbol}:`, error);
    return 0;
  }
}

// ============================================
// Intraday Backfill (Yahoo open endpoint)
// ============================================

export async function fetchIntradayPrices(
  symbol: string,
  timeframe: '5min' | '1hour',
  fromDate: string,
  toDate: string
): Promise<OpenIntradayPrice[]> {
  try {
    const from = parseDateRangeStart(fromDate);
    const to = parseDateRangeEnd(toDate);
    const interval = timeframe === '5min' ? '5m' : '1h';
    const maxWindowDays = timeframe === '5min' ? 58 : 700;
    const windows = splitDateRange(from, to, maxWindowDays);

    const points: OpenIntradayPrice[] = [];
    for (const window of windows) {
      const chart = await yahooFinance.chart(symbol.toUpperCase(), {
        period1: window.from,
        period2: window.to,
        interval,
      });

      const quotes = ((chart as unknown as { quotes?: YahooQuotePoint[] }).quotes || []);
      for (const quote of quotes) {
        const date = toDateValue(quote.date);
        const open = toNumeric(quote.open);
        const high = toNumeric(quote.high);
        const low = toNumeric(quote.low);
        const close = toNumeric(quote.close);
        const volume = toNumeric(quote.volume);

        if (!date || close === null || close <= 0) continue;
        points.push({
          date: date.toISOString(),
          open: open ?? close,
          high: high ?? close,
          low: low ?? close,
          close,
          volume: volume ?? 0,
        });
      }

      await sleep(Math.max(50, Math.floor(RATE_LIMIT_DELAY / 2)));
    }

    const deduped = new Map<string, OpenIntradayPrice>();
    for (const point of points) {
      deduped.set(point.date, point);
    }
    return Array.from(deduped.values()).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`Error fetching intraday prices for ${symbol}:`, error);
    return [];
  }
}

export async function backfillIntradayForSetup(
  symbol: string,
  setupDate: string,
  daysBefore: number = 30,
  daysAfter: number = 60
): Promise<{ hourly: number; fiveMin: number }> {
  const fromDate = new Date(setupDate);
  fromDate.setDate(fromDate.getDate() - daysBefore);
  const toDate = new Date(setupDate);
  toDate.setDate(toDate.getDate() + daysAfter);

  const from = fromDate.toISOString().split('T')[0];
  const to = toDate.toISOString().split('T')[0];

  let hourlyCount = 0;
  let fiveMinCount = 0;

  const hourlyData = await fetchIntradayPrices(symbol, '1hour', from, to);
  if (hourlyData.length > 0) {
    const records = hourlyData.map((p) => ({
      symbol: symbol.toUpperCase(),
      datetime: new Date(p.date),
      timeframe: '1hour',
      open: p.open?.toString(),
      high: p.high?.toString(),
      low: p.low?.toString(),
      close: p.close?.toString(),
      volume: Math.round(p.volume),
    }));

    await db.insert(intradayPrices)
      .values(records)
      .onConflictDoNothing();
    hourlyCount = records.length;
  }

  await sleep(RATE_LIMIT_DELAY);

  const fiveMinData = await fetchIntradayPrices(symbol, '5min', from, to);
  if (fiveMinData.length > 0) {
    const records = fiveMinData.map((p) => ({
      symbol: symbol.toUpperCase(),
      datetime: new Date(p.date),
      timeframe: '5min',
      open: p.open?.toString(),
      high: p.high?.toString(),
      low: p.low?.toString(),
      close: p.close?.toString(),
      volume: Math.round(p.volume),
    }));

    await db.insert(intradayPrices)
      .values(records)
      .onConflictDoNothing();
    fiveMinCount = records.length;
  }

  return { hourly: hourlyCount, fiveMin: fiveMinCount };
}

// ============================================
// Backfill Status
// ============================================

export interface BackfillStatus {
  daily: {
    status: string;
    processed: number;
    total: number;
    lastSymbol?: string;
  };
  earnings: {
    status: string;
    processed: number;
  };
  news: {
    status: string;
    processed: number;
  };
}

export async function getBackfillStatus(): Promise<BackfillStatus> {
  const progress = await db.select().from(backfillProgress);

  const daily = progress.find((p) => p.dataType === 'daily');
  const earningsProgress = progress.find((p) => p.dataType === 'earnings');
  const newsProgress = progress.find((p) => p.dataType === 'news');

  return {
    daily: {
      status: daily?.status || 'pending',
      processed: daily?.processedRecords || 0,
      total: daily?.totalRecords || getAllUSStockSymbols().length,
      lastSymbol: daily?.lastProcessedDate || undefined,
    },
    earnings: {
      status: earningsProgress?.status || 'pending',
      processed: earningsProgress?.processedRecords || 0,
    },
    news: {
      status: newsProgress?.status || 'pending',
      processed: newsProgress?.processedRecords || 0,
    },
  };
}

// ============================================
// Data Statistics
// ============================================

export async function getDataStatistics() {
  const [dailyCount] = await db.select({ count: sql<number>`count(*)` }).from(dailyPrices);
  const [earningsCount] = await db.select({ count: sql<number>`count(*)` }).from(earnings);
  const [newsCount] = await db.select({ count: sql<number>`count(*)` }).from(newsEvents);
  const [intradayCount] = await db.select({ count: sql<number>`count(*)` }).from(intradayPrices);

  const [uniqueSymbols] = await db.select({
    count: sql<number>`count(distinct symbol)`,
  }).from(dailyPrices);

  return {
    dailyPrices: dailyCount?.count || 0,
    earnings: earningsCount?.count || 0,
    news: newsCount?.count || 0,
    intradayPrices: intradayCount?.count || 0,
    uniqueSymbols: uniqueSymbols?.count || 0,
  };
}
