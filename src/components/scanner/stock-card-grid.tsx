"use client";

import {
  Zap, Star, ExternalLink, BarChart3, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { StockData } from "@/types/scanner";

function StockCard({ stock, onClick }: { stock: StockData; onClick?: () => void }) {
  const changeColor = stock.changePercent >= 0 ? "text-emerald-500" : "text-red-500";
  const ChangeIcon = stock.changePercent >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Card
      className="cursor-pointer hover:border-zinc-600 transition-all overflow-hidden border-zinc-800"
      onClick={onClick}
    >
      <div className="h-[140px] sm:h-[180px] w-full bg-zinc-900 relative overflow-hidden">
        <iframe
          src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_${stock.symbol}&symbol=${stock.symbol}&interval=D&range=3M&theme=dark&style=1&locale=en&enable_publishing=false&hide_top_toolbar=true&hide_legend=true&hide_side_toolbar=true&allow_symbol_change=false&save_image=false&withdateranges=false&studies=[]&show_popup_button=false`}
          className="w-full h-full border-0"
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

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

        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
          <div className="text-center p-1 bg-zinc-900 rounded border border-zinc-800">
            <div className="text-zinc-500">Vol.R</div>
            <div className={cn("font-medium", stock.volumeRatio >= 1.5 ? "text-foreground" : "text-zinc-400")}>
              {stock.volumeRatio?.toFixed(1) || "-"}x
            </div>
          </div>
          <div className="text-center p-1 bg-zinc-900 rounded border border-zinc-800">
            <div className="text-zinc-500">RS</div>
            <div className={cn("font-medium", stock.rsRating >= 80 ? "text-white" : "text-zinc-400")}>
              {stock.rsRating}
            </div>
          </div>
          <div className="text-center p-1 bg-zinc-900 rounded border border-zinc-800">
            <div className="text-zinc-500">1M%</div>
            <div className={cn("font-medium", stock.momentum1M >= 0 ? "text-emerald-500" : "text-red-500")}>
              {stock.momentum1M.toFixed(0)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
          <div className="text-center p-1 bg-zinc-900 rounded border border-zinc-800">
            <div className="text-zinc-500">3M%</div>
            <div className={cn("font-medium", stock.momentum3M >= 0 ? "text-emerald-500" : "text-red-500")}>
              {stock.momentum3M.toFixed(0)}%
            </div>
          </div>
          <div className="text-center p-1 bg-zinc-900 rounded border border-zinc-800">
            <div className="text-zinc-500">ADR%</div>
            <div className={cn("font-medium", stock.adrPercent >= 5 ? "text-foreground" : "text-zinc-400")}>
              {stock.adrPercent?.toFixed(1) || "-"}%
            </div>
          </div>
          <div className="text-center p-1 bg-zinc-900 rounded border border-zinc-800">
            <div className="text-zinc-500">Cat.</div>
            <div className={cn("font-medium", (stock.catalystScore ?? 0) >= 80 ? "text-white" : "text-zinc-400")}>
              {(stock.catalystScore ?? 0).toFixed(0)}
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-1.5 pt-0.5">
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
}

interface StockCardGridProps {
  stocks: StockData[];
  cardsPerRow: number;
  onCardClick: (symbol: string) => void;
}

export function StockCardGrid({ stocks, cardsPerRow, onCardClick }: StockCardGridProps) {
  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div
        className="grid grid-cols-1 sm:grid-cols-2 md:[grid-template-columns:var(--card-cols)] gap-3 sm:gap-4 p-1"
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
    </ScrollArea>
  );
}
