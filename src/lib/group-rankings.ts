import type { StockData } from "@/lib/scanner-service";
import { readPersistentSnapshot, writePersistentSnapshot } from "@/lib/persistent-storage";
import type { GroupKind, GroupMemberRow, GroupRankingRow } from "@/types/group-rankings";
import usStocksFull from "@/data/us-stocks-full.json";

type RankSnapshotEntry = {
  name: string;
  score: number;
  rank: number;
};

type RankSnapshot = {
  savedAt: string;
  rows: RankSnapshotEntry[];
};

type AggregatedGroup = {
  name: string;
  kind: GroupKind;
  stockCount: number;
  avgChangePercent: number;
  avgMomentum1M: number;
  avgMomentum3M: number;
  avgMomentum6M: number;
  avgMomentum1Y: number;
  avgRsRating: number;
  avgCatalystScore: number;
  avgGroupHeat: number;
  compositeScore: number;
  leaders: string[];
  members: GroupMemberRow[];
};

const SNAPSHOT_NAMESPACE = "group-rankings";
const LOCAL_STOCK_META = new Map<string, { sector?: string; industry?: string }>();

for (const row of usStocksFull as Array<{ symbol?: string; sector?: string; industry?: string }>) {
  const symbol = (row.symbol || "").toUpperCase().trim();
  if (!symbol) continue;
  LOCAL_STOCK_META.set(symbol, {
    sector: row.sector,
    industry: row.industry,
  });
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeGroupLabel(value: string | null | undefined): string {
  const normalized = (value || "").trim();
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  if (lower === "unknown" || lower === "n/a" || lower === "na" || lower === "-") {
    return "";
  }

  return normalized;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(days: number): Date {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function buildSnapshotKey(kind: GroupKind, date: Date): string {
  return `${kind}-${dateKey(date)}`;
}

function buildGroupScore(stock: StockData, kind: GroupKind): number {
  const rs = finite(stock.rsRating);
  const catalyst = finite(stock.catalystScore);
  const m1 = finite(stock.momentum1M);
  const m3 = finite(stock.momentum3M);
  const m6 = finite(stock.momentum6M);
  const m1Y = finite(stock.momentum1Y);
  const heat = kind === "industry" ? finite(stock.industryHeatScore) : finite(stock.sectorHeatScore);

  return (
    rs * 0.28 +
    catalyst * 0.24 +
    Math.max(0, m1) * 0.12 +
    Math.max(0, m3) * 0.18 +
    Math.max(0, m6) * 0.1 +
    Math.max(0, m1Y) * 0.04 +
    heat * 0.08
  );
}

function buildMemberRow(stock: StockData, kind: GroupKind): GroupMemberRow {
  const localMeta = LOCAL_STOCK_META.get((stock.symbol || "").toUpperCase().trim());
  const resolvedIndustry = normalizeGroupLabel(stock.industry) || normalizeGroupLabel(localMeta?.industry) || "Unbekannt";
  const resolvedSector = normalizeGroupLabel(stock.sector) || normalizeGroupLabel(localMeta?.sector) || "Unbekannt";
  const groupHeat = finite(kind === "industry" ? stock.industryHeatScore : stock.sectorHeatScore);

  return {
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    sector: resolvedSector,
    industry: resolvedIndustry,
    price: round(finite(stock.price), 2),
    changePercent: round(finite(stock.changePercent), 2),
    momentum1M: round(finite(stock.momentum1M), 2),
    momentum3M: round(finite(stock.momentum3M), 2),
    momentum6M: round(finite(stock.momentum6M), 2),
    momentum1Y: round(finite(stock.momentum1Y), 2),
    rsRating: round(finite(stock.rsRating), 1),
    catalystScore: round(finite(stock.catalystScore), 1),
    groupHeat: round(groupHeat, 1),
    score: round(buildGroupScore(stock, kind), 2),
  };
}

function aggregateGroups(stocks: StockData[], kind: GroupKind): AggregatedGroup[] {
  const buckets = new Map<string, StockData[]>();

  for (const stock of stocks) {
    const localMeta = LOCAL_STOCK_META.get((stock.symbol || "").toUpperCase().trim());
    const resolvedIndustry = normalizeGroupLabel(stock.industry) || normalizeGroupLabel(localMeta?.industry);
    const resolvedSector = normalizeGroupLabel(stock.sector) || normalizeGroupLabel(localMeta?.sector);
    const key = kind === "industry" ? resolvedIndustry : resolvedSector;
    if (!key) continue;
    const bucket = buckets.get(key) ?? [];
    bucket.push(stock);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .filter(([, bucket]) => bucket.length >= 1)
    .map(([name, bucket]) => {
      const avgChangePercent = average(bucket.map((stock) => finite(stock.changePercent)));
      const avgMomentum1M = average(bucket.map((stock) => finite(stock.momentum1M)));
      const avgMomentum3M = average(bucket.map((stock) => finite(stock.momentum3M)));
      const avgMomentum6M = average(bucket.map((stock) => finite(stock.momentum6M)));
      const avgMomentum1Y = average(bucket.map((stock) => finite(stock.momentum1Y)));
      const avgRsRating = average(bucket.map((stock) => finite(stock.rsRating)));
      const avgCatalystScore = average(bucket.map((stock) => finite(stock.catalystScore)));
      const avgGroupHeat = average(
        bucket.map((stock) => finite(kind === "industry" ? stock.industryHeatScore : stock.sectorHeatScore))
      );
      const compositeScore = average(bucket.map((stock) => buildGroupScore(stock, kind)));
      const leaders = bucket
        .slice()
        .sort((a, b) => buildGroupScore(b, kind) - buildGroupScore(a, kind))
        .slice(0, 4)
        .map((stock) => stock.symbol);
      const members = bucket
        .slice()
        .sort((a, b) => buildGroupScore(b, kind) - buildGroupScore(a, kind))
        .map((stock) => buildMemberRow(stock, kind));

      return {
        name,
        kind,
        stockCount: bucket.length,
        avgChangePercent: round(avgChangePercent, 2),
        avgMomentum1M: round(avgMomentum1M, 2),
        avgMomentum3M: round(avgMomentum3M, 2),
        avgMomentum6M: round(avgMomentum6M, 2),
        avgMomentum1Y: round(avgMomentum1Y, 2),
        avgRsRating: round(avgRsRating, 1),
        avgCatalystScore: round(avgCatalystScore, 1),
        avgGroupHeat: round(avgGroupHeat, 1),
        compositeScore: round(compositeScore, 2),
        leaders,
        members,
      } satisfies AggregatedGroup;
    })
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

async function saveSnapshot(kind: GroupKind, groups: AggregatedGroup[]): Promise<void> {
  const snapshot: RankSnapshot = {
    savedAt: new Date().toISOString(),
    rows: groups.map((group, index) => ({
      name: group.name,
      score: group.compositeScore,
      rank: index + 1,
    })),
  };

  await writePersistentSnapshot(SNAPSHOT_NAMESPACE, buildSnapshotKey(kind, new Date()), snapshot);
}

async function loadSnapshot(kind: GroupKind, maxAgeDays: number): Promise<RankSnapshot | null> {
  for (let dayOffset = maxAgeDays; dayOffset <= maxAgeDays + 5; dayOffset += 1) {
    const date = shiftDays(dayOffset);
    const snapshot = await readPersistentSnapshot<RankSnapshot>(SNAPSHOT_NAMESPACE, buildSnapshotKey(kind, date));
    if (snapshot?.rows?.length) {
      return snapshot;
    }
  }
  return null;
}

function buildProxyRanks(
  groups: AggregatedGroup[],
  key: "avgMomentum1M" | "avgMomentum3M" | "avgMomentum6M"
): Map<string, number> {
  return new Map(
    groups
      .slice()
      .sort((a, b) => b[key] - a[key])
      .map((group, index) => [group.name, index + 1] as const)
  );
}

function computeRankChangePct(currentRank: number, previousRank: number | null): number | null {
  if (!previousRank || previousRank <= 0) return null;
  return round(((previousRank - currentRank) / previousRank) * 100, 1);
}

export async function buildGroupRankingRows(
  stocks: StockData[],
  kind: GroupKind
): Promise<{ rows: GroupRankingRow[]; snapshotInfo: { lastWeek: "snapshot" | "proxy"; threeMonth: "snapshot" | "proxy"; sixMonth: "snapshot" | "proxy" } }> {
  const groups = aggregateGroups(stocks, kind);
  await saveSnapshot(kind, groups);

  const [weekSnapshot, threeMonthSnapshot, sixMonthSnapshot] = await Promise.all([
    loadSnapshot(kind, 7),
    loadSnapshot(kind, 90),
    loadSnapshot(kind, 180),
  ]);

  const weekMap = weekSnapshot ? new Map(weekSnapshot.rows.map((row) => [row.name, row.rank])) : buildProxyRanks(groups, "avgMomentum1M");
  const threeMonthMap = threeMonthSnapshot
    ? new Map(threeMonthSnapshot.rows.map((row) => [row.name, row.rank]))
    : buildProxyRanks(groups, "avgMomentum3M");
  const sixMonthMap = sixMonthSnapshot
    ? new Map(sixMonthSnapshot.rows.map((row) => [row.name, row.rank]))
    : buildProxyRanks(groups, "avgMomentum6M");

  const rows = groups.map((group, index) => {
    const currentRank = index + 1;
    const lastWeekRank = weekMap.get(group.name) ?? null;
    const threeMonthRank = threeMonthMap.get(group.name) ?? null;
    const sixMonthRank = sixMonthMap.get(group.name) ?? null;

    return {
      name: group.name,
      kind,
      stockCount: group.stockCount,
      currentRank,
      lastWeekRank,
      threeMonthRank,
      sixMonthRank,
      rankChangePct: computeRankChangePct(currentRank, lastWeekRank),
      avgChangePercent: group.avgChangePercent,
      avgMomentum1M: group.avgMomentum1M,
      avgMomentum3M: group.avgMomentum3M,
      avgMomentum6M: group.avgMomentum6M,
      avgMomentum1Y: group.avgMomentum1Y,
      avgRsRating: group.avgRsRating,
      avgCatalystScore: group.avgCatalystScore,
      avgGroupHeat: group.avgGroupHeat,
      leaders: group.leaders,
      members: group.members,
      sourceMode: weekSnapshot && threeMonthSnapshot && sixMonthSnapshot ? "snapshot" : "proxy",
    } satisfies GroupRankingRow;
  });

  return {
    rows,
    snapshotInfo: {
      lastWeek: weekSnapshot ? "snapshot" : "proxy",
      threeMonth: threeMonthSnapshot ? "snapshot" : "proxy",
      sixMonth: sixMonthSnapshot ? "snapshot" : "proxy",
    },
  };
}
