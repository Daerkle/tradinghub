export const NEWS_TAG_TRANSLATIONS: Record<string, string> = {
  Earnings: "Zahlen",
  Analyst: "Analysten",
  "M&A": "M&A",
  Product: "Produkt",
  Contract: "Auftrag",
  Legal: "Recht",
  Macro: "Makro",
  AI: "KI",
  Semiconductors: "Halbleiter",
  Crypto: "Krypto",
  Energy: "Energie",
  Defense: "Ruestung",
  EV: "E-Mobilitaet",
  Biotech: "Biotech",
  China: "China",
  Rates: "Zinsen",
  Dividend: "Dividende",
  Buyback: "Aktienrueckkauf",
  Insider: "Insider",
  Guidance: "Ausblick",
  IPO: "IPO",
  General: "Allgemein",
};

export function translateNewsTag(tag: string): string {
  const normalized = String(tag || "").trim();
  if (!normalized) return "";
  return NEWS_TAG_TRANSLATIONS[normalized] || normalized;
}

