type OpenBBJson = Record<string, unknown>;

export type OpenBBQuoteSnapshot = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  previousClose: number;
  volume: number;
  avgVolume: number;
  marketCap: number;
  peRatio: number;
  forwardPE: number;
  eps: number;
  epsGrowth: number;
  revenueGrowth: number;
  targetPrice: number;
  numAnalysts: number;
  analystRating: string;
  sector: string;
  industry: string;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
};

export type OpenBBCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type OpenBBNewsEntry = {
  title: string;
  link: string;
  publisher: string;
  publishedAt: Date;
};

export type OpenBBFundamentalSnapshot = {
  eps: number;
  peRatio: number;
  forwardPE: number;
  epsGrowth: number;
  targetPrice: number;
  analystRating: string;
  numAnalysts: number;
  sector: string;
  industry: string;
  marketCap: number;
  earningsDate?: string;
};

export type OpenBBOptionChainRow = {
  underlyingSymbol: string;
  underlyingPrice: number;
  contractSymbol: string;
  expiration: string;
  strike: number;
  optionType: "call" | "put";
  openInterest: number;
  volume: number;
  lastTradePrice: number;
  bid: number;
  ask: number;
  impliedVolatility: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  inTheMoney: boolean;
  currency: string;
};

const OPENBB_ENABLED = (process.env.OPENBB_ENABLED || "true").toLowerCase() !== "false";
const OPENBB_BASE_URL = (process.env.OPENBB_BASE_URL || "http://openbb:6900").replace(/\/+$/, "");
const OPENBB_API_PREFIX = `/${(process.env.OPENBB_API_PREFIX || "api/v1").replace(/^\/+|\/+$/g, "")}`;
const OPENBB_PROVIDER = (process.env.OPENBB_PROVIDER || "yfinance").trim();
const OPENBB_NEWS_PROVIDER = (process.env.OPENBB_NEWS_PROVIDER || OPENBB_PROVIDER || "yfinance").trim();
const OPENBB_TIMEOUT_MS = Number.parseInt(process.env.OPENBB_TIMEOUT_MS || "6000", 10);
const OPENBB_MAX_SYMBOLS_PER_SCAN = Number.parseInt(process.env.OPENBB_MAX_SYMBOLS_PER_SCAN || "1000", 10);
const OPENBB_API_KEY = (process.env.OPENBB_API_KEY || "").trim();
const OPENBB_CONCURRENCY = Number.parseInt(process.env.OPENBB_CONCURRENCY || "6", 10);
const OPENBB_QUOTE_BATCH_SIZE_RAW = Number.parseInt(process.env.OPENBB_QUOTE_BATCH_SIZE || "80", 10);
const OPENBB_QUOTE_BATCH_SIZE = Number.isFinite(OPENBB_QUOTE_BATCH_SIZE_RAW) && OPENBB_QUOTE_BATCH_SIZE_RAW > 0
  ? Math.min(OPENBB_QUOTE_BATCH_SIZE_RAW, 250)
  : 80;
const OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT_RAW = Number.parseInt(process.env.OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT || "24", 10);
const OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT =
  Number.isFinite(OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT_RAW) && OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT_RAW > 0
    ? Math.min(OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT_RAW, 200)
    : 24;
const STOOQ_TIMEOUT_MS = 15_000;

function normalizeStooqSymbol(symbol: string): string | null {
  const upper = symbol.toUpperCase().trim();
  if (!upper) return null;

  if (upper === "^GSPC") return "^spx";
  if (upper === "^NDX") return "^ndx";
  if (upper === "^DJI") return "^dji";
  if (upper === "^RUT") return "^rut";
  if (!/^[A-Z0-9.-]{1,10}$/.test(upper)) return null;

  return `${upper.toLowerCase().replace(/\./g, "-")}.us`;
}

function finite(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeGrowthPercent(value: unknown): number {
  const raw = finite(value, NaN);
  if (!Number.isFinite(raw)) return 0;
  if (Math.abs(raw) > 2) return raw;
  return raw * 100;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function toIsoDate(value: unknown): string | null {
  const date = asDate(value);
  if (!date) return null;
  return date.toISOString().split("T")[0];
}

function toApiPath(endpoint: string, params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query.set(key, String(value));
  }
  const queryString = query.toString();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${OPENBB_API_PREFIX}${cleanEndpoint}${queryString ? `?${queryString}` : ""}`;
}

function extractRows(payload: unknown): OpenBBJson[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is OpenBBJson => typeof item === "object" && item !== null);
  }
  if (!payload || typeof payload !== "object") return [];

  const root = payload as OpenBBJson;
  const nestedKeys = ["results", "result", "data", "items", "rows"];
  for (const key of nestedKeys) {
    const nested = root[key];
    if (Array.isArray(nested)) {
      return nested.filter((item): item is OpenBBJson => typeof item === "object" && item !== null);
    }
  }
  return [root];
}

async function fetchJson(path: string): Promise<unknown | null> {
  if (!OPENBB_ENABLED) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENBB_TIMEOUT_MS);
  const url = `${OPENBB_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const headers = new Headers({
      Accept: "application/json,text/plain,*/*",
      "User-Agent": "tradejournal-openbb-client/1.0",
    });
    if (OPENBB_API_KEY) {
      headers.set("Authorization", `Bearer ${OPENBB_API_KEY}`);
      headers.set("X-API-KEY", OPENBB_API_KEY);
    }

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const raw = (await response.text()).trim();
    if (!raw || !raw.startsWith("{") && !raw.startsWith("[")) {
      return null;
    }

    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFirstJson(paths: string[]): Promise<unknown | null> {
  for (const path of paths) {
    const payload = await fetchJson(path);
    if (payload !== null) return payload;
  }
  return null;
}

function parseQuoteSnapshot(row: OpenBBJson): OpenBBQuoteSnapshot | null {
  const symbol = asString(row.symbol || row.ticker || row.asset || row.code).toUpperCase();
  const price = finite(row.last_price ?? row.price ?? row.close ?? row.regular_market_price, 0);
  if (!symbol || price <= 0) return null;

  const change = finite(row.net_change ?? row.change ?? row.regular_market_change, 0);
  const changePercent = finite(
    row.percent_change ?? row.change_percent ?? row.regular_market_change_percent,
    0
  );
  const open = finite(row.open ?? row.regular_market_open, price);
  const dayHigh = finite(row.high ?? row.day_high ?? row.regular_market_day_high, price);
  const dayLow = finite(row.low ?? row.day_low ?? row.regular_market_day_low, price);
  const previousClose = finite(
    row.previous_close ?? row.prev_close ?? row.regular_market_previous_close,
    price
  );
  const volume = finite(row.volume ?? row.regular_market_volume, 0);
  const avgVolume = finite(
    row.avg_volume ?? row.average_volume ?? row.average_daily_volume_3m ?? row.average_daily_volume_10d,
    volume
  );
  const marketCap = finite(row.market_cap, 0);
  const peRatio = finite(row.pe_ratio ?? row.trailing_pe, 0);
  const forwardPE = finite(row.forward_pe, 0);
  const eps = finite(row.eps ?? row.trailing_eps, 0);
  const epsGrowth = normalizeGrowthPercent(row.eps_growth ?? row.earnings_quarterly_growth);
  const revenueGrowth = normalizeGrowthPercent(row.revenue_growth);
  const targetPrice = finite(row.target_price ?? row.target_mean_price, 0);
  const numAnalysts = finite(row.analysts ?? row.number_of_analyst_opinions, 0);
  const analystRating = asString(row.recommendation ?? row.recommendation_key, "N/A");
  const sector = asString(row.sector ?? row.gics_sector, "Unknown");
  const industry = asString(row.industry ?? row.gics_industry, "Unknown");
  const fiftyTwoWeekHigh = finite(row.fifty_two_week_high ?? row.week_52_high, 0);
  const fiftyTwoWeekLow = finite(row.fifty_two_week_low ?? row.week_52_low, 0);

  return {
    symbol,
    name: asString(row.name ?? row.company_name ?? row.short_name ?? row.long_name, symbol),
    price,
    change,
    changePercent,
    open,
    dayHigh,
    dayLow,
    previousClose,
    volume,
    avgVolume,
    marketCap,
    peRatio,
    forwardPE,
    eps,
    epsGrowth,
    revenueGrowth,
    targetPrice,
    numAnalysts,
    analystRating,
    sector,
    industry,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
  };
}

async function fetchQuoteSnapshot(symbol: string): Promise<OpenBBQuoteSnapshot | null> {
  const upper = symbol.toUpperCase();
  const quotePaths = [
    toApiPath("/equity/price/quote", { symbol: upper, provider: OPENBB_PROVIDER }),
    toApiPath("/equity/price/quote", { symbol: upper }),
    toApiPath("/equity/price/quote", { symbols: upper, provider: OPENBB_PROVIDER }),
    toApiPath("/equity/price/quote", { symbols: upper }),
  ];

  const payload = await fetchFirstJson(quotePaths);
  if (!payload) return null;

  const rows = extractRows(payload);
  for (const row of rows) {
    const parsed = parseQuoteSnapshot(row);
    if (!parsed) continue;
    if (parsed.symbol === upper) return parsed;
  }

  if (rows.length === 1) {
    const parsed = parseQuoteSnapshot(rows[0]);
    if (parsed) return parsed;
  }

  return null;
}

async function fetchQuoteSnapshotBatch(symbols: string[]): Promise<Map<string, OpenBBQuoteSnapshot>> {
  const deduped = Array.from(new Set(symbols.map((symbol) => symbol.toUpperCase().trim()).filter(Boolean)));
  const result = new Map<string, OpenBBQuoteSnapshot>();
  if (deduped.length === 0) return result;

  const symbolSet = new Set(deduped);
  const symbolsParam = deduped.join(",");
  const quotePaths = [
    toApiPath("/equity/price/quote", { symbols: symbolsParam, provider: OPENBB_PROVIDER }),
    toApiPath("/equity/price/quote", { symbols: symbolsParam }),
  ];

  if (deduped.length === 1) {
    const [single] = deduped;
    quotePaths.push(
      toApiPath("/equity/price/quote", { symbol: single, provider: OPENBB_PROVIDER }),
      toApiPath("/equity/price/quote", { symbol: single }),
    );
  }

  const payload = await fetchFirstJson(quotePaths);
  if (!payload) return result;

  const rows = extractRows(payload);
  for (const row of rows) {
    const parsed = parseQuoteSnapshot(row);
    if (!parsed) continue;
    if (!symbolSet.has(parsed.symbol)) continue;
    result.set(parsed.symbol, parsed);
  }

  return result;
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

function parseCandle(row: OpenBBJson): OpenBBCandle | null {
  const time =
    toIsoDate(row.date) ||
    toIsoDate(row.datetime) ||
    toIsoDate(row.timestamp) ||
    toIsoDate(row.time);
  if (!time) return null;

  const open = finite(row.open, NaN);
  const high = finite(row.high, NaN);
  const low = finite(row.low, NaN);
  const close = finite(row.close, NaN);
  const volume = finite(row.volume, 0);

  if (!Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }

  return { time, open, high, low, close, volume };
}

async function fetchEarningsDate(symbol: string): Promise<string | undefined> {
  const upper = symbol.toUpperCase();
  const paths = [
    toApiPath("/equity/calendar/earnings", { symbol: upper, provider: OPENBB_PROVIDER, limit: 6 }),
    toApiPath("/equity/calendar/earnings", { symbol: upper, limit: 6 }),
  ];

  const payload = await fetchFirstJson(paths);
  if (!payload) return undefined;

  const rows = extractRows(payload);
  const parsedDates = rows
    .map((row) => toIsoDate(row.date ?? row.earnings_date ?? row.report_date ?? row.report_period))
    .filter((value): value is string => typeof value === "string");

  if (parsedDates.length === 0) return undefined;

  const nowIso = new Date().toISOString().split("T")[0];
  const upcoming = parsedDates.filter((date) => date >= nowIso).sort();
  return upcoming[0] ?? parsedDates.sort().slice(-1)[0];
}

async function fetchEpsGrowth(symbol: string): Promise<number | null> {
  const upper = symbol.toUpperCase();
  const paths = [
    toApiPath("/equity/fundamental/historical_eps", { symbol: upper, provider: OPENBB_PROVIDER, limit: 6 }),
    toApiPath("/equity/fundamental/historical_eps", { symbol: upper, limit: 6 }),
  ];

  const payload = await fetchFirstJson(paths);
  if (!payload) return null;

  const rows = extractRows(payload);
  const series = rows
    .map((row) => ({
      date: asDate(row.date ?? row.report_date ?? row.period),
      eps: finite(row.actual ?? row.eps ?? row.reported_eps ?? row.eps_actual, NaN),
    }))
    .filter((row) => row.date && Number.isFinite(row.eps))
    .sort((a, b) => (a.date!.getTime() - b.date!.getTime()));

  if (series.length < 2) return null;

  const latest = series[series.length - 1].eps;
  const previous = series[series.length - 2].eps;
  if (!Number.isFinite(latest) || !Number.isFinite(previous) || previous === 0) return null;

  return ((latest / Math.abs(previous)) - 1) * 100;
}

export function isOpenBBEnabled(): boolean {
  return OPENBB_ENABLED;
}

export function getOpenBBMaxSymbolsPerScan(): number {
  return Number.isFinite(OPENBB_MAX_SYMBOLS_PER_SCAN) && OPENBB_MAX_SYMBOLS_PER_SCAN > 0
    ? OPENBB_MAX_SYMBOLS_PER_SCAN
    : 1000;
}

export async function fetchOpenBBQuoteSnapshotStocks(symbols: string[]): Promise<Map<string, OpenBBQuoteSnapshot>> {
  const deduped = Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.toUpperCase().trim())
        .filter((symbol) => /^[A-Z.-]{1,7}$/.test(symbol))
    )
  );
  const result = new Map<string, OpenBBQuoteSnapshot>();
  if (!OPENBB_ENABLED || deduped.length === 0) return result;

  const concurrency = Number.isFinite(OPENBB_CONCURRENCY) && OPENBB_CONCURRENCY > 0 ? OPENBB_CONCURRENCY : 6;
  let singleFallbackUsed = 0;

  for (let i = 0; i < deduped.length; i += OPENBB_QUOTE_BATCH_SIZE) {
    const batch = deduped.slice(i, i + OPENBB_QUOTE_BATCH_SIZE);
    const batchMap = await fetchQuoteSnapshotBatch(batch);
    batchMap.forEach((row, symbol) => {
      result.set(symbol, row);
    });

    const missingSymbols = batch.filter((symbol) => !result.has(symbol));
    if (missingSymbols.length === 0) continue;

    // Fallback for symbols not returned in the batch response.
    const fallbackBudget = Math.max(0, OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT - singleFallbackUsed);
    if (fallbackBudget <= 0) {
      console.warn(
        `OpenBB single-quote fallback skipped for ${missingSymbols.length} symbols; limit ${OPENBB_SINGLE_QUOTE_FALLBACK_LIMIT} reached`
      );
      continue;
    }

    const fallbackSymbols = missingSymbols.slice(0, fallbackBudget);
    if (fallbackSymbols.length < missingSymbols.length) {
      console.warn(
        `OpenBB single-quote fallback limited to ${fallbackSymbols.length}/${missingSymbols.length} symbols in batch`
      );
    }

    const fallbackRows = await mapWithConcurrency(
      fallbackSymbols,
      concurrency,
      (symbol) => fetchQuoteSnapshot(symbol)
    );
    singleFallbackUsed += fallbackSymbols.length;

    for (const row of fallbackRows) {
      if (!row) continue;
      result.set(row.symbol, row);
    }
  }

  return result;
}

export async function fetchOpenBBHistoricalCandles(symbol: string, lookbackDays = 200): Promise<OpenBBCandle[]> {
  if (!OPENBB_ENABLED) return [];

  const upper = symbol.toUpperCase();
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const paths = [
    toApiPath("/equity/price/historical", {
      symbol: upper,
      provider: OPENBB_PROVIDER,
      interval: "1d",
      start_date: startDate,
    }),
    toApiPath("/equity/price/historical", {
      symbol: upper,
      interval: "1d",
      start_date: startDate,
    }),
    toApiPath("/equity/price/historical", {
      symbol: upper,
      provider: OPENBB_PROVIDER,
      interval: "1d",
      startDate,
    }),
    toApiPath("/equity/price/historical", {
      symbol: upper,
      interval: "1d",
      startDate,
    }),
  ];

  const payload = await fetchFirstJson(paths);
  if (!payload) return [];

  const rows = extractRows(payload);
  const candles = rows
    .map((row) => parseCandle(row))
    .filter((row): row is OpenBBCandle => row !== null)
    .sort((a, b) => a.time.localeCompare(b.time));

  if (candles.length === 0) return [];
  return candles.slice(-Math.max(lookbackDays, 100));
}

export async function fetchOpenBBOptionsChain(symbol: string): Promise<OpenBBOptionChainRow[]> {
  if (!OPENBB_ENABLED) return [];

  const upper = symbol.toUpperCase().trim();
  if (!upper) return [];

  const paths = [
    toApiPath("/derivatives/options/chains", { symbol: upper, provider: OPENBB_PROVIDER || "yfinance" }),
    toApiPath("/derivatives/options/chains", { symbol: upper, provider: "yfinance" }),
    toApiPath("/derivatives/options/chains", { symbol: upper }),
  ];

  const payload = await fetchFirstJson(paths);
  if (!payload) return [];

  return extractRows(payload)
    .map((row): OpenBBOptionChainRow | null => {
      const optionType = asString(row.option_type ?? row.optionType).toLowerCase();
      const strike = finite(row.strike, NaN);
      const expiration = asString(row.expiration);
      if ((optionType !== "call" && optionType !== "put") || !Number.isFinite(strike) || !expiration) {
        return null;
      }

      return {
        underlyingSymbol: asString(row.underlying_symbol ?? row.underlyingSymbol ?? row.symbol, upper).toUpperCase(),
        underlyingPrice: finite(row.underlying_price ?? row.underlyingPrice, 0),
        contractSymbol: asString(row.contract_symbol ?? row.contractSymbol, `${upper}-${optionType}-${strike}`),
        expiration,
        strike,
        optionType,
        openInterest: finite(row.open_interest ?? row.openInterest, 0),
        volume: finite(row.volume, 0),
        lastTradePrice: finite(row.last_trade_price ?? row.lastPrice, 0),
        bid: finite(row.bid, 0),
        ask: finite(row.ask, 0),
        impliedVolatility: Number.isFinite(finite(row.implied_volatility ?? row.impliedVolatility, NaN))
          ? finite(row.implied_volatility ?? row.impliedVolatility, NaN)
          : null,
        delta: Number.isFinite(finite(row.delta, NaN)) ? finite(row.delta, NaN) : null,
        gamma: Number.isFinite(finite(row.gamma, NaN)) ? finite(row.gamma, NaN) : null,
        theta: Number.isFinite(finite(row.theta, NaN)) ? finite(row.theta, NaN) : null,
        vega: Number.isFinite(finite(row.vega, NaN)) ? finite(row.vega, NaN) : null,
        inTheMoney: Boolean(row.in_the_money ?? row.inTheMoney),
        currency: asString(row.currency, "USD") || "USD",
      };
    })
    .filter((row): row is OpenBBOptionChainRow => row !== null);
}

export async function fetchStooqHistoricalCandles(symbol: string, lookbackDays = 200): Promise<OpenBBCandle[]> {
  const stooqSymbol = normalizeStooqSymbol(symbol);
  if (!stooqSymbol) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STOOQ_TIMEOUT_MS);

  try {
    const response = await fetch(`https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`, {
      signal: controller.signal,
      headers: {
        Accept: "text/csv,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0",
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
    if ([dateIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) {
      return [];
    }

    const candles: OpenBBCandle[] = [];
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

    return candles.slice(-Math.max(lookbackDays, 100));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOpenBBNews(symbol: string, maxItems = 10): Promise<OpenBBNewsEntry[]> {
  if (!OPENBB_ENABLED) return [];

  const upper = symbol.toUpperCase();
  const limit = Math.max(1, Math.min(maxItems, 50));
  const paths = [
    toApiPath("/news/company", { symbol: upper, provider: OPENBB_NEWS_PROVIDER, limit }),
    toApiPath("/news/company", { symbol: upper, limit }),
    toApiPath("/news/company", { symbols: upper, provider: OPENBB_NEWS_PROVIDER, limit }),
    toApiPath("/news/company", { symbols: upper, limit }),
  ];

  const payload = await fetchFirstJson(paths);
  if (!payload) return [];

  const rows = extractRows(payload);
  const dedup = new Set<string>();
  const parsed: OpenBBNewsEntry[] = [];

  for (const row of rows) {
    const title = asString(row.title ?? row.headline);
    const link = asString(row.url ?? row.link);
    const publishedAt =
      asDate(row.published ?? row.published_at ?? row.date ?? row.datetime) || new Date();
    const publisher = asString(row.source ?? row.publisher ?? row.site, "OpenBB");
    if (!title || !link) continue;

    const key = `${title}|${link}`.toLowerCase();
    if (dedup.has(key)) continue;
    dedup.add(key);

    parsed.push({ title, link, publisher, publishedAt });
  }

  return parsed
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, limit);
}

export async function fetchOpenBBFundamentalSnapshot(symbol: string): Promise<OpenBBFundamentalSnapshot | null> {
  if (!OPENBB_ENABLED) return null;

  const [quotes, earningsDate, epsGrowth] = await Promise.all([
    fetchOpenBBQuoteSnapshotStocks([symbol]),
    fetchEarningsDate(symbol),
    fetchEpsGrowth(symbol),
  ]);

  const quote = quotes.get(symbol.toUpperCase()) ?? null;
  if (!quote && !earningsDate && epsGrowth === null) return null;

  return {
    eps: quote?.eps ?? 0,
    peRatio: quote?.peRatio ?? 0,
    forwardPE: quote?.forwardPE ?? 0,
    epsGrowth: epsGrowth ?? quote?.epsGrowth ?? 0,
    targetPrice: quote?.targetPrice ?? 0,
    analystRating: quote?.analystRating ?? "N/A",
    numAnalysts: quote?.numAnalysts ?? 0,
    sector: quote?.sector ?? "Unknown",
    industry: quote?.industry ?? "Unknown",
    marketCap: quote?.marketCap ?? 0,
    earningsDate,
  };
}
