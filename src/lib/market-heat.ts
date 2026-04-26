import type { StockData } from "@/types/scanner";
import type { MarketHeatDataSource, MarketHeatGroup, MarketHeatKind, MarketHeatMember } from "@/types/market-heat";
import usStocksFull from "@/data/us-stocks-full.json";

type ThemeDefinition = {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  symbols?: string[];
};

type GroupAccumulator = {
  id: string;
  kind: MarketHeatKind;
  name: string;
  description: string;
  members: MarketHeatMember[];
};

const LOCAL_STOCK_META = new Map<string, { sector?: string; industry?: string }>();

for (const row of usStocksFull as Array<{ symbol?: string; sector?: string; industry?: string }>) {
  const symbol = (row.symbol || "").toUpperCase().trim();
  if (!symbol) continue;
  LOCAL_STOCK_META.set(symbol, {
    sector: row.sector,
    industry: row.industry,
  });
}

const THEME_DEFINITIONS: ThemeDefinition[] = [
  {
    id: "ai-semiconductors",
    name: "AI & Semiconductors",
    description: "Chips, AI-Infrastruktur, HBM, Foundry, EDA und GPU-Lieferkette.",
    keywords: ["semiconductor", "chip", "ai", "artificial intelligence", "gpu", "memory", "eda", "foundry"],
    symbols: ["NVDA", "AMD", "AVGO", "TSM", "ASML", "ARM", "SMCI", "MU", "MRVL", "PLTR", "ANET", "SNPS", "CDNS"],
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity",
    description: "Security-Software, Zero Trust, Cloud Security und Identität.",
    keywords: ["security", "cyber", "identity", "endpoint", "firewall", "zero trust"],
    symbols: ["CRWD", "PANW", "FTNT", "ZS", "OKTA", "NET", "S", "CYBR", "TENB", "VRNS", "RPD"],
  },
  {
    id: "cloud-software",
    name: "Cloud & Software",
    description: "SaaS, Cloud-Plattformen, Datenbanken, Observability und Enterprise Software.",
    keywords: ["software", "cloud", "saas", "application", "database", "data", "observability"],
    symbols: ["MSFT", "CRM", "NOW", "SNOW", "MDB", "DDOG", "TEAM", "WDAY", "HUBS", "NET"],
  },
  {
    id: "crypto-blockchain",
    name: "Crypto & Blockchain",
    description: "Bitcoin-Proxys, Börsen, Miner, Treasury- und Blockchain-Infrastruktur.",
    keywords: ["crypto", "bitcoin", "blockchain", "digital asset", "mining"],
    symbols: ["COIN", "MSTR", "MARA", "RIOT", "CLSK", "IREN", "HOOD", "HUT", "BITF"],
  },
  {
    id: "aerospace-defense",
    name: "Aerospace & Defense",
    description: "Rüstung, Raumfahrt, Drohnen, Verteidigungselektronik und Luftfahrtzulieferer.",
    keywords: ["aerospace", "defense", "space", "aircraft", "missile", "drone", "aviation"],
    symbols: ["LMT", "RTX", "NOC", "GD", "BA", "HWM", "TDG", "KTOS", "RKLB", "ACHR", "JOBY"],
  },
  {
    id: "nuclear-uranium",
    name: "Nuclear & Uranium",
    description: "Uran, Kernenergie, SMR, Strombedarf durch AI-Rechenzentren.",
    keywords: ["uranium", "nuclear", "reactor", "utility", "electric"],
    symbols: ["CCJ", "UEC", "UUUU", "LEU", "SMR", "CEG", "VST", "OKLO", "NNE"],
  },
  {
    id: "energy-oil-gas",
    name: "Energy & Oil/Gas",
    description: "Öl, Gas, Services, LNG, Raffinerien und Energie-Transport.",
    keywords: ["oil", "gas", "energy", "lng", "drilling", "exploration", "pipeline"],
    symbols: ["XOM", "CVX", "COP", "SLB", "HAL", "LNG", "OXY", "MPC", "VLO", "EOG"],
  },
  {
    id: "solar-renewables",
    name: "Solar & Renewables",
    description: "Solar, Wechselrichter, Speicher, Wasserstoff und erneuerbare Infrastruktur.",
    keywords: ["solar", "renewable", "hydrogen", "wind", "battery storage", "clean energy"],
    symbols: ["FSLR", "ENPH", "SEDG", "NXT", "RUN", "PLUG", "BE", "ARRY"],
  },
  {
    id: "ev-batteries",
    name: "EV & Batteries",
    description: "E-Mobilität, Batterie-Lieferkette, Ladeinfrastruktur und Lithium.",
    keywords: ["ev", "electric vehicle", "battery", "lithium", "charging", "automotive"],
    symbols: ["TSLA", "RIVN", "LCID", "ALB", "LAC", "CHPT", "QS", "ON"],
  },
  {
    id: "biotech-pharma",
    name: "Biotech & Pharma",
    description: "Biotech, Pharma, klinische Daten, FDA-Katalysatoren und Healthcare Growth.",
    keywords: ["biotech", "biotechnology", "pharmaceutical", "therapeutics", "drug", "clinical"],
    symbols: ["MRNA", "VRTX", "REGN", "BIIB", "AMGN", "GILD", "LLY", "NVO", "MRK", "PFE"],
  },
  {
    id: "glp1-obesity",
    name: "GLP-1 & Obesity",
    description: "Adipositas, Diabetes, GLP-1, Weight-Loss und angrenzende Healthcare-Nutznießer.",
    keywords: ["obesity", "diabetes", "weight loss", "metabolic", "glp"],
    symbols: ["LLY", "NVO", "VKTX", "ALT", "AMGN", "MDGL", "RXRX"],
  },
  {
    id: "gold-metals",
    name: "Gold & Precious Metals",
    description: "Gold, Silber, Miner und Edelmetall-Proxys.",
    keywords: ["gold", "silver", "precious", "mining", "metals"],
    symbols: ["NEM", "GOLD", "AEM", "WPM", "AG", "PAAS", "KGC", "HL"],
  },
  {
    id: "copper-critical-materials",
    name: "Copper & Critical Materials",
    description: "Kupfer, kritische Rohstoffe, Industrialisierung und Netzausbau.",
    keywords: ["copper", "materials", "mining", "lithium", "rare earth", "steel"],
    symbols: ["FCX", "SCCO", "TECK", "CLF", "MP", "ALB", "VALE", "RIO", "BHP"],
  },
  {
    id: "fintech-payments",
    name: "Fintech & Payments",
    description: "Broker, Payments, Neobanken, Kreditplattformen und Capital Markets.",
    keywords: ["payment", "fintech", "credit", "banking", "broker", "capital markets"],
    symbols: ["V", "MA", "PYPL", "SQ", "HOOD", "COIN", "SOFI", "AFRM", "UPST"],
  },
  {
    id: "consumer-platforms",
    name: "Consumer Platforms",
    description: "E-Commerce, Werbung, Streaming, Plattformen und Consumer Internet.",
    keywords: ["internet retail", "e-commerce", "advertising", "streaming", "marketplace", "platform"],
    symbols: ["AMZN", "SHOP", "MELI", "META", "GOOGL", "NFLX", "SPOT", "UBER", "DASH", "ABNB"],
  },
  {
    id: "travel-leisure",
    name: "Travel & Leisure",
    description: "Airlines, Hotels, Kreuzfahrten, Booking und Freizeitkonsum.",
    keywords: ["travel", "airline", "hotel", "resort", "cruise", "leisure", "gaming"],
    symbols: ["DAL", "UAL", "AAL", "LUV", "CCL", "RCL", "NCLH", "MAR", "HLT", "BKNG", "ABNB"],
  },
  {
    id: "high-beta-squeeze",
    name: "High Beta & Squeeze",
    description: "Hohe Volatilität, Short Interest, Gap-/Volume-Spikes und Momentum-Bursts.",
    keywords: ["short interest", "high volume", "momentum burst", "gap", "high adr"],
    symbols: ["GME", "AMC", "CVNA", "UPST", "AFRM", "AI", "IONQ", "RGTI", "QBTS"],
  },
];

export const MARKET_HEAT_DATA_SOURCES: MarketHeatDataSource[] = [
  {
    id: "scanner-snapshot",
    name: "TradingHub Scanner Snapshot",
    category: "market_data",
    mode: "api",
    policy: "api_allowed",
    currentUse: true,
    fit: "active",
    latency: "sofort aus Redis, Refresh im Hintergrund",
    useFor: "aktueller MVP für Hot Themes, Sektoren, Industrien und Leader-Aktien",
    url: "/api/scanner/stream",
    note: "Nutzt den vorhandenen Scanner-Snapshot mit Kurs, Momentum, Volumen, RS, Catalyst und Heat-Scores.",
  },
  {
    id: "fmp-sector-industry",
    name: "Financial Modeling Prep",
    category: "market_data",
    mode: "api",
    policy: "api_allowed",
    currentUse: false,
    fit: "recommended",
    latency: "real-time bis täglich, je nach Plan",
    useFor: "Sector Performance, Industry Performance Snapshot und Company Screener",
    url: "https://site.financialmodelingprep.com/developer/docs/stable/sector-performance-snapshot",
    note: "Beste direkte API-Ergänzung für Sektor-/Industrie-Performance plus Screening nach Sector/Industry.",
  },
  {
    id: "polygon-movers",
    name: "Polygon / Massive Snapshots",
    category: "market_data",
    mode: "api",
    policy: "api_allowed",
    currentUse: false,
    fit: "recommended",
    latency: "15 Minuten verzögert in Starter/Developer-Plänen, Plan abhängig",
    useFor: "Top Gainers/Losers, Snapshot-Mover und Intraday-Validierung",
    url: "https://polygon.io/docs/rest/stocks/snapshots/top-market-movers",
    note: "Gut, um Intraday-Mover gegen einen lizenzierten Snapshot-Feed abzusichern.",
  },
  {
    id: "alpha-vantage-news-movers",
    name: "Alpha Vantage",
    category: "market_data",
    mode: "api",
    policy: "api_allowed",
    currentUse: false,
    fit: "recommended",
    latency: "leicht verzögert, API-Limits beachten",
    useFor: "Top Gainers/Losers und News Sentiment nach Topics",
    url: "https://www.alphavantage.co/documentation/",
    note: "Sinnvoll für News-Themen und Basis-Mover, aber nicht als einziger Intraday-Feed.",
  },
  {
    id: "marketaux-news-themes",
    name: "Marketaux",
    category: "reference",
    mode: "api",
    policy: "api_allowed",
    currentUse: false,
    fit: "recommended",
    latency: "nahe Echtzeit, News-API-Limits beachten",
    useFor: "News-Entities, Sentiment, Themen-Hotness und Nachrichten-Cluster",
    url: "https://www.marketaux.com/documentation",
    note: "Gute Ergänzung, um Aktien-Cluster mit echten News-Entity-Statistiken zu gewichten.",
  },
  {
    id: "openbb-equity-screener",
    name: "OpenBB Equity Screener",
    category: "market_data",
    mode: "wrapper",
    policy: "api_allowed",
    currentUse: true,
    fit: "active",
    latency: "Provider abhängig",
    useFor: "Fallback-Screener mit Sector/Industry-Filtern",
    url: "https://docs.openbb.co/odp/python/data_models/EquityScreener",
    note: "Passt gut zum bestehenden OpenBB-Service im Stack und kann später einzelne Provider abstrahieren.",
  },
  {
    id: "nasdaq-data-link-basic",
    name: "Nasdaq Data Link / Nasdaq Basic",
    category: "market_data",
    mode: "api",
    policy: "api_allowed",
    currentUse: false,
    fit: "reference",
    latency: "real-time oder delayed, lizenzabhängig",
    useFor: "lizenzierter Real-Time-/Delayed-Feed und Referenzdaten",
    url: "https://docs.data.nasdaq.com/",
    note: "Saubere Lizenzoption, wenn die Ansicht später nicht nur privat genutzt wird.",
  },
];

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLabel(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "-") return "";
  return trimmed;
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stockHotScore(stock: StockData, groupHeat: number): number {
  const change = finite(stock.changePercent);
  const volumeRatio = finite(stock.volumeRatio);
  const m1 = finite(stock.momentum1M);
  const m3 = finite(stock.momentum3M);
  const m6 = finite(stock.momentum6M);
  const m1Y = finite(stock.momentum1Y);
  const rs = finite(stock.rsRating);
  const catalyst = finite(stock.catalystScore);
  const news = finite(stock.todayNewsCount);
  const shortFloat = finite(stock.shortFloat);
  const flags = [
    stock.isEP ? 7 : 0,
    stock.isQullaSetup ? 5 : 0,
    stock.isStockbeeSetup ? 5 : 0,
    shortFloat >= 15 ? 4 : 0,
  ];

  return Math.max(
    0,
    change * 3.8 +
      Math.min(volumeRatio, 8) * 6 +
      Math.max(0, m1) * 0.55 +
      Math.max(0, m3) * 0.22 +
      Math.max(0, m6) * 0.1 +
      Math.max(0, m1Y) * 0.04 +
      rs * 0.16 +
      catalyst * 0.22 +
      groupHeat * 0.16 +
      Math.min(news, 5) * 5 +
      flags.reduce((sum, value) => sum + value, 0)
  );
}

function buildMember(stock: StockData, kind: MarketHeatKind): MarketHeatMember {
  const localMeta = LOCAL_STOCK_META.get((stock.symbol || "").toUpperCase().trim());
  const sector = normalizeLabel(stock.sector) || normalizeLabel(localMeta?.sector) || "Unbekannt";
  const industry = normalizeLabel(stock.industry) || normalizeLabel(localMeta?.industry) || "Unbekannt";
  const groupHeat = kind === "sector" ? finite(stock.sectorHeatScore) : finite(stock.industryHeatScore || stock.sectorHeatScore);
  return {
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    sector,
    industry,
    price: round(finite(stock.price), 2),
    changePercent: round(finite(stock.changePercent), 2),
    volumeRatio: round(finite(stock.volumeRatio), 2),
    momentum1M: round(finite(stock.momentum1M), 2),
    momentum3M: round(finite(stock.momentum3M), 2),
    momentum6M: round(finite(stock.momentum6M), 2),
    momentum1Y: round(finite(stock.momentum1Y), 2),
    rsRating: round(finite(stock.rsRating), 1),
    catalystScore: round(finite(stock.catalystScore), 1),
    groupHeat: round(groupHeat, 1),
    hotScore: round(stockHotScore(stock, groupHeat), 2),
    signals: Array.isArray(stock.catalystSignals) ? stock.catalystSignals.slice(0, 6) : [],
  };
}

function textForStock(stock: StockData): string {
  return [
    stock.symbol,
    stock.name,
    stock.sector,
    stock.industry,
    ...(Array.isArray(stock.catalystSignals) ? stock.catalystSignals : []),
    ...(Array.isArray(stock.scanTypes) ? stock.scanTypes : []),
  ]
    .join(" ")
    .toLowerCase();
}

function themesForStock(stock: StockData): ThemeDefinition[] {
  const symbol = (stock.symbol || "").toUpperCase();
  const haystack = textForStock(stock);

  return THEME_DEFINITIONS.filter((theme) => {
    if (theme.symbols?.includes(symbol)) return true;
    return theme.keywords.some((keyword) => haystack.includes(keyword));
  });
}

function addMember(groups: Map<string, GroupAccumulator>, group: Omit<GroupAccumulator, "members">, member: MarketHeatMember): void {
  const existing = groups.get(group.id) ?? { ...group, members: [] };
  existing.members.push(member);
  groups.set(group.id, existing);
}

function buildGroup(accumulator: GroupAccumulator): MarketHeatGroup {
  const members = accumulator.members
    .slice()
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, 80);
  const allMembers = accumulator.members;
  const positive = allMembers.filter((member) => member.changePercent > 0).length;
  const avgChangePercent = average(allMembers.map((member) => member.changePercent));
  const avgVolumeRatio = average(allMembers.map((member) => member.volumeRatio));
  const avgMomentum1M = average(allMembers.map((member) => member.momentum1M));
  const avgMomentum3M = average(allMembers.map((member) => member.momentum3M));
  const avgMomentum6M = average(allMembers.map((member) => member.momentum6M));
  const avgMomentum1Y = average(allMembers.map((member) => member.momentum1Y));
  const avgRsRating = average(allMembers.map((member) => member.rsRating));
  const avgCatalystScore = average(allMembers.map((member) => member.catalystScore));
  const avgGroupHeat = average(allMembers.map((member) => member.groupHeat));
  const newsCount = allMembers.reduce((sum, member) => {
    return sum + (member.signals.includes("News Today") || member.signals.includes("News Cluster") ? 1 : 0);
  }, 0);
  const breadth = allMembers.length ? (positive / allMembers.length) * 100 : 0;
  const memberHeat = average(members.slice(0, Math.min(12, members.length)).map((member) => member.hotScore));
  const hotScore =
    memberHeat * 0.48 +
    Math.max(0, avgChangePercent) * 5 +
    Math.min(avgVolumeRatio, 6) * 5 +
    Math.max(0, avgMomentum1M) * 0.5 +
    Math.max(0, avgMomentum3M) * 0.24 +
    Math.max(0, avgMomentum6M) * 0.1 +
    Math.max(0, avgMomentum1Y) * 0.04 +
    avgCatalystScore * 0.16 +
    avgRsRating * 0.08 +
    avgGroupHeat * 0.12 +
    breadth * 0.14 +
    Math.min(newsCount, 10) * 2;

  return {
    id: accumulator.id,
    kind: accumulator.kind,
    name: accumulator.name,
    description: accumulator.description,
    stockCount: allMembers.length,
    hotScore: round(hotScore, 1),
    avgChangePercent: round(avgChangePercent, 2),
    avgVolumeRatio: round(avgVolumeRatio, 2),
    avgMomentum1M: round(avgMomentum1M, 2),
    avgMomentum3M: round(avgMomentum3M, 2),
    avgMomentum6M: round(avgMomentum6M, 2),
    avgMomentum1Y: round(avgMomentum1Y, 2),
    avgRsRating: round(avgRsRating, 1),
    avgCatalystScore: round(avgCatalystScore, 1),
    avgGroupHeat: round(avgGroupHeat, 1),
    positiveBreadthPct: round(breadth, 1),
    newsCount,
    leaders: members.slice(0, 5).map((member) => member.symbol),
    members,
  };
}

function sortGroups(groups: GroupAccumulator[], minMembers: number): MarketHeatGroup[] {
  return groups
    .filter((group) => group.members.length >= minMembers)
    .map(buildGroup)
    .sort((a, b) => b.hotScore - a.hotScore);
}

export function buildMarketHeatGroups(stocks: StockData[]): {
  themes: MarketHeatGroup[];
  sectors: MarketHeatGroup[];
  industries: MarketHeatGroup[];
} {
  const themeGroups = new Map<string, GroupAccumulator>();
  const sectorGroups = new Map<string, GroupAccumulator>();
  const industryGroups = new Map<string, GroupAccumulator>();

  for (const stock of stocks) {
    const localMeta = LOCAL_STOCK_META.get((stock.symbol || "").toUpperCase().trim());
    const sector = normalizeLabel(stock.sector) || normalizeLabel(localMeta?.sector);
    const industry = normalizeLabel(stock.industry) || normalizeLabel(localMeta?.industry);

    if (sector) {
      addMember(
        sectorGroups,
        {
          id: `sector-${slug(sector)}`,
          kind: "sector",
          name: sector,
          description: `Alle Scanner-Aktien im Sektor ${sector}.`,
        },
        buildMember(stock, "sector")
      );
    }

    if (industry) {
      addMember(
        industryGroups,
        {
          id: `industry-${slug(industry)}`,
          kind: "industry",
          name: industry,
          description: `Alle Scanner-Aktien in der Industrie ${industry}.`,
        },
        buildMember(stock, "industry")
      );
    }

    for (const theme of themesForStock(stock)) {
      addMember(
        themeGroups,
        {
          id: `theme-${theme.id}`,
          kind: "theme",
          name: theme.name,
          description: theme.description,
        },
        buildMember(stock, "theme")
      );
    }
  }

  return {
    themes: sortGroups(Array.from(themeGroups.values()), 2),
    sectors: sortGroups(Array.from(sectorGroups.values()), 2),
    industries: sortGroups(Array.from(industryGroups.values()), 2),
  };
}
