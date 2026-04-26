import type { ApprovedDataSource } from "@/types/data-sources";

export type MarketHeatKind = "theme" | "sector" | "industry";

export type MarketHeatDataSource = ApprovedDataSource & {
  fit: "active" | "recommended" | "reference";
  latency: string;
  useFor: string;
};

export type MarketHeatMember = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  volumeRatio: number;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  momentum1Y: number;
  rsRating: number;
  catalystScore: number;
  groupHeat: number;
  hotScore: number;
  signals: string[];
};

export type MarketHeatGroup = {
  id: string;
  kind: MarketHeatKind;
  name: string;
  description: string;
  stockCount: number;
  hotScore: number;
  avgChangePercent: number;
  avgVolumeRatio: number;
  avgMomentum1M: number;
  avgMomentum3M: number;
  avgMomentum6M: number;
  avgMomentum1Y: number;
  avgRsRating: number;
  avgCatalystScore: number;
  avgGroupHeat: number;
  positiveBreadthPct: number;
  newsCount: number;
  leaders: string[];
  members: MarketHeatMember[];
};

export type MarketHeatResponse = {
  fetchedAt: string;
  scanTime: string | null;
  scanAgeSeconds: number | null;
  source: {
    responseCacheHit: boolean;
    scannerSource: "full" | "seeded";
    fromCache: boolean;
    totalScanned: number;
    stocks: number;
  };
  groups: {
    themes: MarketHeatGroup[];
    sectors: MarketHeatGroup[];
    industries: MarketHeatGroup[];
  };
  dataSources: MarketHeatDataSource[];
};
