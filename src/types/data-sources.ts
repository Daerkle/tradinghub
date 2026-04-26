export type DataSourcePolicy = "api_allowed" | "fair_access_required" | "best_effort" | "manual_only";

export type ApprovedDataSource = {
  id: string;
  name: string;
  category: "market_data" | "classification" | "macro" | "reference";
  mode: "api" | "csv" | "reference" | "wrapper";
  policy: DataSourcePolicy;
  currentUse: boolean;
  url: string;
  note: string;
};

export type SecReferenceSnapshot = {
  tickerCount: number;
  cachedAt: string | null;
  isStale: boolean;
};
