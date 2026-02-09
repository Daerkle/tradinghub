import usStockSymbols from "@/data/us-stock-symbols.json";

const SYMBOL_PATTERN = /^[A-Z.-]{1,7}$/;

function normalizeSymbols(input: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const rawSymbol of input) {
    const symbol = (rawSymbol || "").toUpperCase().trim();
    if (!SYMBOL_PATTERN.test(symbol)) continue;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    deduped.push(symbol);
  }

  return deduped;
}

export const LOCAL_US_STOCK_SYMBOLS: string[] = normalizeSymbols(usStockSymbols as string[]);

// Get ALL US stock symbols from local JSON file (pre-filtered universe)
// Sorted by market cap descending.
export function getAllUSStockSymbols(limit?: number): string[] {
  if (limit && limit > 0) {
    return LOCAL_US_STOCK_SYMBOLS.slice(0, limit);
  }
  return [...LOCAL_US_STOCK_SYMBOLS];
}

export function getUSStockCount(): number {
  return LOCAL_US_STOCK_SYMBOLS.length;
}
