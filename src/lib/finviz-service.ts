// Finviz Service - Direct HTTP scraping for stock data
// The finviz-screener npm package only returns ticker symbols, not detailed data
// So we use direct HTTP requests to scrape the data from Finviz

export interface FinvizStockData {
  ticker: string;
  // Core quote data
  price?: number;
  changePercent?: number;
  volume?: number;
  avgVolume?: number;
  marketCap?: number;
  // Sector & Industry
  sector?: string;           // Sector (e.g., Technology, Healthcare)
  industry?: string;         // Industry (e.g., Software, Biotechnology)
  // Ownership
  shortFloat?: number;       // Short Float %
  insiderOwn?: number;       // Insider Ownership %
  instOwn?: number;          // Institutional Ownership %
  // Analyst
  analystRecom?: string;     // Analyst Recommendation (1-5 scale)
  targetPrice?: number;      // Target Price
  // Fundamentals
  peRatio?: number;          // P/E Ratio
  forwardPE?: number;        // Forward P/E
  peg?: number;              // PEG Ratio
  priceToSales?: number;     // P/S Ratio
  priceToBook?: number;      // P/B Ratio
  // Growth
  epsGrowthThisYear?: number;
  epsGrowthNextYear?: number;
  epsGrowthNext5Y?: number;
  salesGrowthPast5Y?: number;
  salesGrowthQoQ?: number;
  epsGrowthQoQ?: number;
  // Profitability
  profitMargin?: number;
  operMargin?: number;
  grossMargin?: number;
  returnOnEquity?: number;
  returnOnAssets?: number;
  // Technical
  beta?: number;
  atr?: number;              // Average True Range
  volatilityWeek?: number;   // Volatility Week
  volatilityMonth?: number;  // Volatility Month
  relativeVolume?: number;   // Relative Volume
  // Performance
  perfWeek?: number;
  perfMonth?: number;
  perfQuarter?: number;
  perfHalfY?: number;
  perfYear?: number;
  perfYTD?: number;
  // Other
  floatShort?: number;       // Float Short
  shortRatio?: number;       // Short Ratio (days to cover)
  earningsDate?: string;
  country?: string;
  exchange?: string;
  sma20?: number;            // Price vs SMA20 %
  sma50?: number;            // Price vs SMA50 %
  sma200?: number;           // Price vs SMA200 %
  distanceFrom52WkHigh?: number; // Price vs 52W High %
  distanceFrom52WkLow?: number;  // Price vs 52W Low %
  rsi14?: number;            // RSI 14
}

// Parse percentage string to number
function parsePercent(value: string | undefined): number | undefined {
  if (!value || value === "-" || value === "") return undefined;
  const normalized = value.replace(/−/g, "-");
  const percentMatches = Array.from(normalized.matchAll(/([-+]?\d+(?:\.\d+)?)\s*%/g));
  if (percentMatches.length > 0) {
    const lastMatch = percentMatches[percentMatches.length - 1]?.[1];
    const parsed = lastMatch !== undefined ? parseFloat(lastMatch) : NaN;
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  const cleaned = normalized.replace("%", "").trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? undefined : num;
}

// Parse number string
function parseNumber(value: string | undefined): number | undefined {
  if (!value || value === "-" || value === "") return undefined;
  // Handle K, M, B suffixes
  let multiplier = 1;
  let cleaned = value.replace(/[,$]/g, "").trim();
  if (cleaned.endsWith("K")) {
    multiplier = 1000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("M")) {
    multiplier = 1000000;
    cleaned = cleaned.slice(0, -1);
  } else if (cleaned.endsWith("B")) {
    multiplier = 1000000000;
    cleaned = cleaned.slice(0, -1);
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? undefined : num * multiplier;
}

function parse52WDistance(
  value: string | undefined,
  currentPrice: number | undefined
): number | undefined {
  if (!value || value === "-" || value === "") return undefined;

  // Some Finviz layouts expose 52W High/Low as percent distance, others as absolute price.
  if (value.includes("%")) {
    return parsePercent(value);
  }

  const level = parseNumber(value);
  if (!Number.isFinite(level) || !Number.isFinite(currentPrice) || (currentPrice ?? 0) <= 0) {
    return undefined;
  }

  return ((currentPrice as number) / (level as number) - 1) * 100;
}

// Extract value from HTML table row
function extractValue(html: string, label: string): string | undefined {
  // Finviz markup changes frequently (classes, nested tags like <small>, label suffixes like "ATR (14)").
  // Keep this extraction tolerant:
  // 1) Match the label cell text starting with the given label (allows suffixes like "(14)")
  // 2) Capture the next <td> contents
  // 3) Strip all tags and normalize whitespace
  const rowRegex = new RegExp(
    `<td[^>]*>\\s*(?:<[^>]*>\\s*)*${escapeRegex(label)}[^<]*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`,
    "i"
  );
  const match = html.match(rowRegex);
  if (!match || !match[1]) return undefined;

  return match[1]
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fetch Finviz data for a single stock by scraping the quote page
const FINVIZ_TIMEOUT_MS = 10_000;
const FINVIZ_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
let finvizRateLimitedUntil = 0;

function isFinvizRateLimited(): boolean {
  return Date.now() < finvizRateLimitedUntil;
}

function activateFinvizCooldown(reason: string): void {
  const nextWindow = Date.now() + FINVIZ_RATE_LIMIT_COOLDOWN_MS;
  if (nextWindow > finvizRateLimitedUntil) {
    finvizRateLimitedUntil = nextWindow;
    console.warn(`Finviz cooldown activated (${reason}) for ${Math.round(FINVIZ_RATE_LIMIT_COOLDOWN_MS / 60000)}m`);
  }
}

export async function fetchFinvizData(symbol: string): Promise<FinvizStockData | null> {
  if (isFinvizRateLimited()) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FINVIZ_TIMEOUT_MS);

  try {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(symbol.toUpperCase())}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (response.status === 429) {
      activateFinvizCooldown(`HTTP 429 (${symbol})`);
      return null;
    }

    if (!response.ok) {
      console.error(`Finviz HTTP error for ${symbol}: ${response.status}`);
      return null;
    }

    const html = await response.text();

    // Check if stock exists
    if (html.includes("No match for") || html.includes("Invalid ticker")) {
      return null;
    }

    // Extract sector and industry from the header section
    // Pattern: <a href="screener.ashx?v=111&f=sec_technology" class="tab-link">Technology</a>
    // and: <a href="screener.ashx?v=111&f=ind_software" class="tab-link">Software - Application</a>
    const sectorMatch = html.match(/href="screener\.ashx\?v=\d+&(?:amp;)?f=sec_[^"]*"[^>]*class="tab-link"[^>]*>([^<]+)</i);
    const industryMatch = html.match(/href="screener\.ashx\?v=\d+&(?:amp;)?f=ind_[^"]*"[^>]*class="tab-link"[^>]*>([^<]+)</i);

    const price = parseNumber(extractValue(html, "Price"));
    const value52WHigh = extractValue(html, "52W High");
    const value52WLow = extractValue(html, "52W Low");

    return {
      ticker: symbol.toUpperCase(),
      // Core quote data
      price,
      changePercent: parsePercent(extractValue(html, "Change")),
      volume: parseNumber(extractValue(html, "Volume")),
      avgVolume: parseNumber(extractValue(html, "Avg Volume")),
      marketCap: parseNumber(extractValue(html, "Market Cap")),
      // Sector & Industry (from header)
      sector: sectorMatch ? sectorMatch[1].trim() : extractValue(html, "Sector"),
      industry: industryMatch ? industryMatch[1].trim() : extractValue(html, "Industry"),
      // Ownership
      shortFloat: parsePercent(extractValue(html, "Short Float")),
      insiderOwn: parsePercent(extractValue(html, "Insider Own")),
      instOwn: parsePercent(extractValue(html, "Inst Own")),
      // Analyst
      analystRecom: extractValue(html, "Recom"),
      targetPrice: parseNumber(extractValue(html, "Target Price")),
      // Fundamentals
      peRatio: parseNumber(extractValue(html, "P/E")),
      forwardPE: parseNumber(extractValue(html, "Forward P/E")),
      peg: parseNumber(extractValue(html, "PEG")),
      priceToSales: parseNumber(extractValue(html, "P/S")),
      priceToBook: parseNumber(extractValue(html, "P/B")),
      // Growth
      epsGrowthThisYear: parsePercent(extractValue(html, "EPS this Y")),
      epsGrowthNextYear: parsePercent(extractValue(html, "EPS next Y")),
      epsGrowthNext5Y: parsePercent(extractValue(html, "EPS next 5Y")),
      salesGrowthPast5Y: parsePercent(extractValue(html, "Sales past 5Y")),
      salesGrowthQoQ: parsePercent(extractValue(html, "Sales Q/Q")),
      epsGrowthQoQ: parsePercent(extractValue(html, "EPS Q/Q")),
      // Profitability
      profitMargin: parsePercent(extractValue(html, "Profit Margin")),
      operMargin: parsePercent(extractValue(html, "Oper. Margin")),
      grossMargin: parsePercent(extractValue(html, "Gross Margin")),
      returnOnEquity: parsePercent(extractValue(html, "ROE")),
      returnOnAssets: parsePercent(extractValue(html, "ROA")),
      // Technical
      beta: parseNumber(extractValue(html, "Beta")),
      atr: parseNumber(extractValue(html, "ATR")),
      volatilityWeek: parsePercent(extractValue(html, "Volatility")?.split(/\s+/).filter(Boolean)[0]),
      volatilityMonth: parsePercent(extractValue(html, "Volatility")?.split(/\s+/).filter(Boolean)[1]),
      relativeVolume: parseNumber(extractValue(html, "Rel Volume")),
      // Performance
      perfWeek: parsePercent(extractValue(html, "Perf Week")),
      perfMonth: parsePercent(extractValue(html, "Perf Month")),
      perfQuarter: parsePercent(extractValue(html, "Perf Quarter")),
      perfHalfY: parsePercent(extractValue(html, "Perf Half Y")),
      perfYear: parsePercent(extractValue(html, "Perf Year")),
      perfYTD: parsePercent(extractValue(html, "Perf YTD")),
      // Other
      floatShort: parseNumber(extractValue(html, "Float Short")),
      shortRatio: parseNumber(extractValue(html, "Short Ratio")),
      earningsDate: extractValue(html, "Earnings"),
      country: extractValue(html, "Country"),
      exchange: extractValue(html, "Exchange"),
      // Technical levels
      sma20: parsePercent(extractValue(html, "SMA20")),
      sma50: parsePercent(extractValue(html, "SMA50")),
      sma200: parsePercent(extractValue(html, "SMA200")),
      distanceFrom52WkHigh: parse52WDistance(value52WHigh, price),
      distanceFrom52WkLow: parse52WDistance(value52WLow, price),
      rsi14: parseNumber(extractValue(html, "RSI (14)")),
    };
  } catch (error) {
    console.error(`Finviz error for ${symbol}:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Fetch Finviz data for multiple stocks with rate limiting
export async function fetchFinvizDataBatch(
  symbols: string[],
  delayMs: number = 700
): Promise<Map<string, FinvizStockData>> {
  const results = new Map<string, FinvizStockData>();
  if (symbols.length === 0 || isFinvizRateLimited()) {
    return results;
  }

  const batchSize = 2;

  for (let i = 0; i < symbols.length; i += batchSize) {
    if (isFinvizRateLimited()) {
      break;
    }

    const batch = symbols.slice(i, i + batchSize);

    // Fetch batch in parallel
    const promises = batch.map(symbol => fetchFinvizData(symbol));
    const batchResults = await Promise.all(promises);

    // Store results
    for (let j = 0; j < batch.length; j++) {
      const data = batchResults[j];
      if (data) {
        results.set(batch[j].toUpperCase(), data);
      }
    }

    // Rate limit between batches
    if (i + batchSize < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

function addScreenerStartParam(screenerUrl: string, start: number): string {
  const url = new URL(screenerUrl);
  url.searchParams.set("r", String(Math.max(1, start)));
  return url.toString();
}

async function fetchScreenerPage(pageUrl: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FINVIZ_TIMEOUT_MS);

  try {
    const response = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    if (response.status === 429) {
      console.warn(`Finviz screener rate-limited (HTTP 429): ${pageUrl}`);
      return null;
    }

    if (!response.ok) {
      console.error(`Finviz screener HTTP error: ${response.status}`);
      return null;
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

// Helper to get screener data from Finviz (returns list of tickers matching criteria)
export async function getFinvizScreenerTickers(
  screenerUrl: string,
  limit: number = 100
): Promise<string[]> {
  const target = Math.max(1, Math.min(limit, 500));
  const pageSize = 20;
  const maxPages = Math.ceil(target / pageSize);
  const tickers: string[] = [];
  const seen = new Set<string>();

  try {
    for (let page = 0; page < maxPages; page++) {
      if (isFinvizRateLimited()) break;

      const start = page * pageSize + 1;
      const pageUrl = addScreenerStartParam(screenerUrl, start);
      const html = await fetchScreenerPage(pageUrl);
      if (!html) break;

      // Pattern: <a href="quote.ashx?t=SYMBOL" class="screener-link-primary">SYMBOL</a>
      const tickerRegex = /href="quote\.ashx\?t=([A-Z.-]+)"[^>]*class="screener-link-primary"/g;
      let match: RegExpExecArray | null;
      let pageCount = 0;

      while ((match = tickerRegex.exec(html)) !== null) {
        const ticker = match[1].toUpperCase();
        if (!seen.has(ticker)) {
          seen.add(ticker);
          tickers.push(ticker);
          pageCount += 1;
          if (tickers.length >= target) {
            return tickers;
          }
        }
      }

      // No full page => reached end
      if (pageCount < pageSize) {
        break;
      }

      // Gentle delay between pages
      if (page + 1 < maxPages) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }

    return tickers;
  } catch (error) {
    console.error("Finviz screener error:", error);
    return tickers;
  }
}

// Get top gainers from Finviz
export async function getTopGainers(limit: number = 20): Promise<string[]> {
  // Finviz screener URL for top gainers: price > $5, volume > 500K, change > 5%
  const url = "https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o500,sh_price_o5,ta_change_u5&o=-change";
  return getFinvizScreenerTickers(url, limit);
}

// Get high momentum stocks from Finviz
export async function getHighMomentumStocks(limit: number = 50): Promise<string[]> {
  // Finviz screener URL for momentum stocks
  const url = "https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o500,sh_price_o10,ta_perf_4w20o,ta_relvol_o1&o=-perf4w";
  return getFinvizScreenerTickers(url, limit);
}

// Get EP (Episodic Pivot) candidates from Finviz
export async function getEPCandidates(limit: number = 30): Promise<string[]> {
  // Finviz screener URL for EP candidates: high volume gap ups
  const url = "https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o300,sh_price_o5,ta_change_u5,ta_relvol_o2&o=-change";
  return getFinvizScreenerTickers(url, limit);
}

// Get stocks near 52-week high (potential breakout candidates)
export async function getNear52WeekHigh(limit: number = 50): Promise<string[]> {
  // Finviz screener URL for stocks near 52-week high
  const url = "https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o500,sh_price_o10,ta_highlow52w_nh&o=-perf1w";
  return getFinvizScreenerTickers(url, limit);
}

// Get stocks with high short interest (potential squeeze candidates)
export async function getHighShortInterest(limit: number = 30): Promise<string[]> {
  // Finviz screener URL for high short float
  const url = "https://finviz.com/screener.ashx?v=111&f=sh_avgvol_o500,sh_price_o5,sh_short_o20&o=-shortinterestshare";
  return getFinvizScreenerTickers(url, limit);
}

// Cache for Finviz data to reduce API calls
const finvizCache = new Map<string, { data: FinvizStockData; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

export async function fetchFinvizDataCached(symbol: string): Promise<FinvizStockData | null> {
  const cached = finvizCache.get(symbol.toUpperCase());
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const data = await fetchFinvizData(symbol);
  if (data) {
    finvizCache.set(symbol.toUpperCase(), { data, timestamp: Date.now() });
  }
  return data;
}

export function clearFinvizCache(): void {
  finvizCache.clear();
}
