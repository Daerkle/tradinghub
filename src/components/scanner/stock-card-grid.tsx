"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  ExternalLink, BarChart3, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StockData } from "@/types/scanner";

function useLazyChartFrame(enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    if (shouldLoad) return;

    const node = ref.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      const frame = globalThis.requestAnimationFrame(() => setShouldLoad(true));
      return () => globalThis.cancelAnimationFrame(frame);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "360px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled, shouldLoad]);

  return { ref, shouldLoad };
}

function formatSignedPct(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-1 text-center">
      <div className="text-zinc-500">{label}</div>
      <div className={cn("font-medium", tone)}>{value}</div>
    </div>
  );
}

const StockCard = memo(function StockCard({ stock, onClick }: { stock: StockData; onClick?: () => void }) {
  const changeColor = stock.changePercent >= 0 ? "text-emerald-500" : "text-red-500";
  const ChangeIcon = stock.changePercent >= 0 ? ArrowUpRight : ArrowDownRight;
  const [chartRequested, setChartRequested] = useState(false);
  const { ref: chartRef, shouldLoad: shouldLoadChart } = useLazyChartFrame(chartRequested);
  const tradingViewSrc = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_${encodeURIComponent(
    stock.symbol
  )}&symbol=${encodeURIComponent(stock.symbol)}&interval=D&range=3M&theme=dark&style=1&locale=en&enable_publishing=false&hide_top_toolbar=true&hide_legend=true&hide_side_toolbar=true&allow_symbol_change=false&save_image=false&withdateranges=false&studies=[]&show_popup_button=false`;

  return (
    <Card
      className="cursor-pointer overflow-hidden border-zinc-800 transition-colors hover:border-zinc-600 [contain-intrinsic-size:220px] [content-visibility:auto]"
      onClick={onClick}
    >
      {chartRequested && (
        <div ref={chartRef} className="relative hidden h-[116px] w-full overflow-hidden bg-zinc-900 min-[440px]:block sm:h-[136px]">
          {shouldLoadChart ? (
            <iframe
              title={`${stock.symbol} TradingView Chart`}
              src={tradingViewSrc}
              className="h-full w-full border-0"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500">
              <BarChart3 className="h-4 w-4" />
              <span className="font-mono">{stock.symbol}</span>
            </div>
          )}
        </div>
      )}

      <CardContent className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm">{stock.symbol}</span>
            {stock.isEP && (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-[10px] px-1 py-0 border border-zinc-700">EP</Badge>
            )}
            {stock.isQullaSetup && (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-[10px] px-1 py-0 border border-zinc-700">Q</Badge>
            )}
            {stock.isStockbeeSetup && (
              <Badge variant="secondary" className="bg-zinc-800 text-zinc-300 text-[10px] px-1 py-0 border border-zinc-700">SB</Badge>
            )}
          </div>
          <div className="text-right font-mono">
            <span className="font-semibold text-sm">${stock.price.toFixed(2)}</span>
            <div className={cn("flex items-center text-[10px] justify-end", changeColor)}>
              <ChangeIcon className="h-2.5 w-2.5" />
              {stock.changePercent.toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="text-[10px] text-zinc-500 truncate">
          {stock.sector !== "Unknown" ? stock.sector : ""}
          {stock.sector !== "Unknown" && stock.industry !== "Unknown" ? " | " : ""}
          {stock.industry !== "Unknown" ? stock.industry : ""}
        </div>

        <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
          <MetricTile
            label="1M"
            value={formatSignedPct(stock.momentum1M)}
            tone={stock.momentum1M >= 0 ? "text-emerald-500" : "text-red-500"}
          />
          <MetricTile
            label="3M"
            value={formatSignedPct(stock.momentum3M)}
            tone={stock.momentum3M >= 0 ? "text-emerald-500" : "text-red-500"}
          />
          <MetricTile
            label="6M"
            value={formatSignedPct(stock.momentum6M)}
            tone={stock.momentum6M >= 0 ? "text-emerald-500" : "text-red-500"}
          />
          <MetricTile
            label="1Y"
            value={formatSignedPct(stock.momentum1Y)}
            tone={stock.momentum1Y >= 0 ? "text-emerald-500" : "text-red-500"}
          />
        </div>

        <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
          <MetricTile
            label="Vol.R"
            value={`${stock.volumeRatio?.toFixed(1) || "-"}x`}
            tone={stock.volumeRatio >= 1.5 ? "text-foreground" : "text-zinc-400"}
          />
          <MetricTile label="RS" value={`${stock.rsRating}`} tone={stock.rsRating >= 80 ? "text-white" : "text-zinc-400"} />
          <MetricTile
            label="ADR"
            value={`${stock.adrPercent?.toFixed(1) || "-"}%`}
            tone={stock.adrPercent >= 5 ? "text-foreground" : "text-zinc-400"}
          />
          <MetricTile
            label="Cat"
            value={`${(stock.catalystScore ?? 0).toFixed(0)}`}
            tone={(stock.catalystScore ?? 0) >= 80 ? "text-white" : "text-zinc-400"}
          />
        </div>

        <div className="flex justify-center gap-1.5 pt-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-zinc-500 hover:text-zinc-300"
            onClick={(e) => {
              e.stopPropagation();
              setChartRequested((value) => !value);
            }}
          >
            <BarChart3 className="h-2.5 w-2.5 mr-0.5" />
            {chartRequested ? "Aus" : "Chart"}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-zinc-500 hover:text-zinc-300" asChild onClick={(e) => e.stopPropagation()}>
            <a href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`} target="_blank" rel="noopener noreferrer">
              <BarChart3 className="h-2.5 w-2.5 mr-0.5" />TV
            </a>
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-zinc-500 hover:text-zinc-300" asChild onClick={(e) => e.stopPropagation()}>
            <a href={`https://finance.yahoo.com/quote/${stock.symbol}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-2.5 w-2.5 mr-0.5" />Yahoo
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
});

interface StockCardGridProps {
  stocks: StockData[];
  cardsPerRow: number;
  onCardClick: (symbol: string) => void;
}

export function StockCardGrid({ stocks, cardsPerRow, onCardClick }: StockCardGridProps) {
  return (
    <div>
      <div
        className="grid grid-cols-1 gap-2 p-1 sm:grid-cols-2 sm:gap-3 md:[grid-template-columns:var(--card-cols)]"
        style={{ "--card-cols": `repeat(${cardsPerRow}, minmax(0, 1fr))` } as React.CSSProperties}
      >
        {stocks.map((stock) => (
          <StockCard key={stock.symbol} stock={stock} onClick={() => onCardClick(stock.symbol)} />
        ))}
      </div>
      {stocks.length === 0 && (
        <div className="flex items-center justify-center h-40 text-muted-foreground">
          Keine Aktien gefunden
        </div>
      )}
    </div>
  );
}
