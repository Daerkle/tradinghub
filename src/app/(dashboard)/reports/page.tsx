"use client";

import { useState, useEffect } from "react";
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
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
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

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const COLORS = ["#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Detaillierte Analyse deiner Trading-Performance
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance Score</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.performanceScore || 0}</div>
            <Progress value={stats?.performanceScore || 0} className="mt-2" />
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
            <div className={`text-2xl font-bold ${(stats?.expectancy || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatCurrency(stats?.expectancy || 0)}
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
            <div className={`text-2xl font-bold ${(stats?.profitFactor || 0) >= 1 ? "text-green-600" : "text-red-600"}`}>
              {(stats?.profitFactor || 0).toFixed(2)}
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
            <div className="text-2xl font-bold">{formatPercent(stats?.consistency || 0)}</div>
            <Progress value={stats?.consistency || 0} className="mt-2" />
            <p className="text-xs text-muted-foreground">
              Profitable Tage
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Extended Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">R-Multiple</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats?.avgRMultiple || 0).toFixed(2)}R</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              -{formatPercent(stats?.maxDrawdown || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Streak</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.winStreak || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Loss Streak</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.lossStreak || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for different reports */}
      <Tabs defaultValue="time" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="time">
            <Clock className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Zeit</span>
          </TabsTrigger>
          <TabsTrigger value="symbols">
            <BarChart3 className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Symbole</span>
          </TabsTrigger>
          <TabsTrigger value="setups">
            <Target className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Setups</span>
          </TabsTrigger>
          <TabsTrigger value="distribution">
            <PieChart className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Verteilung</span>
          </TabsTrigger>
        </TabsList>

        {/* Time Analysis Tab */}
        <TabsContent value="time" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
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
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceByHour}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => `${label}:00 Uhr`}
                      />
                      <Bar
                        dataKey="pnl"
                        fill="#3b82f6"
                        radius={[4, 4, 0, 0]}
                      />
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
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceByDay}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="dayName" />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar
                        dataKey="pnl"
                        fill="#22c55e"
                        radius={[4, 4, 0, 0]}
                      />
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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyPerformance}>
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
                  {performanceByHour.map((hour) => (
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Symbols Tab */}
        <TabsContent value="symbols" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Symbole nach P&L</CardTitle>
                <CardDescription>Deine profitabelsten Instrumente</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceBySymbol.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="symbol" type="category" width={80} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="pnl" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Long vs Short</CardTitle>
                <CardDescription>Performance nach Handelsrichtung</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={performanceBySide}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="trades"
                        nameKey="side"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {performanceBySide.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 space-y-2">
                  {performanceBySide.map((side, index) => (
                    <div key={side.side} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index] }}
                        />
                        <span>{side.side}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">{side.trades} Trades</Badge>
                        <Badge variant={side.winRate >= 50 ? "default" : "secondary"}>
                          {formatPercent(side.winRate)}
                        </Badge>
                        <span className={side.pnl >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(side.pnl)}
                        </span>
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
                  {performanceBySymbol.map((symbol) => (
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Setups Tab */}
        <TabsContent value="setups" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Setup Performance</CardTitle>
                <CardDescription>Welche Setups funktionieren am besten?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceBySetup.slice(0, 10)} layout="vertical">
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
                <div className="space-y-4">
                  {performanceBySetup.slice(0, 5).map((setup) => (
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
                  {performanceBySetup.map((setup) => (
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>P&L Verteilung</CardTitle>
                <CardDescription>Wie sind deine Trades verteilt?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
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
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Sharpe Ratio</span>
                    <span className="font-bold">{(stats?.sharpeRatio || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Risk/Reward</span>
                    <span className="font-bold">{(stats?.riskReward || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Avg Hold Time</span>
                    <span className="font-bold">{Math.round(stats?.avgHoldTime || 0)} min</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Best Trade</span>
                    <span className="font-bold text-green-600">{formatCurrency(stats?.bestTrade || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Worst Trade</span>
                    <span className="font-bold text-red-600">{formatCurrency(stats?.worstTrade || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Avg Win</span>
                    <span className="font-bold text-green-600">{formatCurrency(stats?.avgWin || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <span>Avg Loss</span>
                    <span className="font-bold text-red-600">-{formatCurrency(stats?.avgLoss || 0)}</span>
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
