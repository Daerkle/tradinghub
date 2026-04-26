// Scanner Service - Integriert direkt in Next.js
// Verwendet yahoo-finance2 + Stooq + Finviz + lokale Symbol-Universen
// Mit Redis/Memory Caching und sektor-/industry-basiertem Heat Scoring

import YahooFinance from "yahoo-finance2";
import {
  fetchFinvizDataBatch,
  getTopGainers,
  getHighMomentumStocks,
  getEPCandidates,
  getNear52WeekHigh,
  getHighShortInterest,
  type FinvizStockData
} from "./finviz-service";
import { getAllUSStockSymbols, getUSStockCount } from "./stock-universe";
import { isSameMarketDay } from "./market-time";
import {
  getCachedStockList,
  cacheStockList,
  getCachedScannerResults,
  cacheScannerResults,
  getCachedSeededScannerResults,
  cacheSeededScannerResults,
  getMultipleCachedFinvizData,
  cacheMultipleFinvizData,
  getCachedNews,
  cacheNews,
  CACHE_TTL,
  isRedisAvailable,
  getCacheStats,
} from "./redis-cache";
import { createYahooProxyFetch } from "./proxy-fetch";
import {
  fetchOpenBBFundamentalSnapshot,
  fetchOpenBBHistoricalCandles,
  fetchOpenBBNews,
  fetchOpenBBQuoteSnapshotStocks,
  fetchStooqHistoricalCandles,
  getOpenBBMaxSymbolsPerScan,
  isOpenBBEnabled,
  type OpenBBQuoteSnapshot,
} from "./openbb-service";

// Create Yahoo Finance instance (required for v3+)
const yahooProxyFetch = createYahooProxyFetch();
const yahooFinance = new YahooFinance({
  queue: { concurrency: 2 },
  suppressNotices: ["yahooSurvey"],
  fetch: yahooProxyFetch,
});

// Timeout wrapper for async operations
function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms${label ? `: ${label}` : ""}`));
    }, ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

const YAHOO_TIMEOUT_MS = 15_000;
const YAHOO_RATE_LIMIT_COOLDOWN_MS = 5 * 60 * 1000;
const YAHOO_QUOTE_BATCH_SIZE = 120;
const STOOQ_TIMEOUT_MS = 10_000;
const STOOQ_CONCURRENCY = 8;
const FINVIZ_ENRICHMENT_LIMIT = 300;
const SCAN_BATCH_SIZE = 8;
const OPEN_UNIVERSE_MIN_SIZE = 80;
const OPENBB_FALLBACK_LIMIT = getOpenBBMaxSymbolsPerScan();
const STOOQ_FALLBACK_LIMIT_RAW = Number.parseInt(process.env.STOOQ_MAX_SYMBOLS_PER_SCAN || "200", 10);
const STOOQ_FALLBACK_LIMIT = Number.isFinite(STOOQ_FALLBACK_LIMIT_RAW) && STOOQ_FALLBACK_LIMIT_RAW > 0
  ? STOOQ_FALLBACK_LIMIT_RAW
  : 200;
let yahooRateLimitedUntil = 0;

type ScannerResultsCacheKey = "full" | "seeded";

type InflightScanEntry = {
  startedAt: number;
  promise: Promise<ScanResult & { fromCache: boolean; cacheStats?: { redisAvailable: boolean; memoryCacheSize: number } }>;
};

const inflightScans = new Map<ScannerResultsCacheKey, InflightScanEntry>();
const MAX_INFLIGHT_SCAN_AGE_MS = 4 * 60 * 1000;

function isYahooRateLimited(): boolean {
  return Date.now() < yahooRateLimitedUntil;
}

function activateYahooCooldown(reason: string): void {
  const nextWindow = Date.now() + YAHOO_RATE_LIMIT_COOLDOWN_MS;
  if (nextWindow > yahooRateLimitedUntil) {
    yahooRateLimitedUntil = nextWindow;
    console.warn(`Yahoo cooldown activated (${reason}) for ${Math.round(YAHOO_RATE_LIMIT_COOLDOWN_MS / 60000)}m`);
  }
}

function dedupeSymbols(symbols: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const symbol of symbols) {
    const normalized = symbol.toUpperCase().trim();
    if (!/^[A-Z.-]{1,7}$/.test(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

export interface StockData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  avgVolume: number;
  volumeRatio: number;
  marketCap: number;
  // Momentum
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  momentum1Y: number;
  // Technical
  rsi: number;
  adrPercent: number;
  distanceFrom20SMA: number;
  distanceFrom50SMA: number;
  distanceFrom200SMA: number;
  distanceFrom52WkHigh: number;
  distanceFrom52WkLow: number;
  // Breakout pivots (derived, excludes "today")
  prior20DayHigh?: number;
  prior20DayLow?: number;
  // EMAs
  ema10: number;
  ema20: number;
  ema50: number;
  ema200: number;
  sma20: number;
  sma50: number;
  sma150: number;
  sma200: number;
  // Fundamentals
  eps: number;
  epsGrowth: number;
  revenueGrowth: number;
  peRatio: number;
  forwardPE: number;
  // Ratings
  rsRating: number; // Relative Strength Rating (0-99)
  analystRating: string;
  targetPrice: number;
  numAnalysts: number;
  // Sector/Industry
  sector: string;
  industry: string;
  // EP Scanner
  gapPercent: number;
  isEP: boolean;
  // Qullamaggie Setup
  isQullaSetup: boolean;
  setupScore: number;
  // Stockbee Setup
  isStockbeeSetup?: boolean;
  stockbeeScore?: number;
  stockbee?: StockbeeSignals;
  // Catalyst Intelligence
  catalystScore: number; // 0-100, combines momentum/volume/gap/RS/setup/short-interest
  catalystSignals: string[]; // Human-readable catalyst flags
  sectorHeatScore?: number; // 0-100 relative sector heat inside current scan
  industryHeatScore?: number; // 0-100 relative industry heat inside current scan
  // Detailed Setup Criteria (for UI display - Qullamaggie criteria)
  setupDetails?: {
    // Core Criteria (must all pass)
    hasMinLiquidity: boolean;    // Dollar volume > $5M
    hasMinPrice: boolean;        // Price > $10
    ema50AboveEma200: boolean;   // EMA50 > EMA200
    priceAboveEma200: boolean;   // Price > EMA200
    priceAboveEma50: boolean;    // Price > EMA50
    goodADR: boolean;            // ADR >= 5%
    // Support Criteria
    hasStrongMomentum: boolean;  // Strong 1M/3M/6M performance
    sma200TrendingUp: boolean;   // 200 SMA trending up
    isNear52WkHigh: boolean;     // Within 25% of 52-week high
    isAbove52WkLow: boolean;     // At least 30% above 52-week low
    volatilityMonth: boolean;    // Monthly volatility >4%
    // Scores
    coreScore: number;           // Core criteria passed (0-6)
    supportScore: number;        // Support criteria passed (0-5)
    dollarVolume: number;        // Daily dollar volume
  };
  // Scan Results
  scanTypes: string[];
  // Chart Data
  chartData?: CandleData[];
  // News
  news?: NewsItem[];
  // Proxy Plays (same sector/industry leaders)
  proxyPlays?: string[];
  // Finviz Extended Data
  shortFloat?: number;        // Short Float %
  insiderOwn?: number;        // Insider Ownership %
  instOwn?: number;           // Institutional Ownership %
  shortRatio?: number;        // Short Ratio (days to cover)
  peg?: number;               // PEG Ratio
  priceToSales?: number;      // P/S Ratio
  priceToBook?: number;       // P/B Ratio
  beta?: number;              // Beta
  atr?: number;               // Average True Range
  relativeVolume?: number;    // Relative Volume (Finviz)
  profitMargin?: number;      // Profit Margin %
  operMargin?: number;        // Operating Margin %
  grossMargin?: number;       // Gross Margin %
  returnOnEquity?: number;    // ROE %
  returnOnAssets?: number;    // ROA %
  epsGrowthThisYear?: number; // EPS Growth This Year
  epsGrowthNextYear?: number; // EPS Growth Next Year
  epsGrowthNext5Y?: number;   // EPS Growth Next 5 Years
  salesGrowthQoQ?: number;    // Sales Growth Q/Q
  earningsDate?: string;      // Next Earnings Date
  todayNewsCount?: number;    // Number of news headlines from today (when available)
}

export interface QullaMomentumAlignment {
  month1: boolean;
  month3: boolean;
  month6: boolean;
  month1Percentile: number;
  month3Percentile: number;
  month6Percentile: number;
  thresholdPercentile: number;
  alignedCount: number;
  alignsWithQullamaggie: boolean;
}

export interface StockbeeSignals {
  isEpisodicPivot: boolean;
  isMomentumBurst: boolean;
  isRangeExpansionBreakout: boolean;
  isStockbeeSetup: boolean;
  stockbeeScore: number;
  hasMinLiquidity: boolean;
  hasMinPrice: boolean;
  trendTemplate: boolean;
  nearHighs: boolean;
  momentumLeader: boolean;
  volumeExpansion: boolean;
  closeNearHigh: boolean;
  tightConsolidation: boolean;
  qullaAlignment?: QullaMomentumAlignment;
}

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: Date;
  type: string;
  tags?: string[];
}

export interface ScanResult {
  stocks: StockData[];
  scanTime: Date;
  totalScanned: number;
}

// Stock Universe - Comprehensive US Stock List (~500 liquid stocks)
// Includes: S&P 500, NASDAQ 100, High Growth, and Momentum Stocks
const STOCK_UNIVERSE = [
  // === MEGA CAPS (Top 50 by Market Cap) ===
  "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA", "BRK-B", "UNH",
  "JNJ", "V", "XOM", "JPM", "WMT", "MA", "PG", "HD", "CVX", "MRK",
  "ABBV", "LLY", "PEP", "KO", "COST", "AVGO", "TMO", "MCD", "CSCO", "ACN",
  "ABT", "DHR", "CRM", "AMD", "ORCL", "ADBE", "NFLX", "QCOM", "TXN", "INTC",
  "IBM", "NOW", "INTU", "AMAT", "ADI", "LRCX", "MU", "KLAC", "SNPS", "CDNS",

  // === TECHNOLOGY (Extended) ===
  "MRVL", "FTNT", "PANW", "CRWD", "ZS", "DDOG", "NET", "SNOW", "MDB", "TEAM",
  "SHOP", "SQ", "PYPL", "UBER", "ABNB", "DASH", "COIN", "PLTR", "RBLX", "U",
  "TWLO", "OKTA", "ZM", "DOCU", "SPLK", "ESTC", "FIVN", "BILL", "PCTY", "PAYC",
  "HUBS", "VEEV", "WDAY", "TTD", "ROKU", "ZI", "CFLT", "S", "IOT", "GTLB",
  "APP", "SMAR", "MNDY", "PATH", "AI", "BBAI", "IONQ", "SMCI", "ARM", "MSTR",
  "CYBR", "TENB", "VRNS", "RPD", "QLYS", "AKAM", "FFIV", "JNPR", "NTAP", "WDC",
  "STX", "PSTG", "DELL", "HPQ", "HPE", "LOGI", "KEYS", "CGNX", "MKSI", "ENTG",

  // === SEMICONDUCTORS ===
  "TSM", "ASML", "ARM", "ON", "SWKS", "MPWR", "ALGM", "WOLF", "CRUS", "DIOD",
  "SLAB", "SITM", "NXPI", "MCHP", "FORM", "ACLS", "UCTT", "ICHR", "KLIC", "OLED",

  // === FINANCIALS ===
  "BAC", "WFC", "GS", "MS", "C", "BLK", "SCHW", "AXP", "SPGI", "CME",
  "ICE", "MCO", "MSCI", "FDS", "COIN", "HOOD", "SOFI", "AFRM", "UPST", "LC",
  "PNC", "TFC", "USB", "COF", "DFS", "SYF", "ALLY", "NDAQ", "CBOE", "TROW",
  "BEN", "IVZ", "AMG", "JEF", "LAZ", "EVR", "HLI", "PJT", "MKTX", "VIRT",
  "RJF", "SF", "LPLA", "IBKR", "ETFC", "EWBC", "FRC", "SIVB", "WAL", "ZION",

  // === HEALTHCARE / BIOTECH ===
  "PFE", "BMY", "AMGN", "GILD", "VRTX", "REGN", "MRNA", "BIIB", "ILMN", "ISRG",
  "DXCM", "IDXX", "ZBH", "SYK", "BSX", "MDT", "EW", "HCA", "CI", "ELV",
  "HUM", "CNC", "MOH", "CVS", "WBA", "MCK", "ABC", "CAH", "HOLX", "A",
  "BIO", "WAT", "MTD", "PKI", "TECH", "QGEN", "SGEN", "EXEL", "INCY", "ALNY",
  "BMRN", "BGNE", "NTLA", "CRSP", "EDIT", "BEAM", "VERV", "PRME", "KRYS", "RARE",
  "XENE", "PCVX", "RCKT", "SRPT", "VKTX", "AXSM", "CRNX", "ARWR", "IONS", "JAZZ",
  "UTHR", "NBIX", "PTCT", "IMVT", "ARVN", "KRTX", "ACAD", "HALO", "CYTK", "INSM",

  // === CONSUMER DISCRETIONARY ===
  "NKE", "SBUX", "TGT", "LOW", "TJX", "ROST", "DG", "DLTR", "CMG", "YUM",
  "MCD", "DPZ", "WING", "CAVA", "SHAK", "BROS", "DUTCH", "SG", "LULU", "DECK",
  "CROX", "SKECHERS", "VFC", "PVH", "RL", "TPR", "CPRI", "GPS", "ANF", "AEO",
  "URBN", "FIVE", "OLLI", "ULTA", "ELF", "COTY", "EL", "LVMH", "RCL", "CCL",
  "NCLH", "MAR", "H", "HLT", "WH", "MGM", "WYNN", "LVS", "DKNG", "PENN",
  "CHWY", "CHEWY", "W", "ETSY", "EBAY", "MELI", "AMZN", "BABA", "JD", "PDD",
  "CPNG", "SE", "GRAB", "GLBE", "SHOP", "SPOT", "NFLX", "DIS", "WBD", "PARA",
  "FOX", "FOXA", "NWS", "NWSA", "CMCSA", "CHTR", "TMUS", "VZ", "T", "SIRI",

  // === CONSUMER STAPLES ===
  "PG", "KO", "PEP", "COST", "WMT", "PM", "MO", "KHC", "GIS", "K",
  "CAG", "SJM", "CPB", "HSY", "MDLZ", "CL", "CHD", "CLX", "KMB", "EPC",
  "SYY", "USFD", "PFGC", "KR", "ACI", "WBA", "CVS", "MNST", "CELH", "KDP",
  "TAP", "STZ", "BF-B", "DEO", "SAM", "FIZZ", "COKE", "CCEP", "BUD", "SBUX",

  // === INDUSTRIALS ===
  "CAT", "DE", "BA", "HON", "UNP", "UPS", "FDX", "RTX", "LMT", "GE",
  "GD", "NOC", "LHX", "HII", "TDG", "HEI", "TXT", "CW", "AXON", "TASER",
  "MMM", "EMR", "ROK", "ETN", "ITW", "IR", "PH", "DOV", "XYL", "GNRC",
  "CARR", "TT", "JCI", "LII", "WSO", "FAST", "POOL", "SWK", "BLDR", "VMC",
  "MLM", "CX", "EXP", "SUM", "MAS", "OC", "AWI", "TREX", "AZEK", "CSL",
  "WMS", "SITE", "BECN", "FERG", "WSC", "CNH", "AGCO", "PCAR", "TSCO", "TORO",
  "FTV", "GWW", "CTAS", "PAYX", "ADP", "CPRT", "COPART", "WM", "RSG", "CLH",
  "VLTO", "VRSK", "TRI", "IQV", "GMED", "ICLR", "MEDP", "EXAS", "GH", "NTRA",

  // === ENERGY ===
  "COP", "EOG", "SLB", "OXY", "PSX", "VLO", "MPC", "PXD", "DVN", "HAL",
  "XOM", "CVX", "FANG", "APA", "OVV", "MTDR", "CTRA", "PR", "RRC", "AR",
  "SWN", "EQT", "CHK", "CNQ", "CVE", "SU", "IMO", "ENB", "TRP", "KMI",
  "WMB", "OKE", "TRGP", "AM", "LNG", "TELL", "NFE", "NEXT", "VNOM", "DINO",
  "HES", "MRO", "MGY", "SM", "CHRD", "NOG", "CRC", "ESTE", "PARR", "DK",

  // === REAL ESTATE / REITs ===
  "PLD", "AMT", "CCI", "EQIX", "SPG", "PSA", "DLR", "O", "WELL", "AVB",
  "EQR", "ESS", "MAA", "CPT", "INVH", "AMH", "SUI", "ELS", "REXR", "FR",
  "STAG", "TRNO", "COLD", "ARE", "BXP", "SLG", "VNO", "KRC", "HIW", "DEI",

  // === MATERIALS ===
  "LIN", "APD", "SHW", "ECL", "DD", "DOW", "PPG", "NEM", "FCX", "SCCO",
  "GOLD", "AEM", "KGC", "AU", "WPM", "FNV", "RGLD", "SAND", "MAG", "HL",
  "CLF", "X", "NUE", "STLD", "RS", "ATI", "CMC", "AA", "CENX", "MP",
  "ALB", "LTHM", "LAC", "PLL", "SQM", "FMC", "MOS", "CF", "NTR", "IPI",

  // === UTILITIES ===
  "NEE", "DUK", "SO", "D", "AEP", "XEL", "SRE", "EXC", "WEC", "ED",
  "ES", "EIX", "DTE", "AEE", "CMS", "CNP", "EVRG", "ATO", "NI", "PNW",

  // === HIGH GROWTH / MOMENTUM / RECENT IPOs ===
  "RIVN", "LCID", "NIO", "XPEV", "LI", "FSR", "GOEV", "NKLA", "RIDE", "WKHS",
  "BLNK", "CHPT", "EVgo", "PLUG", "FCEL", "BE", "BLDP", "HTOO", "HYLN", "PTRA",
  "TOST", "DUOL", "SOUN", "BBAI", "DNA", "JOBY", "LILM", "ACHR", "EVTL", "BLDE",
  "GBTC", "ETHE", "ARKK", "ARKG", "ARKW", "ARKF", "ARKQ", "ARKX", "ARKB", "IBIT",
  "MARA", "RIOT", "CLSK", "CIFR", "HUT", "BTBT", "CORZ", "IREN", "WULF", "BITF",

  // === CHINA ADRs ===
  "BABA", "JD", "PDD", "BIDU", "NIO", "XPEV", "LI", "BILI", "TME", "IQ",
  "FUTU", "TIGR", "VNET", "GDS", "WB", "DADA", "ZH", "HUYA", "DOYU", "TAL",
  "EDU", "GOTU", "YQ", "DAO", "MOGU", "AIXI", "YSG", "YMM", "KC", "LEGN",

  // === ADDITIONAL MOMENTUM / GROWTH ===
  "ANET", "ZBRA", "GLOB", "EPAM", "GDYN", "EXLS", "WIT", "INFY", "ACN", "IT",
  "CTSH", "FIS", "FISV", "GPN", "SQ", "V", "MA", "PYPL", "ADYEN", "STNE",
  "PAGS", "NU", "XP", "INTE", "BTRS", "FOUR", "RELY", "REPAY", "PAYO", "PSFE",
];

// Calculate EMA
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  return ema;
}

// Calculate SMA
function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Calculate ADR% (Average Daily Range)
function calculateADR(highs: number[], lows: number[], period: number = 20): number {
  if (highs.length < period) return 0;

  let totalRange = 0;
  for (let i = highs.length - period; i < highs.length; i++) {
    totalRange += ((highs[i] - lows[i]) / lows[i]) * 100;
  }
  return totalRange / period;
}

// Check if 200 SMA is trending up (compares current vs 30 days ago)
function isSMATrendingUp(closes: number[], smaPeriod: number = 200, lookbackDays: number = 30): boolean {
  if (closes.length < smaPeriod + lookbackDays) return false;

  // Calculate current SMA
  const currentSMA = calculateSMA(closes, smaPeriod);

  // Calculate SMA from lookbackDays ago
  const historicalCloses = closes.slice(0, -lookbackDays);
  const historicalSMA = calculateSMA(historicalCloses, smaPeriod);

  // SMA should be higher now than lookbackDays ago
  return currentSMA > historicalSMA;
}

// Calculate RS Rating using pre-fetched closes (no extra API calls)
function calculateRSRatingFromCloses(closes: number[], spyPerformance: { m1: number; m3: number; m6: number }): number {
  if (closes.length < 63) return 50;

  const currentPrice = closes[closes.length - 1];

  const m1Perf = closes.length >= 21 ? ((currentPrice / closes[closes.length - 21]) - 1) * 100 : 0;
  const m3Perf = closes.length >= 63 ? ((currentPrice / closes[closes.length - 63]) - 1) * 100 : m1Perf;
  const m6Perf = closes.length >= 126 ? ((currentPrice / closes[closes.length - 126]) - 1) * 100 : m3Perf;

  const relM1 = m1Perf - spyPerformance.m1;
  const relM3 = m3Perf - spyPerformance.m3;
  const relM6 = m6Perf - spyPerformance.m6;

  const rawScore = (relM1 * 0.4 + relM3 * 0.3 + relM6 * 0.3);
  const normalizedScore = Math.min(99, Math.max(1, 50 + rawScore));

  return Math.round(normalizedScore);
}

function clampScore(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, value));
}

interface StockbeeComputationContext {
  dayHigh?: number;
  dayLow?: number;
  prior20DayHigh?: number;
  prior20DayLow?: number;
}

function getCloseNearHigh(
  price: number,
  dayHigh?: number,
  dayLow?: number,
  fallback?: boolean
): boolean {
  if (Number.isFinite(dayHigh) && (dayHigh || 0) > 0) {
    const high = dayHigh as number;
    if (Number.isFinite(dayLow) && (dayLow || 0) > 0 && high > (dayLow as number)) {
      const low = dayLow as number;
      const closeLocationPercent = ((price - low) / (high - low)) * 100;
      return closeLocationPercent >= 70 || price >= high * 0.98;
    }
    return price >= high * 0.98;
  }
  return fallback ?? false;
}

function computeStockbeeSignals(
  stock: StockData,
  context: StockbeeComputationContext = {}
): StockbeeSignals {
  const price = stock.price || 0;
  const avgVolume = stock.avgVolume || 0;
  const dayHigh = context.dayHigh;
  const dayLow = context.dayLow;
  const prior20DayHigh = context.prior20DayHigh ?? stock.prior20DayHigh;
  const prior20DayLow = context.prior20DayLow ?? stock.prior20DayLow;

  const dollarVolume = price * avgVolume;
  const hasMinLiquidity = dollarVolume >= 5_000_000;
  const hasMinPrice = price >= 10;
  const trendTemplate = (stock.distanceFrom50SMA ?? 0) >= 0 && (stock.distanceFrom200SMA ?? 0) >= 0;
  const nearHighs = (stock.distanceFrom52WkHigh ?? -100) >= -25 && (stock.distanceFrom52WkLow ?? 0) >= 30;
  const momentumLeader = (stock.momentum1M ?? 0) >= 10 || (stock.momentum3M ?? 0) >= 20 || (stock.momentum6M ?? 0) >= 30;
  const volumeExpansion = (stock.volumeRatio ?? 0) >= 1.5;

  const closeNearHigh = getCloseNearHigh(
    price,
    dayHigh,
    dayLow,
    stock.stockbee?.closeNearHigh
  );

  const priorRangePercent = (prior20DayHigh && prior20DayLow && prior20DayLow > 0)
    ? ((prior20DayHigh - prior20DayLow) / prior20DayLow) * 100
    : null;
  const tightConsolidation = priorRangePercent !== null
    ? priorRangePercent <= 30
    : (stock.stockbee?.tightConsolidation ?? false);

  const breakoutAbovePriorHigh = (prior20DayHigh && prior20DayHigh > 0)
    ? price >= prior20DayHigh * 1.005
    : false;

  const dayRangePercent =
    Number.isFinite(dayHigh) && Number.isFinite(dayLow) && (dayLow || 0) > 0
      ? (((dayHigh as number) - (dayLow as number)) / (dayLow as number)) * 100
      : stock.adrPercent;
  const rangeExpansion = (stock.adrPercent ?? 0) > 0
    ? dayRangePercent >= (stock.adrPercent || 0) * 1.2
    : dayRangePercent >= 5;

  // Stockbee EP: large gap + strong volume + closes near high.
  const isEpisodicPivot = (stock.gapPercent ?? 0) >= 10 && (stock.volumeRatio ?? 0) >= 2 && closeNearHigh;

  // Stockbee MRB-style trigger: price expansion with volume after tighter action.
  const isMomentumBurst =
    (stock.changePercent ?? 0) >= 4 &&
    (stock.volumeRatio ?? 0) >= 1.8 &&
    closeNearHigh &&
    (breakoutAbovePriorHigh || rangeExpansion) &&
    tightConsolidation;

  // Range-expansion breakout without a full EP gap.
  const isRangeExpansionBreakout =
    (stock.changePercent ?? 0) >= 3 &&
    volumeExpansion &&
    closeNearHigh &&
    rangeExpansion &&
    breakoutAbovePriorHigh;

  const hasCatalystTrigger = isEpisodicPivot || isMomentumBurst || isRangeExpansionBreakout;

  const scoreFlags = [
    hasMinLiquidity,
    hasMinPrice,
    trendTemplate,
    nearHighs,
    momentumLeader,
    volumeExpansion,
    closeNearHigh,
    tightConsolidation,
    hasCatalystTrigger,
  ];
  const score = Math.round((scoreFlags.filter(Boolean).length / scoreFlags.length) * 100);

  const isStockbeeSetup =
    hasMinLiquidity &&
    hasMinPrice &&
    trendTemplate &&
    nearHighs &&
    momentumLeader &&
    hasCatalystTrigger;

  return {
    isEpisodicPivot,
    isMomentumBurst,
    isRangeExpansionBreakout,
    isStockbeeSetup,
    stockbeeScore: clampScore(score),
    hasMinLiquidity,
    hasMinPrice,
    trendTemplate,
    nearHighs,
    momentumLeader,
    volumeExpansion,
    closeNearHigh,
    tightConsolidation,
    qullaAlignment: stock.stockbee?.qullaAlignment,
  };
}

export function applyStockbeeMetrics(
  stock: StockData,
  options: {
    forceRecompute?: boolean;
    context?: StockbeeComputationContext;
  } = {}
): StockData {
  const { forceRecompute = false, context } = options;
  const existing = !forceRecompute ? stock.stockbee : undefined;
  const computedSignals = existing ?? computeStockbeeSignals(stock, context);

  const scanTypes = Array.isArray(stock.scanTypes) ? [...stock.scanTypes] : [];
  if (computedSignals.isStockbeeSetup && !scanTypes.includes("Stockbee")) {
    scanTypes.push("Stockbee");
  }
  if (computedSignals.isEpisodicPivot && !scanTypes.includes("Stockbee EP")) {
    scanTypes.push("Stockbee EP");
  }
  if (computedSignals.isMomentumBurst && !scanTypes.includes("Momentum Burst")) {
    scanTypes.push("Momentum Burst");
  }

  return {
    ...stock,
    isStockbeeSetup: computedSignals.isStockbeeSetup,
    stockbeeScore: computedSignals.stockbeeScore,
    stockbee: computedSignals,
    scanTypes: Array.from(new Set(scanTypes)),
  };
}

function buildCatalystMetrics(stock: {
  gapPercent: number;
  volumeRatio: number;
  adrPercent: number;
  rsRating: number;
  setupScore: number;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  shortFloat?: number;
  todayNewsCount?: number;
}): { catalystScore: number; catalystSignals: string[] } {
  const gapScore = clampScore((Math.max(0, stock.gapPercent) / 12) * 100);
  const volumeScore = clampScore(((stock.volumeRatio - 1) / 3) * 100);
  const adrScore = clampScore((stock.adrPercent / 8) * 100);
  const rsScore = clampScore(stock.rsRating);
  const setupScore = clampScore(stock.setupScore);
  const momentumScore = clampScore(
    (Math.max(0, stock.momentum1M) * 0.35) +
    (Math.max(0, stock.momentum3M) * 0.04) +
    (Math.max(0, stock.momentum6M) * 0.015)
  );
  const shortInterestScore = clampScore(((stock.shortFloat ?? 0) / 25) * 100);
  const newsScore = clampScore((stock.todayNewsCount ?? 0) * 25);

  const weightedScore =
    gapScore * 0.22 +
    volumeScore * 0.22 +
    adrScore * 0.12 +
    rsScore * 0.15 +
    setupScore * 0.15 +
    momentumScore * 0.08 +
    shortInterestScore * 0.03 +
    newsScore * 0.03;

  const catalystSignals: string[] = [];
  if (stock.gapPercent >= 5) catalystSignals.push("Gap");
  if (stock.volumeRatio >= 1.8) catalystSignals.push("High Volume");
  if (stock.adrPercent >= 5) catalystSignals.push("High ADR");
  if (stock.rsRating >= 80) catalystSignals.push("High RS");
  if (stock.setupScore >= 75) catalystSignals.push("Strong Setup");
  if ((stock.shortFloat ?? 0) >= 15) catalystSignals.push("Short Interest");
  if ((stock.todayNewsCount ?? 0) > 0) catalystSignals.push("News Today");

  return {
    catalystScore: Math.round(clampScore(weightedScore)),
    catalystSignals,
  };
}

export function applyCatalystMetrics(stock: StockData): StockData {
  const withStockbee = applyStockbeeMetrics(stock);
  const metrics = buildCatalystMetrics({
    gapPercent: withStockbee.gapPercent,
    volumeRatio: withStockbee.volumeRatio,
    adrPercent: withStockbee.adrPercent,
    rsRating: withStockbee.rsRating,
    setupScore: withStockbee.setupScore,
    momentum1M: withStockbee.momentum1M,
    momentum3M: withStockbee.momentum3M,
    momentum6M: withStockbee.momentum6M,
    shortFloat: withStockbee.shortFloat,
    todayNewsCount: withStockbee.todayNewsCount,
  });

  return {
    ...withStockbee,
    catalystScore: metrics.catalystScore,
    catalystSignals: metrics.catalystSignals,
  };
}

function normalizeHeatMap(rawScores: Map<string, number>): Map<string, number> {
  if (rawScores.size === 0) return new Map();
  let max = 0;
  rawScores.forEach((score) => {
    if (score > max) max = score;
  });
  if (max <= 0) return new Map();

  const normalized = new Map<string, number>();
  rawScores.forEach((score, key) => {
    normalized.set(key, Math.round(clampScore((score / max) * 100)));
  });
  return normalized;
}

function computeStockHeatContribution(stock: StockData): number {
  const positiveGap = Math.max(stock.gapPercent, 0);
  const volumeExpansion = Math.max(stock.volumeRatio - 1, 0);
  const positiveChange = Math.max(stock.changePercent, 0);
  const positiveMomentum =
    Math.max(stock.momentum1M, 0) * 0.3 +
    Math.max(stock.momentum3M, 0) * 0.08 +
    Math.max(stock.momentum6M, 0) * 0.04;
  const newsImpulse = Math.min(stock.todayNewsCount ?? 0, 4) * 8;

  return (
    positiveGap * 4 +
    volumeExpansion * 15 +
    positiveChange * 2 +
    positiveMomentum +
    stock.catalystScore * 0.35 +
    newsImpulse
  );
}

function buildHeatMaps(stocks: StockData[]): {
  sectorHeatMap: Map<string, number>;
  industryHeatMap: Map<string, number>;
} {
  const sectorRaw = new Map<string, number>();
  const industryRaw = new Map<string, number>();

  for (const stock of stocks) {
    const contribution = computeStockHeatContribution(stock);
    if (contribution <= 0) continue;

    const sectorKey = (stock.sector || "").trim();
    if (sectorKey && sectorKey !== "Unknown") {
      sectorRaw.set(sectorKey, (sectorRaw.get(sectorKey) || 0) + contribution);
    }

    const industryKey = (stock.industry || "").trim();
    if (industryKey && industryKey !== "Unknown") {
      industryRaw.set(industryKey, (industryRaw.get(industryKey) || 0) + contribution);
    }
  }

  return {
    sectorHeatMap: normalizeHeatMap(sectorRaw),
    industryHeatMap: normalizeHeatMap(industryRaw),
  };
}

function applyThemeHeat(stock: StockData, sectorHeatScore: number, industryHeatScore: number): StockData {
  const catalystSignals = [...stock.catalystSignals];
  let heatBoost = 0;

  if (industryHeatScore >= 75) {
    heatBoost += 9;
    catalystSignals.push("Hot Industry");
  } else if (industryHeatScore >= 60) {
    heatBoost += 5;
    catalystSignals.push("Industry Momentum");
  }

  if (sectorHeatScore >= 75) {
    heatBoost += 6;
    catalystSignals.push("Hot Sector");
  } else if (sectorHeatScore >= 60) {
    heatBoost += 3;
    catalystSignals.push("Sector Momentum");
  }

  if ((stock.todayNewsCount ?? 0) >= 2 && !catalystSignals.includes("News Cluster")) {
    catalystSignals.push("News Cluster");
  }

  const uniqueSignals = Array.from(new Set(catalystSignals));

  return {
    ...stock,
    catalystScore: Math.round(clampScore(stock.catalystScore + heatBoost)),
    catalystSignals: uniqueSignals,
    sectorHeatScore,
    industryHeatScore,
  };
}

function calculateBaseFromDistance(price: number, distancePercent: number | undefined): number {
  if (!price || distancePercent === undefined || distancePercent <= -99) return price;
  return price / (1 + distancePercent / 100);
}

export function buildStockFromFinvizData(
  symbol: string,
  finvizData: FinvizStockData,
  spyPerformance?: { m1: number; m3: number; m6: number }
): StockData {
  const price = finvizData.price ?? 0;
  const volume = finvizData.volume ?? 0;
  const avgVolume = finvizData.avgVolume ?? volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
  const momentum1M = finvizData.perfMonth ?? 0;
  const momentum3M = finvizData.perfQuarter ?? 0;
  const momentum6M = finvizData.perfHalfY ?? 0;
  const momentum1Y = finvizData.perfYear ?? 0;
  const gapPercent = Math.max(0, finvizData.changePercent ?? 0);
  const adrPercent = price > 0 && (finvizData.atr ?? 0) > 0
    ? ((finvizData.atr || 0) / price) * 100
    : (finvizData.volatilityMonth ?? 0);
  const distanceFrom20SMA = finvizData.sma20 ?? 0;
  const distanceFrom50SMA = finvizData.sma50 ?? 0;
  const distanceFrom200SMA = finvizData.sma200 ?? 0;

  const ema20 = calculateBaseFromDistance(price, distanceFrom20SMA);
  const ema50 = calculateBaseFromDistance(price, distanceFrom50SMA);
  const ema200 = calculateBaseFromDistance(price, distanceFrom200SMA);
  const sma20 = ema20;
  const sma50 = ema50;
  const sma200 = ema200;
  const sma150 = (sma50 + sma200) / 2 || price;
  const ema10 = sma20 || price;

  const hasMinLiquidity = price * avgVolume >= 5_000_000;
  const hasMinPrice = price >= 10;
  const ema50AboveEma200 = ema50 >= ema200;
  const priceAboveEma200 = distanceFrom200SMA >= 0;
  const priceAboveEma50 = distanceFrom50SMA >= 0;
  const goodADR = adrPercent >= 5;
  const hasStrongMomentum = momentum1M >= 20 || momentum3M >= 40 || momentum6M >= 60;
  const sma200TrendingUp = (finvizData.perfYear ?? 0) > 0;
  const isNear52WkHigh = (finvizData.perfYear ?? 0) > -15;
  const isAbove52WkLow = (finvizData.perfYear ?? 0) > -40;
  const volatilityMonth = (finvizData.volatilityMonth ?? 0) >= 4 || adrPercent >= 4;
  const coreScore = [hasMinLiquidity, hasMinPrice, ema50AboveEma200, priceAboveEma200, priceAboveEma50, goodADR].filter(Boolean).length;
  const supportScore = [hasStrongMomentum, sma200TrendingUp, isNear52WkHigh, isAbove52WkLow, volatilityMonth].filter(Boolean).length;
  const setupScore = ((coreScore + supportScore) / 11) * 100;
  const isQullaSetup = coreScore === 6 && supportScore >= 2;
  const isEP = gapPercent >= 5 && volumeRatio >= 1.5;

  const rsRaw = spyPerformance
    ? ((momentum1M - spyPerformance.m1) * 0.4 + (momentum3M - spyPerformance.m3) * 0.3 + (momentum6M - spyPerformance.m6) * 0.3)
    : 0;
  const rsRating = Math.round(clampScore(50 + rsRaw, 1, 99));

  const scanTypes: string[] = [];
  if (isEP) scanTypes.push("EP");
  if (momentum1M >= 10) scanTypes.push("1M Momentum");
  if (momentum3M >= 20) scanTypes.push("3M Momentum");
  if (momentum6M >= 30) scanTypes.push("6M Momentum");
  if (isQullaSetup) scanTypes.push("Qullamaggie");

  const stock: StockData = {
    symbol: symbol.toUpperCase(),
    name: symbol.toUpperCase(),
    price,
    change: 0,
    changePercent: finvizData.changePercent ?? 0,
    volume,
    avgVolume,
    volumeRatio,
    marketCap: finvizData.marketCap ?? 0,
    momentum1M,
    momentum3M,
    momentum6M,
    momentum1Y,
    rsi: finvizData.rsi14 ?? 50,
    adrPercent,
    distanceFrom20SMA,
    distanceFrom50SMA,
    distanceFrom200SMA,
    distanceFrom52WkHigh: 0,
    distanceFrom52WkLow: 0,
    ema10,
    ema20,
    ema50,
    ema200,
    sma20,
    sma50,
    sma150,
    sma200,
    eps: 0,
    epsGrowth: finvizData.epsGrowthThisYear ?? 0,
    revenueGrowth: finvizData.salesGrowthQoQ ?? 0,
    peRatio: finvizData.peRatio ?? 0,
    forwardPE: finvizData.forwardPE ?? 0,
    rsRating,
    analystRating: finvizData.analystRecom || "N/A",
    targetPrice: finvizData.targetPrice || 0,
    numAnalysts: 0,
    sector: finvizData.sector || "Unknown",
    industry: finvizData.industry || "Unknown",
    gapPercent,
    isEP,
    isQullaSetup,
    setupScore,
    catalystScore: 0,
    catalystSignals: [],
    setupDetails: {
      hasMinLiquidity,
      hasMinPrice,
      ema50AboveEma200,
      priceAboveEma200,
      priceAboveEma50,
      goodADR,
      hasStrongMomentum,
      sma200TrendingUp,
      isNear52WkHigh,
      isAbove52WkLow,
      volatilityMonth,
      coreScore,
      supportScore,
      dollarVolume: price * avgVolume,
    },
    scanTypes,
    shortFloat: finvizData.shortFloat,
    insiderOwn: finvizData.insiderOwn,
    instOwn: finvizData.instOwn,
    shortRatio: finvizData.shortRatio,
    peg: finvizData.peg,
    priceToSales: finvizData.priceToSales,
    priceToBook: finvizData.priceToBook,
    beta: finvizData.beta,
    atr: finvizData.atr,
    relativeVolume: finvizData.relativeVolume,
    profitMargin: finvizData.profitMargin,
    operMargin: finvizData.operMargin,
    grossMargin: finvizData.grossMargin,
    returnOnEquity: finvizData.returnOnEquity,
    returnOnAssets: finvizData.returnOnAssets,
    epsGrowthThisYear: finvizData.epsGrowthThisYear,
    epsGrowthNextYear: finvizData.epsGrowthNextYear,
    epsGrowthNext5Y: finvizData.epsGrowthNext5Y,
    salesGrowthQoQ: finvizData.salesGrowthQoQ,
    earningsDate: finvizData.earningsDate,
  };

  const withCatalyst = applyCatalystMetrics(stock);
  if (withCatalyst.catalystScore >= 70 && !withCatalyst.scanTypes.includes("Catalyst")) {
    withCatalyst.scanTypes = [...withCatalyst.scanTypes, "Catalyst"];
  }
  return withCatalyst;
}

interface YahooQuoteSnapshot {
  symbol?: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketVolume?: number;
  averageDailyVolume3Month?: number;
  averageDailyVolume10Day?: number;
  marketCap?: number;
  regularMarketOpen?: number;
  regularMarketPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  fiftyDayAverage?: number;
  twoHundredDayAverage?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  trailingEps?: number;
  earningsQuarterlyGrowth?: number;
  revenueGrowth?: number;
  trailingPE?: number;
  forwardPE?: number;
  recommendationKey?: string;
  targetMeanPrice?: number;
  numberOfAnalystOpinions?: number;
  sector?: string;
  industry?: string;
}

export function buildStockFromYahooQuoteSnapshot(
  symbol: string,
  quote: YahooQuoteSnapshot,
  spyPerformance?: { m1: number; m3: number; m6: number }
): StockData {
  const ticker = symbol.toUpperCase();
  const price = quote.regularMarketPrice || 0;
  const volume = quote.regularMarketVolume || 0;
  const avgVolume = quote.averageDailyVolume3Month || quote.averageDailyVolume10Day || volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
  const prevClose = quote.regularMarketPreviousClose || 0;
  const marketOpen = quote.regularMarketOpen || price;
  const changePercent = quote.regularMarketChangePercent || 0;
  const gapPercent = prevClose > 0 ? ((marketOpen / prevClose) - 1) * 100 : changePercent;
  const dayHigh = quote.regularMarketDayHigh || price;
  const dayLow = quote.regularMarketDayLow || price;
  const adrPercent = price > 0 && dayLow > 0 ? ((dayHigh - dayLow) / dayLow) * 100 : 0;
  const ema50 = quote.fiftyDayAverage || price;
  const ema200 = quote.twoHundredDayAverage || price;
  const sma20 = ema50;
  const sma50 = ema50;
  const sma150 = (ema50 + ema200) / 2 || price;
  const sma200 = ema200;
  const distanceFrom50SMA = sma50 > 0 ? ((price / sma50) - 1) * 100 : 0;
  const distanceFrom200SMA = sma200 > 0 ? ((price / sma200) - 1) * 100 : 0;
  const distanceFrom20SMA = distanceFrom50SMA;
  const high52 = quote.fiftyTwoWeekHigh || 0;
  const low52 = quote.fiftyTwoWeekLow || 0;
  const distanceFrom52WkHigh = high52 > 0 ? ((price / high52) - 1) * 100 : 0;
  const distanceFrom52WkLow = low52 > 0 ? ((price / low52) - 1) * 100 : 0;
  const hasMinLiquidity = (price * avgVolume) >= 5_000_000;
  const hasMinPrice = price >= 10;
  const ema50AboveEma200 = ema50 >= ema200;
  const priceAboveEma200 = price >= ema200;
  const priceAboveEma50 = price >= ema50;
  const goodADR = adrPercent >= 5;
  const hasStrongMomentum = changePercent >= 5;
  const sma200TrendingUp = distanceFrom200SMA >= 0;
  const isNear52WkHigh = distanceFrom52WkHigh >= -25;
  const isAbove52WkLow = distanceFrom52WkLow >= 30;
  const volatilityMonth = adrPercent >= 4;
  const coreScore = [hasMinLiquidity, hasMinPrice, ema50AboveEma200, priceAboveEma200, priceAboveEma50, goodADR].filter(Boolean).length;
  const supportScore = [hasStrongMomentum, sma200TrendingUp, isNear52WkHigh, isAbove52WkLow, volatilityMonth].filter(Boolean).length;
  const setupScore = ((coreScore + supportScore) / 11) * 100;
  const isEP = gapPercent >= 5 && volumeRatio >= 1.5;
  const rsRating = spyPerformance
    ? Math.round(clampScore(50 + (changePercent - spyPerformance.m1) * 0.8, 1, 99))
    : 50;
  const scanTypes: string[] = [];
  if (isEP) scanTypes.push("EP");
  if (changePercent >= 5) scanTypes.push("1M Momentum");

  const baseStock: StockData = {
    symbol: ticker,
    name: quote.shortName || quote.longName || ticker,
    price,
    change: quote.regularMarketChange || 0,
    changePercent,
    volume,
    avgVolume,
    volumeRatio,
    marketCap: quote.marketCap || 0,
    momentum1M: 0,
    momentum3M: 0,
    momentum6M: 0,
    momentum1Y: 0,
    rsi: 50,
    adrPercent,
    distanceFrom20SMA,
    distanceFrom50SMA,
    distanceFrom200SMA,
    distanceFrom52WkHigh,
    distanceFrom52WkLow,
    ema10: sma20,
    ema20: sma20,
    ema50,
    ema200,
    sma20,
    sma50,
    sma150,
    sma200,
    eps: quote.trailingEps || 0,
    epsGrowth: quote.earningsQuarterlyGrowth ? quote.earningsQuarterlyGrowth * 100 : 0,
    revenueGrowth: quote.revenueGrowth ? quote.revenueGrowth * 100 : 0,
    peRatio: quote.trailingPE || 0,
    forwardPE: quote.forwardPE || 0,
    rsRating,
    analystRating: quote.recommendationKey || "N/A",
    targetPrice: quote.targetMeanPrice || 0,
    numAnalysts: quote.numberOfAnalystOpinions || 0,
    sector: quote.sector || "Unknown",
    industry: quote.industry || "Unknown",
    gapPercent,
    isEP,
    isQullaSetup: false,
    setupScore,
    catalystScore: 0,
    catalystSignals: [],
    setupDetails: {
      hasMinLiquidity,
      hasMinPrice,
      ema50AboveEma200,
      priceAboveEma200,
      priceAboveEma50,
      goodADR,
      hasStrongMomentum,
      sma200TrendingUp,
      isNear52WkHigh,
      isAbove52WkLow,
      volatilityMonth,
      coreScore,
      supportScore,
      dollarVolume: price * avgVolume,
    },
    scanTypes,
  };

  const withStockbee = applyStockbeeMetrics(baseStock, {
    forceRecompute: true,
    context: {
      dayHigh,
      dayLow,
    },
  });
  const withCatalyst = applyCatalystMetrics(withStockbee);
  if (withCatalyst.catalystScore >= 70 && !withCatalyst.scanTypes.includes("Catalyst")) {
    withCatalyst.scanTypes = [...withCatalyst.scanTypes, "Catalyst"];
  }
  return withCatalyst;
}

function buildStockFromOpenBBQuoteSnapshot(
  quote: OpenBBQuoteSnapshot,
  spyPerformance?: { m1: number; m3: number; m6: number }
): StockData {
  const ticker = quote.symbol.toUpperCase();
  const price = quote.price || 0;
  const volume = quote.volume || 0;
  const avgVolume = quote.avgVolume || volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
  const prevClose = quote.previousClose || price;
  const marketOpen = quote.open || price;
  const change = quote.change || (price - prevClose);
  const changePercent = quote.changePercent || (prevClose > 0 ? ((price / prevClose) - 1) * 100 : 0);
  const gapPercent = prevClose > 0 ? ((marketOpen / prevClose) - 1) * 100 : changePercent;
  const dayHigh = quote.dayHigh || price;
  const dayLow = quote.dayLow || price;
  const adrPercent = price > 0 && dayLow > 0 ? ((dayHigh - dayLow) / dayLow) * 100 : 0;
  const ema50 = price;
  const ema200 = price;
  const sma20 = price;
  const sma50 = price;
  const sma150 = price;
  const sma200 = price;
  const distanceFrom52WkHigh = quote.fiftyTwoWeekHigh > 0 ? ((price / quote.fiftyTwoWeekHigh) - 1) * 100 : 0;
  const distanceFrom52WkLow = quote.fiftyTwoWeekLow > 0 ? ((price / quote.fiftyTwoWeekLow) - 1) * 100 : 0;
  const hasMinLiquidity = (price * avgVolume) >= 5_000_000;
  const hasMinPrice = price >= 10;
  const ema50AboveEma200 = true;
  const priceAboveEma200 = true;
  const priceAboveEma50 = true;
  const goodADR = adrPercent >= 5;
  const hasStrongMomentum = changePercent >= 5;
  const sma200TrendingUp = changePercent >= 0;
  const isNear52WkHigh = distanceFrom52WkHigh >= -25;
  const isAbove52WkLow = distanceFrom52WkLow >= 30;
  const volatilityMonth = adrPercent >= 4;
  const coreScore = [hasMinLiquidity, hasMinPrice, ema50AboveEma200, priceAboveEma200, priceAboveEma50, goodADR].filter(Boolean).length;
  const supportScore = [hasStrongMomentum, sma200TrendingUp, isNear52WkHigh, isAbove52WkLow, volatilityMonth].filter(Boolean).length;
  const setupScore = ((coreScore + supportScore) / 11) * 100;
  const isEP = gapPercent >= 5 && volumeRatio >= 1.5;
  const rsRating = spyPerformance
    ? Math.round(clampScore(50 + (changePercent - spyPerformance.m1) * 0.8, 1, 99))
    : 50;
  const scanTypes: string[] = [];
  if (isEP) scanTypes.push("EP");
  if (changePercent >= 5) scanTypes.push("1M Momentum");

  const baseStock: StockData = {
    symbol: ticker,
    name: quote.name || ticker,
    price,
    change,
    changePercent,
    volume,
    avgVolume,
    volumeRatio,
    marketCap: quote.marketCap || 0,
    momentum1M: 0,
    momentum3M: 0,
    momentum6M: 0,
    momentum1Y: 0,
    rsi: 50,
    adrPercent,
    distanceFrom20SMA: 0,
    distanceFrom50SMA: 0,
    distanceFrom200SMA: 0,
    distanceFrom52WkHigh,
    distanceFrom52WkLow,
    ema10: sma20,
    ema20: sma20,
    ema50,
    ema200,
    sma20,
    sma50,
    sma150,
    sma200,
    eps: quote.eps || 0,
    epsGrowth: quote.epsGrowth || 0,
    revenueGrowth: quote.revenueGrowth || 0,
    peRatio: quote.peRatio || 0,
    forwardPE: quote.forwardPE || 0,
    rsRating,
    analystRating: quote.analystRating || "N/A",
    targetPrice: quote.targetPrice || 0,
    numAnalysts: quote.numAnalysts || 0,
    sector: quote.sector || "Unknown",
    industry: quote.industry || "Unknown",
    gapPercent,
    isEP,
    isQullaSetup: false,
    setupScore,
    catalystScore: 0,
    catalystSignals: [],
    setupDetails: {
      hasMinLiquidity,
      hasMinPrice,
      ema50AboveEma200,
      priceAboveEma200,
      priceAboveEma50,
      goodADR,
      hasStrongMomentum,
      sma200TrendingUp,
      isNear52WkHigh,
      isAbove52WkLow,
      volatilityMonth,
      coreScore,
      supportScore,
      dollarVolume: price * avgVolume,
    },
    scanTypes,
  };

  const withStockbee = applyStockbeeMetrics(baseStock, {
    forceRecompute: true,
    context: {
      dayHigh,
      dayLow,
    },
  });
  const withCatalyst = applyCatalystMetrics(withStockbee);
  if (withCatalyst.catalystScore >= 70 && !withCatalyst.scanTypes.includes("Catalyst")) {
    withCatalyst.scanTypes = [...withCatalyst.scanTypes, "Catalyst"];
  }
  return withCatalyst;
}

export async function fetchYahooQuoteSnapshotStocks(
  symbols: string[],
  spyPerformance?: { m1: number; m3: number; m6: number }
): Promise<StockData[]> {
  if (symbols.length === 0 || isYahooRateLimited()) return [];

  const dedupedSymbols = dedupeSymbols(symbols);
  const quoteMap = new Map<string, YahooQuoteSnapshot>();

  for (let i = 0; i < dedupedSymbols.length; i += YAHOO_QUOTE_BATCH_SIZE) {
    const batch = dedupedSymbols.slice(i, i + YAHOO_QUOTE_BATCH_SIZE);
    const symbolParam = encodeURIComponent(batch.join(","));
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolParam}&lang=en-US&region=US`;

    try {
      const response = await withTimeout(
        yahooProxyFetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
          },
        }),
        YAHOO_TIMEOUT_MS,
        `yahoo-quote-batch-${Math.floor(i / YAHOO_QUOTE_BATCH_SIZE) + 1}`,
      );

      if (response.status === 429) {
        activateYahooCooldown("quote-batch-429");
        break;
      }

      if (!response.ok) {
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = await response.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (payload?.quoteResponse?.result || []) as any[];
      for (const item of result) {
        if (!item?.symbol) continue;
        quoteMap.set(String(item.symbol).toUpperCase(), item as YahooQuoteSnapshot);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("429") || message.includes("Too Many Requests")) {
        activateYahooCooldown("quote-batch-error-429");
        break;
      }
    }

    if (i + YAHOO_QUOTE_BATCH_SIZE < dedupedSymbols.length) {
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  const stocks = dedupedSymbols
    .map((symbol) => {
      const quote = quoteMap.get(symbol);
      if (!quote) return null;
      const stock = buildStockFromYahooQuoteSnapshot(symbol, quote, spyPerformance);
      return stock.price > 0 ? stock : null;
    })
    .filter((stock): stock is StockData => stock !== null);

  return stocks;
}

export async function fetchOpenBBQuoteSnapshotStocksFallback(
  symbols: string[],
  spyPerformance?: { m1: number; m3: number; m6: number }
): Promise<StockData[]> {
  if (!isOpenBBEnabled() || symbols.length === 0) return [];

  const dedupedSymbols = dedupeSymbols(symbols).slice(0, OPENBB_FALLBACK_LIMIT);
  if (dedupedSymbols.length === 0) return [];

  const quoteMap = await fetchOpenBBQuoteSnapshotStocks(dedupedSymbols);
  if (quoteMap.size === 0) return [];

  const stocks = dedupedSymbols
    .map((symbol) => {
      const quote = quoteMap.get(symbol);
      if (!quote) return null;
      return buildStockFromOpenBBQuoteSnapshot(quote, spyPerformance);
    })
    .filter((stock): stock is StockData => stock !== null && stock.price > 0);

  return stocks;
}

function buildStockFromStooqSnapshot(
  symbol: string,
  values: { open: number; high: number; low: number; close: number; volume: number },
  spyPerformance?: { m1: number; m3: number; m6: number }
): StockData {
  const ticker = symbol.toUpperCase();
  const price = values.close;
  const change = values.open > 0 ? price - values.open : 0;
  const changePercent = values.open > 0 ? ((price / values.open) - 1) * 100 : 0;
  const volume = values.volume;
  const avgVolume = volume;
  const volumeRatio = 1;
  const adrPercent = values.low > 0 ? ((values.high - values.low) / values.low) * 100 : 0;
  const gapPercent = 0;
  const hasMinLiquidity = (price * avgVolume) >= 5_000_000;
  const hasMinPrice = price >= 10;
  const ema50AboveEma200 = true;
  const priceAboveEma200 = true;
  const priceAboveEma50 = true;
  const goodADR = adrPercent >= 5;
  const hasStrongMomentum = changePercent >= 3;
  const sma200TrendingUp = changePercent >= 0;
  const isNear52WkHigh = true;
  const isAbove52WkLow = true;
  const volatilityMonth = adrPercent >= 4;
  const coreScore = [hasMinLiquidity, hasMinPrice, ema50AboveEma200, priceAboveEma200, priceAboveEma50, goodADR].filter(Boolean).length;
  const supportScore = [hasStrongMomentum, sma200TrendingUp, isNear52WkHigh, isAbove52WkLow, volatilityMonth].filter(Boolean).length;
  const setupScore = ((coreScore + supportScore) / 11) * 100;
  const isEP = gapPercent >= 5 && volumeRatio >= 1.5;
  const rsRating = spyPerformance
    ? Math.round(clampScore(50 + (changePercent - spyPerformance.m1), 1, 99))
    : 50;
  const scanTypes: string[] = [];
  if (changePercent >= 3) scanTypes.push("1M Momentum");

  const baseStock: StockData = {
    symbol: ticker,
    name: ticker,
    price,
    change,
    changePercent,
    volume,
    avgVolume,
    volumeRatio,
    marketCap: 0,
    momentum1M: 0,
    momentum3M: 0,
    momentum6M: 0,
    momentum1Y: 0,
    rsi: 50,
    adrPercent,
    distanceFrom20SMA: 0,
    distanceFrom50SMA: 0,
    distanceFrom200SMA: 0,
    distanceFrom52WkHigh: 0,
    distanceFrom52WkLow: 0,
    ema10: price,
    ema20: price,
    ema50: price,
    ema200: price,
    sma20: price,
    sma50: price,
    sma150: price,
    sma200: price,
    eps: 0,
    epsGrowth: 0,
    revenueGrowth: 0,
    peRatio: 0,
    forwardPE: 0,
    rsRating,
    analystRating: "N/A",
    targetPrice: 0,
    numAnalysts: 0,
    sector: "Unknown",
    industry: "Unknown",
    gapPercent,
    isEP,
    isQullaSetup: false,
    setupScore,
    catalystScore: 0,
    catalystSignals: [],
    setupDetails: {
      hasMinLiquidity,
      hasMinPrice,
      ema50AboveEma200,
      priceAboveEma200,
      priceAboveEma50,
      goodADR,
      hasStrongMomentum,
      sma200TrendingUp,
      isNear52WkHigh,
      isAbove52WkLow,
      volatilityMonth,
      coreScore,
      supportScore,
      dollarVolume: price * avgVolume,
    },
    scanTypes,
  };

  const withStockbee = applyStockbeeMetrics(baseStock, {
    forceRecompute: true,
    context: {
      dayHigh: values.high,
      dayLow: values.low,
    },
  });
  return applyCatalystMetrics(withStockbee);
}

async function fetchSingleStooqSnapshot(symbol: string): Promise<{ symbol: string; open: number; high: number; low: number; close: number; volume: number } | null> {
  const stooqSymbol = `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`;

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

    if (!response.ok) {
      return null;
    }

    const csv = (await response.text()).trim();
    const lines = csv
      .split("\n")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (lines.length === 0) return null;

    const expectedPrefix = `${symbol.toUpperCase()}.US,`;
    const line =
      lines.find((entry) => entry.toUpperCase().startsWith(expectedPrefix)) ||
      lines.find((entry, idx) => idx > 0 && !entry.toLowerCase().startsWith("symbol,")) ||
      null;
    if (!line) return null;

    const parts = line.split(",");
    if (parts.length < 8) return null;
    if (parts[1] === "N/D" || parts[6] === "N/D") return null;

    const open = Number.parseFloat(parts[3] || "0");
    const high = Number.parseFloat(parts[4] || "0");
    const low = Number.parseFloat(parts[5] || "0");
    const close = Number.parseFloat(parts[6] || "0");
    const volume = Number.parseFloat(parts[7] || "0");

    if (!Number.isFinite(close) || close <= 0) return null;

    return {
      symbol: symbol.toUpperCase(),
      open: Number.isFinite(open) ? open : close,
      high: Number.isFinite(high) ? high : close,
      low: Number.isFinite(low) ? low : close,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchStooqSnapshotStocks(
  symbols: string[],
  spyPerformance?: { m1: number; m3: number; m6: number }
): Promise<StockData[]> {
  const dedupedSymbols = dedupeSymbols(symbols);
  if (dedupedSymbols.length === 0) return [];

  const stocks: StockData[] = [];
  for (let i = 0; i < dedupedSymbols.length; i += STOOQ_CONCURRENCY) {
    const batch = dedupedSymbols.slice(i, i + STOOQ_CONCURRENCY);
    const snapshots = await Promise.all(batch.map((symbol) => fetchSingleStooqSnapshot(symbol)));
    for (const snapshot of snapshots) {
      if (!snapshot) continue;
      stocks.push(
        buildStockFromStooqSnapshot(snapshot.symbol, {
          open: snapshot.open,
          high: snapshot.high,
          low: snapshot.low,
          close: snapshot.close,
          volume: snapshot.volume,
        }, spyPerformance)
      );
    }
  }

  return stocks;
}

// Get SPY performance for RS calculation
export async function getSPYPerformance(): Promise<{ m1: number; m3: number; m6: number }> {
  type SpyPerformance = { m1: number; m3: number; m6: number };
  const SPY_PERF_CACHE_TTL_MS = 15 * 60 * 1000;

  if (spyPerformanceCache && Date.now() - spyPerformanceCache.fetchedAt < SPY_PERF_CACHE_TTL_MS) {
    return spyPerformanceCache.value;
  }

  const safePerf = (closes: number[], lookbackDays: number): number => {
    const n = closes.length;
    if (n <= lookbackDays) return 0;
    const current = closes[n - 1];
    const past = closes[n - 1 - lookbackDays];
    if (!Number.isFinite(current) || !Number.isFinite(past) || current <= 0 || past <= 0) return 0;
    return ((current / past) - 1) * 100;
  };

  const compute = (closes: number[]): SpyPerformance => ({
    m1: safePerf(closes, 21),
    m3: safePerf(closes, 63),
    m6: safePerf(closes, 126),
  });

  const fetchStooqDailyCloses = async (symbol: string): Promise<number[] | null> => {
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

      return closes.length >= 30 ? closes : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  let closes: number[] | null = null;

  if (!isYahooRateLimited()) {
    try {
      const historical = await withTimeout(
        yahooFinance.chart("SPY", {
          period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          period2: new Date(),
          interval: "1d",
        }),
        YAHOO_TIMEOUT_MS,
        "SPY",
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chartData = historical as any;
      const quotes = Array.isArray(chartData?.quotes) ? chartData.quotes : [];
      closes = quotes
        .map((q: { close?: number }) => q.close || 0)
        .filter((c: number) => Number.isFinite(c) && c > 0);

      if (!closes || closes.length < 63) {
        closes = null;
      }
    } catch (error) {
      const message = String(error ?? "");
      if (message.includes("429") || message.toLowerCase().includes("rate")) {
        activateYahooCooldown("SPY rate limit");
      }
      closes = null;
    }
  }

  if (!closes) {
    closes = await fetchStooqDailyCloses("SPY");
  }

  if (!closes && isOpenBBEnabled()) {
    const candles = await fetchOpenBBHistoricalCandles("SPY", 320);
    const openbbCloses = candles
      .map((candle) => candle.close)
      .filter((close) => Number.isFinite(close) && close > 0);
    if (openbbCloses.length >= 63) {
      closes = openbbCloses;
    }
  }

  const value = closes ? compute(closes) : { m1: 0, m3: 0, m6: 0 };
  spyPerformanceCache = { fetchedAt: Date.now(), value };
  return value;
}

let spyPerformanceCache: { fetchedAt: number; value: { m1: number; m3: number; m6: number } } | null = null;

// Quote type definition for yahoo-finance2 chart data
interface YahooQuote {
  date: Date | string;
  close?: number;
  high?: number;
  low?: number;
  open?: number;
  volume?: number;
}

async function fetchSingleOpenBBFallbackStock(
  symbol: string,
  spyPerformance?: { m1: number; m3: number; m6: number }
): Promise<StockData | null> {
  if (!isOpenBBEnabled()) return null;

  const baseCandidates = await fetchOpenBBQuoteSnapshotStocksFallback([symbol], spyPerformance);
  if (baseCandidates.length === 0) return null;

  let fallback = baseCandidates[0];
  const candles = await fetchOpenBBHistoricalCandles(symbol, 320);

  if (candles.length >= 40) {
    const closes = candles.map((candle) => candle.close).filter((value) => Number.isFinite(value) && value > 0);
    const highs = candles.map((candle) => candle.high).filter((value) => Number.isFinite(value) && value > 0);
    const lows = candles.map((candle) => candle.low).filter((value) => Number.isFinite(value) && value > 0);
    const volumes = candles.map((candle) => candle.volume).filter((value) => Number.isFinite(value) && value >= 0);
    const latestPrice = fallback.price > 0 ? fallback.price : closes[closes.length - 1];

    if (closes.length >= 20 && latestPrice > 0) {
      const ema10 = calculateEMA(closes, 10);
      const ema20 = calculateEMA(closes, 20);
      const ema50 = calculateEMA(closes, 50);
      const ema200 = calculateEMA(closes, 200);
      const sma20 = calculateSMA(closes, 20);
      const sma50 = calculateSMA(closes, 50);
      const sma150 = calculateSMA(closes, 150);
      const sma200 = calculateSMA(closes, 200);
      const rsi = calculateRSI(closes);
      const adrPercent = calculateADR(highs, lows);
      const momentum1M = closes.length >= 21 ? ((latestPrice / closes[closes.length - 21]) - 1) * 100 : fallback.momentum1M;
      const momentum3M = closes.length >= 63 ? ((latestPrice / closes[closes.length - 63]) - 1) * 100 : fallback.momentum3M;
      const momentum6M = closes.length >= 126 ? ((latestPrice / closes[closes.length - 126]) - 1) * 100 : fallback.momentum6M;
      const momentum1Y = closes.length >= 252 ? ((latestPrice / closes[closes.length - 252]) - 1) * 100 : fallback.momentum1Y;
      const high52 = Math.max(...highs.slice(-252));
      const low52 = Math.min(...lows.slice(-252));
      const avgVolume = volumes.length >= 20
        ? volumes.slice(-20).reduce((sum, value) => sum + value, 0) / 20
        : fallback.avgVolume;
      const volume = fallback.volume > 0 ? fallback.volume : (volumes[volumes.length - 1] || 0);
      const volumeRatio = avgVolume > 0 ? volume / avgVolume : fallback.volumeRatio;

      fallback = {
        ...fallback,
        chartData: candles.slice(-100),
        momentum1M,
        momentum3M,
        momentum6M,
        momentum1Y,
        rsi,
        adrPercent,
        ema10,
        ema20,
        ema50,
        ema200,
        sma20,
        sma50,
        sma150,
        sma200,
        distanceFrom20SMA: sma20 > 0 ? ((latestPrice / sma20) - 1) * 100 : fallback.distanceFrom20SMA,
        distanceFrom50SMA: sma50 > 0 ? ((latestPrice / sma50) - 1) * 100 : fallback.distanceFrom50SMA,
        distanceFrom200SMA: sma200 > 0 ? ((latestPrice / sma200) - 1) * 100 : fallback.distanceFrom200SMA,
        distanceFrom52WkHigh: high52 > 0 ? ((latestPrice / high52) - 1) * 100 : fallback.distanceFrom52WkHigh,
        distanceFrom52WkLow: low52 > 0 ? ((latestPrice / low52) - 1) * 100 : fallback.distanceFrom52WkLow,
        volume,
        avgVolume,
        volumeRatio,
      };
    }
  }

  const fundamentals = await fetchOpenBBFundamentalSnapshot(symbol);
  if (fundamentals) {
    fallback = {
      ...fallback,
      eps: fundamentals.eps || fallback.eps,
      epsGrowth: fundamentals.epsGrowth || fallback.epsGrowth,
      peRatio: fundamentals.peRatio || fallback.peRatio,
      forwardPE: fundamentals.forwardPE || fallback.forwardPE,
      targetPrice: fundamentals.targetPrice || fallback.targetPrice,
      analystRating: fundamentals.analystRating || fallback.analystRating,
      numAnalysts: fundamentals.numAnalysts || fallback.numAnalysts,
      sector: fallback.sector === "Unknown" ? fundamentals.sector : fallback.sector,
      industry: fallback.industry === "Unknown" ? fundamentals.industry : fallback.industry,
      marketCap: fundamentals.marketCap || fallback.marketCap,
      earningsDate: fundamentals.earningsDate || fallback.earningsDate,
    };
  }

  const withStockbee = applyStockbeeMetrics(fallback, {
    forceRecompute: true,
    context: {
      dayHigh: fallback.chartData?.[fallback.chartData.length - 1]?.high || fallback.price,
      dayLow: fallback.chartData?.[fallback.chartData.length - 1]?.low || fallback.price,
    },
  });
  return applyCatalystMetrics(withStockbee);
}

// Fetch stock data with all indicators
export async function fetchStockData(symbol: string, spyPerformance?: { m1: number; m3: number; m6: number }): Promise<StockData | null> {
  if (isYahooRateLimited()) {
    const fastOpenBB = await fetchOpenBBQuoteSnapshotStocksFallback([symbol], spyPerformance);
    if (fastOpenBB.length > 0) {
      return fastOpenBB[0];
    }
    return fetchSingleOpenBBFallbackStock(symbol, spyPerformance);
  }

  try {
    // Get quote data (with timeout)
    const [quoteRaw, historicalRaw] = await withTimeout(
      Promise.all([
        yahooFinance.quote(symbol),
        yahooFinance.chart(symbol, {
          period1: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
          period2: new Date(),
          interval: "1d",
        }),
      ]),
      YAHOO_TIMEOUT_MS,
      symbol,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote = quoteRaw as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const historical = historicalRaw as any;
    if (!quote || !historical.quotes || historical.quotes.length < 50) {
      return null;
    }

    const quotes: YahooQuote[] = historical.quotes;
    const closes = quotes.map(q => q.close || 0).filter(c => c > 0);
    const highs = quotes.map(q => q.high || 0).filter(h => h > 0);
    const lows = quotes.map(q => q.low || 0).filter(l => l > 0);
    const volumes = quotes.map(q => q.volume || 0);

    const currentPrice = quote.regularMarketPrice || closes[closes.length - 1];
    const prevClose = quote.regularMarketPreviousClose || closes[closes.length - 2];

    // Calculate indicators
    const ema10 = calculateEMA(closes, 10);
    const ema20 = calculateEMA(closes, 20);
    const ema50 = calculateEMA(closes, 50);
    const ema200 = calculateEMA(closes, 200);
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);
    const sma150 = calculateSMA(closes, 150);
    const sma200 = calculateSMA(closes, 200);
    const rsi = calculateRSI(closes);
    const adrPercent = calculateADR(highs, lows);

    // Momentum calculations
    const momentum1M = closes.length >= 21 ? ((currentPrice / closes[closes.length - 21]) - 1) * 100 : 0;
    const momentum3M = closes.length >= 63 ? ((currentPrice / closes[closes.length - 63]) - 1) * 100 : 0;
    const momentum6M = closes.length >= 126 ? ((currentPrice / closes[closes.length - 126]) - 1) * 100 : 0;
    const momentum1Y = closes.length >= 252 ? ((currentPrice / closes[closes.length - 252]) - 1) * 100 : 0;

    // 52 week high/low
    const high52Wk = Math.max(...highs.slice(-252));
    const low52Wk = Math.min(...lows.slice(-252));

    // Volume analysis
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentVolume = quote.regularMarketVolume || volumes[volumes.length - 1];
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    // Gap calculation (for EP scanner)
    const gapPercent = prevClose > 0 ? ((quote.regularMarketOpen || currentPrice) / prevClose - 1) * 100 : 0;

    // EP Scanner criteria
    const isEP = gapPercent >= 5 && volumeRatio >= 1.5;

    // ========================================
    // QULLAMAGGIE (KRISTJAN KULLAMÄGI) SCAN CRITERIA
    // ========================================
    // Focus: Top 1-2% performers with high momentum and volatility
    // Key: Performance ranking, volatility, trend, and liquidity

    // 1. LIQUIDITY FILTER (Dollar Volume > $5M daily)
    const dollarVolume = currentPrice * avgVolume;
    const hasMinLiquidity = dollarVolume >= 5000000;  // $5M daily dollar volume
    const hasMinPrice = currentPrice >= 10;           // Price > $10 (avoid micro-caps)

    // 2. TREND FILTER (EMA conditions for uptrend)
    const ema50AboveEma200 = ema50 > ema200;          // EMA50 > EMA200 (uptrend)
    const priceAboveEma200 = currentPrice > ema200;   // Price > EMA200
    const priceAboveEma50 = currentPrice > ema50;     // Price > EMA50
    const sma200TrendingUp = isSMATrendingUp(closes, 200, 30); // 200 SMA trending up

    // 3. VOLATILITY FILTER (High ADR% for trading opportunities)
    const goodADR = adrPercent >= 5;                  // ADR >= 5% (Qulla prefers volatile stocks)
    const volatilityMonth = adrPercent >= 4;          // Alternative: monthly volatility >4%

    // 4. MOMENTUM / PERFORMANCE RANKING
    // Qulla focuses on top 1-2% performers over 1M, 3M, 6M
    const strongMomentum1M = momentum1M >= 20;        // Strong 1M performance (top tier)
    const strongMomentum3M = momentum3M >= 40;        // Strong 3M performance
    const strongMomentum6M = momentum6M >= 60;        // Strong 6M performance
    const hasStrongMomentum = strongMomentum1M || strongMomentum3M || strongMomentum6M;

    // 5. PRICE STRUCTURE (near highs, away from lows)
    const distanceFromHigh = ((currentPrice / high52Wk) - 1) * 100;
    const distanceFromLow = ((currentPrice / low52Wk) - 1) * 100;
    const isNear52WkHigh = distanceFromHigh >= -25;   // Within 25% of 52-week high
    const isAbove52WkLow = distanceFromLow >= 30;     // At least 30% above 52-week low

    // Calculate Setup Score (Qullamaggie weighted criteria)
    // Core criteria (must pass for valid setup)
    const coreCriteria = [
      hasMinLiquidity,    // $5M+ daily dollar volume
      hasMinPrice,        // Price > $10
      ema50AboveEma200,   // EMA50 > EMA200 (uptrend confirmation)
      priceAboveEma200,   // Price > EMA200
      priceAboveEma50,    // Price > EMA50
      goodADR,            // ADR >= 5% (volatility)
    ];

    // Supporting criteria (quality indicators)
    const supportCriteria = [
      hasStrongMomentum,  // Top momentum performer
      sma200TrendingUp,   // Long-term trend confirmation
      isNear52WkHigh,     // Near 52-week high
      isAbove52WkLow,     // Away from lows
      volatilityMonth,    // Good monthly volatility
    ];

    // Calculate weighted score
    const coreScore = coreCriteria.filter(Boolean).length;
    const supportScore = supportCriteria.filter(Boolean).length;
    const maxScore = coreCriteria.length + supportCriteria.length;
    const setupScore = ((coreScore + supportScore) / maxScore) * 100;

    // Qullamaggie Setup: Must pass ALL core criteria + at least 2 support criteria
    const passesCoreCriteria = coreScore === coreCriteria.length;
    const passesSupportCriteria = supportScore >= 2;
    const isQullaSetup = passesCoreCriteria && passesSupportCriteria;

    // RS Rating (uses pre-fetched closes, no extra API calls)
    const rsRating = spyPerformance
      ? calculateRSRatingFromCloses(closes, spyPerformance)
      : 50;

    // Determine scan types
    const scanTypes: string[] = [];
    if (isEP) scanTypes.push("EP");
    if (momentum1M >= 10) scanTypes.push("1M Momentum");
    if (momentum3M >= 20) scanTypes.push("3M Momentum");
    if (momentum6M >= 30) scanTypes.push("6M Momentum");
    if (isQullaSetup) scanTypes.push("Qullamaggie");

    // Breakout pivots: prior 20 sessions, excluding the current candle.
    const priorWindow = quotes.slice(-21, -1);
    const priorHighs = priorWindow
      .map((q) => q.high || q.close || 0)
      .filter((v) => Number.isFinite(v) && v > 0);
    const priorLows = priorWindow
      .map((q) => q.low || q.close || 0)
      .filter((v) => Number.isFinite(v) && v > 0);
    const prior20DayHigh = priorHighs.length > 0 ? Math.max(...priorHighs) : 0;
    const prior20DayLow = priorLows.length > 0 ? Math.min(...priorLows) : 0;

    const baseStock: StockData = {
      symbol,
      name: quote.shortName || quote.longName || symbol,
      price: currentPrice,
      change: (quote.regularMarketChange || 0),
      changePercent: (quote.regularMarketChangePercent || 0),
      volume: currentVolume,
      avgVolume,
      volumeRatio,
      marketCap: quote.marketCap || 0,
      momentum1M,
      momentum3M,
      momentum6M,
      momentum1Y,
      rsi,
      adrPercent,
      distanceFrom20SMA: sma20 > 0 ? ((currentPrice / sma20) - 1) * 100 : 0,
      distanceFrom50SMA: sma50 > 0 ? ((currentPrice / sma50) - 1) * 100 : 0,
      distanceFrom200SMA: sma200 > 0 ? ((currentPrice / sma200) - 1) * 100 : 0,
      distanceFrom52WkHigh: ((currentPrice / high52Wk) - 1) * 100,
      distanceFrom52WkLow: ((currentPrice / low52Wk) - 1) * 100,
      prior20DayHigh,
      prior20DayLow,
      ema10,
      ema20,
      ema50,
      ema200,
      sma20,
      sma50,
      sma150,
      sma200,
      eps: quote.trailingEps || 0,
      epsGrowth: quote.earningsQuarterlyGrowth ? quote.earningsQuarterlyGrowth * 100 : 0,
      revenueGrowth: quote.revenueGrowth ? quote.revenueGrowth * 100 : 0,
      peRatio: quote.trailingPE || 0,
      forwardPE: quote.forwardPE || 0,
      rsRating,
      analystRating: quote.recommendationKey || "N/A",
      targetPrice: quote.targetMeanPrice || 0,
      numAnalysts: quote.numberOfAnalystOpinions || 0,
      sector: quote.sector || "Unknown",
      industry: quote.industry || "Unknown",
      gapPercent,
      isEP,
      isQullaSetup,
      setupScore,
      catalystScore: 0,
      catalystSignals: [],
      setupDetails: {
        // Core Criteria
        hasMinLiquidity,
        hasMinPrice,
        ema50AboveEma200,
        priceAboveEma200,
        priceAboveEma50,
        goodADR,
        // Support Criteria
        hasStrongMomentum,
        sma200TrendingUp,
        isNear52WkHigh,
        isAbove52WkLow: isAbove52WkLow,
        volatilityMonth,
        // Scores
        coreScore,
        supportScore,
        dollarVolume,
      },
      scanTypes,
    };

    const stockWithStockbee = applyStockbeeMetrics(baseStock, {
      forceRecompute: true,
      context: {
        dayHigh: quote.regularMarketDayHigh || highs[highs.length - 1],
        dayLow: quote.regularMarketDayLow || lows[lows.length - 1],
        prior20DayHigh,
        prior20DayLow,
      },
    });
    const stockWithCatalyst = applyCatalystMetrics(stockWithStockbee);
    if (stockWithCatalyst.catalystScore >= 70 && !stockWithCatalyst.scanTypes.includes("Catalyst")) {
      stockWithCatalyst.scanTypes = [...stockWithCatalyst.scanTypes, "Catalyst"];
    }
    return stockWithCatalyst;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (
      errorMessage.includes("status 429") ||
      errorMessage.includes("Too Many Requests") ||
      errorMessage.includes("Failed to get crumb")
    ) {
      activateYahooCooldown(symbol);
      return null;
    }
    console.error(`Error fetching ${symbol}:`, error);
    const fastOpenBB = await fetchOpenBBQuoteSnapshotStocksFallback([symbol], spyPerformance);
    if (fastOpenBB.length > 0) {
      return fastOpenBB[0];
    }
    return fetchSingleOpenBBFallbackStock(symbol, spyPerformance);
  }
}

function selectNewsItems(
  items: NewsItem[],
  options: { todayOnly?: boolean; maxItems?: number } = {}
): NewsItem[] {
  const { todayOnly = false, maxItems = 10 } = options;
  const normalized = items
    .filter((item) => item.title && item.link && item.publishedAt instanceof Date && !Number.isNaN(item.publishedAt.getTime()))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  const filtered = todayOnly
    ? normalized.filter((item) => isSameMarketDay(item.publishedAt))
    : normalized;

  return filtered.slice(0, Math.max(1, Math.min(maxItems, 50)));
}

const NEWS_TAG_RULES: Array<{ tag: string; regex: RegExp }> = [
  { tag: "Earnings", regex: /\b(earnings|eps|guidance|revenue|quarter|q[1-4]|beat|miss)\b/i },
  { tag: "Analyst", regex: /\b(upgrade|downgrade|price target|initiat|reiterat|overweight|underweight)\b/i },
  { tag: "M&A", regex: /\b(acquire|acquisition|merger|buyout|takeover|stake)\b/i },
  { tag: "Product", regex: /\b(launch|release|fda|approval|trial|phase\s?[1-4]|patent)\b/i },
  { tag: "Contract", regex: /\b(contract|order|deal|partnership|agreement)\b/i },
  { tag: "Legal", regex: /\b(lawsuit|investigation|sec|doj|settlement|probe)\b/i },
  { tag: "Macro", regex: /\b(inflation|fed|rate|cpi|gdp|tariff|policy)\b/i },
  { tag: "AI", regex: /\b(ai|artificial intelligence|gpu|data\s*center|llm|chatgpt|openai)\b/i },
  { tag: "Semiconductors", regex: /\b(semiconductor|chip|foundry|wafer|gpu|cpu|tsmc|asml|nvidia|nvda|amd|intel|intc|qualcomm)\b/i },
  { tag: "Crypto", regex: /\b(bitcoin|btc|crypto|ethereum|eth|blockchain|token|spot\s*etf)\b/i },
  { tag: "Energy", regex: /\b(oil|crude|wti|brent|gas|lng|opec|refinery|energy)\b/i },
  { tag: "Defense", regex: /\b(defense|pentagon|nato|military|missile|drone|contract\s*award)\b/i },
  { tag: "EV", regex: /\b(ev|electric vehicle|battery|charging|tesla)\b/i },
  { tag: "Biotech", regex: /\b(biotech|fda|clinical|trial|phase\s?[1-4]|drug)\b/i },
  { tag: "China", regex: /\b(china|chinese|beijing|hong\s*kong)\b/i },
  { tag: "Rates", regex: /\b(yield|treasury|bond|rates?|interest rate)\b/i },
  { tag: "Dividend", regex: /\b(dividend|special dividend)\b/i },
  { tag: "Buyback", regex: /\b(buyback|repurchase|share repurchase)\b/i },
  { tag: "Insider", regex: /\b(insider|insider trading|sec form 4|form 4)\b/i },
  { tag: "Guidance", regex: /\b(outlook|forecast|raises? guidance|cuts? guidance)\b/i },
  { tag: "IPO", regex: /\b(ipo|public offering|secondary offering|follow-on offering)\b/i },
];

function deriveNewsTags(title: string): string[] {
  const tags = NEWS_TAG_RULES
    .filter((rule) => rule.regex.test(title))
    .map((rule) => rule.tag);
  if (tags.length > 0) return tags;
  return ["General"];
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function extractXmlTag(content: string, tag: string): string | undefined {
  const match = content.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match || !match[1]) return undefined;
  return decodeXmlEntities(match[1].trim());
}

async function fetchGoogleNewsRss(symbol: string): Promise<NewsItem[]> {
  const query = encodeURIComponent(`${symbol} stock when:1d`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), YAHOO_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        },
      });

      if (!response.ok) {
        return [];
      }

      const xml = await response.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      const items: NewsItem[] = [];
      let match: RegExpExecArray | null;

      while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = extractXmlTag(block, "title");
        const link = extractXmlTag(block, "link");
        const publisher = extractXmlTag(block, "source") || "Google News";
        const published = extractXmlTag(block, "pubDate");
        const publishedAt = published ? new Date(published) : new Date();

        if (!title || !link || Number.isNaN(publishedAt.getTime())) {
          continue;
        }

        items.push({
          title,
          link,
          publisher,
          publishedAt,
          type: "STORY",
          tags: deriveNewsTags(title),
        });
      }

      return items;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return [];
  }
}

export async function fetchStockNews(
  symbol: string,
  options: { forceRefresh?: boolean; todayOnly?: boolean; maxItems?: number } = {}
): Promise<NewsItem[]> {
  const upperSymbol = symbol.toUpperCase();

  if (!options.forceRefresh) {
    const cachedNews = await getCachedNews<NewsItem[]>(upperSymbol);
    if (cachedNews && cachedNews.length > 0) {
      return selectNewsItems(cachedNews.map((item) => ({
        ...item,
        publishedAt: new Date(item.publishedAt),
      })), options);
    }
  }

  try {
    const searchResultRaw = await yahooFinance.search(upperSymbol, { newsCount: 25 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const searchResult = searchResultRaw as any;

    const yahooNewsItems: NewsItem[] = (searchResult.news || []).map((item: {
      title: string;
      link: string;
      publisher: string;
      providerPublishTime: number;
      type: string;
    }) => ({
      title: item.title,
      link: item.link,
      publisher: item.publisher,
      publishedAt: new Date(item.providerPublishTime * 1000),
      type: item.type,
      tags: deriveNewsTags(item.title || ""),
    }));

    const openbbNewsItemsRaw = await fetchOpenBBNews(upperSymbol, 25);
    const openbbNewsItems: NewsItem[] = openbbNewsItemsRaw.map((item) => ({
      title: item.title,
      link: item.link,
      publisher: item.publisher,
      publishedAt: item.publishedAt,
      type: "STORY",
      tags: deriveNewsTags(item.title || ""),
    }));

    const rssFallbackItems = await fetchGoogleNewsRss(upperSymbol);
    const combined = [...yahooNewsItems, ...openbbNewsItems, ...rssFallbackItems]
      .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

    const deduped: NewsItem[] = [];
    const seen = new Set<string>();
    for (const item of combined) {
      const key = `${item.link}|${item.title}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    if (deduped.length > 0) {
      await cacheNews(upperSymbol, deduped);
    }

    return selectNewsItems(deduped, options);
  } catch {
    const cachedNews = await getCachedNews<NewsItem[]>(upperSymbol);
    if (cachedNews && cachedNews.length > 0) {
      return selectNewsItems(cachedNews.map((item) => ({
        ...item,
        publishedAt: new Date(item.publishedAt),
      })), options);
    }
    const rssFallbackItems = await fetchGoogleNewsRss(upperSymbol);
    if (rssFallbackItems.length > 0) {
      await cacheNews(upperSymbol, rssFallbackItems);
      return selectNewsItems(rssFallbackItems, options);
    }
    const openbbNewsItemsRaw = await fetchOpenBBNews(upperSymbol, 20);
    if (openbbNewsItemsRaw.length > 0) {
      const openbbNewsItems: NewsItem[] = openbbNewsItemsRaw.map((item) => ({
        title: item.title,
        link: item.link,
        publisher: item.publisher,
        publishedAt: item.publishedAt,
        type: "STORY",
        tags: deriveNewsTags(item.title || ""),
      }));
      await cacheNews(upperSymbol, openbbNewsItems);
      return selectNewsItems(openbbNewsItems, options);
    }
    return [];
  }
}

// Index types for fast proxy play lookup
interface ProxyPlayIndex {
  byIndustry: Map<string, StockData[]>;  // Pre-sorted by rsRating desc, filtered >= 70
  bySector: Map<string, StockData[]>;    // Pre-sorted by rsRating desc, filtered >= 70
}

// Build indexes for O(1) lookup instead of O(n) filter
function buildProxyPlayIndex(stocks: StockData[]): ProxyPlayIndex {
  const byIndustry = new Map<string, StockData[]>();
  const bySector = new Map<string, StockData[]>();

  // First pass: group stocks with rsRating >= 70
  for (const stock of stocks) {
    if (stock.rsRating < 70) continue;

    // Group by industry
    if (stock.industry) {
      const industryList = byIndustry.get(stock.industry) || [];
      industryList.push(stock);
      byIndustry.set(stock.industry, industryList);
    }

    // Group by sector
    if (stock.sector) {
      const sectorList = bySector.get(stock.sector) || [];
      sectorList.push(stock);
      bySector.set(stock.sector, sectorList);
    }
  }

  // Second pass: sort each group by rsRating descending
  byIndustry.forEach((list, key) => {
    byIndustry.set(key, list.sort((a, b) => b.rsRating - a.rsRating));
  });
  bySector.forEach((list, key) => {
    bySector.set(key, list.sort((a, b) => b.rsRating - a.rsRating));
  });

  return { byIndustry, bySector };
}

// Find proxy plays using pre-built index - O(1) lookup instead of O(n) filter
function findProxyPlaysWithIndex(stock: StockData, index: ProxyPlayIndex): string[] {
  const industryStocks = index.byIndustry.get(stock.industry || '') || [];
  const sectorStocks = index.bySector.get(stock.sector || '') || [];

  // Get top 3 from same industry (already sorted by rsRating)
  const sameIndustry: string[] = [];
  for (const s of industryStocks) {
    if (s.symbol !== stock.symbol && sameIndustry.length < 3) {
      sameIndustry.push(s.symbol);
    }
    if (sameIndustry.length >= 3) break;
  }

  // Get top 2 from same sector (excluding industry picks)
  const industrySet = new Set(sameIndustry);
  const sameSector: string[] = [];
  for (const s of sectorStocks) {
    if (s.symbol !== stock.symbol && !industrySet.has(s.symbol) && sameSector.length < 2) {
      sameSector.push(s.symbol);
    }
    if (sameSector.length >= 2) break;
  }

  return [...sameIndustry, ...sameSector];
}

// Legacy function for backward compatibility (deprecated - use findProxyPlaysWithIndex)
export async function findProxyPlays(stock: StockData, allStocks: StockData[]): Promise<string[]> {
  // Build index once and use it - still O(n) for index build but better than O(n²)
  const index = buildProxyPlayIndex(allStocks);
  return findProxyPlaysWithIndex(stock, index);
}

// Merge Finviz data into StockData
function mergeFinvizData(stock: StockData, finvizData: FinvizStockData | undefined): StockData {
  if (!finvizData) return stock;

  const merged: StockData = {
    ...stock,
    // Override sector/industry from Finviz if Yahoo Finance returned "Unknown"
    sector: (stock.sector === "Unknown" && finvizData.sector) ? finvizData.sector : stock.sector,
    industry: (stock.industry === "Unknown" && finvizData.industry) ? finvizData.industry : stock.industry,
    shortFloat: finvizData.shortFloat,
    insiderOwn: finvizData.insiderOwn,
    instOwn: finvizData.instOwn,
    shortRatio: finvizData.shortRatio,
    peg: finvizData.peg,
    priceToSales: finvizData.priceToSales,
    priceToBook: finvizData.priceToBook,
    beta: finvizData.beta,
    atr: finvizData.atr,
    relativeVolume: finvizData.relativeVolume,
    profitMargin: finvizData.profitMargin,
    operMargin: finvizData.operMargin,
    grossMargin: finvizData.grossMargin,
    returnOnEquity: finvizData.returnOnEquity,
    returnOnAssets: finvizData.returnOnAssets,
    epsGrowthThisYear: finvizData.epsGrowthThisYear,
    epsGrowthNextYear: finvizData.epsGrowthNextYear,
    epsGrowthNext5Y: finvizData.epsGrowthNext5Y,
    salesGrowthQoQ: finvizData.salesGrowthQoQ,
    earningsDate: finvizData.earningsDate,
    // Override targetPrice from Finviz if available (often more accurate)
    targetPrice: finvizData.targetPrice || stock.targetPrice,
    // Override analyst rating if Finviz has it
    analystRating: finvizData.analystRecom || stock.analystRating,
  };

  const hasFinite = (value: number | undefined): value is number =>
    typeof value === "number" && Number.isFinite(value);

  // Quote/stooq fallbacks often miss momentum buckets; backfill from Finviz snapshots.
  if ((!hasFinite(merged.momentum1M) || merged.momentum1M === 0) && hasFinite(finvizData.perfMonth)) {
    merged.momentum1M = finvizData.perfMonth;
  }
  if ((!hasFinite(merged.momentum3M) || merged.momentum3M === 0) && hasFinite(finvizData.perfQuarter)) {
    merged.momentum3M = finvizData.perfQuarter;
  }
  if ((!hasFinite(merged.momentum6M) || merged.momentum6M === 0) && hasFinite(finvizData.perfHalfY)) {
    merged.momentum6M = finvizData.perfHalfY;
  }
  if ((!hasFinite(merged.momentum1Y) || merged.momentum1Y === 0) && hasFinite(finvizData.perfYear)) {
    merged.momentum1Y = finvizData.perfYear;
  }

  const hasFlat52WRange =
    hasFinite(merged.distanceFrom52WkHigh) &&
    hasFinite(merged.distanceFrom52WkLow) &&
    merged.distanceFrom52WkHigh === 0 &&
    merged.distanceFrom52WkLow === 0;
  if (hasFlat52WRange) {
    if (hasFinite(finvizData.distanceFrom52WkHigh)) {
      merged.distanceFrom52WkHigh = finvizData.distanceFrom52WkHigh;
    }
    if (hasFinite(finvizData.distanceFrom52WkLow)) {
      merged.distanceFrom52WkLow = finvizData.distanceFrom52WkLow;
    }
  }

  if ((!hasFinite(merged.distanceFrom20SMA) || merged.distanceFrom20SMA === 0) && hasFinite(finvizData.sma20)) {
    merged.distanceFrom20SMA = finvizData.sma20;
  }
  if ((!hasFinite(merged.distanceFrom50SMA) || merged.distanceFrom50SMA === 0) && hasFinite(finvizData.sma50)) {
    merged.distanceFrom50SMA = finvizData.sma50;
  }
  if ((!hasFinite(merged.distanceFrom200SMA) || merged.distanceFrom200SMA === 0) && hasFinite(finvizData.sma200)) {
    merged.distanceFrom200SMA = finvizData.sma200;
  }

  if (merged.price > 0) {
    merged.sma20 = calculateBaseFromDistance(merged.price, merged.distanceFrom20SMA);
    merged.sma50 = calculateBaseFromDistance(merged.price, merged.distanceFrom50SMA);
    merged.sma200 = calculateBaseFromDistance(merged.price, merged.distanceFrom200SMA);
    merged.sma150 = (merged.sma50 + merged.sma200) / 2 || merged.price;
    merged.ema10 = merged.sma20 || merged.price;
    merged.ema20 = merged.sma20 || merged.price;
    merged.ema50 = merged.sma50 || merged.price;
    merged.ema200 = merged.sma200 || merged.price;
  }

  const needsAdrBackfill = !Number.isFinite(merged.adrPercent) || merged.adrPercent <= 0;
  if (needsAdrBackfill) {
    const priceForAdr = merged.price > 0 ? merged.price : (finvizData.price ?? 0);
    const finvizAdr =
      (finvizData.atr ?? 0) > 0 && priceForAdr > 0
        ? ((finvizData.atr || 0) / priceForAdr) * 100
        : (finvizData.volatilityMonth ?? finvizData.volatilityWeek ?? 0);
    if (Number.isFinite(finvizAdr) && finvizAdr > 0) {
      merged.adrPercent = finvizAdr;
    }
  }

  const withStockbee = applyStockbeeMetrics(merged, { forceRecompute: true });
  return applyCatalystMetrics(withStockbee);
}

function rankFinvizCandidates(stocks: StockData[]): StockData[] {
  return [...stocks].sort((a, b) => {
    const scoreA =
      a.catalystScore +
      (a.isEP ? 18 : 0) +
      (a.isQullaSetup ? 22 : 0) +
      (a.isStockbeeSetup ? 18 : 0) +
      ((a.stockbeeScore ?? 0) * 0.08) +
      Math.min(a.volumeRatio, 6) * 2 +
      Math.min(a.todayNewsCount ?? 0, 4) * 4 +
      (a.industryHeatScore ?? 0) * 0.08 +
      (a.sectorHeatScore ?? 0) * 0.05;
    const scoreB =
      b.catalystScore +
      (b.isEP ? 18 : 0) +
      (b.isQullaSetup ? 22 : 0) +
      (b.isStockbeeSetup ? 18 : 0) +
      ((b.stockbeeScore ?? 0) * 0.08) +
      Math.min(b.volumeRatio, 6) * 2 +
      Math.min(b.todayNewsCount ?? 0, 4) * 4 +
      (b.industryHeatScore ?? 0) * 0.08 +
      (b.sectorHeatScore ?? 0) * 0.05;
    return scoreB - scoreA;
  });
}

function buildMomentumPercentileMap(
  stocks: StockData[],
  selector: (stock: StockData) => number
): Map<string, number> {
  const ranked = stocks
    .map((stock) => ({ symbol: stock.symbol, value: selector(stock) }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((a, b) => b.value - a.value);

  const total = ranked.length;
  const percentileMap = new Map<string, number>();
  if (total === 0) return percentileMap;

  for (let index = 0; index < ranked.length; index++) {
    const percentile = ((index + 1) / total) * 100;
    percentileMap.set(ranked[index].symbol, percentile);
  }

  return percentileMap;
}

function calculateIBDRelativeStrengthScore(stock: StockData): number | null {
  const return3M = Number.isFinite(stock.momentum3M) ? stock.momentum3M : null;
  const return12M = Number.isFinite(stock.momentum1Y) ? stock.momentum1Y : null;
  if (return3M === null || return12M === null) return null;

  const total3M = 1 + return3M / 100;
  const total12M = 1 + return12M / 100;
  if (total3M <= 0 || total12M <= 0) return null;

  // IBD-style proxy from public descriptions:
  // 12M performance ranked against the universe, with the latest 3M weighted higher.
  // The latest quarter gets 40%, the prior 9M block 60%.
  const prior9MReturn = ((total12M / total3M) - 1) * 100;
  return return3M * 0.4 + prior9MReturn * 0.6;
}

function applyIBDRelativeStrengthRatings(stocks: StockData[]): StockData[] {
  if (stocks.length === 0) return stocks;

  const ranked = stocks
    .map((stock) => ({
      symbol: stock.symbol,
      score: calculateIBDRelativeStrengthScore(stock),
    }))
    .filter((entry): entry is { symbol: string; score: number } => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return stocks.map((stock) => ({ ...stock, rsRating: 50 }));
  }

  const total = ranked.length;
  const ratingMap = new Map<string, number>();

  for (let index = 0; index < ranked.length; index += 1) {
    const percentile = 100 - ((index + 1) / total) * 100;
    const rating = Math.max(1, Math.min(99, Math.round(percentile)));
    ratingMap.set(ranked[index].symbol, rating);
  }

  return stocks.map((stock) => ({
    ...stock,
    rsRating: ratingMap.get(stock.symbol) ?? stock.rsRating ?? 50,
  }));
}

function applyStockbeeQullamaggieAlignment(
  stocks: StockData[],
  thresholdPercentile: number = 2
): StockData[] {
  if (stocks.length === 0) return stocks;

  const m1Percentiles = buildMomentumPercentileMap(stocks, (s) => s.momentum1M ?? Number.NEGATIVE_INFINITY);
  const m3Percentiles = buildMomentumPercentileMap(stocks, (s) => s.momentum3M ?? Number.NEGATIVE_INFINITY);
  const m6Percentiles = buildMomentumPercentileMap(stocks, (s) => s.momentum6M ?? Number.NEGATIVE_INFINITY);

  return stocks.map((stock) => {
    const withStockbee = applyStockbeeMetrics(stock);
    const m1 = m1Percentiles.get(stock.symbol) ?? 100;
    const m3 = m3Percentiles.get(stock.symbol) ?? 100;
    const m6 = m6Percentiles.get(stock.symbol) ?? 100;

    const month1 = m1 <= thresholdPercentile && (stock.momentum1M ?? 0) > 0;
    const month3 = m3 <= thresholdPercentile && (stock.momentum3M ?? 0) > 0;
    const month6 = m6 <= thresholdPercentile && (stock.momentum6M ?? 0) > 0;
    const alignedCount = Number(month1) + Number(month3) + Number(month6);

    const alignment: QullaMomentumAlignment = {
      month1,
      month3,
      month6,
      month1Percentile: m1,
      month3Percentile: m3,
      month6Percentile: m6,
      thresholdPercentile,
      alignedCount,
      alignsWithQullamaggie: alignedCount > 0,
    };

    const stockbee: StockbeeSignals = {
      ...(withStockbee.stockbee as StockbeeSignals),
      qullaAlignment: alignment,
    };

    return {
      ...withStockbee,
      stockbee,
    };
  });
}

// Run full scan
export async function runFullScan(symbols: string[] = STOCK_UNIVERSE): Promise<ScanResult> {
  const spyPerformance = await getSPYPerformance();
  const baseResultsMap = new Map<string, StockData>();
  let yahooEarlyStop = false;

  for (let i = 0; i < symbols.length; i += SCAN_BATCH_SIZE) {
    const batch = symbols.slice(i, i + SCAN_BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(symbol => fetchStockData(symbol, spyPerformance))
    );

    for (const stock of batchResults) {
      if (!stock) continue;
      baseResultsMap.set(stock.symbol.toUpperCase(), stock);
    }

    // Minimal delay between batches - yahoo-finance2 handles rate limiting
    if (i + SCAN_BATCH_SIZE < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    if (isYahooRateLimited()) {
      yahooEarlyStop = true;
      console.warn(`Yahoo cooldown active, stopping Yahoo scan early after ${Math.min(i + SCAN_BATCH_SIZE, symbols.length)} symbols`);
      break;
    }
  }

  const missingSymbols = symbols.filter((symbol) => !baseResultsMap.has(symbol.toUpperCase()));
  if (missingSymbols.length > 0) {
    const quoteFallbackStocks = await fetchYahooQuoteSnapshotStocks(missingSymbols, spyPerformance);
    for (const stock of quoteFallbackStocks) {
      baseResultsMap.set(stock.symbol.toUpperCase(), stock);
    }
    if (quoteFallbackStocks.length > 0) {
      console.log(`Yahoo quote snapshot fallback added ${quoteFallbackStocks.length} stocks`);
    }
  }

  const stillMissingAfterYahooQuote = symbols.filter((symbol) => !baseResultsMap.has(symbol.toUpperCase()));
  if (stillMissingAfterYahooQuote.length > 0 && isOpenBBEnabled()) {
    const openbbSymbols = stillMissingAfterYahooQuote.slice(0, OPENBB_FALLBACK_LIMIT);
    const openbbFallbackStocks = await fetchOpenBBQuoteSnapshotStocksFallback(openbbSymbols, spyPerformance);
    for (const stock of openbbFallbackStocks) {
      baseResultsMap.set(stock.symbol.toUpperCase(), stock);
    }
    if (openbbFallbackStocks.length > 0) {
      console.log(`OpenBB quote fallback added ${openbbFallbackStocks.length} stocks`);
    }
    if (stillMissingAfterYahooQuote.length > OPENBB_FALLBACK_LIMIT) {
      console.warn(
        `OpenBB fallback limited to ${OPENBB_FALLBACK_LIMIT}/${stillMissingAfterYahooQuote.length} symbols`
      );
    }
  }

  const stillMissingSymbols = symbols.filter((symbol) => !baseResultsMap.has(symbol.toUpperCase()));
  if (stillMissingSymbols.length > 0) {
    const stooqSymbols = stillMissingSymbols.slice(0, STOOQ_FALLBACK_LIMIT);
    const stooqFallbackStocks = await fetchStooqSnapshotStocks(stooqSymbols, spyPerformance);
    for (const stock of stooqFallbackStocks) {
      baseResultsMap.set(stock.symbol.toUpperCase(), stock);
    }
    if (stooqFallbackStocks.length > 0) {
      console.log(`Stooq fallback added ${stooqFallbackStocks.length} stocks`);
    }
    if (stillMissingSymbols.length > STOOQ_FALLBACK_LIMIT) {
      console.warn(
        `Stooq fallback limited to ${STOOQ_FALLBACK_LIMIT}/${stillMissingSymbols.length} symbols`
      );
    }
  }

  const missingAfterQuoteFallbacks = symbols.filter((symbol) => !baseResultsMap.has(symbol.toUpperCase()));
  if (missingAfterQuoteFallbacks.length > 0) {
    try {
      const finvizFallbackMap = await fetchFinvizDataWithCache(missingAfterQuoteFallbacks.slice(0, 400));
      let added = 0;
      for (const [fallbackSymbol, data] of finvizFallbackMap.entries()) {
        if (baseResultsMap.has(fallbackSymbol.toUpperCase())) continue;
        const stock = buildStockFromFinvizData(fallbackSymbol, data, spyPerformance);
        if (stock.price <= 0) continue;
        baseResultsMap.set(stock.symbol.toUpperCase(), stock);
        added += 1;
      }
      if (added > 0) {
        console.warn(`Finviz quote fallback added ${added} stocks after quote fallbacks`);
      }
    } catch (error) {
      console.error("Finviz quote fallback failed:", error);
    }
  }

  let baseResults = Array.from(baseResultsMap.values());

  if (baseResults.length === 0) {
    try {
      const finvizFallbackMap = await fetchFinvizDataWithCache(symbols.slice(0, 400));
      const finvizFallbackStocks = Array.from(finvizFallbackMap.entries())
        .map(([fallbackSymbol, data]) => buildStockFromFinvizData(fallbackSymbol, data, spyPerformance))
        .filter((stock) => stock.price > 0);

      if (finvizFallbackStocks.length > 0) {
        baseResults = finvizFallbackStocks;
        console.warn(`Yahoo scan returned 0 stocks, using Finviz fallback for ${baseResults.length} symbols`);
      }
    } catch (error) {
      console.error("Finviz fallback failed:", error);
    }
  }

  if (yahooEarlyStop && baseResults.length > 0) {
    console.warn(`Using partial Yahoo scan results: ${baseResults.length} stocks`);
  }

  let finvizDataMap: Map<string, FinvizStockData> = new Map();
  const finvizCandidates = rankFinvizCandidates(baseResults)
    .slice(0, FINVIZ_ENRICHMENT_LIMIT)
    .map((stock) => stock.symbol);

  if (finvizCandidates.length > 0) {
    try {
      finvizDataMap = await fetchFinvizDataWithCache(finvizCandidates);
      console.log(`Fetched Finviz data for ${finvizDataMap.size}/${finvizCandidates.length} prioritized symbols`);
    } catch (error) {
      console.error("Finviz batch fetch failed, continuing without Finviz data:", error);
    }
  }

  let results = baseResults.map((stock) => mergeFinvizData(stock, finvizDataMap.get(stock.symbol)));

  // Theme heat: identify sectors/industries with unusual momentum + volume concentration
  const { sectorHeatMap, industryHeatMap } = buildHeatMaps(results);
  results = results.map((stock) => {
    const sectorHeatScore = sectorHeatMap.get(stock.sector || "") || 0;
    const industryHeatScore = industryHeatMap.get(stock.industry || "") || 0;
    return applyThemeHeat(stock, sectorHeatScore, industryHeatScore);
  });

  // Add proxy plays using indexed lookup - O(n) instead of O(n²)
  // Build index once, then use for all lookups
  const proxyPlayIndex = buildProxyPlayIndex(results);
  for (const stock of results) {
    stock.proxyPlays = findProxyPlaysWithIndex(stock, proxyPlayIndex);
  }

  results = applyIBDRelativeStrengthRatings(results);
  results = applyStockbeeQullamaggieAlignment(results, 2);

  return {
    stocks: results,
    scanTime: new Date(),
    totalScanned: symbols.length,
  };
}

// Re-export shared filter function (includes all scan types)
export { filterByScanType } from "./scanner-filters";

// Export stock universe for external use
export { STOCK_UNIVERSE };

// ========================================
// OPEN DATA + REDIS CACHING INTEGRATION
// ========================================

// Fetch "interesting" stocks from Finviz screeners for priority ordering
// These stocks get scanned first before the rest of the local list
async function getFinvizPrioritySymbols(): Promise<string[]> {
  const [gainers, momentum, ep, nearHigh, shortInterest] = await Promise.allSettled([
    getTopGainers(200),
    getHighMomentumStocks(300),
    getEPCandidates(200),
    getNear52WeekHigh(300),
    getHighShortInterest(200),
  ]);

  const candidates = dedupeSymbols([
    ...(gainers.status === "fulfilled" ? gainers.value : []),
    ...(momentum.status === "fulfilled" ? momentum.value : []),
    ...(ep.status === "fulfilled" ? ep.value : []),
    ...(nearHigh.status === "fulfilled" ? nearHigh.value : []),
    ...(shortInterest.status === "fulfilled" ? shortInterest.value : []),
  ]);

  console.log(`Finviz priority: ${candidates.length} interesting stocks from screeners`);
  return candidates;
}

// Get stock symbols for scanner
// Priority: 1) Finviz screener hits (interesting stocks first)
//           2) Local pre-fetched list (4,316 US stocks, sorted by market cap)
//           3) Hardcoded fallback
export async function getStockSymbols(
  forceRefresh: boolean = false,
  limit?: number  // Optional limit for testing/performance
): Promise<string[]> {
  const localTotal = getUSStockCount();

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cachedSymbols = await getCachedStockList();
    if (cachedSymbols && cachedSymbols.length > 0) {
      // Only accept cache if it covers a good portion of the local list
      // This prevents stale small caches from old runs blocking the full list
      const minAcceptable = localTotal > 0 ? Math.floor(localTotal * 0.5) : OPEN_UNIVERSE_MIN_SIZE;
      if (cachedSymbols.length >= minAcceptable) {
        console.log(`Using cached stock list: ${cachedSymbols.length} symbols`);
        return limit ? cachedSymbols.slice(0, limit) : cachedSymbols;
      }
      console.log(`Cached stock list too small (${cachedSymbols.length}/${localTotal}), refreshing`);
    }
  }

  // Build prioritized symbol list:
  // Finviz screener hits first (momentum, EP, breakouts), then local list fills the rest
  const finvizPriority = await getFinvizPrioritySymbols();
  const localSymbols = getAllUSStockSymbols();

  if (localSymbols.length > 0) {
    // Merge: Finviz interesting stocks first, then rest of local list by market cap
    const merged = dedupeSymbols([...finvizPriority, ...localSymbols]);
    // Always cache the FULL list - limit only affects the return value
    await cacheStockList(merged);
    const result = limit ? merged.slice(0, limit) : merged;
    console.log(`Using ${result.length}${limit ? `/${merged.length}` : ""} symbols (${finvizPriority.length} prioritized from Finviz, ${localSymbols.length} local total)`);
    return result;
  }

  // No local list available - use Finviz-only results
  if (finvizPriority.length > 0) {
    await cacheStockList(finvizPriority);
    console.log(`Using Finviz-only stock list: ${finvizPriority.length} symbols (no local list found)`);
    return limit ? finvizPriority.slice(0, limit) : finvizPriority;
  }

  // Last resort: hardcoded list
  console.log(`Using hardcoded stock list: ${STOCK_UNIVERSE.length} symbols`);
  return limit ? STOCK_UNIVERSE.slice(0, limit) : STOCK_UNIVERSE;
}

// Run full scan with caching
export async function runFullScanWithCache(
  options: {
    useCache?: boolean;
    forceRefresh?: boolean;
    symbols?: string[];
    cacheKey?: ScannerResultsCacheKey;
  } = {}
): Promise<ScanResult & { fromCache: boolean; cacheStats?: { redisAvailable: boolean; memoryCacheSize: number } }> {
  const {
    useCache = true,
    forceRefresh = false,
    symbols: providedSymbols,
    cacheKey = "full",
  } = options;
  let staleCachedResults: ScanResult | null = null;

  const getCache = <T,>(): Promise<T | null> => {
    return cacheKey === "seeded" ? getCachedSeededScannerResults<T>() : getCachedScannerResults<T>();
  };

  const setCache = (results: unknown): Promise<boolean> => {
    return cacheKey === "seeded" ? cacheSeededScannerResults(results) : cacheScannerResults(results);
  };

  // Check for cached results (unless force refresh)
  if (useCache && !forceRefresh) {
    const cachedResults = await getCache<ScanResult>();
    if (cachedResults && cachedResults.stocks.length > 0) {
      // Check if cache is still fresh (5 minutes)
      const cacheAge = Date.now() - new Date(cachedResults.scanTime).getTime();
      if (cacheAge < CACHE_TTL.SCANNER_DATA * 1000) {
        console.log(`Using cached scanner results: ${cachedResults.stocks.length} stocks`);
        const stats = await getCacheStats();
        const normalizedStocks = cachedResults.stocks.map((stock) => applyCatalystMetrics({
          ...stock,
          catalystScore: stock.catalystScore ?? 0,
          catalystSignals: Array.isArray(stock.catalystSignals) ? stock.catalystSignals : [],
        }));
        const withAlignment = applyStockbeeQullamaggieAlignment(normalizedStocks, 2);
        return {
          ...cachedResults,
          stocks: withAlignment,
          fromCache: true,
          cacheStats: stats,
        };
      }
      staleCachedResults = cachedResults;
    }
  }

  // Singleflight: avoid duplicate scans in parallel (same cache key)
  const now = Date.now();
  const inflight = inflightScans.get(cacheKey);
  if (inflight && now - inflight.startedAt < MAX_INFLIGHT_SCAN_AGE_MS) {
    try {
      return await inflight.promise;
    } catch {
      // fall through; start a new scan
    }
  }

  // Get symbols to scan
  const symbols = providedSymbols || await getStockSymbols(forceRefresh);

  const runPromise = (async () => {
    // Run the actual scan
    console.log(`Running full scan for ${symbols.length} symbols...`);
    const results = await runFullScan(symbols);

    if (results.stocks.length === 0 && staleCachedResults && staleCachedResults.stocks.length > 0) {
      console.warn(`Fresh scan returned 0 stocks, falling back to stale cache (${staleCachedResults.stocks.length})`);
      const stats = await getCacheStats();
      const normalizedStocks = staleCachedResults.stocks.map((stock) => applyCatalystMetrics({
        ...stock,
        catalystScore: stock.catalystScore ?? 0,
        catalystSignals: Array.isArray(stock.catalystSignals) ? stock.catalystSignals : [],
      }));
      const withAlignment = applyStockbeeQullamaggieAlignment(normalizedStocks, 2);
      return {
        ...staleCachedResults,
        stocks: withAlignment,
        fromCache: true,
        cacheStats: stats,
      };
    }

    let resultsToCache = results;
    if (useCache && results.stocks.length > 0) {
      const existingSnapshot = await getCache<ScanResult>();
      const existingStocks = Array.isArray(existingSnapshot?.stocks) ? existingSnapshot.stocks : [];

      if (existingStocks.length > results.stocks.length) {
        const mergedStocks = new Map<string, StockData>();
        for (const stock of existingStocks) {
          if (stock?.symbol) mergedStocks.set(stock.symbol.toUpperCase(), stock);
        }
        for (const stock of results.stocks) {
          if (stock?.symbol) mergedStocks.set(stock.symbol.toUpperCase(), stock);
        }

        if (mergedStocks.size > results.stocks.length) {
          resultsToCache = {
            ...results,
            stocks: [...mergedStocks.values()],
            scanTime: new Date(),
            totalScanned: mergedStocks.size,
          };
          console.log(
            `Merged partial ${cacheKey} scan (${results.stocks.length}) into existing snapshot (${existingStocks.length}); keeping ${mergedStocks.size} stocks`
          );
        }
      }
    }

    // Cache the results
    if (useCache && resultsToCache.stocks.length > 0) {
      await setCache(resultsToCache);
      console.log(`Cached scanner results: ${resultsToCache.stocks.length} stocks`);
    } else if (results.stocks.length === 0) {
      console.warn("Scan produced 0 stocks, skipping cache overwrite");
    }

    const stats = await getCacheStats();
    return {
      ...resultsToCache,
      fromCache: false,
      cacheStats: stats,
    };
  })();

  inflightScans.set(cacheKey, { startedAt: now, promise: runPromise });
  try {
    return await runPromise;
  } finally {
    const current = inflightScans.get(cacheKey);
    if (current?.promise === runPromise) {
      inflightScans.delete(cacheKey);
    }
  }
}

// Fetch Finviz data with caching
export async function fetchFinvizDataWithCache(
  symbols: string[]
): Promise<Map<string, FinvizStockData>> {
  const normalizedSymbols = symbols.map((s) => s.toUpperCase());

  // Check cache for already fetched data
  const cachedData = await getMultipleCachedFinvizData<FinvizStockData>(normalizedSymbols);

  // If cached entries were created before parser fixes, they may miss ATR/Volatility
  // or contain bad 52W distance values from mixed "price + percent" cells.
  // Treat those as stale so we refetch.
  let staleCount = 0;
  for (const symbol of normalizedSymbols) {
    const data = cachedData.get(symbol);
    if (!data) continue;
    const atr = data.atr ?? 0;
    const volMonth = data.volatilityMonth ?? 0;
    const volWeek = data.volatilityWeek ?? 0;
    const hasAdrInputs =
      (Number.isFinite(atr) && atr > 0) ||
      (Number.isFinite(volMonth) && volMonth > 0) ||
      (Number.isFinite(volWeek) && volWeek > 0);
    const highDist = data.distanceFrom52WkHigh;
    const hasFiniteHighDist = typeof highDist === "number" && Number.isFinite(highDist);
    const hasPlausible52WHigh =
      !hasFiniteHighDist ||
      (highDist >= -100 && highDist <= 50);
    const hasPerformanceBuckets = [
      data.perfMonth,
      data.perfQuarter,
      data.perfHalfY,
      data.perfYear,
    ].some((value) => typeof value === "number" && Number.isFinite(value));

    if (!hasAdrInputs || !hasPlausible52WHigh || !hasPerformanceBuckets) {
      cachedData.delete(symbol);
      staleCount += 1;
    }
  }

  const uncachedSymbols = normalizedSymbols.filter((s) => !cachedData.has(s));

  console.log(
    `Finviz cache: ${cachedData.size} cached, ${staleCount} stale, ${uncachedSymbols.length} to fetch`
  );

  // Fetch uncached data
  if (uncachedSymbols.length > 0) {
    try {
      const newData = await fetchFinvizDataBatch(uncachedSymbols);

      // Cache the new data
      await cacheMultipleFinvizData(newData);

      // Merge with cached data
      newData.forEach((data, symbol) => {
        cachedData.set(symbol, data);
      });
    } catch (error) {
      console.error("Finviz fetch error:", error);
    }
  }

  return cachedData;
}

// Get cache statistics
export async function getScannerCacheStats(): Promise<{
  redisAvailable: boolean;
  memoryCacheSize: number;
  redisKeys?: number;
  stockListCached: boolean;
  scanResultsCached: boolean;
  totalAvailableStocks: number;
}> {
  const baseStats = await getCacheStats();

  // Check if specific caches exist
  const stockList = await getCachedStockList();
  const scanResults = await getCachedScannerResults<ScanResult>();

  return {
    ...baseStats,
    stockListCached: !!stockList && stockList.length > 0,
    scanResultsCached: !!scanResults && scanResults.stocks.length > 0,
    totalAvailableStocks: getUSStockCount(),
  };
}

// Refresh stock list cache from open universe + Finviz priority
export async function refreshStockList(): Promise<string[]> {
  return getStockSymbols(true);
}

// Fetch only chart data for a symbol (lightweight, no fundamentals)
export async function fetchChartOnly(symbol: string): Promise<CandleData[]> {
  if (!isYahooRateLimited()) {
    try {
      const historical = await withTimeout(
        yahooFinance.chart(symbol.toUpperCase(), {
          period1: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // ~4 months
          period2: new Date(),
          interval: "1d",
        }),
        YAHOO_TIMEOUT_MS,
        `chart-${symbol}`,
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = historical as any;
      if (data.quotes && data.quotes.length >= 10) {
        return (data.quotes as YahooQuote[]).slice(-100).map((q) => ({
          time: new Date(q.date).toISOString().split("T")[0],
          open: q.open || 0,
          high: q.high || 0,
          low: q.low || 0,
          close: q.close || 0,
          volume: q.volume || 0,
        }));
      }
    } catch {
      // fall through to OpenBB fallback
    }
  }

  const openbbCandles = await fetchOpenBBHistoricalCandles(symbol.toUpperCase(), 180);
  if (openbbCandles.length >= 10) {
    return openbbCandles.slice(-100);
  }

  const stooqCandles = await fetchStooqHistoricalCandles(symbol.toUpperCase(), 180);
  if (stooqCandles.length >= 10) {
    return stooqCandles.slice(-100);
  }

  return [];
}

// Export additional utilities
export { isRedisAvailable, getCacheStats };

// Re-export stock count function for easy access
export { getUSStockCount } from "./stock-universe";
