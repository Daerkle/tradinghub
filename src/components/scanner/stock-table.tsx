"use client";

import {
  ChevronDown, ChevronRight, Zap, BarChart3, ExternalLink,
  ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { MetricTooltip, formatNumber, getRSRatingColor } from "@/components/scanner/metric-tooltip";
import { StockDetailPanel } from "@/components/scanner/stock-detail-panel";
import type { StockData } from "@/types/scanner";

type SortField = keyof StockData | "none";
type SortDirection = "asc" | "desc";

interface StockRowProps {
  stock: StockData;
  isExpanded: boolean;
  onToggle: () => void;
  showEpColumns?: boolean;
  compareMode?: boolean;
  isSelected?: boolean;
  onSelectChange?: (selected: boolean) => void;
}

function StockRow({ stock, isExpanded, onToggle, showEpColumns, compareMode, isSelected, onSelectChange }: StockRowProps) {
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-zinc-800/50 text-xs font-mono" onClick={onToggle}>
        <TableCell className="py-1.5 px-2" onClick={(e) => e.stopPropagation()}>
          {compareMode ? (
            <Checkbox checked={isSelected} onCheckedChange={(checked: boolean | "indeterminate") => onSelectChange?.(!!checked)} />
          ) : (
            <Button variant="ghost" size="icon" className="h-5 w-5">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </Button>
          )}
        </TableCell>
        <TableCell className="py-1.5 px-2">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm text-foreground">{stock.symbol}</span>
            {stock.isEP && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-zinc-800 text-zinc-300 border border-zinc-700">EP</Badge>}
            {stock.isQullaSetup && <Badge variant="secondary" className="text-[10px] px-1 py-0 bg-zinc-800 text-zinc-300 border border-zinc-700">Q</Badge>}
          </div>
          <div className="text-[10px] text-zinc-500 truncate max-w-[160px] font-sans">{stock.name}</div>
        </TableCell>
        <TableCell className="py-1.5 px-2 hidden md:table-cell">
          <div className="text-[10px] truncate max-w-[80px] text-zinc-500 font-sans" title={stock.sector + " - " + stock.industry}>
            {stock.sector !== "Unknown" ? stock.sector : "-"}
          </div>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums text-foreground">${formatNumber(stock.price)}</TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums">
          <span className={cn(stock.changePercent >= 0 ? "text-emerald-500" : "text-red-500")}>
            {stock.changePercent >= 0 ? "+" : ""}{formatNumber(stock.changePercent)}%
          </span>
        </TableCell>
        {showEpColumns && (
          <TableCell className="py-1.5 px-2 tabular-nums">
            <span className={cn(stock.gapPercent >= 5 ? "text-foreground" : "text-zinc-500")}>
              {stock.gapPercent >= 0 ? "+" : ""}{formatNumber(stock.gapPercent)}%
            </span>
          </TableCell>
        )}
        <TableCell className="py-1.5 px-2 tabular-nums">
          <span className={cn(stock.volumeRatio >= 2 ? "text-foreground" : "text-zinc-500")}>
            {formatNumber(stock.volumeRatio)}x
          </span>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums hidden md:table-cell">
          <span className={cn(stock.adrPercent >= 5 ? "text-foreground" : "text-zinc-500")}>
            {formatNumber(stock.adrPercent)}%
          </span>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums">
          <span className={cn(stock.momentum1M >= 0 ? "text-emerald-500" : "text-red-500")}>
            {stock.momentum1M >= 0 ? "+" : ""}{formatNumber(stock.momentum1M)}%
          </span>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums hidden md:table-cell">
          <span className={cn(stock.momentum3M >= 0 ? "text-emerald-500" : "text-red-500")}>
            {stock.momentum3M >= 0 ? "+" : ""}{formatNumber(stock.momentum3M)}%
          </span>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums hidden md:table-cell">
          <span className={cn(stock.momentum6M >= 0 ? "text-emerald-500" : "text-red-500")}>
            {stock.momentum6M >= 0 ? "+" : ""}{formatNumber(stock.momentum6M)}%
          </span>
        </TableCell>
        <TableCell className="py-1.5 px-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className={cn("w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px]", getRSRatingColor(stock.rsRating))}>
                  {stock.rsRating}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-semibold">RS Rating: {stock.rsRating}</p>
                  <p className="text-sm">Relative Strength vs SPY</p>
                  {stock.rsRating >= 80 && <p className="text-zinc-300">Top-Performer</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className={cn(stock.setupScore >= 85 ? "text-white font-bold" : stock.setupScore >= 70 ? "text-zinc-300" : "text-zinc-500")}>
                  {formatNumber(stock.setupScore, 0)}%
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-semibold">Setup Score: {formatNumber(stock.setupScore, 0)}%</p>
                  <p className="text-sm">Qullamaggie Setup-Qualitat</p>
                  {stock.isQullaSetup && <p className="text-zinc-300">Erfullt alle Kriterien</p>}
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums hidden lg:table-cell">
          <span className={cn(
            stock.catalystScore >= 80 ? "text-white font-bold" : stock.catalystScore >= 65 ? "text-zinc-300" : "text-zinc-500"
          )}>
            {formatNumber(stock.catalystScore, 0)}
          </span>
        </TableCell>
        <TableCell className="py-1.5 px-2 tabular-nums hidden md:table-cell">
          {stock.shortFloat !== undefined ? (
            <span className={cn(stock.shortFloat >= 20 ? "text-foreground" : "text-zinc-500")}>
              {stock.shortFloat.toFixed(1)}%
            </span>
          ) : (
            <span className="text-zinc-600">-</span>
          )}
        </TableCell>
        <TableCell className="py-1.5 px-2">
          <div className="flex items-center gap-0.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300" asChild onClick={(e) => e.stopPropagation()}>
                    <a href={`https://www.tradingview.com/chart/?symbol=${stock.symbol}`} target="_blank" rel="noopener noreferrer">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>TradingView</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-zinc-300" asChild onClick={(e) => e.stopPropagation()}>
                    <a href={`https://finance.yahoo.com/quote/${stock.symbol}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Yahoo Finance</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && !compareMode && (
        <TableRow>
          <TableCell colSpan={showEpColumns ? 16 : 15} className="p-0">
            <StockDetailPanel stock={stock} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

interface SortHeaderProps {
  field: SortField;
  children: React.ReactNode;
  metricKey?: string;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}

function SortHeader({ field, children, metricKey, sortField, sortDirection, onSort, className }: SortHeaderProps) {
  return (
    <TableHead className={cn("cursor-pointer hover:bg-muted/50 transition-colors", className)} onClick={() => onSort(field)}>
      <div className="flex items-center gap-1">
        {metricKey ? <MetricTooltip metricKey={metricKey}>{children}</MetricTooltip> : children}
        {sortField === field && (
          <ChevronDown className={cn("h-3 w-3", sortDirection === "asc" && "rotate-180")} />
        )}
      </div>
    </TableHead>
  );
}

interface StockTableProps {
  stocks: StockData[];
  expandedRows: Set<string>;
  onToggleRow: (symbol: string) => void;
  showEpColumns: boolean;
  compareMode: boolean;
  selectedForCompare: Set<string>;
  onSelectChange: (symbol: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

export function StockTable({
  stocks, expandedRows, onToggleRow, showEpColumns, compareMode,
  selectedForCompare, onSelectChange, onSelectAll,
  sortField, sortDirection, onSort,
}: StockTableProps) {
  return (
    <ScrollArea className="h-[calc(100vh-320px)]">
      <div className="rounded-md border min-w-[700px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                {compareMode && (
                  <Checkbox
                    checked={selectedForCompare.size === stocks.length && stocks.length > 0}
                    onCheckedChange={(checked: boolean | "indeterminate") => onSelectAll(!!checked)}
                  />
                )}
              </TableHead>
              <SortHeader field="symbol" metricKey="symbol" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>Symbol</SortHeader>
              <SortHeader field="sector" metricKey="sector" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden md:table-cell">Sektor</SortHeader>
              <SortHeader field="price" metricKey="price" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>Preis</SortHeader>
              <SortHeader field="changePercent" metricKey="changePercent" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>%</SortHeader>
              {showEpColumns && <SortHeader field="gapPercent" metricKey="gapPercent" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>Gap</SortHeader>}
              <SortHeader field="volumeRatio" metricKey="volumeRatio" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>Vol.R</SortHeader>
              <SortHeader field="adrPercent" metricKey="adrPercent" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden md:table-cell">ADR%</SortHeader>
              <SortHeader field="momentum1M" metricKey="momentum1M" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>1M%</SortHeader>
              <SortHeader field="momentum3M" metricKey="momentum3M" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden md:table-cell">3M%</SortHeader>
              <SortHeader field="momentum6M" metricKey="momentum6M" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden md:table-cell">6M%</SortHeader>
              <SortHeader field="rsRating" metricKey="rsRating" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>RS</SortHeader>
              <SortHeader field="setupScore" metricKey="setupScore" sortField={sortField} sortDirection={sortDirection} onSort={onSort}>Setup</SortHeader>
              <SortHeader field="catalystScore" metricKey="catalystScore" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden lg:table-cell">Catalyst</SortHeader>
              <SortHeader field="shortFloat" metricKey="shortFloat" sortField={sortField} sortDirection={sortDirection} onSort={onSort} className="hidden md:table-cell">Short%</SortHeader>
              <TableHead className="text-right">Links</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stocks.map((stock) => (
              <StockRow
                key={stock.symbol}
                stock={stock}
                isExpanded={expandedRows.has(stock.symbol)}
                onToggle={() => onToggleRow(stock.symbol)}
                showEpColumns={showEpColumns}
                compareMode={compareMode}
                isSelected={selectedForCompare.has(stock.symbol)}
                onSelectChange={(selected) => onSelectChange(stock.symbol, selected)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
