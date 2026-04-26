"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronRight,
  Database,
  ExternalLink,
  RefreshCw,
  Search,
  TrendingUp,
  type LucideIcon,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompactStockWatchlist, type CompactWatchlistItem } from "@/components/scanner/compact-stock-watchlist";
import { SlimMetricRow, SlimStatCard } from "@/components/dashboard/slim-stat-card";
import { readClientJsonCache, writeClientJsonCache } from "@/lib/client-json-cache";
import { cn } from "@/lib/utils";
import type { GroupMemberRow, GroupRankingResponse, GroupRankingRow } from "@/types/group-rankings";

type TabValue = "industry" | "sector";

const TOP_GROUPS_CACHE_KEY = "top-groups-v4";
const TOP_GROUPS_MAX_AGE_MS = 3 * 60 * 1000;

function formatPct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatRank(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value}`;
}

function toneClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-muted-foreground";
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function sourceLabel(value: "snapshot" | "proxy"): string {
  return value === "snapshot" ? "Snapshot" : "Proxy";
}

function scannerUrl(symbol: string): string {
  return `/scanner?symbol=${encodeURIComponent(symbol)}`;
}

function groupMemberToWatchItem(member: GroupMemberRow): CompactWatchlistItem {
  return {
    symbol: member.symbol,
    name: member.name,
    href: scannerUrl(member.symbol),
    price: member.price,
    changePercent: member.changePercent,
    momentum1M: member.momentum1M,
    momentum3M: member.momentum3M,
    momentum6M: member.momentum6M,
    momentum1Y: member.momentum1Y,
    rsRating: member.rsRating,
    catalystScore: member.catalystScore,
    heatScore: member.groupHeat,
    score: member.score,
    sector: member.sector,
    industry: member.industry,
  };
}

function momentumComposite(row: GroupRankingRow | null | undefined): number {
  if (!row) return -Infinity;
  return row.avgMomentum1M * 0.32 + row.avgMomentum3M * 0.3 + row.avgMomentum6M * 0.23 + row.avgMomentum1Y * 0.15;
}

function policyLabel(value: "api_allowed" | "fair_access_required" | "best_effort" | "manual_only"): string {
  switch (value) {
    case "api_allowed":
      return "API erlaubt";
    case "fair_access_required":
      return "Fair Access";
    case "best_effort":
      return "Best Effort";
    case "manual_only":
      return "Nur Referenz";
  }
}

export default function TopGroupsPage() {
  const [data, setData] = useState<GroupRankingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<TabValue>("industry");
  const [selectedRow, setSelectedRow] = useState<GroupRankingRow | null>(null);
  const deferredSearch = useDeferredValue(searchQuery.trim().toLowerCase());

  async function loadData(refresh = false) {
    const cached = readClientJsonCache<GroupRankingResponse>(TOP_GROUPS_CACHE_KEY, {
      maxAgeMs: TOP_GROUPS_MAX_AGE_MS,
      allowStale: true,
    });

    if (cached) {
      setData(cached.data);
      setIsLoading(false);
      if (!refresh && !cached.isStale) {
        setIsRefreshing(false);
        setError(null);
        return;
      }
      setIsRefreshing(true);
    } else if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/scanner/group-rankings${refresh ? "?refresh=true" : ""}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as GroupRankingResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Top-Gruppen konnten nicht geladen werden.");
      }
      setData(payload);
      writeClientJsonCache(TOP_GROUPS_CACHE_KEY, payload);
    } catch (fetchError) {
      if (!cached) {
        setError(fetchError instanceof Error ? fetchError.message : "Top-Gruppen konnten nicht geladen werden.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData(false);
  }, []);

  const activeRows = useMemo(() => {
    const rows = tab === "industry" ? data?.industries ?? [] : data?.sectors ?? [];
    if (!deferredSearch) return rows;

    return rows.filter((row) => {
      const haystack = [
        row.name,
        row.leaders.join(" "),
        row.members.map((member) => `${member.symbol} ${member.name}`).join(" "),
      ].join(" ").toLowerCase();
      return haystack.includes(deferredSearch);
    });
  }, [data, deferredSearch, tab]);

  const topRow = activeRows[0] ?? null;
  const strongestMomentum = useMemo(() => {
    return activeRows.reduce<GroupRankingRow | null>((best, row) => {
      if (!best) return row;
      return momentumComposite(row) > momentumComposite(best) ? row : best;
    }, null);
  }, [activeRows]);

  const mostImproved = useMemo(() => {
    return activeRows.reduce<GroupRankingRow | null>((best, row) => {
      if (typeof row.rankChangePct !== "number") return best;
      if (!best || (best.rankChangePct ?? -Infinity) < row.rankChangePct) return row;
      return best;
    }, null);
  }, [activeRows]);

  const snapshotInfo = data?.snapshotInfo;

  return (
    <div className="space-y-2 pb-6 sm:space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="hidden items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
            <BarChart3 className="h-3.5 w-3.5" />
            Gruppen-Rankings aus Scanner, Heat und Momentum
          </div>
          <div>
            <h1 className="sr-only font-bold sm:not-sr-only sm:text-2xl">Top Gruppen</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Nachgebaut aus euren Quellen: aktuelle Branchen- und Sektor-Rankings mit Historienvergleich.
            </p>
          </div>
        </div>

        <div className="flex flex-row gap-2 sm:items-center">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Gruppe oder Leader suchen"
              className="h-9 pl-8"
            />
          </div>
          <Button
            onClick={() => void loadData(true)}
            disabled={isRefreshing}
            size="sm"
            className="h-9 shrink-0 gap-2 px-2.5 sm:px-3"
            aria-label="Top Gruppen aktualisieren"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:hidden">
        <MiniGroupStat
          icon={Users}
          label="Führend"
          value={topRow?.name ?? "-"}
          hint={`#${formatRank(topRow?.currentRank)} · ${formatPct(topRow?.avgChangePercent, 2)}`}
          toneClassName={toneClass(topRow?.avgChangePercent)}
        />
        <MiniGroupStat
          icon={TrendingUp}
          label="Momentum"
          value={strongestMomentum?.name ?? "-"}
          hint={`1M ${formatPct(strongestMomentum?.avgMomentum1M, 1)} · 3M ${formatPct(strongestMomentum?.avgMomentum3M, 1)}`}
          toneClassName={toneClass(momentumComposite(strongestMomentum))}
        />
        <MiniGroupStat
          icon={BarChart3}
          label="Aufstieg"
          value={mostImproved?.name ?? "-"}
          hint={`${formatPct(mostImproved?.rankChangePct)} · #${formatRank(mostImproved?.currentRank)}`}
          toneClassName={toneClass(mostImproved?.rankChangePct)}
        />
        <MiniGroupStat
          icon={Activity}
          label="Daten"
          value={`${data?.source.stocks ?? 0}`}
          hint={`${activeRows.length} Gruppen · ${data?.source.responseCacheHit ? "Cache" : "Live"}`}
        />
      </div>

      <div className="hidden gap-2 md:grid md:grid-cols-3">
        <SlimStatCard
          icon={Users}
          label="Führende Gruppe"
          value={topRow?.name ?? "-"}
          hint={`#${formatRank(topRow?.currentRank)} · ${formatPct(topRow?.avgChangePercent, 2)} · ${topRow?.leaders.join(", ") || "-"}`}
          toneClassName={toneClass(topRow?.avgChangePercent)}
        />
        <SlimStatCard
          icon={TrendingUp}
          label="Stärkster Performance-Mix"
          value={strongestMomentum?.name ?? "-"}
          hint={`1M ${formatPct(strongestMomentum?.avgMomentum1M, 1)} · 3M ${formatPct(strongestMomentum?.avgMomentum3M, 1)} · 6M ${formatPct(strongestMomentum?.avgMomentum6M, 1)} · 1Y ${formatPct(strongestMomentum?.avgMomentum1Y, 1)}`}
          toneClassName={toneClass(momentumComposite(strongestMomentum))}
        />
        <SlimStatCard
          icon={BarChart3}
          label="Größter Aufstieg vs. Vorwoche"
          value={mostImproved?.name ?? "-"}
          hint={`${formatPct(mostImproved?.rankChangePct)} · #${formatRank(mostImproved?.currentRank)} / #${formatRank(mostImproved?.lastWeekRank)} · ${mostImproved?.stockCount ?? "-"} Mitglieder`}
          toneClassName={toneClass(mostImproved?.rankChangePct)}
        />
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="space-y-2 sm:space-y-3">
        <TabsList className="!grid h-8 w-full grid-cols-2 gap-1 sm:w-[260px]">
          <TabsTrigger value="industry">Branchen</TabsTrigger>
          <TabsTrigger value="sector">Sektoren</TabsTrigger>
        </TabsList>

        <TabsContent value="industry" className="space-y-3">
          <RankingTable
            rows={activeRows}
            isLoading={isLoading}
            error={error}
            onSelect={setSelectedRow}
            kindLabel="Branchen"
          />
        </TabsContent>

        <TabsContent value="sector" className="space-y-3">
          <RankingTable
            rows={activeRows}
            isLoading={isLoading}
            error={error}
            onSelect={setSelectedRow}
            kindLabel="Sektoren"
          />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader className="gap-2 pb-2 sm:gap-3 sm:pb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-base sm:text-lg">Historie & Datenstand</CardTitle>
              <CardDescription className="hidden sm:block">
                `Last Week`, `3 Mo Ago` und `6 Mo Ago` nutzen echte Snapshots, wenn vorhanden. Sonst fällt die App auf Proxy-Ränge aus euren Momentum-Fenstern zurück.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">1W: {snapshotInfo ? sourceLabel(snapshotInfo.lastWeek) : "-"}</Badge>
              <Badge variant="outline">3M: {snapshotInfo ? sourceLabel(snapshotInfo.threeMonth) : "-"}</Badge>
              <Badge variant="outline">6M: {snapshotInfo ? sourceLabel(snapshotInfo.sixMonth) : "-"}</Badge>
              <Badge variant="outline">{data?.source.responseCacheHit ? "Response Cache" : "Live Compute"}</Badge>
              <Badge variant="secondary">{data?.source.fromCache ? "Cache" : "Fresh Scan"}</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1.35fr_0.95fr]">
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Freigegebene Quellen</CardTitle>
            <CardDescription className="hidden sm:block">
              Nur Quellen, die wir sinnvoll anzapfen können oder bewusst als reine Referenz behandeln.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {data?.sources.map((source, index) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "rounded-md border p-2 transition-colors hover:bg-muted/30 sm:p-3",
                    index >= 4 && "hidden sm:block"
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{source.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {source.category} · {source.mode}
                      </div>
                    </div>
                    <ExternalLink className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant={source.currentUse ? "default" : "secondary"}>
                      {source.currentUse ? "Aktiv" : "Geplant"}
                    </Badge>
                      <Badge variant="outline">{policyLabel(source.policy)}</Badge>
                    </div>
                  <p className="hidden text-sm text-muted-foreground sm:block">{source.note}</p>
                </a>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="text-base sm:text-lg">Offizielle Referenzdaten</CardTitle>
            <CardDescription className="hidden sm:block">
              Automatisiert und gecacht über SEC Fair Access.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Database className="h-4 w-4" />
              SEC Company Tickers
            </div>
            <SlimMetricRow label="Ticker im Snapshot" value={`${data?.secReference.tickerCount ?? 0}`} />
            <SlimMetricRow label="Cache-Stand" value={data?.secReference.cachedAt ? new Date(data.secReference.cachedAt).toLocaleString("de-DE") : "-"} />
            <SlimMetricRow
              label="Status"
              value={data?.secReference.isStale ? "Stale Fallback" : "Aktuell"}
              valueClassName={data?.secReference.isStale ? "text-amber-600" : "text-emerald-600"}
            />
            <p className="text-muted-foreground">
              Die SEC-Daten dienen hier als offiziell erlaubte Referenz- und Klassifikationsquelle. Für Preis- und Rankingdaten bleibt eure App bei gecachten Marktfeeds und eigener Aggregation.
            </p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(selectedRow)} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="max-h-[94dvh] p-0 sm:max-w-3xl">
          {selectedRow ? (
            <>
              <DialogHeader className="border-b px-4 py-4 text-left sm:px-6">
                <DialogTitle className="break-words leading-tight">{selectedRow.name}</DialogTitle>
                <DialogDescription>
                  {selectedRow.kind === "industry" ? "Branche" : "Sektor"} mit {selectedRow.stockCount} Aktien aus eurem Scanner-Universum.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2 sm:px-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Ranking-Verlauf</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <SlimMetricRow label="Aktueller Rang" value={`#${selectedRow.currentRank}`} />
                    <SlimMetricRow label="Letzte Woche" value={selectedRow.lastWeekRank ? `#${selectedRow.lastWeekRank}` : "-"} />
                    <SlimMetricRow label="Vor 3 Monaten" value={selectedRow.threeMonthRank ? `#${selectedRow.threeMonthRank}` : "-"} />
                    <SlimMetricRow label="Vor 6 Monaten" value={selectedRow.sixMonthRank ? `#${selectedRow.sixMonthRank}` : "-"} />
                    <SlimMetricRow
                      label="Änderung vs. Vorwoche"
                      value={formatPct(selectedRow.rankChangePct)}
                      valueClassName={toneClass(selectedRow.rankChangePct)}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Leistung</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <SlimMetricRow label="Ø Tagesänderung" value={formatPct(selectedRow.avgChangePercent, 2)} valueClassName={toneClass(selectedRow.avgChangePercent)} />
                    <SlimMetricRow label="Ø Momentum 1M" value={formatPct(selectedRow.avgMomentum1M, 2)} valueClassName={toneClass(selectedRow.avgMomentum1M)} />
                    <SlimMetricRow label="Ø Momentum 3M" value={formatPct(selectedRow.avgMomentum3M, 2)} valueClassName={toneClass(selectedRow.avgMomentum3M)} />
                    <SlimMetricRow label="Ø Momentum 6M" value={formatPct(selectedRow.avgMomentum6M, 2)} valueClassName={toneClass(selectedRow.avgMomentum6M)} />
                    <SlimMetricRow label="Ø Momentum 1Y" value={formatPct(selectedRow.avgMomentum1Y, 2)} valueClassName={toneClass(selectedRow.avgMomentum1Y)} />
                    <SlimMetricRow label="Ø RS" value={selectedRow.avgRsRating.toFixed(1)} />
                    <SlimMetricRow label="Ø Catalyst" value={selectedRow.avgCatalystScore.toFixed(1)} />
                    <SlimMetricRow label="Ø Group Heat" value={selectedRow.avgGroupHeat.toFixed(1)} />
                  </CardContent>
                </Card>

                <Card className="sm:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Leader in der Gruppe</CardTitle>
                    <CardDescription>Die stärksten Titel nach dem internen Gruppen-Score aus RS, Catalyst, Momentum und Heat.</CardDescription>
                  </CardHeader>
                  <CardContent>
	                    <div className="flex flex-wrap gap-2">
	                      {selectedRow.leaders.map((leader, index) => (
	                        <Link key={leader} href={scannerUrl(leader)} className="rounded-full">
	                          <Badge variant={index === 0 ? "default" : "secondary"}>{leader}</Badge>
	                        </Link>
	                      ))}
	                    </div>
                  </CardContent>
                </Card>

                <Card className="sm:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Aktien in der Gruppe</CardTitle>
                    <CardDescription>
                      Kompakte Watchlist aus eurem Scanner-Universum. Eine Zeile pro Aktie, oben schnell zwischen Symbolen umschalten.
                    </CardDescription>
	                  </CardHeader>
	                  <CardContent>
	                    <CompactStockWatchlist
                        title="Gruppen-Watchlist"
                        description={selectedRow.name}
                        items={selectedRow.members.map(groupMemberToWatchItem)}
                        maxHeightClassName="max-h-[42dvh]"
                      />
                  </CardContent>
                </Card>

                <Card className="sm:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Einordnung</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    <p>
	                      Der Rank ist ein zusammengesetzter Score aus `RS`, `Catalyst`, `1M/3M/6M/1Y Momentum` sowie `Sector/Industry Heat`.
                    </p>
                    <p>
                      Historische Ränge basieren auf echten Tagessnapshots, sobald genügend Historie gesammelt ist. Bis dahin dienen die 1M-, 3M- und 6M-Momentum-Felder als Proxy für frühere Platzierungen.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniGroupStat({
  icon: Icon,
  label,
  value,
  hint,
  toneClassName,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  toneClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-card/55 px-2 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
        <Icon className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className={cn("mt-0.5 break-words text-sm font-semibold leading-tight", toneClassName)}>{value}</div>
      <div className="line-clamp-2 text-[11px] leading-tight text-muted-foreground">{hint}</div>
    </div>
  );
}

function RankingTable({
  rows,
  isLoading,
  error,
  onSelect,
  kindLabel,
}: {
  rows: GroupRankingRow[];
  isLoading: boolean;
  error: string | null;
  onSelect: (row: GroupRankingRow) => void;
  kindLabel: string;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">Lade {kindLabel.toLowerCase()}...</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-rose-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold sm:text-lg">{kindLabel}</h2>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Gruppiert aus eurem Scanner-Universum. Tap oder Klick auf eine Zeile öffnet die Details.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          {rows.length} Gruppen
        </Badge>
      </div>

      <GroupPulseGrid rows={rows} onSelect={onSelect} />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.42fr)]">
        <MobileRankingCards rows={rows} onSelect={onSelect} />

        <div className="hidden overflow-x-auto rounded-md border md:block">
          <Table className="min-w-[1180px]">
            <TableHeader className="[&_tr]:border-b">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Rang</TableHead>
                <TableHead className="text-right">Last Week</TableHead>
                <TableHead className="text-right">3 Mo Ago</TableHead>
                <TableHead className="text-right">6 Mo Ago</TableHead>
                <TableHead className="text-right">% Chg</TableHead>
                <TableHead className="text-right">Ø 1M</TableHead>
                <TableHead className="text-right">Ø 3M</TableHead>
                <TableHead className="text-right">Ø 6M</TableHead>
                <TableHead className="text-right">Ø 1Y</TableHead>
                <TableHead className="text-right">Heat</TableHead>
                <TableHead className="text-right">Stocks</TableHead>
                <TableHead>Leader</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="py-6 text-center text-muted-foreground">
                    Keine Gruppen für diese Suche.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow
                    key={`${row.kind}-${row.name}`}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    onClick={() => onSelect(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(row);
                      }
                    }}
                  >
                    <TableCell className="min-w-[260px]">
                      <div className="flex items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="font-medium">{row.name}</div>
                          <div className="text-xs text-muted-foreground">
                            RS {row.avgRsRating.toFixed(1)} · Catalyst {row.avgCatalystScore.toFixed(1)}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{row.currentRank}</TableCell>
                    <TableCell className="text-right">{formatRank(row.lastWeekRank)}</TableCell>
                    <TableCell className="text-right">{formatRank(row.threeMonthRank)}</TableCell>
                    <TableCell className="text-right">{formatRank(row.sixMonthRank)}</TableCell>
                    <TableCell className={cn("text-right font-medium", toneClass(row.rankChangePct))}>
                      {formatPct(row.rankChangePct)}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", toneClass(row.avgMomentum1M))}>
                      {formatPct(row.avgMomentum1M, 2)}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", toneClass(row.avgMomentum3M))}>
                      {formatPct(row.avgMomentum3M, 2)}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", toneClass(row.avgMomentum6M))}>
                      {formatPct(row.avgMomentum6M, 2)}
                    </TableCell>
                    <TableCell className={cn("text-right font-medium", toneClass(row.avgMomentum1Y))}>
                      {formatPct(row.avgMomentum1Y, 2)}
                    </TableCell>
                    <TableCell className="text-right">{row.avgGroupHeat.toFixed(1)}</TableCell>
                    <TableCell className="text-right">{row.stockCount}</TableCell>
                    <TableCell>
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {row.leaders.map((leader) => (
                          <Badge key={leader} variant="secondary">
                            {leader}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <GroupInsightPanel row={rows[0] ?? null} />
      </div>
    </section>
  );
}

function GroupPulseGrid({ rows, onSelect }: { rows: GroupRankingRow[]; onSelect: (row: GroupRankingRow) => void }) {
  const pulseRows = rows.slice(0, 6);
  const maxPulse = Math.max(...pulseRows.map((row) => Math.max(1, row.avgGroupHeat + Math.max(0, momentumComposite(row)) + row.avgRsRating / 10)), 1);

  if (!pulseRows.length) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {pulseRows.map((row) => {
        const pulse = Math.max(1, row.avgGroupHeat + Math.max(0, momentumComposite(row)) + row.avgRsRating / 10);
        return (
          <button
            key={`${row.kind}-${row.name}-pulse`}
            type="button"
            onClick={() => onSelect(row)}
            className="min-w-0 rounded-md border p-2 text-left transition-colors hover:bg-muted/35"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                  <Badge variant={row.currentRank <= 3 ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                    #{row.currentRank}
                  </Badge>
	                  <span className="min-w-0 flex-1 break-words text-xs font-semibold leading-tight sm:text-sm">{row.name}</span>
                </div>
	                <div className="mt-1 hidden flex-wrap gap-1 sm:flex">
	                  {row.leaders.map((leader) => (
	                    <Badge key={`${row.name}-${leader}-pulse`} variant="outline" className="h-5 px-1.5 text-[10px]">
	                      {leader}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className={cn("shrink-0 text-right text-xs font-semibold sm:text-sm", toneClass(row.avgChangePercent))}>
                {formatPct(row.avgChangePercent, 2)}
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (pulse / maxPulse) * 100)}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground sm:text-[11px]">
              <span>{row.stockCount} Aktien</span>
              <span className={toneClass(row.avgMomentum1M)}>1M {formatPct(row.avgMomentum1M, 1)}</span>
              <span className={toneClass(row.avgMomentum3M)}>3M {formatPct(row.avgMomentum3M, 1)}</span>
              <span className="hidden sm:inline">6M {formatPct(row.avgMomentum6M, 1)}</span>
              <span className="hidden sm:inline">RS {row.avgRsRating.toFixed(1)}</span>
              <span>Heat {row.avgGroupHeat.toFixed(1)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function MobileRankingCards({ rows, onSelect }: { rows: GroupRankingRow[]; onSelect: (row: GroupRankingRow) => void }) {
  const visibleRows = rows.slice(6, 18);

  return (
    <div className="space-y-1.5 md:hidden">
      {rows.length === 0 ? (
        <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">Keine Gruppen für diese Suche.</div>
      ) : visibleRows.length === 0 ? null : (
        <>
          <div className="pt-1 text-xs font-medium text-muted-foreground">Weitere Gruppen</div>
          {visibleRows.map((row) => (
            <button
              key={`${row.kind}-${row.name}-mobile`}
              type="button"
              onClick={() => onSelect(row)}
              className="w-full rounded-md border p-2 text-left transition-colors hover:bg-muted/35"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Badge variant={row.currentRank <= 3 ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                      #{row.currentRank}
                    </Badge>
	                    <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-tight">{row.name}</span>
                  </div>
	                  <div className="mt-1 flex flex-wrap gap-1">
	                    {row.leaders.map((leader) => (
	                      <Badge key={`${row.name}-${leader}-mobile`} variant="outline" className="h-5 px-1.5 text-[10px]">
	                        {leader}
                      </Badge>
                    ))}
                  </div>
                </div>
	                <div className="hidden shrink-0 text-right sm:block">
	                  <div className={cn("font-mono text-sm font-semibold", toneClass(row.rankChangePct))}>
	                    {formatPct(row.rankChangePct)}
	                  </div>
	                  <div className={cn("text-xs", toneClass(row.avgMomentum3M))}>{formatPct(row.avgMomentum3M, 1)}</div>
	                </div>
	              </div>
	              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
	                <span>{row.stockCount} Aktien</span>
	                <span className={toneClass(row.avgMomentum1M)}>1M {formatPct(row.avgMomentum1M, 1)}</span>
	                <span className={toneClass(row.avgMomentum3M)}>3M {formatPct(row.avgMomentum3M, 1)}</span>
	                <span className={toneClass(row.avgMomentum6M)}>6M {formatPct(row.avgMomentum6M, 1)}</span>
	                <span className={toneClass(row.avgMomentum1Y)}>1Y {formatPct(row.avgMomentum1Y, 1)}</span>
	                <span>RS {row.avgRsRating.toFixed(1)}</span>
	                <span>Heat {row.avgGroupHeat.toFixed(1)}</span>
	              </div>
            </button>
          ))}
          {rows.length > 18 && (
            <div className="rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground">
              Top 18 von {rows.length} Gruppen. Suche oder Tab nutzen für Details.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GroupInsightPanel({ row }: { row: GroupRankingRow | null }) {
  if (!row) {
    return (
      <div className="hidden rounded-md border bg-muted/15 p-3 text-sm text-muted-foreground xl:block">
        Wähle eine Gruppe, um Details zu sehen.
      </div>
    );
  }

  return (
    <div className="hidden rounded-md border bg-muted/15 p-3 xl:block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs uppercase text-muted-foreground">Top Signal</div>
          <div className="break-words text-base font-semibold leading-tight">{row.name}</div>
        </div>
        <Badge variant="secondary">#{row.currentRank}</Badge>
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <SlimMetricRow label="Tagesbewegung" value={formatPct(row.avgChangePercent, 2)} valueClassName={toneClass(row.avgChangePercent)} />
        <SlimMetricRow label="Momentum 1M" value={formatPct(row.avgMomentum1M, 2)} valueClassName={toneClass(row.avgMomentum1M)} />
        <SlimMetricRow label="Momentum 3M" value={formatPct(row.avgMomentum3M, 2)} valueClassName={toneClass(row.avgMomentum3M)} />
        <SlimMetricRow label="Momentum 6M" value={formatPct(row.avgMomentum6M, 2)} valueClassName={toneClass(row.avgMomentum6M)} />
        <SlimMetricRow label="Momentum 1Y" value={formatPct(row.avgMomentum1Y, 2)} valueClassName={toneClass(row.avgMomentum1Y)} />
        <SlimMetricRow label="Aufstieg 1W" value={formatPct(row.rankChangePct)} valueClassName={toneClass(row.rankChangePct)} />
        <SlimMetricRow label="RS Ø" value={row.avgRsRating.toFixed(1)} />
        <SlimMetricRow label="Catalyst Ø" value={row.avgCatalystScore.toFixed(1)} />
        <SlimMetricRow label="Heat Ø" value={row.avgGroupHeat.toFixed(1)} />
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {row.leaders.map((leader, index) => (
          <Badge key={`${row.name}-${leader}-insight`} variant={index === 0 ? "default" : "outline"} className="h-5 px-1.5 text-[10px]">
            {leader}
          </Badge>
        ))}
      </div>
    </div>
  );
}
