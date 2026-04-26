"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Grid2x2,
  Rows3,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarService, type DailyPnL, TradeService, type TradeData } from "@/lib/models";
import {
  buildDailyPnLMap,
  dateKeyToDate,
  dateToDateKey,
  formatWeekRange,
  getCalendarDayData,
  getMonthDays,
  getMonthMatrix,
  getWeekDays,
  getYearMonths,
  isSameDateKey,
  summarizeRange,
  type CalendarDayData,
  type CalendarMonthOverview,
} from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { useCurrencyFormatter } from "@/hooks/use-currency-formatter";

type CalendarViewMode = "month" | "week" | "year";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function getDayTone(day: CalendarDayData) {
  if (!day.isActive) {
    return "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40";
  }

  if (day.isPositive) {
    return "border-emerald-500/35 bg-emerald-500/12 text-emerald-50 hover:bg-emerald-500/18";
  }

  if (day.isNegative) {
    return "border-rose-500/35 bg-rose-500/12 text-rose-50 hover:bg-rose-500/18";
  }

  return "border-amber-500/35 bg-amber-500/12 text-amber-50 hover:bg-amber-500/18";
}

function SummaryCard({
  title,
  value,
  helper,
  tone = "neutral",
}: {
  title: string;
  value: string;
  helper: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="rounded-md border border-border/70 bg-card/80 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{title}</div>
      <div
        className={cn(
          "mt-1 text-base font-semibold sm:text-lg",
          tone === "positive" && "text-emerald-400",
          tone === "negative" && "text-rose-400"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{helper}</div>
    </div>
  );
}

function MonthHeatmap({
  month,
  selectedDateKey,
  onSelectMonth,
  onSelectDay,
  entryMap,
  formatMoneyValue,
  formatCompactMoneyValue,
}: {
  month: CalendarMonthOverview;
  selectedDateKey: string;
  onSelectMonth: (monthIndex: number) => void;
  onSelectDay: (dateKey: string) => void;
  entryMap: Map<string, DailyPnL>;
  formatMoneyValue: (value: number) => string;
  formatCompactMoneyValue: (value: number) => string;
}) {
  const matrix = getMonthMatrix(new Date(Number(month.monthKey.slice(0, 4)), month.monthIndex, 1, 12), entryMap);

  return (
    <div className="rounded-md border border-border/70 bg-card/70 p-2">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => onSelectMonth(month.monthIndex)}
      >
        <div>
          <div className="text-sm font-semibold capitalize text-foreground">{month.label}</div>
          <div className="text-xs text-muted-foreground">{formatCompactMoneyValue(month.pnl)}</div>
        </div>
        <Badge variant="secondary" className="text-[11px]">{month.activeDays} Tage</Badge>
      </button>

      <div className="mt-2 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((label) => (
          <div key={`${month.monthKey}-${label}`} className="text-center text-[10px] uppercase text-muted-foreground">
            {label}
          </div>
        ))}
        {matrix.flat().map((day, index) => {
          if (!day) {
            return <div key={`${month.monthKey}-empty-${index}`} className="h-7 rounded-md bg-transparent" />;
          }

          return (
            <button
              key={day.dateKey}
              type="button"
              onClick={() => onSelectDay(day.dateKey)}
              className={cn(
                "flex h-6 items-center justify-center rounded-md border text-[10px] transition-colors sm:h-7",
                getDayTone(day),
                isSameDateKey(day.dateKey, selectedDateKey) && "ring-2 ring-primary/70 ring-offset-1 ring-offset-background"
              )}
              title={`${day.date.toLocaleDateString("de-DE")}: ${formatMoneyValue(day.pnl)} bei ${day.trades} Trades`}
            >
              {day.date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CalendarPage() {
  const { displayCurrency, formatMoney, formatCompactMoney, convertMoney } = useCurrencyFormatter();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [focusDate, setFocusDate] = useState(() => new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(() => dateToDateKey(new Date()));
  const [dailyData, setDailyData] = useState<DailyPnL[]>([]);
  const [dayTrades, setDayTrades] = useState<TradeData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDayLoading, setIsDayLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const focusYear = focusDate.getFullYear();

  useEffect(() => {
    let cancelled = false;

    async function loadYearData() {
      try {
        setIsLoading(true);
        const yearStart = new Date(focusYear, 0, 1, 12, 0, 0, 0);
        const yearEnd = new Date(focusYear, 11, 31, 12, 0, 0, 0);
        const data = await CalendarService.getDailyPnL(yearStart, yearEnd);

        if (!cancelled) {
          setDailyData(data);
          setError(null);
        }
      } catch (loadError) {
        console.error("Failed to load calendar data:", loadError);
        if (!cancelled) {
          setError("Kalenderdaten konnten nicht geladen werden.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadYearData();

    return () => {
      cancelled = true;
    };
  }, [focusYear]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedDayTrades() {
      try {
        setIsDayLoading(true);
        const trades = await TradeService.getByMarketDate(dateKeyToDate(selectedDateKey));
        if (!cancelled) {
          setDayTrades(trades);
        }
      } catch (loadError) {
        console.error("Failed to load selected day trades:", loadError);
        if (!cancelled) {
          setDayTrades([]);
        }
      } finally {
        if (!cancelled) {
          setIsDayLoading(false);
        }
      }
    }

    loadSelectedDayTrades();

    return () => {
      cancelled = true;
    };
  }, [selectedDateKey]);

  const convertedDailyData = useMemo(
    () => dailyData.map((entry) => ({ ...entry, pnl: convertMoney(entry.pnl, "USD") })),
    [convertMoney, dailyData]
  );
  const entryMap = useMemo(() => buildDailyPnLMap(convertedDailyData), [convertedDailyData]);
  const monthDays = useMemo(() => getMonthDays(focusDate, entryMap), [focusDate, entryMap]);
  const monthMatrix = useMemo(() => getMonthMatrix(focusDate, entryMap), [focusDate, entryMap]);
  const weekDays = useMemo(() => getWeekDays(focusDate, entryMap), [focusDate, entryMap]);
  const yearMonths = useMemo(() => getYearMonths(focusYear, entryMap), [entryMap, focusYear]);
  const selectedDay = useMemo(() => getCalendarDayData(dateKeyToDate(selectedDateKey), entryMap), [entryMap, selectedDateKey]);

  const visibleDays = useMemo(() => {
    if (viewMode === "week") {
      return weekDays;
    }
    if (viewMode === "year") {
      return yearMonths.flatMap((month) => month.days);
    }
    return monthDays;
  }, [monthDays, viewMode, weekDays, yearMonths]);

  const summary = useMemo(() => summarizeRange(visibleDays), [visibleDays]);

  const selectedDayWins = useMemo(() => dayTrades.filter((trade) => trade.pnl > 0).length, [dayTrades]);
  const selectedDayBestTrade = useMemo(
    () => (dayTrades.length > 0 ? Math.max(...dayTrades.map((trade) => convertMoney(trade.pnl, trade.currency))) : null),
    [convertMoney, dayTrades]
  );
  const selectedDayWorstTrade = useMemo(
    () => (dayTrades.length > 0 ? Math.min(...dayTrades.map((trade) => convertMoney(trade.pnl, trade.currency))) : null),
    [convertMoney, dayTrades]
  );

  const bestMonths = useMemo(() => [...yearMonths].sort((left, right) => right.pnl - left.pnl).slice(0, 3), [yearMonths]);
  const weakestMonths = useMemo(() => [...yearMonths].sort((left, right) => left.pnl - right.pnl).slice(0, 3), [yearMonths]);

  const headerLabel = useMemo(() => {
    if (viewMode === "week") {
      return formatWeekRange(focusDate);
    }
    if (viewMode === "year") {
      return String(focusDate.getFullYear());
    }
    return focusDate.toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    });
  }, [focusDate, viewMode]);

  function updateFocus(nextDate: Date) {
    const normalized = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), 12, 0, 0, 0);
    setFocusDate(normalized);
    setSelectedDateKey(dateToDateKey(normalized));
  }

  function navigate(direction: number) {
    const nextDate = new Date(focusDate);
    if (viewMode === "week") {
      nextDate.setDate(nextDate.getDate() + direction * 7);
    } else if (viewMode === "year") {
      nextDate.setFullYear(nextDate.getFullYear() + direction);
    } else {
      nextDate.setMonth(nextDate.getMonth() + direction);
    }
    updateFocus(nextDate);
  }

  function jumpToToday() {
    updateFocus(new Date());
  }

  function selectDate(dateKey: string) {
    const date = dateKeyToDate(dateKey);
    setSelectedDateKey(dateKey);
    setFocusDate(date);
  }

  function openMonth(monthIndex: number) {
    const nextDate = new Date(focusDate.getFullYear(), monthIndex, 1, 12, 0, 0, 0);
    setViewMode("month");
    updateFocus(nextDate);
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Kalender</h1>
          <p className="text-sm text-muted-foreground">Jahres-, Monats- und Wochenblick auf deine Trading-Performance.</p>
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
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Kalender</h1>
          <p className="text-sm text-muted-foreground">Jahres-, Monats- und Wochenblick auf deine Trading-Performance.</p>
        </div>

        <div className="flex w-full flex-col gap-2 xl:w-auto">
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as CalendarViewMode)} className="w-full xl:w-auto">
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-md border border-border/70 bg-card/60 p-0.5 xl:w-auto">
              <TabsTrigger value="month" className="gap-1.5 rounded-sm">
                <CalendarDays className="h-4 w-4" />
                <span>Monat</span>
              </TabsTrigger>
              <TabsTrigger value="week" className="gap-1.5 rounded-sm">
                <Rows3 className="h-4 w-4" />
                <span>Woche</span>
              </TabsTrigger>
              <TabsTrigger value="year" className="gap-1.5 rounded-sm">
                <Grid2x2 className="h-4 w-4" />
                <span>Jahr</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => navigate(-1)} className="shrink-0">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1 rounded-md border border-border/70 bg-card/60 px-3 py-1.5 text-center text-sm font-medium capitalize xl:min-w-[190px]">
              {headerLabel}
            </div>
            <Button variant="outline" size="icon" onClick={() => navigate(1)} className="shrink-0">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={jumpToToday} className="hidden sm:inline-flex">
              Heute
            </Button>
          </div>
          <Button variant="outline" onClick={jumpToToday} className="w-full sm:hidden">
            Heute
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Periode P&L"
          value={formatMoney(summary.totalPnl, displayCurrency)}
          helper={`${summary.activeDays} aktive Tage`}
          tone={summary.totalPnl > 0 ? "positive" : summary.totalPnl < 0 ? "negative" : "neutral"}
        />
        <SummaryCard
          title="Trades"
          value={String(summary.totalTrades)}
          helper={`${summary.positiveDays} grüne, ${summary.negativeDays} rote Tage`}
        />
        <SummaryCard
          title="Ø aktiver Tag"
          value={formatMoney(summary.avgPnlPerActiveDay, displayCurrency)}
          helper={`${summary.avgTradesPerActiveDay.toFixed(1)} Trades je aktivem Tag`}
          tone={summary.avgPnlPerActiveDay > 0 ? "positive" : summary.avgPnlPerActiveDay < 0 ? "negative" : "neutral"}
        />
        <SummaryCard
          title="Best / Worst"
          value={
            summary.bestDay && summary.worstDay
              ? `${formatCompactMoney(summary.bestDay.pnl, displayCurrency)} / ${formatCompactMoney(summary.worstDay.pnl, displayCurrency)}`
              : "$0 / $0"
          }
          helper={
            summary.bestDay && summary.worstDay
              ? `${summary.bestDay.date.toLocaleDateString("de-DE")} und ${summary.worstDay.date.toLocaleDateString("de-DE")}`
              : "Noch keine aktiven Tage"
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-[300px] w-full" />
              </CardContent>
            </Card>
          ) : viewMode === "month" ? (
            <Card>
              <CardHeader>
                <CardTitle>Monatsansicht</CardTitle>
                <CardDescription>Klicke auf einen Tag für den Drilldown und springe von dort direkt ins Tages-Journal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {WEEKDAY_LABELS.map((day) => (
                    <div key={day} className="text-center text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:text-xs">
                      {day}
                    </div>
                  ))}
                  {monthMatrix.flat().map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} className="aspect-square rounded-lg border border-dashed border-border/40 bg-muted/10" />;
                    }

                    return (
                      <button
                        key={day.dateKey}
                        type="button"
                        onClick={() => selectDate(day.dateKey)}
                        className={cn(
                          "aspect-square rounded-md border p-1.5 text-left transition-colors sm:min-h-[72px] sm:aspect-auto sm:p-2",
                          getDayTone(day),
                          isSameDateKey(day.dateKey, selectedDateKey) && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold sm:text-sm">{day.date.getDate()}</span>
                          <Badge variant="secondary" className="hidden border-0 bg-background/40 text-foreground sm:inline-flex">
                            {day.trades}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-1 sm:hidden">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full",
                              day.isPositive && "bg-emerald-400",
                              day.isNegative && "bg-rose-400",
                              day.isActive && !day.isPositive && !day.isNegative && "bg-amber-400",
                              !day.isActive && "bg-muted-foreground/40"
                            )}
                          />
                          <span className="text-[9px] text-muted-foreground">{day.trades > 0 ? day.trades : ""}</span>
                        </div>
                        <div className="mt-3 hidden line-clamp-1 text-xs font-medium sm:block">
                          {day.isActive ? formatCompactMoney(day.pnl, displayCurrency) : "Kein Trade"}
                        </div>
                        <div className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">
                          {day.isActive ? `${day.trades} Trades` : "Details"}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground sm:hidden">
                  Tippe auf einen Tag, um den Drilldown oben zu aktualisieren.
                </div>
              </CardContent>
            </Card>
          ) : viewMode === "week" ? (
            <Card>
              <CardHeader>
                <CardTitle>Wochenansicht</CardTitle>
                <CardDescription>Schneller Überblick über die sieben Handelstage rund um dein aktuelles Fokusdatum.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-3 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0 lg:grid-cols-4 xl:grid-cols-7">
                  {weekDays.map((day) => (
                    <button
                      key={day.dateKey}
                      type="button"
                      onClick={() => selectDate(day.dateKey)}
                      className={cn(
                        "min-w-[142px] flex-shrink-0 rounded-md border p-2.5 text-left transition-colors md:min-w-0",
                        getDayTone(day),
                        isSameDateKey(day.dateKey, selectedDateKey) && "ring-2 ring-primary/70 ring-offset-2 ring-offset-background"
                      )}
                    >
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                        {day.date.toLocaleDateString("de-DE", { weekday: "short" })}
                      </div>
                      <div className="mt-1 text-lg font-semibold">{day.date.getDate()}</div>
                      <div className="mt-4 text-sm font-medium">{day.isActive ? formatMoney(day.pnl, displayCurrency) : "Kein Trade"}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{day.trades} Trades</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
              <CardHeader>
                <CardTitle>Jahresansicht</CardTitle>
                <CardDescription>Alle Monate in einer Heatmap-Übersicht. Klick auf einen Monat öffnet die Monatsansicht.</CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {yearMonths.map((month) => (
                      <MonthHeatmap
                        key={month.monthKey}
                        month={month}
                        selectedDateKey={selectedDateKey}
                        onSelectMonth={openMonth}
                        onSelectDay={selectDate}
                        entryMap={entryMap}
                        formatMoneyValue={(value) => formatMoney(value, displayCurrency)}
                        formatCompactMoneyValue={(value) => formatCompactMoney(value, displayCurrency)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Stärkste Monate</CardTitle>
                    <CardDescription>Wo du im laufenden Jahr bisher am meisten verdient hast.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {bestMonths.map((month, index) => (
                      <div key={month.monthKey} className="flex items-center justify-between rounded-md border border-border/70 bg-card/60 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold capitalize">{index + 1}. {month.label}</div>
                          <div className="text-xs text-muted-foreground">{month.trades} Trades an {month.activeDays} Tagen</div>
                        </div>
                        <div className="text-right text-emerald-400">{formatMoney(month.pnl, displayCurrency)}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Schwächste Monate</CardTitle>
                    <CardDescription>Die Monate, in denen der Drawdown im Jahresverlauf am sichtbarsten war.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {weakestMonths.map((month, index) => (
                      <div key={month.monthKey} className="flex items-center justify-between rounded-md border border-border/70 bg-card/60 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold capitalize">{index + 1}. {month.label}</div>
                          <div className="text-xs text-muted-foreground">{month.trades} Trades an {month.activeDays} Tagen</div>
                        </div>
                        <div className={cn("text-right", month.pnl < 0 ? "text-rose-400" : "text-foreground")}>
                          {formatMoney(month.pnl, displayCurrency)}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>

        <div className="order-first space-y-3 xl:order-none">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm leading-snug sm:text-base">{selectedDay.date.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</span>
                <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                  <Link href={`/daily?date=${selectedDateKey}`}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Daily
                  </Link>
                </Button>
              </CardTitle>
              <CardDescription>Drilldown für den ausgewählten Handelstag.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Tages-P&L</div>
                  <div className={cn("mt-1 text-lg font-semibold", selectedDay.pnl > 0 && "text-emerald-400", selectedDay.pnl < 0 && "text-rose-400")}>
                    {formatMoney(selectedDay.pnl, displayCurrency)}
                  </div>
                </div>
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Trades / Win Rate</div>
                  <div className="mt-1 text-lg font-semibold">{selectedDay.trades}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {selectedDay.trades > 0 ? formatCompactMoney(selectedDay.pnl / Math.max(selectedDay.trades, 1), displayCurrency) : formatMoney(0, displayCurrency)} je Trade
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Bester Trade
                  </div>
                  <div className="mt-1 text-base font-semibold text-emerald-400">
                    {selectedDayBestTrade !== null ? formatMoney(selectedDayBestTrade, displayCurrency) : "Keine Trades"}
                  </div>
                </div>
                <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    <TrendingDown className="h-3.5 w-3.5" />
                    Schlechtester Trade
                  </div>
                  <div className="mt-1 text-base font-semibold text-rose-400">
                    {selectedDayWorstTrade !== null ? formatMoney(selectedDayWorstTrade, displayCurrency) : "Keine Trades"}
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                {dayTrades.length > 0
                  ? `${selectedDayWins} von ${dayTrades.length} Trades im Gewinn.`
                  : "Für diesen Tag sind aktuell keine Trades hinterlegt."}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tagesliste</CardTitle>
              <CardDescription>Die einzelnen Trades des gewählten Tages in chronologischer Übersicht.</CardDescription>
            </CardHeader>
            <CardContent>
              {isDayLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((item) => (
                    <Skeleton key={item} className="h-16 w-full" />
                  ))}
                </div>
              ) : dayTrades.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
                  Keine Trades für diesen Tag.
                </div>
              ) : (
                <ScrollArea className="h-[300px] pr-3 sm:h-[340px]">
                  <div className="space-y-2">
                    {dayTrades.map((trade) => (
                      <div key={trade.id} className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold">{trade.symbol}</span>
                              <Badge variant={trade.side === "long" ? "default" : "secondary"}>{trade.side.toUpperCase()}</Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {new Date(trade.entryTime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} -{" "}
                              {new Date(trade.exitTime).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                            {trade.setup ? <div className="mt-2 text-xs text-muted-foreground">Setup: {trade.setup}</div> : null}
                          </div>
                          <div className="text-right">
                            <div className={cn("text-sm font-semibold", trade.pnl > 0 && "text-emerald-400", trade.pnl < 0 && "text-rose-400")}>
                              {formatMoney(trade.pnl, trade.currency)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {formatMoney(trade.entryPrice, trade.currency)} - {formatMoney(trade.exitPrice, trade.currency)}
                            </div>
                          </div>
                        </div>
                        {trade.notes ? (
                          <div className="mt-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5 text-xs text-muted-foreground">
                            {trade.notes}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Legende</CardTitle>
              <CardDescription>So liest du die Heatmap.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-emerald-500/20" />
                <span>Gewinn-Tag</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-rose-500/20" />
                <span>Verlust-Tag</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded bg-muted/30" />
                <span>Kein Trade</span>
              </div>
              <div className="rounded-md border border-border/70 bg-card/60 px-3 py-2">
                <div className="flex items-center gap-2 text-foreground">
                  <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                  <span>Monats- und Wochennavigation hält Fokus und Drilldown synchron.</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-foreground">
                  <ArrowDownRight className="h-4 w-4 text-rose-400" />
                  <span>Jahresansicht bringt dich mit einem Klick zurück in die Monatsdetails.</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
