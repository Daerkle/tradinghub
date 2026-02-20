// Scanner Types - können sowohl im Client als auch Server verwendet werden

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
  // Breakout Pivots (derived from daily history, excludes "today")
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
  rsRating: number;
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
  // Catalyst Intelligence
  catalystScore: number;
  catalystSignals: string[];
  sectorHeatScore?: number;
  industryHeatScore?: number;
  // Scan Results
  scanTypes: string[];
  // Chart Data
  chartData?: CandleData[];
  // Proxy Plays
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
  publishedAt: string | Date;
  type: string;
  tags?: string[];
}

export interface ScanResult {
  stocks: StockData[];
  scanTime: string | Date;
  totalScanned: number;
  fromCache?: boolean;
}
