"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { translateNewsTag } from "@/lib/news-tags";
import { SectorRotationHeatmap } from "@/components/scanner/sector-rotation-heatmap";
import { cn } from "@/lib/utils";
import type { StockData } from "@/types/scanner";

type HeatGroup = {
  name: string;
  count: number;
  totalHeat: number;
  topSymbols: string[];
};

type CatalystFeedResponse = {
  generatedAt: string;
  source: string;
  scannedCount: number;
  news: Array<{
    symbol: string;
    title: string;
    link: string;
    publisher: string;
    publishedAt: string;
    tags: string[];
  }>;
  newsTagCounts: Record<string, number>;
};

type MarketResponse = {
  fetchedAt: string;
  benchmark: string;
  spy: { m1: number; m3: number; m6: number };
  regime: { label: string; explanation: string };
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function computeHeatScore(stock: StockData): number {
  const catalyst = clamp(stock.catalystScore || 0, 0, 100);
  const setup = clamp(stock.setupScore || 0, 0, 100);
  const vol = clamp(stock.volumeRatio || 0, 0, 6);
  const gap = clamp(Math.abs(stock.gapPercent || 0), 0, 15);
  const mom1m = clamp(stock.momentum1M || 0, -30, 30);

  // Heuristik (ohne KI): Catalyst + Setup + Liquiditaet + Gap + Momentum
  // Ziel ist Ranking (nicht absolute Genauigkeit).
  return (
    catalyst * 1.0 +
    setup * 0.25 +
    vol * 10 +
    gap * 2 +
    Math.max(0, mom1m) * 0.5
  );
}

function buildHeatGroups(stocks: StockData[], key: (s: StockData) => string): HeatGroup[] {
  const buckets = new Map<string, Array<{ symbol: string; heat: number }>>();

  for (const stock of stocks) {
    const name = (key(stock) || "Unknown").trim() || "Unknown";
    const heat = computeHeatScore(stock);
    const list = buckets.get(name) || [];
    list.push({ symbol: stock.symbol, heat });
    buckets.set(name, list);
  }

  const groups: HeatGroup[] = [];
  for (const [name, items] of buckets.entries()) {
    const sorted = [...items].sort((a, b) => b.heat - a.heat);
    const totalHeat = sorted.reduce((acc, item) => acc + item.heat, 0);
    groups.push({
      name,
      count: sorted.length,
      totalHeat,
      topSymbols: sorted.slice(0, 4).map((i) => i.symbol),
    });
  }

  return groups.sort((a, b) => b.totalHeat - a.totalHeat);
}

export function ScannerInsights({
  stocks,
  onSearch,
  compact = false,
}: {
  stocks: StockData[];
  onSearch?: (query: string) => void;
  compact?: boolean;
}) {
  const [feed, setFeed] = useState<CatalystFeedResponse | null>(null);
  const [market, setMarket] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [feedRes, marketRes] = await Promise.allSettled([
          fetch("/api/scanner/catalyst-feed?stocks=18&news=30").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/scanner/market").then((r) => (r.ok ? r.json() : null)),
        ]);

        if (cancelled) return;
        setFeed(feedRes.status === "fulfilled" ? (feedRes.value as CatalystFeedResponse | null) : null);
        setMarket(marketRes.status === "fulfilled" ? (marketRes.value as MarketResponse | null) : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const sectorGroups = useMemo(() => {
    const filtered = stocks.filter((s) => (s.sector || "").trim() && s.sector !== "Unknown");
    return buildHeatGroups(filtered.length > 0 ? filtered : stocks, (s) => s.sector);
  }, [stocks]);

  const industryGroups = useMemo(() => {
    const filtered = stocks.filter((s) => (s.industry || "").trim() && s.industry !== "Unknown");
    return buildHeatGroups(filtered.length > 0 ? filtered : stocks, (s) => s.industry);
  }, [stocks]);

  const topTags = useMemo(() => {
    const counts = feed?.newsTagCounts || {};
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [feed]);

  const topSectors = sectorGroups.slice(0, compact ? 4 : 6);
  const topIndustries = industryGroups.slice(0, compact ? 4 : 6);

  return (
    <Card>
      <CardHeader className={compact ? "pb-1 sm:pb-2" : undefined}>
        <CardTitle className={compact ? "break-words text-sm leading-tight" : undefined}>
          Heute: Themes, Sektoren, Markt-Regime
        </CardTitle>
        <CardDescription className={compact ? "hidden sm:block" : undefined}>
          Regelbasiert (ohne KI). Scores sind eine Heuristik aus Catalyst, Volumen, Gap und Momentum.
        </CardDescription>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : undefined}>
        <div className={cn("grid gap-3 md:grid-cols-3", compact && "gap-2")}>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Markt-Regime (SPY)</div>
            {loading && !market ? (
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : market ? (
              <div className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{market.regime.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    1M {market.spy.m1.toFixed(1)}% · 3M {market.spy.m3.toFixed(1)}% · 6M {market.spy.m6.toFixed(1)}%
                  </span>
                </div>
                <p className={cn("mt-2 text-sm text-muted-foreground", compact && "line-clamp-2 sm:line-clamp-none")}>
                  {market.regime.explanation}
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Marktdaten aktuell nicht verfuegbar.</div>
            )}

            <div className="mt-3 text-xs text-muted-foreground">News-Themes (heute)</div>
            {loading && !feed ? (
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-16" />
                ))}
              </div>
            ) : topTags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {topTags.map(([tag, count]) => (
                  <button
                    key={`theme-${tag}`}
                    type="button"
                    onClick={() => onSearch?.(tag)}
                    className="rounded-full text-left transition-opacity hover:opacity-80"
                  >
                    <Badge variant="outline" className="px-2 py-0.5 text-[11px]">
                      {translateNewsTag(tag)} {count}
                    </Badge>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Keine Themes gefunden.</div>
            )}

            <div className={cn("mt-3", compact && "hidden sm:block")}>
              <SectorRotationHeatmap compact={compact} limit={compact ? 4 : undefined} onSelect={(query) => onSearch?.(query)} />
            </div>
          </div>

          <div className={cn("space-y-2", compact && "hidden sm:block")}>
            <div className="text-xs text-muted-foreground">Heisse Sektoren</div>
            {topSectors.length === 0 ? (
              <div className="text-sm text-muted-foreground">Noch keine Daten.</div>
            ) : (
              <div className="space-y-2">
                {topSectors.map((g) => (
                  <button
                    key={`sector-${g.name}`}
                    type="button"
                    onClick={() => onSearch?.(g.name)}
                    className="w-full rounded-md border p-1.5 text-left transition-colors hover:bg-muted/40"
                  >
	                    <div className="flex items-center justify-between gap-2">
	                      <div className="min-w-0">
	                        <div className="break-words font-medium leading-tight">{g.name}</div>
	                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
	                          Top: {g.topSymbols.join(", ")}
	                        </div>
	                      </div>
                      <Badge variant="secondary" className="text-[11px]">{g.count}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={cn("space-y-2", compact && "hidden sm:block")}>
            <div className="text-xs text-muted-foreground">Heisse Industrien</div>
            {topIndustries.length === 0 ? (
              <div className="text-sm text-muted-foreground">Noch keine Daten.</div>
            ) : (
              <div className="space-y-2">
                {topIndustries.map((g) => (
                  <button
                    key={`industry-${g.name}`}
                    type="button"
                    onClick={() => onSearch?.(g.name)}
                    className="w-full rounded-md border p-1.5 text-left transition-colors hover:bg-muted/40"
                  >
	                    <div className="flex items-center justify-between gap-2">
	                      <div className="min-w-0">
	                        <div className="break-words font-medium leading-tight">{g.name}</div>
	                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
	                          Top: {g.topSymbols.join(", ")}
	                        </div>
	                      </div>
                      <Badge variant="secondary" className="text-[11px]">{g.count}</Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
