"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Database,
  ExternalLink,
  Flame,
  type LucideIcon,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompactStockWatchlist, type CompactWatchlistItem } from "@/components/scanner/compact-stock-watchlist";
import { SlimMetricRow, SlimStatCard } from "@/components/dashboard/slim-stat-card";
import { readClientJsonCache, writeClientJsonCache } from "@/lib/client-json-cache";
import { cn } from "@/lib/utils";
import type { MarketHeatDataSource, MarketHeatGroup, MarketHeatKind, MarketHeatMember, MarketHeatResponse } from "@/types/market-heat";

type TabValue = "themes" | "sectors" | "industries";

const MARKET_HEAT_CACHE_KEY = "market-heat-v3";
const MARKET_HEAT_MAX_AGE_MS = 2 * 60 * 1000;

function formatPct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function formatAge(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "-";
  if (seconds < 90) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function toneClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-muted-foreground";
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function heatTone(score: number): string {
  if (score >= 115) return "text-rose-600";
  if (score >= 95) return "text-orange-600";
  if (score >= 75) return "text-amber-600";
  return "text-muted-foreground";
}

function tabLabel(tab: TabValue): string {
  switch (tab) {
    case "themes":
      return "Themes";
    case "sectors":
      return "Sektoren";
    case "industries":
      return "Industrien";
  }
}

function fitLabel(value: MarketHeatDataSource["fit"]): string {
  switch (value) {
    case "active":
      return "Aktiv";
    case "recommended":
      return "Empfohlen";
    case "reference":
      return "Referenz";
  }
}

function fitVariant(value: MarketHeatDataSource["fit"]): "default" | "secondary" | "outline" {
  if (value === "active") return "default";
  if (value === "recommended") return "secondary";
  return "outline";
}

function groupKindLabel(kind: MarketHeatKind): string {
  if (kind === "theme") return "Theme";
  if (kind === "sector") return "Sektor";
  return "Industrie";
}

function scannerUrl(param: "q" | "symbol" | "symbols", value: string): string {
  return `/scanner?${param}=${encodeURIComponent(value)}`;
}

function heatMemberToWatchItem(member: MarketHeatMember): CompactWatchlistItem {
  return {
    symbol: member.symbol,
    name: member.name,
    href: scannerUrl("symbol", member.symbol),
    price: member.price,
    changePercent: member.changePercent,
    volumeRatio: member.volumeRatio,
    momentum1M: member.momentum1M,
    momentum3M: member.momentum3M,
    momentum6M: member.momentum6M,
    momentum1Y: member.momentum1Y,
    rsRating: member.rsRating,
    catalystScore: member.catalystScore,
    heatScore: member.hotScore,
    score: member.hotScore,
    sector: member.sector,
    industry: member.industry,
    tags: member.signals,
  };
}

function hasUsableMarketHeatData(data: MarketHeatResponse | null | undefined): data is MarketHeatResponse {
  if (!data?.groups || !data.source || data.source.stocks <= 0) return false;
  const groupCount = data.groups.themes.length + data.groups.sectors.length + data.groups.industries.length;
  const memberCount = [...data.groups.themes, ...data.groups.sectors, ...data.groups.industries].reduce(
    (sum, group) => sum + group.members.length,
    0
  );
  return groupCount > 0 && memberCount > 0;
}

function filterGroups(groups: MarketHeatGroup[], query: string): MarketHeatGroup[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groups;

  return groups.filter((group) => {
    const haystack = [
      group.name,
      group.description,
      group.leaders.join(" "),
      group.members.map((member) => `${member.symbol} ${member.name} ${member.sector} ${member.industry}`).join(" "),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export default function MarketHeatPage() {
  const [data, setData] = useState<MarketHeatResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>("themes");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(searchQuery);

  async function loadData(refresh = false) {
    const cachedResult = readClientJsonCache<MarketHeatResponse>(MARKET_HEAT_CACHE_KEY, {
      maxAgeMs: MARKET_HEAT_MAX_AGE_MS,
      allowStale: true,
    });
    const cached = cachedResult && hasUsableMarketHeatData(cachedResult.data) ? cachedResult : null;

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
      const response = await fetch(`/api/market-heat${refresh ? "?refresh=true" : ""}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as MarketHeatResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Market Heat konnte nicht geladen werden.");
      if (!hasUsableMarketHeatData(payload)) throw new Error("Market Heat hat noch keinen nutzbaren Datenbestand.");
      setData(payload);
      writeClientJsonCache(MARKET_HEAT_CACHE_KEY, payload);
    } catch (loadError) {
      if (!cached) {
        setError(loadError instanceof Error ? loadError.message : "Market Heat konnte nicht geladen werden.");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadData(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get("q");
    const tab = params.get("tab");
    if (tab === "themes" || tab === "sectors" || tab === "industries") {
      setActiveTab(tab);
    }
    if (query?.trim()) {
      setSearchQuery(query.trim());
    }
  }, []);

  const activeGroups = useMemo(() => {
    const groups =
      activeTab === "themes"
        ? data?.groups.themes ?? []
        : activeTab === "sectors"
          ? data?.groups.sectors ?? []
          : data?.groups.industries ?? [];
    return filterGroups(groups, deferredSearch);
  }, [activeTab, data, deferredSearch]);

  const selectedGroup = useMemo(() => {
    if (!activeGroups.length) return null;
    return activeGroups.find((group) => group.id === selectedId) ?? activeGroups[0];
  }, [activeGroups, selectedId]);

  useEffect(() => {
    setSelectedId(null);
  }, [activeTab, deferredSearch]);

  const hotTheme = data?.groups.themes[0] ?? null;
  const hotSector = data?.groups.sectors[0] ?? null;
  const hotIndustry = data?.groups.industries[0] ?? null;

  return (
    <div className="space-y-2 pb-6 sm:space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="hidden items-center gap-2 rounded-full border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
            <Flame className="h-3.5 w-3.5 text-orange-500" />
            Themes, Sektoren, Industrien und Leader aus dem Scanner-Snapshot
          </div>
          <div>
            <h1 className="sr-only font-bold sm:not-sr-only sm:text-2xl">Market Heat</h1>
            <p className="hidden text-sm text-muted-foreground sm:block">
              Zeigt kompakt, was gerade gespielt wird: heiße Themes, starke Gruppen und die Aktien darin.
            </p>
          </div>
        </div>

        <div className="flex flex-row gap-2 sm:items-center">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Theme, Gruppe oder Aktie"
              className="h-9 pl-8"
            />
          </div>
          <Button
            onClick={() => void loadData(true)}
            disabled={isRefreshing}
            size="sm"
            className="h-9 shrink-0 gap-2 px-2.5 sm:px-3"
            aria-label="Market Heat aktualisieren"
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-rose-500/40 bg-rose-500/5">
          <CardContent className="flex items-center gap-2 py-3 text-sm text-rose-600">
            <AlertCircle className="h-4 w-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 md:hidden">
        <MiniHeatStat
          icon={Flame}
          label="Theme"
          value={hotTheme?.name ?? "-"}
          hint={hotTheme ? `${formatNumber(hotTheme.hotScore, 0)} Heat · ${hotTheme.leaders.join(", ")}` : "Keine Daten"}
          toneClassName={heatTone(hotTheme?.hotScore ?? 0)}
        />
        <MiniHeatStat
          icon={BarChart3}
          label="Sektor"
          value={hotSector?.name ?? "-"}
          hint={hotSector ? `${formatPct(hotSector.avgChangePercent, 2)} · ${hotSector.stockCount} Aktien` : "Keine Daten"}
          toneClassName={toneClass(hotSector?.avgChangePercent)}
        />
        <MiniHeatStat
          icon={TrendingUp}
          label="Industrie"
          value={hotIndustry?.name ?? "-"}
          hint={hotIndustry ? `${formatNumber(hotIndustry.hotScore, 0)} Heat · ${hotIndustry.leaders.join(", ")}` : "Keine Daten"}
          toneClassName={heatTone(hotIndustry?.hotScore ?? 0)}
        />
        <MiniHeatStat
          icon={Activity}
          label="Stand"
          value={formatAge(data?.scanAgeSeconds)}
          hint={`${data?.source.stocks ?? 0} Aktien · ${data?.source.scannerSource ?? "-"}`}
        />
      </div>

      <div className="hidden gap-2 md:grid md:grid-cols-4">
        <SlimStatCard
          icon={Flame}
          label="Hot Theme"
          value={hotTheme?.name ?? "-"}
          hint={hotTheme ? `${formatNumber(hotTheme.hotScore, 0)} Heat · ${hotTheme.leaders.join(", ")}` : "Noch keine Daten"}
          toneClassName={heatTone(hotTheme?.hotScore ?? 0)}
        />
        <SlimStatCard
          icon={BarChart3}
          label="Hot Sector"
          value={hotSector?.name ?? "-"}
          hint={hotSector ? `${formatPct(hotSector.avgChangePercent, 2)} · ${hotSector.stockCount} Aktien` : "Noch keine Daten"}
          toneClassName={toneClass(hotSector?.avgChangePercent)}
        />
        <SlimStatCard
          icon={TrendingUp}
          label="Hot Industry"
          value={hotIndustry?.name ?? "-"}
          hint={hotIndustry ? `${formatNumber(hotIndustry.hotScore, 0)} Heat · ${hotIndustry.leaders.join(", ")}` : "Noch keine Daten"}
          toneClassName={heatTone(hotIndustry?.hotScore ?? 0)}
        />
        <SlimStatCard
          icon={Activity}
          label="Datenstand"
          value={formatAge(data?.scanAgeSeconds)}
          hint={`${data?.source.stocks ?? 0} Aktien · ${data?.source.scannerSource ?? "-"} Snapshot`}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)]">
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-base sm:text-lg">Heat Map</CardTitle>
                <CardDescription className="hidden sm:block">
                  HotScore kombiniert Tagesbewegung, Volumen, Momentum, RS, Catalyst, Group Heat und News-Signale.
                </CardDescription>
              </div>
              <Tabs className="w-full sm:w-auto" value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
                <TabsList className="!grid h-8 w-full grid-cols-3 overflow-hidden sm:w-[330px]">
                  <TabsTrigger className="min-w-0 px-1 text-[11px] sm:text-xs" value="themes">
                    Themes
                  </TabsTrigger>
                  <TabsTrigger className="min-w-0 px-1 text-[11px] sm:text-xs" value="sectors">
                    Sektoren
                  </TabsTrigger>
                  <TabsTrigger className="min-w-0 px-1 text-[11px] sm:text-xs" value="industries">
                    Industrien
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="xl:hidden">
              <GroupDetail group={selectedGroup} isLoading={isLoading} embedded />
            </div>
            <HeatGroupList
              groups={activeGroups}
              selectedId={selectedGroup?.id ?? null}
              isLoading={isLoading}
              label={tabLabel(activeTab)}
              onSelect={(group) => setSelectedId(group.id)}
            />
          </CardContent>
        </Card>

        <div className="space-y-3 xl:sticky xl:top-3 xl:self-start">
          <div className="hidden xl:block">
            <GroupDetail group={selectedGroup} isLoading={isLoading} />
          </div>
          <DataSourcePanel sources={data?.dataSources ?? []} />
        </div>
      </div>
    </div>
  );
}

function MiniHeatStat({
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

function HeatGroupList({
  groups,
  selectedId,
  isLoading,
  label,
  onSelect,
}: {
  groups: MarketHeatGroup[];
  selectedId: string | null;
  isLoading: boolean;
  label: string;
  onSelect: (group: MarketHeatGroup) => void;
}) {
  if (isLoading) {
    return <div className="py-5 text-sm text-muted-foreground sm:py-8">Lade {label.toLowerCase()}...</div>;
  }

  if (!groups.length) {
    return <div className="py-5 text-sm text-muted-foreground sm:py-8">Keine Treffer für diese Suche.</div>;
  }

  const maxScore = Math.max(...groups.slice(0, 24).map((group) => group.hotScore), 1);

  return (
    <div className="space-y-1.5 sm:space-y-2">
      {groups.slice(0, 32).map((group, index) => (
        <button
          key={group.id}
          type="button"
          onClick={() => onSelect(group)}
          className={cn(
            "w-full rounded-md border p-2 text-left transition-colors hover:bg-muted/40 sm:p-2.5",
            selectedId === group.id && "border-primary/60 bg-primary/5"
          )}
        >
          <div className="flex items-start justify-between gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex min-w-0 items-start gap-1.5 sm:items-center sm:gap-2">
                <Badge variant={index < 3 ? "default" : "secondary"} className="h-5 px-1.5 text-[10px]">
                  #{index + 1}
                </Badge>
                <span className="min-w-0 flex-1 break-words text-sm font-medium leading-tight sm:text-base">{group.name}</span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{groupKindLabel(group.kind)}</span>
              </div>
              <div className="hidden text-xs text-muted-foreground sm:line-clamp-1">{group.description}</div>
	              <div className="flex flex-wrap gap-1">
	                {group.leaders.map((leader) => (
	                  <Badge key={leader} variant="outline" className="h-5 px-1.5 text-[10px]">
	                    {leader}
	                  </Badge>
	                ))}
	              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={cn("font-mono text-sm font-semibold", heatTone(group.hotScore))}>
                {formatNumber(group.hotScore, 0)}
              </div>
              <div className={cn("text-xs", toneClass(group.avgChangePercent))}>
                {formatPct(group.avgChangePercent, 2)}
              </div>
            </div>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted sm:mt-2 sm:h-1.5">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, Math.max(6, (group.hotScore / maxScore) * 100))}%` }}
            />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground sm:text-[11px]">
            <span>{group.stockCount} Aktien</span>
            <span>Vol {formatNumber(group.avgVolumeRatio, 1)}x</span>
            <span className={toneClass(group.avgMomentum1M)}>1M {formatPct(group.avgMomentum1M, 1)}</span>
            <span className={toneClass(group.avgMomentum3M)}>3M {formatPct(group.avgMomentum3M, 1)}</span>
            <span className={toneClass(group.avgMomentum6M)}>6M {formatPct(group.avgMomentum6M, 1)}</span>
            <span className={toneClass(group.avgMomentum1Y)}>1Y {formatPct(group.avgMomentum1Y, 1)}</span>
            <span>RS {formatNumber(group.avgRsRating, 1)}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function GroupDetail({
  group,
  isLoading,
  embedded = false,
}: {
  group: MarketHeatGroup | null;
  isLoading: boolean;
  embedded?: boolean;
}) {
  if (isLoading) {
    const content = <CardContent className="py-6 text-sm text-muted-foreground">Lade Detailansicht...</CardContent>;
    return embedded ? <div className="rounded-md border bg-muted/10">{content}</div> : <Card>{content}</Card>;
  }

  if (!group) {
    const content = <CardContent className="py-6 text-sm text-muted-foreground">Wähle links eine Gruppe aus.</CardContent>;
    return embedded ? <div className="rounded-md border bg-muted/10">{content}</div> : <Card>{content}</Card>;
  }

  const groupScannerSymbols = group.members
    .slice(0, 40)
    .map((member) => member.symbol)
    .join(",");

  const content = (
    <>
      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="break-words text-base leading-tight sm:text-lg">{group.name}</CardTitle>
            <CardDescription className="line-clamp-2 sm:line-clamp-none">{group.description}</CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {groupKindLabel(group.kind)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:gap-2 sm:text-sm">
          <SlimMetricRow label="HotScore" value={formatNumber(group.hotScore, 1)} valueClassName={heatTone(group.hotScore)} />
          <SlimMetricRow label="Tagesbewegung" value={formatPct(group.avgChangePercent, 2)} valueClassName={toneClass(group.avgChangePercent)} />
          <SlimMetricRow label="Volumenratio" value={`${formatNumber(group.avgVolumeRatio, 2)}x`} />
          <SlimMetricRow label="Breite positiv" value={formatPct(group.positiveBreadthPct, 1)} />
          <SlimMetricRow label="Momentum 1M" value={formatPct(group.avgMomentum1M, 2)} valueClassName={toneClass(group.avgMomentum1M)} />
          <SlimMetricRow label="Momentum 3M" value={formatPct(group.avgMomentum3M, 2)} valueClassName={toneClass(group.avgMomentum3M)} />
          <SlimMetricRow label="Momentum 6M" value={formatPct(group.avgMomentum6M, 2)} valueClassName={toneClass(group.avgMomentum6M)} />
          <SlimMetricRow label="Momentum 1Y" value={formatPct(group.avgMomentum1Y, 2)} valueClassName={toneClass(group.avgMomentum1Y)} />
          <SlimMetricRow label="RS Ø" value={formatNumber(group.avgRsRating, 1)} />
          <SlimMetricRow label="Catalyst Ø" value={formatNumber(group.avgCatalystScore, 1)} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Link
            href={scannerUrl("symbols", groupScannerSymbols)}
            className="inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium transition-colors hover:bg-muted/40"
          >
            Alle im Scanner
          </Link>
	          {group.leaders.map((leader) => (
            <Link
              key={`${group.id}-${leader}-scanner-link`}
              href={scannerUrl("symbol", leader)}
              className="inline-flex h-7 items-center rounded-md border px-2 font-mono text-xs transition-colors hover:bg-muted/40"
            >
              {leader}
            </Link>
          ))}
        </div>

        <CompactStockWatchlist
          title="Aktien-Watchlist"
          description="Eine Zeile je Aktie, oben schnell zwischen Symbolen umschalten."
          items={group.members.map(heatMemberToWatchItem)}
        />
      </CardContent>
    </>
  );

  return embedded ? <div className="rounded-md border bg-muted/10">{content}</div> : <Card>{content}</Card>;
}

function DataSourcePanel({ sources }: { sources: MarketHeatDataSource[] }) {
  const visibleSources = sources.slice(0, 6);

  return (
    <Card>
      <CardHeader className="pb-2 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <Database className="h-4 w-4" />
          Datenquellen
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Aktuell schnell aus Cache; externe Feeds sind vorbereitet, brauchen aber Keys/Lizenz.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {visibleSources.map((source, index) => (
          <a
            key={source.id}
            href={source.url}
            target={source.url.startsWith("/") ? undefined : "_blank"}
            rel={source.url.startsWith("/") ? undefined : "noreferrer"}
            className={cn(
              "block rounded-md border p-2 transition-colors hover:bg-muted/30",
              index >= 3 && "hidden sm:block"
            )}
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">{source.name}</div>
                <div className="hidden text-xs text-muted-foreground sm:block">{source.useFor}</div>
              </div>
              {!source.url.startsWith("/") && <ExternalLink className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={fitVariant(source.fit)} className="h-5 px-1.5 text-[10px]">
                {fitLabel(source.fit)}
              </Badge>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {source.latency}
              </Badge>
            </div>
          </a>
        ))}
      </CardContent>
    </Card>
  );
}
