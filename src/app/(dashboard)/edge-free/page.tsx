"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";

import { useScannerStream } from "@/hooks/use-scanner-stream";
import { cn } from "@/lib/utils";
import { StockChart } from "@/components/scanner/stock-chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMarketCap, formatNumber, formatVolume } from "@/components/scanner/metric-tooltip";
import type { CandleData, NewsItem, StockData } from "@/types/scanner";

type MoversMode = "gainers" | "losers" | "volume" | "earnings";
type DetailStock = StockData & { news?: NewsItem[] };

const MODE_LABELS: Record<MoversMode, string> = {
  gainers: "Gainers",
  losers: "Losers",
  volume: "Volumen",
  earnings: "Earnings",
};

function signedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}%`;
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE");
}

export default function EdgeFreePage() {
  const [mode, setMode] = useState<MoversMode>("gainers");
  const [search, setSearch] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedStock, setSelectedStock] = useState<DetailStock | null>(null);
  const [chartData, setChartData] = useState<CandleData[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const {
    stocks: streamedStocks,
    isLoading,
    stats,
    startScan,
    refresh,
  } = useScannerStream({
    scanType: "all",
    batchSize: 14,
    onComplete: () => {
      setLastUpdated(new Date().toLocaleTimeString("de-DE"));
    },
  });

  const stocks = streamedStocks as StockData[];

  useEffect(() => {
    startScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moverList = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = stocks.filter((stock) => {
      const matchesQuery =
        query.length === 0 ||
        stock.symbol.toLowerCase().includes(query) ||
        stock.name.toLowerCase().includes(query) ||
        stock.sector.toLowerCase().includes(query) ||
        stock.industry.toLowerCase().includes(query);

      if (!matchesQuery) return false;

      if (mode === "earnings") return Boolean(stock.earningsDate);
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (mode === "losers") return a.changePercent - b.changePercent;
      if (mode === "volume") return b.volumeRatio - a.volumeRatio;
      if (mode === "earnings") {
        const aTime = a.earningsDate ? new Date(a.earningsDate).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.earningsDate ? new Date(b.earningsDate).getTime() : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return b.catalystScore - a.catalystScore;
      }
      return b.changePercent - a.changePercent;
    });

    return sorted.slice(0, 80);
  }, [mode, search, stocks]);

  useEffect(() => {
    if (moverList.length === 0) {
      setSelectedSymbol("");
      setSelectedStock(null);
      setChartData([]);
      return;
    }
    if (!selectedSymbol || !moverList.some((item) => item.symbol === selectedSymbol)) {
      setSelectedSymbol(moverList[0].symbol);
    }
  }, [moverList, selectedSymbol]);

  useEffect(() => {
    if (!selectedSymbol) return;
    const fallback = stocks.find((item) => item.symbol === selectedSymbol) || null;
    if (fallback) setSelectedStock((prev) => (prev?.symbol === selectedSymbol ? prev : fallback));
  }, [selectedSymbol, stocks]);

  useEffect(() => {
    if (!selectedSymbol) return;
    setDetailError(null);

    let cancelled = false;

    async function loadDetails() {
      setDetailLoading(true);
      try {
        const response = await fetch(`/api/scanner/${encodeURIComponent(selectedSymbol)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as DetailStock;
        if (!cancelled) setSelectedStock(data);
      } catch (error) {
        if (!cancelled) setDetailError(`Detaildaten nicht verfügbar (${String(error)})`);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    async function loadChart() {
      setChartLoading(true);
      try {
        const response = await fetch(`/api/scanner/chart/${encodeURIComponent(selectedSymbol)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { chartData?: CandleData[] };
        if (!cancelled) setChartData(data.chartData || []);
      } catch {
        if (!cancelled) setChartData([]);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }

    loadDetails();
    loadChart();

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

  const summary = useMemo(() => {
    if (stocks.length === 0) {
      return {
        positive: 0,
        highCatalyst: 0,
        avgVolumeRatio: 0,
      };
    }
    const positive = stocks.filter((item) => item.changePercent > 0).length;
    const highCatalyst = stocks.filter((item) => item.catalystScore >= 80).length;
    const avgVolumeRatio = stocks.reduce((sum, item) => sum + item.volumeRatio, 0) / stocks.length;
    return { positive, highCatalyst, avgVolumeRatio };
  }, [stocks]);

  const activeStock = (
    selectedStock ||
    (selectedSymbol ? stocks.find((item) => item.symbol === selectedSymbol) || null : null)
  ) as DetailStock | null;

  const activeNews = (activeStock?.news || []).slice(0, 10);
  const tradingViewSrc = activeStock
    ? `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(activeStock.symbol)}&interval=D&range=12M&theme=dark&style=1&locale=de_DE&hide_top_toolbar=false&hide_legend=false&hide_side_toolbar=false`
    : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Edge Free</h1>
          <p className="text-muted-foreground mt-1">
            Kostenfreie Movers-Ansicht mit Scanner-Cache, Symbol-Detail, Chart und News.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Zuletzt aktualisiert: {lastUpdated}
            </span>
          )}
          <Button size="sm" onClick={() => refresh()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">Aktualisieren</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Geladene Symbole</div>
            <div className="mt-1 text-xl font-semibold">{stocks.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Positive Titel</div>
            <div className="mt-1 text-xl font-semibold">{summary.positive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Ø Volumen-Ratio</div>
            <div className="mt-1 text-xl font-semibold">{summary.avgVolumeRatio.toFixed(2)}x</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">Catalyst Score ≥ 80</div>
            <div className="mt-1 text-xl font-semibold">{summary.highCatalyst}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[520px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="space-y-3">
            <div>
              <CardTitle>Movers</CardTitle>
              <CardDescription>
                Nur kostenfreie Datenquellen (Scanner + Cache)
              </CardDescription>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(MODE_LABELS) as MoversMode[]).map((entry) => (
                <Button
                  key={entry}
                  type="button"
                  variant={entry === mode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode(entry)}
                >
                  {MODE_LABELS[entry]}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Symbol, Name, Sektor..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[calc(100vh-370px)] min-h-[420px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10 border-y">
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left">Ticker</th>
                    <th className="px-3 py-2 text-right">Preis</th>
                    <th className="px-3 py-2 text-right">%chg</th>
                    <th className="px-3 py-2 text-right">Gap</th>
                    <th className="px-3 py-2 text-right">Vol.R</th>
                  </tr>
                </thead>
                <tbody>
                  {moverList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-5 text-center text-muted-foreground">
                        {isLoading ? "Lade Scanner-Daten..." : "Keine Treffer für diese Ansicht."}
                      </td>
                    </tr>
                  )}
                  {moverList.map((stock) => {
                    const selected = stock.symbol === selectedSymbol;
                    return (
                      <tr
                        key={stock.symbol}
                        onClick={() => setSelectedSymbol(stock.symbol)}
                        className={cn(
                          "cursor-pointer border-b transition-colors hover:bg-muted/40",
                          selected && "bg-muted/60"
                        )}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{stock.symbol}</span>
                            {stock.earningsDate && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                ER
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                            {stock.name}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">${formatNumber(stock.price)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            stock.changePercent >= 0 ? "text-emerald-500" : "text-red-500"
                          )}
                        >
                          {signedPercent(stock.changePercent)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{signedPercent(stock.gapPercent)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatNumber(stock.volumeRatio)}x</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {activeStock?.symbol || "-"}
                    {detailLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </CardTitle>
                  <CardDescription>{activeStock?.name || "Kein Symbol ausgewählt"}</CardDescription>
                </div>
                {activeStock && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{activeStock.sector}</Badge>
                    <Badge variant="outline">{activeStock.industry}</Badge>
                    <a
                      href={`https://finance.yahoo.com/quote/${encodeURIComponent(activeStock.symbol)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activeStock ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Preis</div>
                    <div className="text-lg font-semibold mt-1">${formatNumber(activeStock.price)}</div>
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        activeStock.changePercent >= 0 ? "text-emerald-500" : "text-red-500"
                      )}
                    >
                      {signedPercent(activeStock.changePercent)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Volumen</div>
                    <div className="text-lg font-semibold mt-1">{formatVolume(activeStock.volume)}</div>
                    <div className="text-xs mt-0.5 text-muted-foreground">
                      {formatNumber(activeStock.volumeRatio)}x vs AVG
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Marktkapitalisierung</div>
                    <div className="text-lg font-semibold mt-1">{formatMarketCap(activeStock.marketCap)}</div>
                    <div className="text-xs mt-0.5 text-muted-foreground">RS {activeStock.rsRating}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-xs text-muted-foreground">Catalyst Score</div>
                    <div className="text-lg font-semibold mt-1">{formatNumber(activeStock.catalystScore, 0)}</div>
                    <div className="text-xs mt-0.5 text-muted-foreground">
                      Setup {formatNumber(activeStock.setupScore, 0)}%
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Keine Daten verfügbar.</div>
              )}
              {detailError && <div className="mt-3 text-xs text-amber-500">{detailError}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chart</CardTitle>
              <CardDescription>Daily Candles (100 Tage, kostenloser Scanner-Feed)</CardDescription>
            </CardHeader>
            <CardContent>
              {!activeStock && <div className="text-sm text-muted-foreground">Kein Symbol ausgewählt.</div>}
              {activeStock && chartLoading && (
                <div className="h-[360px]">
                  <Skeleton className="h-full w-full" />
                </div>
              )}
              {activeStock && !chartLoading && chartData.length > 0 && (
                <div className="h-[360px]">
                  <StockChart data={chartData} symbol={activeStock.symbol} height={360} />
                </div>
              )}
              {activeStock && !chartLoading && chartData.length === 0 && (
                <div className="h-[360px] overflow-hidden rounded-md border bg-black">
                  <iframe
                    title={`TradingView ${activeStock.symbol}`}
                    src={tradingViewSrc}
                    className="h-full w-full border-0"
                    loading="lazy"
                    sandbox="allow-scripts allow-same-origin"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Earnings Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!activeStock && <div className="text-muted-foreground">Keine Daten verfügbar.</div>}
                {activeStock && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Nächste Earnings</span>
                      <span>{formatDate(activeStock.earningsDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">EPS</span>
                      <span>{formatNumber(activeStock.eps)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">EPS Growth</span>
                      <span>{signedPercent(activeStock.epsGrowth)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Sales QoQ</span>
                      <span>{activeStock.salesGrowthQoQ ? signedPercent(activeStock.salesGrowthQoQ) : "-"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">KGV / fwd KGV</span>
                      <span>
                        {formatNumber(activeStock.peRatio, 1)} / {formatNumber(activeStock.forwardPE, 1)}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Trigger & Flow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {!activeStock && <div className="text-muted-foreground">Keine Daten verfügbar.</div>}
                {activeStock && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Gap %</span>
                      <span>{signedPercent(activeStock.gapPercent)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">ADR %</span>
                      <span>{formatNumber(activeStock.adrPercent)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Short Float</span>
                      <span>{activeStock.shortFloat !== undefined ? `${activeStock.shortFloat.toFixed(1)}%` : "-"}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(activeStock.catalystSignals || []).slice(0, 8).map((signal) => (
                        <Badge key={signal} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {signal}
                        </Badge>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>News</CardTitle>
              <CardDescription>Aktuelle Headlines für {activeStock?.symbol || "-"}</CardDescription>
            </CardHeader>
            <CardContent>
              {!activeStock && <div className="text-sm text-muted-foreground">Kein Symbol ausgewählt.</div>}
              {activeStock && activeNews.length === 0 && (
                <div className="text-sm text-muted-foreground">Keine News verfügbar.</div>
              )}
              {activeStock && activeNews.length > 0 && (
                <div className="space-y-2">
                  {activeNews.map((item, index) => (
                    <a
                      key={`${item.link}-${index}`}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border p-3 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium line-clamp-2">{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {item.publisher} · {formatDate(String(item.publishedAt))}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground mt-1" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            Scan: {stats ? `${stats.totalStocks} Titel` : "läuft"}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            Modus: {MODE_LABELS[mode]}
          </span>
          <span className="inline-flex items-center gap-1">
            <TrendingDown className="h-3.5 w-3.5" />
            Cache: {stats ? `${stats.fromCache} aus Cache` : "-"}
          </span>
        </div>
      </div>
    </div>
  );
}
