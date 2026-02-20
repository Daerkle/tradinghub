import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { runFullScanWithCache, type StockData } from "@/lib/scanner-service";

type IndexTrend = "bullish" | "bearish" | "mixed";

type IndexSnapshot = {
  symbol: "SPY" | "QQQ";
  price: number;
  ema10: number;
  ema20: number;
  aboveEma10: boolean;
  aboveEma20: boolean;
  ema10AboveEma20: boolean;
  trend: IndexTrend;
};

type SectorSummary = {
  sector: string;
  stockCount: number;
  avgHeat: number;
  avgMomentum3M: number;
  avgDistance52WHigh: number;
  leadersNearHigh: number;
  score: number;
};

type MatrixRow = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  distanceFrom52WkHigh: number;
  sectorHeatScore: number;
  catalystScore: number;
};

function finite(value: unknown, fallback: number = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parsePositiveInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function getIndexTrend(snapshot: Pick<IndexSnapshot, "aboveEma10" | "aboveEma20" | "ema10AboveEma20">): IndexTrend {
  if (snapshot.aboveEma20 && snapshot.aboveEma10 && snapshot.ema10AboveEma20) return "bullish";
  if (!snapshot.aboveEma20 && !snapshot.aboveEma10 && !snapshot.ema10AboveEma20) return "bearish";
  return "mixed";
}

function buildIndexSnapshot(stock: StockData | undefined, symbol: "SPY" | "QQQ"): IndexSnapshot {
  const price = finite(stock?.price);
  const ema10 = finite(stock?.ema10);
  const ema20 = finite(stock?.ema20);
  const aboveEma10 = price > 0 && ema10 > 0 ? price > ema10 : false;
  const aboveEma20 = price > 0 && ema20 > 0 ? price > ema20 : false;
  const ema10AboveEma20 = ema10 > 0 && ema20 > 0 ? ema10 > ema20 : false;
  const trend = getIndexTrend({ aboveEma10, aboveEma20, ema10AboveEma20 });

  return {
    symbol,
    price,
    ema10,
    ema20,
    aboveEma10,
    aboveEma20,
    ema10AboveEma20,
    trend,
  };
}

function getMatrixScore(stock: StockData): number {
  const momentum3M = finite(stock.momentum3M);
  const momentum6M = finite(stock.momentum6M);
  const catalystScore = finite(stock.catalystScore);
  const sectorHeatScore = finite(stock.sectorHeatScore);
  const distanceFromHigh = finite(stock.distanceFrom52WkHigh, -100);
  const proximityScore = Math.max(0, 100 + Math.min(0, distanceFromHigh));

  return (
    catalystScore * 0.4 +
    Math.max(0, momentum3M) * 0.3 +
    Math.max(0, momentum6M) * 0.1 +
    sectorHeatScore * 0.1 +
    proximityScore * 0.1
  );
}

function buildSectorSummary(stocks: StockData[]): SectorSummary[] {
  const bySector = new Map<string, StockData[]>();

  for (const stock of stocks) {
    const sector = (stock.sector || "").trim();
    if (!sector || sector === "Unknown") continue;
    const existing = bySector.get(sector) || [];
    existing.push(stock);
    bySector.set(sector, existing);
  }

  const summaries: SectorSummary[] = [];
  for (const [sector, sectorStocks] of bySector.entries()) {
    if (sectorStocks.length < 3) continue;

    const stockCount = sectorStocks.length;
    const avgHeat =
      sectorStocks.reduce((sum, stock) => sum + finite(stock.sectorHeatScore), 0) / stockCount;
    const avgMomentum3M =
      sectorStocks.reduce((sum, stock) => sum + finite(stock.momentum3M), 0) / stockCount;
    const avgDistance52WHigh =
      sectorStocks.reduce((sum, stock) => sum + finite(stock.distanceFrom52WkHigh, -100), 0) / stockCount;
    const leadersNearHigh = sectorStocks.filter((stock) => finite(stock.distanceFrom52WkHigh, -100) >= -10).length;

    const score =
      avgHeat * 0.45 +
      Math.max(0, avgMomentum3M) * 0.35 +
      Math.max(0, 20 + avgDistance52WHigh) * 0.2;

    summaries.push({
      sector,
      stockCount,
      avgHeat,
      avgMomentum3M,
      avgDistance52WHigh,
      leadersNearHigh,
      score,
    });
  }

  return summaries.sort((a, b) => b.score - a.score);
}

function buildBreadth(stocks: StockData[]) {
  const eligible = stocks.filter((stock) => finite(stock.price) > 0);
  const total = eligible.length;

  let aboveEma10 = 0;
  let aboveEma20 = 0;
  let near52WHigh = 0;

  for (const stock of eligible) {
    const price = finite(stock.price);
    const ema10 = finite(stock.ema10);
    const ema20 = finite(stock.ema20);
    const distance = finite(stock.distanceFrom52WkHigh, -100);

    if (ema10 > 0 && price > ema10) aboveEma10++;
    if (ema20 > 0 && price > ema20) aboveEma20++;
    if (distance >= -10) near52WHigh++;
  }

  const pctAboveEma10 = total > 0 ? (aboveEma10 / total) * 100 : 0;
  const pctAboveEma20 = total > 0 ? (aboveEma20 / total) * 100 : 0;
  const pctNear52WHigh = total > 0 ? (near52WHigh / total) * 100 : 0;

  return {
    total,
    aboveEma10,
    aboveEma20,
    near52WHigh,
    pctAboveEma10,
    pctAboveEma20,
    pctNear52WHigh,
  };
}

function buildSentiment(indexes: IndexSnapshot[], breadth: ReturnType<typeof buildBreadth>) {
  let score = 0;

  for (const index of indexes) {
    score += index.aboveEma20 ? 2 : -2;
    score += index.aboveEma10 ? 1 : -1;
    score += index.ema10AboveEma20 ? 1 : -1;
  }

  if (breadth.pctAboveEma20 >= 60) score += 2;
  else if (breadth.pctAboveEma20 <= 40) score -= 2;

  if (breadth.pctAboveEma10 >= 60) score += 1;
  else if (breadth.pctAboveEma10 <= 40) score -= 1;

  if (breadth.pctNear52WHigh >= 30) score += 1;
  else if (breadth.pctNear52WHigh <= 15) score -= 1;

  let label: "Bullish" | "Bearish" | "Neutral" = "Neutral";
  let explanation = "Gemischtes Bild. Nur A+ Setups handeln und Positionsgroesse diszipliniert halten.";

  if (score >= 5) {
    label = "Bullish";
    explanation = "SPY/QQQ und Marktbreite sprechen fuer Risk-On. Momentum-Setups haben statistischen Rueckenwind.";
  } else if (score <= -5) {
    label = "Bearish";
    explanation = "SPY/QQQ und Marktbreite sprechen fuer Risk-Off. Fokus auf Defense, kleinere Size und selektive Trades.";
  }

  return { score, label, explanation };
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const forceRefresh = searchParams.get("refresh") === "true";
  const maxRows = parsePositiveInt(searchParams.get("rows"), 36, 10, 120);
  const sectorCount = parsePositiveInt(searchParams.get("sectors"), 4, 2, 8);

  const [scanResult, indexResult] = await Promise.all([
    runFullScanWithCache({
      useCache: !forceRefresh,
      forceRefresh,
      cacheKey: "full",
    }),
    runFullScanWithCache({
      useCache: false,
      forceRefresh,
      symbols: ["SPY", "QQQ"],
      cacheKey: "seeded",
    }),
  ]);

  const stockMap = new Map<string, StockData>();
  for (const stock of scanResult.stocks) {
    stockMap.set(stock.symbol.toUpperCase(), stock);
  }
  for (const stock of indexResult.stocks) {
    stockMap.set(stock.symbol.toUpperCase(), stock);
  }

  const indexes: IndexSnapshot[] = [
    buildIndexSnapshot(stockMap.get("SPY"), "SPY"),
    buildIndexSnapshot(stockMap.get("QQQ"), "QQQ"),
  ];

  const tradableStocks = scanResult.stocks.filter((stock) => {
    const sector = (stock.sector || "").trim();
    return stock.symbol !== "SPY" && stock.symbol !== "QQQ" && sector && sector !== "Unknown" && finite(stock.price) > 2;
  });

  const hotSectors = buildSectorSummary(tradableStocks).slice(0, sectorCount);
  const hotSectorSet = new Set(hotSectors.map((sector) => sector.sector));

  const matrix: MatrixRow[] = tradableStocks
    .filter((stock) => hotSectorSet.has((stock.sector || "").trim()))
    .sort((a, b) => {
      const sectorScoreA = hotSectors.find((s) => s.sector === a.sector)?.score ?? 0;
      const sectorScoreB = hotSectors.find((s) => s.sector === b.sector)?.score ?? 0;
      if (sectorScoreB !== sectorScoreA) return sectorScoreB - sectorScoreA;
      return getMatrixScore(b) - getMatrixScore(a);
    })
    .slice(0, maxRows)
    .map((stock) => ({
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      industry: stock.industry,
      price: finite(stock.price),
      changePercent: finite(stock.changePercent),
      momentum1M: finite(stock.momentum1M),
      momentum3M: finite(stock.momentum3M),
      momentum6M: finite(stock.momentum6M),
      distanceFrom52WkHigh: finite(stock.distanceFrom52WkHigh, -100),
      sectorHeatScore: finite(stock.sectorHeatScore),
      catalystScore: finite(stock.catalystScore),
    }));

  const breadth = buildBreadth(tradableStocks);
  const sentiment = buildSentiment(indexes, breadth);

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    source: {
      fromCache: scanResult.fromCache,
      totalScanned: scanResult.totalScanned,
      stocks: scanResult.stocks.length,
    },
    sentiment,
    indexes,
    breadth,
    hotSectors,
    matrix,
  });
}
