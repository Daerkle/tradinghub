"use client";

import { useState, useEffect } from "react";
import {
  BarChart3, Star, Building2, Users, Calendar, Newspaper, ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { translateNewsTag } from "@/lib/news-tags";
import { StockChart } from "@/components/scanner/stock-chart";
import { formatNumber, getRSRatingColor, getSetupScoreColor } from "@/components/scanner/metric-tooltip";
import type { StockData, NewsItem } from "@/types/scanner";

function NewsSection({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [todayNewsCount, setTodayNewsCount] = useState(0);
  const [totalNewsCount, setTotalNewsCount] = useState(0);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNews() {
      setLoading(true);
      try {
        const response = await fetch(`/api/scanner/news/${encodeURIComponent(symbol)}?today=true&max=10`);
        if (response.ok) {
          const data = await response.json();
          setNews(data.news || []);
          setTodayNewsCount(data.todayNewsCount || 0);
          setTotalNewsCount(data.totalNewsCount || 0);
          setTagCounts(data.tagCounts || {});
        }
      } catch (error) {
        console.error("Error loading news:", error);
      }
      setLoading(false);
    }
    loadNews();
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Keine News von heute gefunden
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground pb-1">
        Heute: {todayNewsCount} | Gesamt (letzte Treffer): {totalNewsCount}
      </div>
      {Object.keys(tagCounts).length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1">
          {Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([tag, count]) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                {translateNewsTag(tag)} ({count})
              </Badge>
            ))}
        </div>
      )}
      {news.slice(0, 5).map((item, index) => (
        <a
          key={index}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium line-clamp-2">{item.title}</p>
            <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1" />
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{item.publisher}</span>
            <span>-</span>
            <span>{new Date(item.publishedAt).toLocaleDateString("de-DE")}</span>
          </div>
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {translateNewsTag(tag)}
                </Badge>
              ))}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

interface StockDetailPanelProps {
  stock: StockData;
}

function ChartSection({ stock }: { stock: StockData }) {
  const [chartData, setChartData] = useState(() => stock.chartData || []);
  const [failed, setFailed] = useState(false);
  const [chartMode, setChartMode] = useState<"journal" | "tradingview">("journal");
  const loading = chartMode === "journal" && !failed && chartData.length === 0;

  useEffect(() => {
    if (chartData.length > 0 || failed) return;

    let cancelled = false;

    fetch(`/api/scanner/chart/${encodeURIComponent(stock.symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.chartData?.length > 0) {
          setChartData(data.chartData);
        } else if (!cancelled) {
          setFailed(true);
          setChartMode("tradingview");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setChartMode("tradingview");
        }
      });

    return () => { cancelled = true; };
  }, [stock.symbol, chartData.length, failed]);

  const tradingViewSrc = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_detail_${stock.symbol.replace(
    /[^a-zA-Z0-9_]/g,
    "_"
  )}&symbol=${encodeURIComponent(
    stock.symbol
  )}&interval=D&range=12M&theme=dark&style=1&locale=de_DE&enable_publishing=false&hide_top_toolbar=false&hide_legend=false&hide_side_toolbar=false&allow_symbol_change=true&save_image=false&withdateranges=true&show_popup_button=true`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border p-0.5 bg-muted/20">
          <Button
            type="button"
            size="sm"
            variant={chartMode === "journal" ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setChartMode("journal")}
          >
            Journal
          </Button>
          <Button
            type="button"
            size="sm"
            variant={chartMode === "tradingview" ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setChartMode("tradingview")}
          >
            TradingView
          </Button>
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(stock.symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Extern öffnen
        </a>
      </div>

      {chartMode === "journal" && (
        <>
          {loading && (
            <div className="h-[250px] sm:h-[350px] flex items-center justify-center bg-muted rounded-md">
              <Skeleton className="h-full w-full rounded-md" />
            </div>
          )}

          {!loading && chartData.length > 0 && (
            <div className="h-[250px] sm:h-[350px]">
              <StockChart data={chartData} symbol={stock.symbol} height={250} />
            </div>
          )}

          {!loading && chartData.length === 0 && (
            <div className="h-[250px] sm:h-[350px] flex items-center justify-center bg-muted rounded-md px-4 text-center">
              <span className="text-muted-foreground">
                Keine Journal-Chart-Daten verfügbar. Bitte TradingView nutzen.
              </span>
            </div>
          )}
        </>
      )}

      {chartMode === "tradingview" && (
        <div className="h-[250px] sm:h-[350px] overflow-hidden rounded-md border bg-black">
          <iframe
            title={`TradingView ${stock.symbol}`}
            src={tradingViewSrc}
            className="h-full w-full border-0"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

export function StockDetailPanel({ stock }: StockDetailPanelProps) {
  return (
    <div className="p-4 bg-muted/30 border-t">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Chart (100 Tage)
          </h4>
          <ChartSection key={stock.symbol} stock={stock} />
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h4 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
              <Star className="h-4 w-4 text-zinc-500" />
              Ratings
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">RS Rating</span>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", getRSRatingColor(stock.rsRating))}>
                  {stock.rsRating}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Setup Score</span>
                <span className={cn("font-bold text-lg", getSetupScoreColor(stock.setupScore))}>
                  {formatNumber(stock.setupScore, 0)}%
                </span>
              </div>
              {stock.stockbeeScore !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Stockbee Score</span>
                  <span className={cn(
                    "font-bold text-lg",
                    stock.stockbeeScore >= 80 ? "text-white" : stock.stockbeeScore >= 65 ? "text-zinc-300" : "text-zinc-500"
                  )}>
                    {formatNumber(stock.stockbeeScore, 0)}%
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm">Catalyst Score</span>
                <span className={cn(
                  "font-bold text-lg",
                  stock.catalystScore >= 80 ? "text-white" : stock.catalystScore >= 65 ? "text-zinc-300" : "text-zinc-500"
                )}>
                  {formatNumber(stock.catalystScore, 0)}
                </span>
              </div>
              {stock.stockbee && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {stock.stockbee.isEpisodicPivot && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Stockbee EP</Badge>}
                  {stock.stockbee.isMomentumBurst && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Momentum Burst</Badge>}
                  {stock.stockbee.isRangeExpansionBreakout && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Range Breakout</Badge>}
                  {stock.stockbee.qullaAlignment?.alignsWithQullamaggie && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Qulla Align: {[
                        stock.stockbee.qullaAlignment.month1 ? "1M" : null,
                        stock.stockbee.qullaAlignment.month3 ? "3M" : null,
                        stock.stockbee.qullaAlignment.month6 ? "6M" : null,
                      ].filter(Boolean).join("/")}
                    </Badge>
                  )}
                </div>
              )}
              {stock.catalystSignals && stock.catalystSignals.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {stock.catalystSignals.slice(0, 5).map((signal) => (
                    <Badge key={signal} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {signal}
                    </Badge>
                  ))}
                </div>
              )}
              {stock.analystRating && stock.analystRating !== "N/A" && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Analysten</span>
                  <Badge variant="secondary" className="capitalize">
                    {stock.analystRating} ({stock.numAnalysts})
                  </Badge>
                </div>
              )}
              {stock.targetPrice > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Kursziel</span>
                  <span className="font-medium">${formatNumber(stock.targetPrice)}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Sektor & Industrie
            </h4>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground">Sektor</span>
                <p className="font-medium">{stock.sector}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Industrie</span>
                <p className="font-medium">{stock.industry}</p>
              </div>
            </div>
          </Card>

          {(stock.shortFloat || stock.instOwn || stock.insiderOwn || stock.earningsDate) && (
            <Card className="p-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Ownership & Shorts
              </h4>
              <div className="space-y-2 text-sm">
                {stock.shortFloat !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Short Float</span>
                    <span className={cn("font-medium", stock.shortFloat >= 20 ? "text-foreground" : "text-zinc-400")}>
                      {stock.shortFloat.toFixed(1)}%
                    </span>
                  </div>
                )}
                {stock.shortRatio !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Days to Cover</span>
                    <span className={cn("font-medium", stock.shortRatio >= 5 ? "text-foreground" : "text-zinc-400")}>
                      {stock.shortRatio.toFixed(1)} Tage
                    </span>
                  </div>
                )}
                {stock.instOwn !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Institutionell</span>
                    <span className={cn("font-medium", stock.instOwn >= 70 ? "text-foreground" : "text-zinc-400")}>
                      {stock.instOwn.toFixed(1)}%
                    </span>
                  </div>
                )}
                {stock.insiderOwn !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Insider</span>
                    <span className="font-medium">{stock.insiderOwn.toFixed(1)}%</span>
                  </div>
                )}
                {stock.beta !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Beta</span>
                    <span className={cn("font-medium", stock.beta >= 2 ? "text-foreground" : "text-zinc-400")}>
                      {stock.beta.toFixed(2)}
                    </span>
                  </div>
                )}
                {stock.earningsDate && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />Earnings
                    </span>
                    <span className="font-medium text-foreground">{stock.earningsDate}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {stock.proxyPlays && stock.proxyPlays.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Users className="h-4 w-4" />Proxy Plays
              </h4>
              <div className="flex flex-wrap gap-2">
                {stock.proxyPlays.map((sym) => (
                  <a key={sym} href={`https://www.tradingview.com/chart/?symbol=${sym}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors text-sm font-medium">
                    {sym}<ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Starke Aktien im gleichen Sektor/Industrie</p>
            </Card>
          )}

          <Card className="p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Technische Daten</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">EMA 10</span><span>${formatNumber(stock.ema10)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">EMA 20</span><span>${formatNumber(stock.ema20)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SMA 50</span><span>${formatNumber(stock.sma50)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SMA 200</span><span>${formatNumber(stock.sma200)}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RSI</span>
                <span className={cn(stock.rsi > 70 || stock.rsi < 30 ? "text-foreground" : "text-zinc-400")}>{formatNumber(stock.rsi, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ADR%</span>
                <span className={stock.adrPercent >= 5 ? "text-foreground" : "text-zinc-400"}>{formatNumber(stock.adrPercent)}%</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">52W High</span><span>{formatNumber(stock.distanceFrom52WkHigh)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">52W Low</span><span>+{formatNumber(stock.distanceFrom52WkLow)}%</span></div>
            </div>
          </Card>

          <Card className="p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Newspaper className="h-4 w-4" />News
            </h4>
            <NewsSection symbol={stock.symbol} />
          </Card>
        </div>
      </div>
    </div>
  );
}
