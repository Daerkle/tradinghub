"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateKeyToDate, dateToDateKey } from "@/lib/calendar-utils";
import { TradeService, type TradeData } from "@/lib/models";
import { useCurrencyFormatter } from "@/hooks/use-currency-formatter";

export default function DailyPage() {
  const { displayCurrency, formatMoney, convertMoney } = useCurrencyFormatter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (dateParam) {
      return dateKeyToDate(dateParam);
    }
    return new Date();
  });
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dateParam) {
      return;
    }
    setCurrentDate(dateKeyToDate(dateParam));
  }, [dateParam]);

  useEffect(() => {
    loadTrades(currentDate);
  }, [currentDate]);

  async function loadTrades(date: Date) {
    try {
      setIsLoading(true);
      const data = await TradeService.getByMarketDate(date);
      setTrades(data);
      setError(null);
    } catch (loadError) {
      console.error("Failed to load trades:", loadError);
      setError("Trades konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  function syncDate(nextDate: Date) {
    const normalized = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 12, 0, 0, 0);
    setCurrentDate(normalized);
    router.replace(`/daily?date=${dateToDateKey(normalized)}`);
  }

  function navigateDay(direction: number) {
    const nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + direction);
    syncDate(nextDate);
  }

  function jumpToToday() {
    syncDate(new Date());
  }

  const totalPnL = useMemo(
    () => trades.reduce((sum, trade) => sum + convertMoney(trade.pnl, trade.currency), 0),
    [convertMoney, trades]
  );
  const winningTrades = useMemo(() => trades.filter((trade) => trade.pnl > 0), [trades]);
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;
  const bestTrade = trades.length > 0
    ? Math.max(...trades.map((trade) => convertMoney(trade.pnl, trade.currency)))
    : 0;

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tages-Journal</h1>
            <p className="text-muted-foreground">Überprüfe deine Trading-Performance für einen einzelnen Handelstag.</p>
          </div>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Tages-Journal</h1>
          <p className="text-muted-foreground">Überprüfe deine Trading-Performance für einen einzelnen Handelstag.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigateDay(-1)} className="h-10 w-10 shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-center text-sm font-medium capitalize sm:min-w-[260px]">
              {currentDate.toLocaleDateString("de-DE", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
            <Button variant="outline" size="icon" onClick={() => navigateDay(1)} className="h-10 w-10 shrink-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={jumpToToday} className="w-full sm:w-auto">
            Heute
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tages-P&L</CardTitle>
            {isLoading ? (
              <Skeleton className="h-4 w-4" />
            ) : totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-rose-400" />
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className={totalPnL >= 0 ? "text-2xl font-bold text-emerald-400" : "text-2xl font-bold text-rose-400"}>
                {formatMoney(totalPnL, displayCurrency)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trades</CardTitle>
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-12" /> : <div className="text-2xl font-bold">{trades.length}</div>}</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trefferquote</CardTitle>
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-2xl font-bold">{winRate.toFixed(0)}%</div>}</CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bester Trade</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-emerald-400">{trades.length > 0 ? formatMoney(bestTrade, displayCurrency) : formatMoney(0, displayCurrency)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Trades</CardTitle>
          <CardDescription>Alle Trades an diesem Handelstag.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-12 w-full" />
              ))}
            </div>
          ) : trades.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 py-6 text-center text-muted-foreground">
              Keine Trades an diesem Tag.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 md:hidden">
                {trades.map((trade) => (
                  <div key={trade.id} className="rounded-lg border border-border/70 bg-card/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold">{trade.symbol}</span>
                          <Badge variant={trade.side === "long" ? "default" : "secondary"}>{trade.side.toUpperCase()}</Badge>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {new Date(trade.entryTime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} -{" "}
                          {new Date(trade.exitTime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      <div className={trade.pnl >= 0 ? "text-right font-semibold text-emerald-400" : "text-right font-semibold text-rose-400"}>
                        {formatMoney(trade.pnl, trade.currency)}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Entry</div>
                        <div className="mt-1 font-medium">{formatMoney(trade.entryPrice, trade.currency)}</div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Exit</div>
                        <div className="mt-1 font-medium">{formatMoney(trade.exitPrice, trade.currency)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zeit</TableHead>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Seite</TableHead>
                      <TableHead className="hidden lg:table-cell">Entry</TableHead>
                      <TableHead className="hidden lg:table-cell">Exit</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trades.map((trade) => (
                      <TableRow key={trade.id}>
                        <TableCell>
                          {new Date(trade.entryTime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                        </TableCell>
                        <TableCell className="font-medium">{trade.symbol}</TableCell>
                        <TableCell>
                          <Badge variant={trade.side === "long" ? "default" : "secondary"}>{trade.side.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{formatMoney(trade.entryPrice, trade.currency)}</TableCell>
                        <TableCell className="hidden lg:table-cell">{formatMoney(trade.exitPrice, trade.currency)}</TableCell>
                        <TableCell className={trade.pnl >= 0 ? "text-right font-medium text-emerald-400" : "text-right font-medium text-rose-400"}>
                          {formatMoney(trade.pnl, trade.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
