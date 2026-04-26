import type { ApprovedDataSource, SecReferenceSnapshot } from "@/types/data-sources";

export type GroupKind = "industry" | "sector";

export type GroupMemberRow = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  momentum1Y: number;
  rsRating: number;
  catalystScore: number;
  groupHeat: number;
  score: number;
};

export type GroupRankingRow = {
  name: string;
  kind: GroupKind;
  stockCount: number;
  currentRank: number;
  lastWeekRank: number | null;
  threeMonthRank: number | null;
  sixMonthRank: number | null;
  rankChangePct: number | null;
  avgChangePercent: number;
  avgMomentum1M: number;
  avgMomentum3M: number;
  avgMomentum6M: number;
  avgMomentum1Y: number;
  avgRsRating: number;
  avgCatalystScore: number;
  avgGroupHeat: number;
  leaders: string[];
  members: GroupMemberRow[];
  sourceMode: "snapshot" | "proxy";
};

export type GroupRankingResponse = {
  fetchedAt: string;
  source: {
    fromCache: boolean;
    responseCacheHit?: boolean;
    totalScanned: number;
    stocks: number;
  };
  snapshotInfo: {
    lastWeek: "snapshot" | "proxy";
    threeMonth: "snapshot" | "proxy";
    sixMonth: "snapshot" | "proxy";
  };
  sources: ApprovedDataSource[];
  secReference: SecReferenceSnapshot;
  industries: GroupRankingRow[];
  sectors: GroupRankingRow[];
};
