"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Clock,
  Calendar,
  TrendingUp,
  TrendingDown,
  Target,
  Percent,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  Activity,
  Download,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import {
  TradeService,
  ReportService,
  PerformanceByDay,
  PerformanceBySymbol,
  PerformanceBySetup,
  PerformanceByHour,
  DashboardStats,
} from "@/lib/models";
import { exportTradingReportPdf } from "@/lib/report-export";
import { toast } from "sonner";
import { useCurrencyFormatter } from "@/hooks/use-currency-formatter";

export default function ReportsPage() {
  const { displayCurrency, formatMoney, formatCompactMoney, convertMoney } = useCurrencyFormatter();
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [performanceByDay, setPerformanceByDay] = useState<PerformanceByDay[]>([]);
  const [performanceByHour, setPerformanceByHour] = useState<PerformanceByHour[]>([]);
  const [performanceBySymbol, setPerformanceBySymbol] = useState<PerformanceBySymbol[]>([]);
  const [performanceBySetup, setPerformanceBySetup] = useState<PerformanceBySetup[]>([]);
  const [performanceBySide, setPerformanceBySide] = useState<{ side: string; pnl: number; trades: number; winRate: number }[]>([]);
  const [monthlyPerformance, setMonthlyPerformance] = useState<{ month: string; pnl: number; trades: number; winRate: number }[]>([]);
  const [winLossDistribution, setWinLossDistribution] = useState<{ range: string; count: number }[]>([]);

  useEffect(() => {
    async function loadData() {
      try {
        const [
          statsData,
          dayData,
          hourData,
          symbolData,
          setupData,
          sideData,
          monthlyData,
          distributionData,
        ] = await Promise.all([
          TradeService.getStats(),
          TradeService.getPerformanceByDay(),
          ReportService.getPerformanceByHour(),
          TradeService.getPerformanceBySymbol(),
          TradeService.getPerformanceBySetup(),
          ReportService.getPerformanceBySide(),
          ReportService.getMonthlyPerformance(),
          ReportService.getWinLossDistribution(),
        ]);

        setStats(statsData);
        setPerformanceByDay(dayData);
        setPerformanceByHour(hourData);
        setPerformanceBySymbol(symbolData);
        setPerformanceBySetup(setupData);
        setPerformanceBySide(sideData);
        setMonthlyPerformance(monthlyData);
        setWinLossDistribution(distributionData);
      } catch (error) {
        console.error("Error loading report data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };
  const formatCurrency = (value: number) => formatMoney(value, displayCurrency);
  const formatCompactCurrency = (value: number) => formatCompactMoney(value, displayCurrency);

  const displayStats = useMemo(
    () =>
      stats
        ? {
            ...stats,
            totalPnl: convertMoney(stats.totalPnl, "USD"),
            avgWin: convertMoney(stats.avgWin, "USD"),
            avgLoss: convertMoney(stats.avgLoss, "USD"),
            bestTrade: convertMoney(stats.bestTrade, "USD"),
            worstTrade: convertMoney(stats.worstTrade, "USD"),
            expectancy: convertMoney(stats.expectancy, "USD"),
          }
        : null,
    [convertMoney, stats]
  );

  const displayPerformanceByDay = useMemo(
    () => performanceByDay.map((entry) => ({ ...entry, pnl: convertMoney(entry.pnl, "USD") })),
    [convertMoney, performanceByDay]
  );
  const displayPerformanceByHour = useMemo(
    () => performanceByHour.map((entry) => ({ ...entry, pnl: convertMoney(entry.pnl, "USD") })),
    [convertMoney, performanceByHour]
  );
  const displayPerformanceBySymbol = useMemo(
    () => performanceBySymbol.map((entry) => ({
      ...entry,
      pnl: convertMoney(entry.pnl, "USD"),
      avgPnl: convertMoney(entry.avgPnl, "USD"),
    })),
    [convertMoney, performanceBySymbol]
  );
  const displayPerformanceBySetup = useMemo(
    () => performanceBySetup.map((entry) => ({
      ...entry,
      pnl: convertMoney(entry.pnl, "USD"),
      avgPnl: convertMoney(entry.avgPnl, "USD"),
    })),
    [convertMoney, performanceBySetup]
  );
  const displayPerformanceBySide = useMemo(
    () => performanceBySide.map((entry) => ({ ...entry, pnl: convertMoney(entry.pnl, "USD") })),
    [convertMoney, performanceBySide]
  );
  const displayMonthlyPerformance = useMemo(
    () => monthlyPerformance.map((entry) => ({ ...entry, pnl: convertMoney(entry.pnl, "USD") })),
    [convertMoney, monthlyPerformance]
  );

  const handleExportPdf = async () => {
    if (loading) {
      return;
    }

    try {
      setIsExporting(true);
      await exportTradingReportPdf({
        stats: displayStats,
        performanceByDay: displayPerformanceByDay,
        performanceByHour: displayPerformanceByHour,
        performanceBySymbol: displayPerformanceBySymbol,
        performanceBySetup: displayPerformanceBySetup,
        performanceBySide: displayPerformanceBySide,
        monthlyPerformance: displayMonthlyPerformance,
        winLossDistribution,
        displayCurrency,
      });
      toast.success("PDF-Report wurde erstellt");
    } catch (error) {
      console.error("Failed to export PDF report:", error);
      toast.error("PDF-Report konnte nicht erstellt werden");
    } finally {
      setIsExporting(false);
    }
  };

  const sortedSymbols = [...displayPerformanceBySymbol].sort((a, b) => b.pnl - a.pnl);
  const topSymbols = sortedSymbols.slice(0, 8);
  const bestSymbol = topSymbols[0] ?? null;
  const mostTradedSymbol = [...displayPerformanceBySymbol].sort((a, b) => b.trades - a.trades)[0] ?? null;
  const profitableSymbolCount = displayPerformanceBySymbol.filter((symbol) => symbol.pnl > 0).length;
  const profitableSymbolRate = displayPerformanceBySymbol.length > 0
    ? (profitableSymbolCount / displayPerformanceBySymbol.length) * 100
    : 0;
  const averageSymbolWinRate = displayPerformanceBySymbol.length > 0
    ? displayPerformanceBySymbol.reduce((sum, symbol) => sum + symbol.winRate, 0) / displayPerformanceBySymbol.length
    : 0;
  const longSide = displayPerformanceBySide.find((entry) => entry.side.toLowerCase() === "long") ?? null;
  const shortSide = displayPerformanceBySide.find((entry) => entry.side.toLowerCase() === "short") ?? null;

  const renderSymbolTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload?: PerformanceBySymbol }> }) => {
    const symbol = payload?.[0]?.payload;
    if (!active || !symbol) return null;

    return (
      <div className="min-w-[220px] rounded-md border border-white/10 bg-neutral-950/95 p-3 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Symbol</div>
            <div className="mt-1 text-lg font-semibold text-foreground">{symbol.symbol}</div>
          </div>
          <Badge variant={symbol.winRate >= 50 ? "default" : "secondary"}>
            {formatPercent(symbol.winRate)} Win Rate
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total P&amp;L</div>
            <div className={`mt-1 font-semibold ${symbol.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatCurrency(symbol.pnl)}
            </div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ø pro Trade</div>
            <div className={`mt-1 font-semibold ${symbol.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {formatCurrency(symbol.avgPnl)}
            </div>
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{symbol.trades} Trades insgesamt</div>
      </div>
    );
  };

  const renderPnlTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value?: number; payload?: { trades?: number; winRate?: number } }>;
    label?: string | number;
  }) => {
    const point = payload?.[0];
    const value = typeof point?.value === "number" ? point.value : null;
    if (!active || value === null) return null;

    return (
      <div className="min-w-[220px] rounded-md border border-white/10 bg-neutral-950/95 p-3 text-sm shadow-2xl backdrop-blur">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Zeitraum</div>
        <div className="mt-1 text-base font-semibold text-foreground">{String(label)}</div>
        <div className={`mt-2 text-lg font-semibold ${value >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {formatCurrency(value)}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Trades</div>
            <div className="mt-1 font-medium text-foreground">{point?.payload?.trades ?? "-"}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Win Rate</div>
            <div className="mt-1 font-medium text-foreground">
              {typeof point?.payload?.winRate === "number" ? formatPercent(point.payload.winRate) : "-"}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Reports</h1>
          <p className="text-muted-foreground">
            Detaillierte Analyse deiner Trading-Performance
          </p>
        </div>
        <Button onClick={handleExportPdf} disabled={loading || isExporting} className="w-full sm:w-auto">
          {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          PDF exportieren
        </Button>
      </div>

      <Card className="hidden md:flex">
        <CardHeader>
          <CardTitle>Was dir diese Seite bringt</CardTitle>
          <CardDescription>
            Reports sollen keine schöne Statistik sein, sondern dir zeigen, wo du wirklich Geld verdienst und wo du dir
            selbst im Weg stehst.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Zeit</div>
            <div className="mt-2 font-medium">Wann handelst du gut und wann eher schlecht?</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Nutze das, um schwache Stunden oder Wochentage bewusst zu meiden.
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Symbole</div>
            <div className="mt-2 font-medium">Welche Namen bringen dir wirklich P&amp;L?</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Gut für Watchlist-Fokus und um Zeitfresser mit schwacher Performance zu erkennen.
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Setups</div>
            <div className="mt-2 font-medium">Welche Muster haben echten Edge und welche nur Aktivität?</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Hier siehst du, was du ausbauen und was du eher streichen solltest.
            </div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-sm text-muted-foreground">Verteilung</div>
            <div className="mt-2 font-medium">Sind deine Gewinne stabil oder kommen sie von wenigen Ausreißern?</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Das hilft bei der Frage, ob dein Trading reproduzierbar ist oder noch zu zufällig wirkt.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-xl">{displayStats?.performanceScore || 0}</div>
            <Progress value={displayStats?.performanceScore || 0} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              Composite Trading Score
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expectancy</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-lg font-bold sm:text-xl ${(displayStats?.expectancy || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(displayStats?.expectancy || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Durchschnittlicher Gewinn pro Trade
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-lg font-bold sm:text-xl ${(displayStats?.profitFactor || 0) >= 1 ? "text-green-600" : "text-red-600"}`}>
              {(displayStats?.profitFactor || 0).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Bruttoprofit / Bruttoverlust
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Konsistenz</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-xl">{formatPercent(displayStats?.consistency || 0)}</div>
            <Progress value={displayStats?.consistency || 0} className="mt-2" />
            <p className="text-xs text-muted-foreground">
              Profitable Tage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Extended Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">R-Multiple</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold sm:text-xl">{(displayStats?.avgRMultiple || 0).toFixed(2)}R</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600 sm:text-2xl">
              -{formatPercent(displayStats?.maxDrawdown || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Streak</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-green-600 sm:text-2xl">{displayStats?.winStreak || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Loss Streak</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600 sm:text-2xl">{displayStats?.lossStreak || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different reports */}
      <Tabs defaultValue="time" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-md border border-white/10 bg-white/[0.03] p-1.5 sm:grid-cols-4">
          <TabsTrigger
            value="time"
            className="min-h-11 flex-col gap-1 rounded-md px-3 py-2 text-xs font-semibold data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:h-12 sm:flex-row sm:text-sm"
          >
            <Clock className="h-4 w-4 sm:mr-1.5" />
            <span>Zeit</span>
          </TabsTrigger>
          <TabsTrigger
            value="symbols"
            className="min-h-11 flex-col gap-1 rounded-md px-3 py-2 text-xs font-semibold data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:h-12 sm:flex-row sm:text-sm"
          >
            <BarChart3 className="h-4 w-4 sm:mr-1.5" />
            <span>Symbole</span>
          </TabsTrigger>
          <TabsTrigger
            value="setups"
            className="min-h-11 flex-col gap-1 rounded-md px-3 py-2 text-xs font-semibold data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:h-12 sm:flex-row sm:text-sm"
          >
            <Target className="h-4 w-4 sm:mr-1.5" />
            <span>Setups</span>
          </TabsTrigger>
          <TabsTrigger
            value="distribution"
            className="min-h-11 flex-col gap-1 rounded-md px-3 py-2 text-xs font-semibold data-[state=active]:bg-white/[0.08] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] sm:h-12 sm:flex-row sm:text-sm"
          >
            <PieChart className="h-4 w-4 sm:mr-1.5" />
            <span>Verteilung</span>
          </TabsTrigger>
        </TabsList>

        {/* Time Analysis Tab */}
        <TabsContent value="time" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {/* Performance by Hour */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Performance nach Uhrzeit
                </CardTitle>
                <CardDescription>
                  Deine besten und schlechtesten Trading-Stunden
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[180px] sm:h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayPerformanceByHour} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(1 0 0 / 0.08)"
                        horizontal={false}
                      />
                      <XAxis
                        dataKey="hour"
                        tickFormatter={(h) => `${h}:00`}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        content={({ active, payload, label }) =>
                          renderPnlTooltip({
                            active,
                            payload: payload as Array<{ value?: number; payload?: { trades?: number; winRate?: number } }> | undefined,
                            label: `${label}:00 Uhr`,
                          })
                        }
                      />
                      <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                        {displayPerformanceByHour.map((entry) => (
                          <Cell
                            key={`hour-bar-${entry.hour}`}
                            fill={entry.pnl >= 0 ? "oklch(0.66 0.19 257)" : "oklch(0.63 0.23 20)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Performance by Day */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Performance nach Wochentag
                </CardTitle>
                <CardDescription>
                  Welche Tage sind am profitabelsten?
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[180px] sm:h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayPerformanceByDay} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(1 0 0 / 0.08)"
                        horizontal={false}
                      />
                      <XAxis dataKey="dayName" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        content={({ active, payload, label }) =>
                          renderPnlTooltip({
                            active,
                            payload: payload as Array<{ value?: number; payload?: { trades?: number; winRate?: number } }> | undefined,
                            label,
                          })
                        }
                      />
                      <Bar dataKey="pnl" radius={[6, 6, 0, 0]}>
                        {displayPerformanceByDay.map((entry) => (
                          <Cell
                            key={`day-bar-${entry.dayName}`}
                            fill={entry.pnl >= 0 ? "oklch(0.66 0.18 150)" : "oklch(0.63 0.23 20)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Monthly Performance */}
          <Card>
            <CardHeader>
              <CardTitle>Monatliche Performance</CardTitle>
              <CardDescription>Entwicklung über die Monate</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[180px] sm:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayMonthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="pnl"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      name="P&L"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Time Stats Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detaillierte Zeit-Statistiken</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:hidden">
                {displayPerformanceByHour.map((hour) => (
                  <div key={hour.hour} className="rounded-md border border-border/70 bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{hour.hour}:00 - {hour.hour}:59</div>
                        <div className="mt-1 text-sm text-muted-foreground">{hour.trades} Trades</div>
                      </div>
                      <div className={`text-right font-semibold ${hour.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(hour.pnl)}
                      </div>
                    </div>
                    <div className="mt-3">
                      <Badge variant={hour.winRate >= 50 ? "default" : "secondary"}>
                        {formatPercent(hour.winRate)} Win Rate
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stunde</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayPerformanceByHour.map((hour) => (
                      <TableRow key={hour.hour}>
                        <TableCell className="font-medium">{hour.hour}:00 - {hour.hour}:59</TableCell>
                        <TableCell className="text-right">{hour.trades}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={hour.winRate >= 50 ? "default" : "secondary"}>
                            {formatPercent(hour.winRate)}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${hour.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCurrency(hour.pnl)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Symbols Tab */}
        <TabsContent value="symbols" className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <Card className="border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent">
              <CardHeader className="gap-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <CardTitle>Top Symbole nach P&amp;L</CardTitle>
                    <CardDescription>Ranking nach Gesamt-P&amp;L, ergänzt um Win Rate und Ø Trade.</CardDescription>
                  </div>
                <div className="grid gap-2 sm:grid-cols-3">
                    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Bestes Symbol</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {bestSymbol ? `${bestSymbol.symbol} ${formatCompactCurrency(bestSymbol.pnl)}` : "Keine Daten"}
                      </div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ø Win Rate</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">{formatPercent(averageSymbolWinRate)}</div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Profitabel</div>
                      <div className="mt-1 text-sm font-semibold text-foreground">
                        {profitableSymbolCount}/{displayPerformanceBySymbol.length} ({formatPercent(profitableSymbolRate)})
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-[190px] sm:h-[230px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topSymbols}
                      layout="vertical"
                      margin={{ top: 8, right: 18, left: 0, bottom: 8 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(1 0 0 / 0.08)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(value: number) => formatCompactCurrency(value)}
                        domain={[
                          (dataMin: number) => Math.min(0, Math.floor(dataMin * 1.1)),
                          (dataMax: number) => Math.max(0, Math.ceil(dataMax * 1.08)),
                        ]}
                      />
                      <YAxis
                        dataKey="symbol"
                        type="category"
                        width={56}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={renderSymbolTooltip} />
                      <Bar dataKey="pnl" radius={[0, 8, 8, 0]} barSize={26}>
                        {topSymbols.map((entry) => (
                          <Cell
                            key={`symbol-bar-${entry.symbol}`}
                            fill={entry.pnl >= 0 ? "oklch(0.66 0.19 257)" : "oklch(0.63 0.23 20)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-muted-foreground">
                  Hover zeigt dir jetzt Gesamt-P&amp;L, Ø Trade, Win Rate und Anzahl Trades je Symbol.
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-gradient-to-b from-white/[0.03] to-transparent">
              <CardHeader>
                <CardTitle>Symbol-Schnellcheck</CardTitle>
                <CardDescription>Die wichtigsten Instrumente mit sofort lesbaren Kennzahlen.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Meistgehandelt</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">
                      {mostTradedSymbol ? mostTradedSymbol.symbol : "Keine Daten"}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {mostTradedSymbol ? `${mostTradedSymbol.trades} Trades` : "Noch keine Symbolstatistik"}
                    </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2.5">
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Long vs. Short</div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <div>
                        <div className="font-medium text-foreground">Long</div>
                        <div className={longSide && longSide.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {formatCurrency(longSide?.pnl ?? 0)}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-foreground">Short</div>
                        <div className={shortSide && shortSide.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {formatCurrency(shortSide?.pnl ?? 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {topSymbols.slice(0, 6).map((symbol, index) => (
                    <div
                      key={symbol.symbol}
                      className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="h-6 min-w-6 justify-center rounded-full px-2 text-[11px]">
                            {index + 1}
                          </Badge>
                          <span className="font-semibold text-foreground">{symbol.symbol}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {symbol.trades} Trades · Ø {formatCurrency(symbol.avgPnl)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-semibold ${symbol.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {formatCurrency(symbol.pnl)}
                        </div>
                        <div className="mt-1">
                          <Badge variant={symbol.winRate >= 50 ? "default" : "secondary"}>
                            {formatPercent(symbol.winRate)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Symbol Table */}
          <Card>
            <CardHeader>
              <CardTitle>Alle Symbole</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:hidden">
                {displayPerformanceBySymbol.map((symbol) => (
                  <div key={symbol.symbol} className="rounded-md border border-border/70 bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{symbol.symbol}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{symbol.trades} Trades</div>
                      </div>
                      <div className={`text-right font-semibold ${symbol.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(symbol.pnl)}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant={symbol.winRate >= 50 ? "default" : "secondary"}>
                        {formatPercent(symbol.winRate)}
                      </Badge>
                      <span className={`text-sm ${symbol.avgPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        Ø {formatCurrency(symbol.avgPnl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                    <TableHead className="text-right">Avg P&L</TableHead>
                    <TableHead className="text-right">Total P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPerformanceBySymbol.map((symbol) => (
                    <TableRow key={symbol.symbol}>
                      <TableCell className="font-medium">{symbol.symbol}</TableCell>
                      <TableCell className="text-right">{symbol.trades}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={symbol.winRate >= 50 ? "default" : "secondary"}>
                          {formatPercent(symbol.winRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right ${symbol.avgPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(symbol.avgPnl)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${symbol.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(symbol.pnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Setups Tab */}
        <TabsContent value="setups" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Setup Performance</CardTitle>
                <CardDescription>Welche Setups funktionieren am besten?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[180px] sm:h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayPerformanceBySetup.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="setup" type="category" width={100} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="pnl" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Setup Win Rates</CardTitle>
                <CardDescription>Erfolgsquote pro Setup</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {displayPerformanceBySetup.slice(0, 5).map((setup) => (
                    <div key={setup.setup} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{setup.setup}</span>
                        <Badge variant={setup.winRate >= 50 ? "default" : "secondary"}>
                          {formatPercent(setup.winRate)}
                        </Badge>
                      </div>
                      <Progress value={setup.winRate} />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>{setup.trades} Trades</span>
                        <span className={setup.pnl >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(setup.pnl)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Setup Table */}
          <Card>
            <CardHeader>
              <CardTitle>Alle Setups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:hidden">
                {displayPerformanceBySetup.map((setup) => (
                  <div key={setup.setup} className="rounded-md border border-border/70 bg-card/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{setup.setup}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{setup.trades} Trades</div>
                      </div>
                      <div className={`text-right font-semibold ${setup.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(setup.pnl)}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant={setup.winRate >= 50 ? "default" : "secondary"}>
                        {formatPercent(setup.winRate)}
                      </Badge>
                      <span className={`text-sm ${setup.avgPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        Ø {formatCurrency(setup.avgPnl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setup</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">Win Rate</TableHead>
                    <TableHead className="text-right">Avg P&L</TableHead>
                    <TableHead className="text-right">Total P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPerformanceBySetup.map((setup) => (
                    <TableRow key={setup.setup}>
                      <TableCell className="font-medium">{setup.setup}</TableCell>
                      <TableCell className="text-right">{setup.trades}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={setup.winRate >= 50 ? "default" : "secondary"}>
                          {formatPercent(setup.winRate)}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right ${setup.avgPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(setup.avgPnl)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${setup.pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(setup.pnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>P&L Verteilung</CardTitle>
                <CardDescription>Wie sind deine Trades verteilt?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[180px] sm:h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={winLossDistribution}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Metrics</CardTitle>
                <CardDescription>Wichtige Trading-Kennzahlen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Sharpe Ratio</span>
                    <span className="font-bold">{(displayStats?.sharpeRatio || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Risk/Reward</span>
                    <span className="font-bold">{(displayStats?.riskReward || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Avg Hold Time</span>
                    <span className="font-bold">{Math.round(displayStats?.avgHoldTime || 0)} min</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Best Trade</span>
                    <span className="font-bold text-green-600">{formatCurrency(displayStats?.bestTrade || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Worst Trade</span>
                    <span className="font-bold text-red-600">{formatCurrency(displayStats?.worstTrade || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Avg Win</span>
                    <span className="font-bold text-green-600">{formatCurrency(displayStats?.avgWin || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-muted rounded-md">
                    <span>Avg Loss</span>
                    <span className="font-bold text-red-600">{formatCurrency(displayStats?.avgLoss || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
