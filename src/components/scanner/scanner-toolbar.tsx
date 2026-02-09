"use client";

import {
  Search, Copy, Check, Download, GitCompare, LayoutGrid, LayoutList, Columns,
  Zap, Calendar, TrendingUp, Target, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StockData } from "@/types/scanner";
import { filterByScanType } from "@/lib/scanner-filters";

const formatSymbolsForTradingView = (stocks: StockData[]): string => {
  return stocks.map(s => s.symbol).join(",");
};

const downloadAsTextFile = (stocks: StockData[], listName: string) => {
  const symbols = formatSymbolsForTradingView(stocks);
  const blob = new Blob([symbols], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tradingview-${listName}-${new Date().toISOString().split("T")[0]}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const copyToClipboard = async (stocks: StockData[]): Promise<boolean> => {
  const symbols = formatSymbolsForTradingView(stocks);
  try {
    await navigator.clipboard.writeText(symbols);
    return true;
  } catch {
    return false;
  }
};

interface ScannerToolbarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  compareMode: boolean;
  setCompareMode: (mode: boolean) => void;
  selectedCount: number;
  onShowCompare: () => void;
  displayCount: number;
  viewMode: "table" | "cards";
  setViewMode: (mode: "table" | "cards") => void;
  cardsPerRow: number;
  setCardsPerRow: (n: number) => void;
  copiedList: string | null;
  setCopiedList: (list: string | null) => void;
  streamedStocks: StockData[];
  displayData: StockData[];
  epCount: number;
  momentum1mCount: number;
  momentum3mCount: number;
  momentum6mCount: number;
  setupCount: number;
  rsCount: number;
  catalystCount: number;
  clearSelection: () => void;
}

export function ScannerToolbar({
  searchQuery, setSearchQuery,
  compareMode, setCompareMode, selectedCount, onShowCompare,
  displayCount, viewMode, setViewMode, cardsPerRow, setCardsPerRow,
  copiedList, setCopiedList, streamedStocks, displayData,
  epCount, momentum1mCount, momentum3mCount, momentum6mCount, setupCount, rsCount, catalystCount,
  clearSelection,
}: ScannerToolbarProps) {
  const getStocksForExport = (listName: string): StockData[] => {
    if (!streamedStocks || streamedStocks.length === 0) return [];
    switch (listName) {
      case "ep": return filterByScanType(streamedStocks, "ep");
      case "1m": return filterByScanType(streamedStocks, "1m");
      case "3m": return filterByScanType(streamedStocks, "3m");
      case "6m": return filterByScanType(streamedStocks, "6m");
      case "setup": return filterByScanType(streamedStocks, "qullamaggie");
      case "rs": return filterByScanType(streamedStocks, "rs");
      case "catalyst": return filterByScanType(streamedStocks, "catalyst");
      case "chrisswings": return filterByScanType(streamedStocks, "chrisswings");
      case "current": return displayData;
      default: return streamedStocks;
    }
  };

  const handleCopyToClipboard = async (listName: string) => {
    const stocks = getStocksForExport(listName);
    const success = await copyToClipboard(stocks);
    if (success) {
      setCopiedList(listName);
      setTimeout(() => setCopiedList(null), 2000);
    }
  };

  const handleDownload = (listName: string) => {
    const stocks = getStocksForExport(listName);
    downloadAsTextFile(stocks, listName);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Symbol, Name, Sektor..." className="pl-8 w-full sm:w-[250px]" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        <Button
          variant={compareMode ? "default" : "outline"}
          size="icon"
          className={compareMode ? "bg-primary text-primary-foreground" : ""}
          onClick={() => { setCompareMode(!compareMode); if (!compareMode) clearSelection(); }}
        >
          <TooltipProvider><Tooltip><TooltipTrigger asChild><GitCompare className="h-4 w-4" /></TooltipTrigger>
            <TooltipContent>Vergleichsmodus {compareMode ? "beenden" : "starten"}</TooltipContent>
          </Tooltip></TooltipProvider>
        </Button>

        {compareMode && selectedCount > 0 && (
          <Button variant="secondary" className="gap-2 bg-zinc-800 text-zinc-200 hover:bg-zinc-700" onClick={onShowCompare}>
            <GitCompare className="h-4 w-4" />Vergleichen ({selectedCount})
          </Button>
        )}

        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={() => handleCopyToClipboard("current")} disabled={displayCount === 0}>
            {copiedList === "current" ? <Check className="h-4 w-4 text-zinc-300" /> : <Copy className="h-4 w-4" />}
          </Button>
        </TooltipTrigger><TooltipContent>Aktuelle Liste kopieren ({displayCount} Symbole)</TooltipContent></Tooltip></TooltipProvider>

        <TooltipProvider><Tooltip><TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={() => handleDownload("current")} disabled={displayCount === 0}>
            <Download className="h-4 w-4" />
          </Button>
        </TooltipTrigger><TooltipContent>Aktuelle Liste als TXT exportieren</TooltipContent></Tooltip></TooltipProvider>

        <div className="flex items-center border rounded-lg p-0.5 bg-muted/30">
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant={viewMode === "table" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("table")}>
              <LayoutList className="h-4 w-4" />
            </Button>
          </TooltipTrigger><TooltipContent>Tabellen-Ansicht</TooltipContent></Tooltip></TooltipProvider>
          <TooltipProvider><Tooltip><TooltipTrigger asChild>
            <Button variant={viewMode === "cards" ? "default" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("cards")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </TooltipTrigger><TooltipContent>Karten-Ansicht mit Charts</TooltipContent></Tooltip></TooltipProvider>
        </div>

        {viewMode === "cards" && (
          <div className="hidden sm:flex items-center gap-1.5 border rounded-lg p-1 bg-muted/30">
            <Columns className="h-4 w-4 text-muted-foreground ml-1" />
            {[2, 3, 4, 5, 6].map((num) => (
              <Button key={num} variant={cardsPerRow === num ? "default" : "ghost"} size="sm" className="h-7 w-7 p-0 text-xs" onClick={() => setCardsPerRow(num)}>
                {num}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* TradingView Export Section */}
      <div className="hidden sm:flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg">
        <span className="text-sm font-medium text-muted-foreground mr-2">TradingView Export:</span>
        {[
          { key: "ep", label: "EP", count: epCount, icon: Zap, color: "text-zinc-400" },
          { key: "1m", label: "1M", count: momentum1mCount, icon: Calendar, color: "text-zinc-400" },
          { key: "3m", label: "3M", count: momentum3mCount, icon: TrendingUp, color: "text-zinc-400" },
          { key: "6m", label: "6M", count: momentum6mCount, icon: Target, color: "text-zinc-400" },
          { key: "setup", label: "Setup", count: setupCount, icon: Star, color: "text-zinc-400" },
          { key: "rs", label: "RS", count: rsCount, icon: TrendingUp, color: "text-zinc-400" },
          { key: "catalyst", label: "Catalyst", count: catalystCount, icon: Zap, color: "text-zinc-400" },
        ].map(({ key, label, count, icon: Icon, color }) => (
          <div key={key} className="flex items-center gap-1">
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-2 gap-1" onClick={() => handleCopyToClipboard(key)} disabled={count === 0}>
                <Icon className={`h-3 w-3 ${color}`} /><span className="text-xs">{label}</span>
                {copiedList === key ? <Check className="h-3 w-3 text-zinc-300" /> : <Copy className="h-3 w-3" />}
              </Button>
            </TooltipTrigger><TooltipContent>{count} Symbole in Zwischenablage kopieren</TooltipContent></Tooltip></TooltipProvider>
            <TooltipProvider><Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(key)} disabled={count === 0}>
                <Download className="h-3 w-3" />
              </Button>
            </TooltipTrigger><TooltipContent>Als TXT herunterladen</TooltipContent></Tooltip></TooltipProvider>
          </div>
        ))}
      </div>
    </>
  );
}
