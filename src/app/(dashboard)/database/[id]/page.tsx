"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SetupChart } from "@/components/database/setup-chart";
import {
  ArrowLeft,
  RefreshCw,
  Trophy,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Zap,
  Flag,
  Target,
  Calendar,
  DollarSign,
  BarChart3,
  Newspaper,
  ExternalLink,
} from "lucide-react";

interface Setup {
  id: string;
  symbol: string;
  setupType: string;
  setupDate: string;
  catalystType: string | null;
  gapPercent: string | null;
  volumeRatio: string | null;
  epsSurprisePercent: string | null;
  outcome: string | null;
  maxGainPercent: string | null;
  entryPrice: string | null;
  stopPrice: string | null;
  stoppedOut: boolean | null;
  consolidationDays: number | null;
  consolidationRange: string | null;
  priorRunPercent: string | null;
  notes: string | null;
  tags: string[] | null;
}

interface ChartData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Earnings {
  id: number;
  symbol: string;
  date: string;
  epsActual: string | null;
  epsEstimated: string | null;
  epsSurprisePercent: string | null;
  revenueActual: number | null;
  revenueEstimated: number | null;
}

interface News {
  id: number;
  symbol: string;
  publishedDate: string;
  title: string;
  content: string | null;
  url: string | null;
  source: string | null;
}

const SETUP_TYPE_INFO: Record<string, { label: string; icon: React.ReactNode; color: string; description: string }> = {
  EP: {
    label: "Episodic Pivot",
    icon: <Zap className="h-5 w-5" />,
    color: "bg-yellow-500",
    description: "Gap >5% auf News/Earnings mit hohem Volumen",
  },
  PowerEarningsGap: {
    label: "Power Earnings Gap",
    icon: <TrendingUp className="h-5 w-5" />,
    color: "bg-green-500",
    description: "Gap >10% nach Earnings mit positivem Surprise",
  },
  Flag: {
    label: "Flag",
    icon: <Flag className="h-5 w-5" />,
    color: "bg-blue-500",
    description: "3-8 Wochen Konsolidierung nahe 52W-Hoch",
  },
  HighTightFlag: {
    label: "High Tight Flag",
    icon: <Target className="h-5 w-5" />,
    color: "bg-purple-500",
    description: "100%+ Run gefolgt von 10-25% Korrektur",
  },
};

export default function SetupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [chartData, setChartData] = useState<{
    daily: ChartData[];
    hourly: ChartData[];
    fiveMin: ChartData[];
  }>({ daily: [], hourly: [], fiveMin: [] });
  const [earningsData, setEarningsData] = useState<Earnings | null>(null);
  const [news, setNews] = useState<News[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/database/setups/${id}`);
        if (response.ok) {
          const data = await response.json();
          setSetup(data.setup);
          setChartData(data.chartData);
          setEarningsData(data.earnings);
          setNews(data.news);
        }
      } catch (error) {
        console.error("Error fetching setup:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-muted-foreground">Setup nicht gefunden</p>
      </div>
    );
  }

  const typeInfo = SETUP_TYPE_INFO[setup.setupType] || {
    label: setup.setupType,
    icon: <BarChart3 className="h-5 w-5" />,
    color: "bg-gray-500",
    description: "",
  };

  const getOutcomeBadge = () => {
    if (setup.outcome === "winner") {
      return (
        <Badge className="bg-green-500 text-lg px-3 py-1">
          <Trophy className="h-4 w-4 mr-2" />
          Winner
        </Badge>
      );
    }
    if (setup.outcome === "loser") {
      return (
        <Badge variant="destructive" className="text-lg px-3 py-1">
          {setup.stoppedOut ? <XCircle className="h-4 w-4 mr-2" /> : <TrendingDown className="h-4 w-4 mr-2" />}
          {setup.stoppedOut ? "Stopped Out" : "Loser"}
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-lg px-3 py-1">
        <Clock className="h-4 w-4 mr-2" />
        Pending
      </Badge>
    );
  };

  const formatCurrency = (value: string | null) => {
    if (!value) return "-";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const formatPercent = (value: string | null) => {
    if (!value) return "-";
    const num = parseFloat(value);
    const formatted = num.toFixed(1) + "%";
    if (num > 0) return <span className="text-green-500">+{formatted}</span>;
    if (num < 0) return <span className="text-red-500">{formatted}</span>;
    return formatted;
  };

  const formatLargeNumber = (value: number | null) => {
    if (!value) return "-";
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold tracking-tight">{setup.symbol}</h1>
            <Badge variant="outline" className="text-lg gap-2 px-3 py-1">
              <span className={`w-3 h-3 rounded-full ${typeInfo.color}`} />
              {typeInfo.label}
            </Badge>
            {getOutcomeBadge()}
          </div>
          <p className="text-muted-foreground">{typeInfo.description}</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart - 2 columns */}
        <div className="lg:col-span-2">
          <SetupChart
            symbol={setup.symbol}
            setupDate={setup.setupDate}
            daily={chartData.daily}
            hourly={chartData.hourly}
            fiveMin={chartData.fiveMin}
            entryPrice={setup.entryPrice ? parseFloat(setup.entryPrice) : undefined}
            stopPrice={setup.stopPrice ? parseFloat(setup.stopPrice) : undefined}
          />
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Setup Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Setup Metriken
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Datum</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(setup.setupDate).toLocaleDateString("de-DE")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Catalyst</p>
                  <Badge variant="secondary" className="capitalize">
                    {setup.catalystType || "-"}
                  </Badge>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Gap</p>
                  <p className="text-lg font-semibold">{formatPercent(setup.gapPercent)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vol Ratio</p>
                  <p className="text-lg font-semibold">
                    {setup.volumeRatio ? `${parseFloat(setup.volumeRatio).toFixed(1)}x` : "-"}
                  </p>
                </div>
              </div>

              {setup.consolidationDays && (
                <>
                  <Separator />
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Konsol. Tage</p>
                      <p className="text-lg font-semibold">{setup.consolidationDays}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Prior Run</p>
                      <p className="text-lg font-semibold">{formatPercent(setup.priorRunPercent)}</p>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Entry</p>
                  <p className="text-lg font-semibold">{formatCurrency(setup.entryPrice)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Stop</p>
                  <p className="text-lg font-semibold text-red-500">{formatCurrency(setup.stopPrice)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Max Gain</p>
                <p className="text-2xl font-bold">{formatPercent(setup.maxGainPercent)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Earnings Info */}
          {earningsData && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Earnings
                </CardTitle>
                <CardDescription>
                  {new Date(earningsData.date).toLocaleDateString("de-DE")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">EPS Actual</p>
                    <p className="font-semibold">
                      {earningsData.epsActual ? `$${parseFloat(earningsData.epsActual).toFixed(2)}` : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">EPS Est.</p>
                    <p className="font-semibold">
                      {earningsData.epsEstimated ? `$${parseFloat(earningsData.epsEstimated).toFixed(2)}` : "-"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">EPS Surprise</p>
                  <p className="text-xl font-bold">{formatPercent(earningsData.epsSurprisePercent)}</p>
                </div>
                {earningsData.revenueActual && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Revenue</p>
                      <p className="font-semibold">{formatLargeNumber(earningsData.revenueActual)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Est.</p>
                      <p className="font-semibold">{formatLargeNumber(earningsData.revenueEstimated)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* News Section */}
      {news.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              Relevante News
            </CardTitle>
            <CardDescription>News rund um das Setup-Datum</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {news.map((item) => (
                <div key={item.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{item.title}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <span>{item.source}</span>
                        <span>•</span>
                        <span>{new Date(item.publishedDate).toLocaleDateString("de-DE")}</span>
                      </div>
                    </div>
                    {item.url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
