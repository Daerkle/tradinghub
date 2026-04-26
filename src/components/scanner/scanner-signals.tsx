"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type GapperStockItem = {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  gapPercent: number;
  volumeRatio: number;
  rsRating: number;
  momentum3M: number;
  catalystScore: number;
  earningsDate?: string;
  flags: {
    earningsRelated: boolean;
    guidanceRelated: boolean;
  };
};

type GapperHeadlineItem = {
  symbol: string;
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
  tags: string[];
};

type GappersFeedResponse = {
  generatedAt: string;
  source: string;
  scannedCount: number;
  earningsWinners: GapperStockItem[];
  topGappers: GapperStockItem[];
  headlines: GapperHeadlineItem[];
  tagCounts: Record<string, number>;
};

type AlertItem = {
  symbol: string;
  name: string;
  type: "Breakout" | "RS" | "Volumen" | "Gap Up";
  score: number;
  message: string;
  price: number;
  changePercent: number;
  gapPercent: number;
  volumeRatio: number;
  rsRating: number;
  sector?: string;
  industry?: string;
};

type AlertsFeedResponse = {
  generatedAt: string;
  source: string;
  scannedCount: number;
  alerts: AlertItem[];
};

function formatSignedPercent(value: number): string {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function toneForPercent(value: number): string {
  if (!Number.isFinite(value)) return "text-muted-foreground";
  return value >= 0 ? "text-green-500" : "text-red-500";
}

export function ScannerSignals({
  onSearch,
  cacheOnly = false,
  compact = false,
}: {
  onSearch?: (query: string) => void;
  cacheOnly?: boolean;
  compact?: boolean;
}) {
  const [gappers, setGappers] = useState<GappersFeedResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const retries = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [gappersRes, alertsRes] = await Promise.allSettled([
          fetch(`/api/scanner/gappers-feed?stocks=22&news=4${cacheOnly ? "&cacheOnly=true" : ""}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/scanner/alerts-feed?limit=18${cacheOnly ? "&cacheOnly=true" : ""}`).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (cancelled) return;
        setGappers(gappersRes.status === "fulfilled" ? (gappersRes.value as GappersFeedResponse | null) : null);
        setAlerts(alertsRes.status === "fulfilled" ? (alertsRes.value as AlertsFeedResponse | null) : null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cacheOnly, reloadKey]);

  useEffect(() => {
    if (!cacheOnly) return;
    const gappersMiss = gappers?.source === "cache-miss";
    const alertsMiss = alerts?.source === "cache-miss";
    if (!gappersMiss && !alertsMiss) return;
    if (retries.current >= 5) return;

    const timer = setTimeout(() => {
      retries.current += 1;
      setReloadKey((k) => k + 1);
    }, 8000);

    return () => clearTimeout(timer);
  }, [cacheOnly, gappers?.source, alerts?.source]);

  const headlineBySymbol = useMemo(() => {
    const map = new Map<string, GapperHeadlineItem>();
    for (const item of gappers?.headlines || []) {
      if (!map.has(item.symbol)) map.set(item.symbol, item);
    }
    return map;
  }, [gappers]);

  const gappersCacheMiss = gappers?.source === "cache-miss";
  const alertsCacheMiss = alerts?.source === "cache-miss";
  const earningsLimit = compact ? 2 : 6;
  const gappersLimit = compact ? 3 : 8;
  const alertsLimit = compact ? 3 : 10;

  const wrap = (content: ReactNode, query?: string, title?: string) => {
    const className = cn(
      "block rounded-md border transition-colors",
      compact ? "p-1.5" : "p-2",
      onSearch ? "hover:bg-muted/40 cursor-pointer" : ""
    );
    if (!onSearch || !query) {
      return (
        <div className={className} title={title}>
          {content}
        </div>
      );
    }
    return (
      <button type="button" className={className} onClick={() => onSearch(query)} title={title}>
        {content}
      </button>
    );
  };

  return (
    <Card>
      <CardHeader className={compact ? "pb-1 sm:pb-2" : undefined}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          Signale: Earnings, Gappers, Alerts
        </CardTitle>
        <CardDescription className={compact ? "hidden sm:block" : undefined}>
          Regelbasiert (ohne KI). Basierend auf Gap, Volumen, Trend/RS und heutigen News-Tags.
        </CardDescription>
      </CardHeader>
      <CardContent className={compact ? "pt-0" : undefined}>
        {loading && !gappers && !alerts ? (
          <div className={cn("grid gap-3 md:grid-cols-3", compact && "gap-2")}>
            <Skeleton className={cn("w-full", compact ? "h-32" : "h-56")} />
            <Skeleton className={cn("w-full", compact ? "h-32" : "h-56")} />
            <Skeleton className={cn("w-full", compact ? "h-32" : "h-56")} />
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Earnings Gewinner
                {gappers && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {gappers.source}
                  </Badge>
                )}
              </div>
              {!gappers ? (
                <div className="text-sm text-muted-foreground">Nicht verfuegbar.</div>
              ) : cacheOnly && gappersCacheMiss ? (
                <div className="text-sm text-muted-foreground">
                  Scanner-Daten sind noch nicht im Cache. Laedt im Hintergrund...
                </div>
              ) : gappers.earningsWinners.length === 0 ? (
                <div className="text-sm text-muted-foreground">Keine Earnings/GUIDANCE-Gapper gefunden.</div>
              ) : (
                gappers.earningsWinners.slice(0, earningsLimit).map((stock) => {
                  const headline = headlineBySymbol.get(stock.symbol);
                  return (
                    <div key={`ew-${stock.symbol}`}>
                      {wrap(
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{stock.symbol}</span>
                              {stock.flags.guidanceRelated && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Guidance</Badge>
                              )}
                              {stock.flags.earningsRelated && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Earnings</Badge>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{stock.name}</div>
                          </div>
                          <div className="text-right">
                            <div className={cn("text-sm font-medium", toneForPercent(stock.changePercent))}>
                              {formatSignedPercent(stock.changePercent)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              Gap {stock.gapPercent.toFixed(1)}% · Vol {stock.volumeRatio.toFixed(1)}x
                            </div>
                          </div>
                        </div>,
                        stock.symbol,
                        `Filter nach Symbol: ${stock.symbol}`
                      )}
                      {headline?.title && (
                        <div className="mt-1 hidden text-[11px] text-muted-foreground line-clamp-2 sm:block">
                          {headline.title}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className={cn("space-y-2", compact && "hidden sm:block")}>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Top Gappers
              </div>
              {!gappers ? (
                <div className="text-sm text-muted-foreground">Nicht verfuegbar.</div>
              ) : cacheOnly && gappersCacheMiss ? (
                <div className="text-sm text-muted-foreground">
                  Scanner-Daten sind noch nicht im Cache. Laedt im Hintergrund...
                </div>
              ) : gappers.topGappers.length === 0 ? (
                <div className="text-sm text-muted-foreground">Keine Gapper gefunden.</div>
              ) : (
                gappers.topGappers.slice(0, gappersLimit).map((stock) => {
                  return (
                    <div key={`gap-${stock.symbol}`}>
                      {wrap(
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{stock.symbol}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                Gap {stock.gapPercent.toFixed(1)}%
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                              Vol {stock.volumeRatio.toFixed(1)}x · RS {stock.rsRating}
                            </div>
                          </div>
                          <div className={cn("text-sm font-medium", toneForPercent(stock.changePercent))}>
                            {formatSignedPercent(stock.changePercent)}
                          </div>
                        </div>,
                        stock.symbol,
                        `Filter nach Symbol: ${stock.symbol}`
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className={cn("space-y-2", compact && "hidden sm:block")}>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5" />
                Alerts (RS / Breakout / Volumen)
                {alerts && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {alerts.source}
                  </Badge>
                )}
              </div>
              {!alerts ? (
                <div className="text-sm text-muted-foreground">Nicht verfuegbar.</div>
              ) : cacheOnly && alertsCacheMiss ? (
                <div className="text-sm text-muted-foreground">
                  Scanner-Daten sind noch nicht im Cache. Laedt im Hintergrund...
                </div>
              ) : alerts.alerts.length === 0 ? (
                <div className="text-sm text-muted-foreground">Keine Alerts gefunden.</div>
              ) : (
                alerts.alerts.slice(0, alertsLimit).map((item) => {
                  const typeTone =
                    item.type === "Breakout" ? "border-emerald-500/25 text-emerald-200" :
                    item.type === "RS" ? "border-sky-500/25 text-sky-200" :
                    item.type === "Volumen" ? "border-amber-500/25 text-amber-200" :
                    "border-rose-500/25 text-rose-200";

                  return (
                    <div key={`alert-${item.symbol}`}>
                      {wrap(
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{item.symbol}</span>
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", typeTone)}>
                                {item.type}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {item.score}
                              </Badge>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                              {item.message}
                            </div>
                          </div>
                          <div className={cn("text-sm font-medium", toneForPercent(item.changePercent))}>
                            {formatSignedPercent(item.changePercent)}
                          </div>
                        </div>,
                        item.symbol,
                        `Filter nach Symbol: ${item.symbol}`
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
