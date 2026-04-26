import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { StockData } from "@/types/scanner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useCurrencyFormatter } from "@/hooks/use-currency-formatter";

interface CompareViewProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stocks: StockData[];
    onRemove: (symbol: string) => void;
}

export function CompareView({ open, onOpenChange, stocks, onRemove }: CompareViewProps) {
    const { formatMoney, formatCompactMoney } = useCurrencyFormatter();
    if (stocks.length === 0) return null;

    const formatNumber = (num: number | null | undefined, decimals = 2) => {
        if (num === null || num === undefined || isNaN(num)) return "-";
        return num.toLocaleString("de-DE", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    };

    const getRSRatingColor = (rating: number) => {
        if (rating >= 90) return "bg-white text-black";
        if (rating >= 80) return "bg-zinc-300 text-black";
        if (rating >= 70) return "bg-zinc-500 text-white";
        if (rating >= 60) return "bg-zinc-600 text-white";
        if (rating >= 50) return "bg-zinc-700 text-zinc-300";
        return "bg-zinc-800 text-zinc-400";
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex h-[100dvh] max-w-[100vw] flex-col p-0 sm:h-[90vh] sm:max-w-[95vw]">
                <DialogHeader className="border-b px-3 py-3 sm:px-4">
                    <DialogTitle>Aktien Vergleich</DialogTitle>
                    <DialogDescription>
                        {stocks.length} Aktien im direkten Vergleich
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="flex-1">
                    <div className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row gap-4 sm:min-w-max">
                            {/* Labels Column */}
                            <div className="hidden w-36 flex-shrink-0 space-y-3 pt-[48px] text-xs sm:block">
                                <div className="h-8 flex items-center font-medium text-muted-foreground">Preis</div>
                                <div className="h-8 flex items-center font-medium text-muted-foreground">Veränderung</div>
                                <div className="h-8 flex items-center font-medium text-muted-foreground">Sektor</div>
                                <div className="h-8 flex items-center font-medium text-muted-foreground">Industrie</div>
                                <div className="h-8 flex items-center font-medium text-muted-foreground">Marktkapitalisierung</div>

                                <div className="mt-3 border-t pt-3">
                                    <h4 className="mb-2 font-semibold">Momentum</h4>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">1 Monat</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">3 Monate</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">6 Monate</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">1 Jahr</div>
                                </div>

                                <div className="mt-3 border-t pt-3">
                                    <h4 className="mb-2 font-semibold">Technical</h4>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">RS Rating</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">ADR %</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">RSI</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">Distanz 52W Hoch</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">Volumen Ratio</div>
                                </div>

                                <div className="mt-3 border-t pt-3">
                                    <h4 className="mb-2 font-semibold">Setup</h4>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">Setup Score</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">Qullamaggie</div>
                                    <div className="h-8 flex items-center font-medium text-muted-foreground">EMA Trend</div>
                                </div>
                            </div>

                            {/* Stock Columns */}
                            {stocks.map((stock) => (
                                <div key={stock.symbol} className="relative w-full flex-shrink-0 space-y-3 rounded-md border border-zinc-800 bg-zinc-900/50 p-3 sm:w-56">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="absolute top-2 right-2 h-6 w-6"
                                        onClick={() => onRemove(stock.symbol)}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>

                                    <div className="h-10">
                                        <h3 className="flex items-center gap-2 text-base font-bold">
                                            {stock.symbol}
                                            {stock.isEP && (
                                                <Badge variant="secondary" className="text-[10px] h-5 px-1 bg-zinc-800 text-zinc-300 border border-zinc-700">
                                                    EP
                                                </Badge>
                                            )}
                                        </h3>
                                        <p className="text-xs text-muted-foreground truncate" title={stock.name}>
                                            {stock.name}
                                        </p>
                                    </div>

                                    {/* Basic Data */}
                                    <div className="h-8 flex items-center font-medium">{formatMoney(stock.price, "USD")}</div>
                                    <div className={cn(
                                        "h-8 flex items-center font-medium font-mono tabular-nums",
                                        stock.changePercent >= 0 ? "text-emerald-500" : "text-red-500"
                                    )}>
                                        {stock.changePercent >= 0 ? <ArrowUpRight className="h-4 w-4 mr-1" /> : <ArrowDownRight className="h-4 w-4 mr-1" />}
                                        {formatNumber(stock.changePercent)}%
                                    </div>
                                    <div className="h-8 flex items-center text-sm truncate" title={stock.sector}>{stock.sector || "-"}</div>
                                    <div className="h-8 flex items-center text-sm truncate" title={stock.industry}>{stock.industry || "-"}</div>
                                    <div className="h-8 flex items-center text-sm">
                                        {/* Simplified Market Cap Display logic here if needed, or re-use helper */}
                                        {formatCompactMoney(stock.marketCap, "USD")}
                                    </div>

                                    {/* Momentum */}
                                    <div className="border-t pt-4 mt-4">
                                        <div className="h-[28px] mb-2"></div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.momentum1M >= 0 ? "text-emerald-500" : "text-red-500")}>
                                            {formatNumber(stock.momentum1M)}%
                                        </div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.momentum3M >= 0 ? "text-emerald-500" : "text-red-500")}>
                                            {formatNumber(stock.momentum3M)}%
                                        </div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.momentum6M >= 0 ? "text-emerald-500" : "text-red-500")}>
                                            {formatNumber(stock.momentum6M)}%
                                        </div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.momentum1Y >= 0 ? "text-emerald-500" : "text-red-500")}>
                                            {formatNumber(stock.momentum1Y)}%
                                        </div>
                                    </div>

                                    {/* Technical */}
                                    <div className="border-t pt-4 mt-4">
                                        <div className="h-[28px] mb-2"></div>
                                        <div className="h-8 flex items-center">
                                            <div className={cn(
                                                "w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs",
                                                getRSRatingColor(stock.rsRating)
                                            )}>
                                                {stock.rsRating}
                                            </div>
                                        </div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.adrPercent >= 5 ? "text-foreground" : "text-zinc-500")}>
                                            {formatNumber(stock.adrPercent)}%
                                        </div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.rsi > 70 || stock.rsi < 30 ? "text-foreground" : "text-zinc-500")}>
                                            {formatNumber(stock.rsi, 0)}
                                        </div>
                                        <div className="h-8 flex items-center">
                                            {stock.distanceFrom52WkHigh > -10 ? "Nahe High" : formatNumber(stock.distanceFrom52WkHigh) + "%"}
                                        </div>
                                        <div className={cn("h-8 flex items-center font-mono tabular-nums", stock.volumeRatio >= 1.5 ? "text-foreground" : "text-zinc-500")}>
                                            {formatNumber(stock.volumeRatio)}x
                                        </div>
                                    </div>

                                    {/* Setup */}
                                    <div className="border-t pt-4 mt-4">
                                        <div className="h-[28px] mb-2"></div>
                                        <div className={cn(
                                            "h-8 flex items-center font-bold text-lg font-mono tabular-nums",
                                            stock.setupScore >= 85 ? "text-white" : stock.setupScore >= 70 ? "text-zinc-300" : "text-zinc-500"
                                        )}>
                                            {formatNumber(stock.setupScore, 0)}%
                                        </div>
                                        <div className="h-8 flex items-center">
                                            {stock.isQullaSetup ? (
                                                <Badge className="bg-white text-black hover:bg-zinc-200">Ja</Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">Nein</span>
                                            )}
                                        </div>
                                        <div className="h-8 flex items-center text-sm">
                                            {stock.ema50 > stock.ema200 ? (
                                                <span className="text-foreground flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Bullish</span>
                                            ) : (
                                                <span className="text-zinc-500 flex items-center gap-1">Neutral</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
