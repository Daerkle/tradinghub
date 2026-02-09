import type { StockData } from "@/types/scanner";

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
    case "qullamaggie":
      return stocks.filter(s => s.isQullaSetup).sort((a, b) => b.setupScore - a.setupScore);
    case "rs":
      return stocks.filter(s => s.rsRating >= 80).sort((a, b) => b.rsRating - a.rsRating);
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
