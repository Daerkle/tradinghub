import type { StockData } from "@/types/scanner";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function maxOrNull(...values: Array<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const value of values) {
    if (!isFiniteNumber(value)) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

function isMinerviniTrendTemplate(stock: StockData): boolean {
  const price = stock.price;
  const sma50 = stock.sma50;
  const sma150 = stock.sma150;
  const sma200 = stock.sma200;
  const rs = stock.rsRating;

  if (![price, sma50, sma150, sma200, rs].every(isFiniteNumber)) return false;
  if (price <= 0 || sma50 <= 0 || sma150 <= 0 || sma200 <= 0) return false;

  const priceAbove150And200 = price > sma150 && price > sma200;
  const maStackBullish = sma50 > sma150 && sma150 > sma200;
  const has52WRange =
    isFiniteNumber(stock.distanceFrom52WkHigh) &&
    isFiniteNumber(stock.distanceFrom52WkLow) &&
    !(stock.distanceFrom52WkHigh === 0 && stock.distanceFrom52WkLow === 0);

  // Some fallbacks (Finviz/Stooq/limited quote snapshot) don't provide 52W range.
  // In that case, don't block the filter just because we cannot compute the distances.
  const nearHigh = !has52WRange ? true : stock.distanceFrom52WkHigh >= -25; // within 25% of 52W high
  const awayFromLow = !has52WRange ? true : stock.distanceFrom52WkLow >= 30; // 30% above 52W low
  const rsOk = rs >= 70;
  const momentumOk = (stock.momentum3M ?? 0) >= 0;

  return priceAbove150And200 && maStackBullish && nearHigh && awayFromLow && rsOk && momentumOk;
}

function isCANSLIMHeuristic(stock: StockData): boolean {
  const price = stock.price;
  const sma50 = stock.sma50;
  const sma200 = stock.sma200;
  const rs = stock.rsRating;

  if (![price, sma50, sma200, rs].every(isFiniteNumber)) return false;
  if (price <= 0 || sma50 <= 0 || sma200 <= 0) return false;

  const rsOk = rs >= 80;
  const trendOk = price > sma50 && price > sma200 && sma50 > sma200;
  const has52WRange =
    isFiniteNumber(stock.distanceFrom52WkHigh) &&
    isFiniteNumber(stock.distanceFrom52WkLow) &&
    !(stock.distanceFrom52WkHigh === 0 && stock.distanceFrom52WkLow === 0);

  const nearHigh = !has52WRange ? true : stock.distanceFrom52WkHigh >= -20; // leaders live near highs
  const volumeOk = (stock.volumeRatio ?? 0) >= 1.2;

  const epsGrowth = maxOrNull(stock.epsGrowthThisYear, stock.epsGrowthNextYear, stock.epsGrowth);
  const salesGrowth = maxOrNull(stock.salesGrowthQoQ, stock.revenueGrowth);
  const growthOk =
    (epsGrowth !== null && epsGrowth >= 20) ||
    (salesGrowth !== null && salesGrowth >= 15) ||
    (stock.momentum3M ?? 0) >= 25;

  // Institutional sponsorship is a CANSLIM pillar; treat missing as unknown (don't block).
  const instOk = stock.instOwn === undefined || stock.instOwn === null ? true : stock.instOwn >= 20;

  return rsOk && trendOk && nearHigh && volumeOk && growthOk && instOk;
}

export function filterByScanType(stocks: StockData[], scanType: string): StockData[] {
  switch (scanType) {
    case "ep":
      return stocks.filter(s => s.isEP);
    case "1m":
      return stocks.filter(s => s.momentum1M >= 10).sort((a, b) => b.momentum1M - a.momentum1M);
    case "3m":
      return stocks.filter(s => s.momentum3M >= 20).sort((a, b) => b.momentum3M - a.momentum3M);
    case "6m":
      return stocks.filter(s => s.momentum6M >= 30).sort((a, b) => b.momentum6M - a.momentum6M);
    case "1y":
      return stocks.filter(s => s.momentum1Y >= 40).sort((a, b) => b.momentum1Y - a.momentum1Y);
    case "setup":
    case "qullamaggie":
      return stocks.filter(s => s.isQullaSetup).sort((a, b) => b.setupScore - a.setupScore);
    case "stockbee":
      return stocks
        .filter((s) =>
          s.isStockbeeSetup ||
          s.stockbee?.isEpisodicPivot ||
          s.stockbee?.isMomentumBurst ||
          s.stockbee?.isRangeExpansionBreakout
        )
        .sort((a, b) => {
          const alignA = a.stockbee?.qullaAlignment?.alignedCount ?? 0;
          const alignB = b.stockbee?.qullaAlignment?.alignedCount ?? 0;
          if (alignB !== alignA) return alignB - alignA;
          return (b.stockbeeScore ?? 0) - (a.stockbeeScore ?? 0);
        });
    case "rs":
      return stocks.filter(s => s.rsRating >= 80).sort((a, b) => b.rsRating - a.rsRating);
    case "minervini":
      return stocks
        .filter(isMinerviniTrendTemplate)
        .sort((a, b) => {
          if (b.rsRating !== a.rsRating) return b.rsRating - a.rsRating;
          return (b.distanceFrom52WkHigh ?? -999) - (a.distanceFrom52WkHigh ?? -999);
        });
    case "canslim":
      return stocks
        .filter(isCANSLIMHeuristic)
        .sort((a, b) => {
          if (b.rsRating !== a.rsRating) return b.rsRating - a.rsRating;
          return (b.momentum3M ?? 0) - (a.momentum3M ?? 0);
        });
    case "squeeze":
      return stocks.filter(s => {
        const hasHighShortFloat = (s.shortFloat ?? 0) >= 15;
        const hasHighVolume = s.volumeRatio >= 1.5;
        const hasPositiveMomentum = s.momentum1M > 0;
        return hasHighShortFloat && hasHighVolume && hasPositiveMomentum;
      }).sort((a, b) => (b.shortFloat ?? 0) - (a.shortFloat ?? 0));
    case "catalyst":
      return stocks
        .filter((s) => s.catalystScore >= 70 || (s.gapPercent >= 5 && s.volumeRatio >= 1.8))
        .sort((a, b) => b.catalystScore - a.catalystScore);
    case "chrisswings":
      return stocks.filter(s => {
        const priceAboveEma20 = s.ema20 && s.price > s.ema20;
        const priceAboveEma50 = s.ema50 ? s.price > s.ema50 : true;
        const goodRS = s.rsRating >= 70;
        const hasSetup = s.setupScore >= 60;
        const volumeContraction = s.volumeRatio ? s.volumeRatio < 1.5 : true;
        return priceAboveEma20 && priceAboveEma50 && goodRS && hasSetup && volumeContraction;
      }).sort((a, b) => {
        if (b.rsRating !== a.rsRating) return b.rsRating - a.rsRating;
        return b.setupScore - a.setupScore;
      });
    default:
      return stocks;
  }
}
