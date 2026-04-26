"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  Play,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Newspaper,
  BarChart3,
} from "lucide-react";

interface BackfillStatus {
  daily: {
    status: string;
    processed: number;
    total: number;
    lastSymbol?: string;
  };
  earnings: {
    status: string;
    processed: number;
  };
  news: {
    status: string;
    processed: number;
  };
}

interface DataStats {
  dailyPrices: number;
  earnings: number;
  news: number;
  intradayPrices: number;
  uniqueSymbols: number;
}

export default function BackfillPage() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [stats, setStats] = useState<DataStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/database/backfill");
      if (response.ok) {
        const data = await response.json();
        setStatus(data.status);
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 5 seconds if any backfill is in progress
    const interval = setInterval(() => {
      if (status?.daily.status === "in_progress" ||
          status?.earnings.status === "in_progress" ||
          status?.news.status === "in_progress") {
        fetchStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [status]);

  const startBackfill = async (dataType: string) => {
    setStarting(dataType);
    try {
      const response = await fetch("/api/database/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", dataType }),
      });
      if (response.ok) {
        await fetchStatus();
      }
    } catch (error) {
      console.error("Error starting backfill:", error);
    } finally {
      setStarting(null);
    }
  };

  const getStatusBadge = (statusValue: string) => {
    switch (statusValue) {
      case "completed":
        return <Badge variant="default" className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Abgeschlossen</Badge>;
      case "in_progress":
        return <Badge variant="default" className="bg-blue-500"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Läuft</Badge>;
      case "failed":
        return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Fehler</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Ausstehend</Badge>;
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("de-DE").format(num);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daten Backfill</h1>
          <p className="text-muted-foreground">
            Historische Daten aus offenen Quellen laden (Yahoo, Stooq, News-Feeds)
          </p>
        </div>
        <Button variant="outline" onClick={fetchStatus}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aktualisieren
        </Button>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Symbole
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.uniqueSymbols || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Daily Preise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.dailyPrices || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.earnings || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              News
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.news || 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Intraday
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(stats?.intradayPrices || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Backfill Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Daily Prices */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-blue-500" />
                <CardTitle>Daily Preise</CardTitle>
              </div>
              {getStatusBadge(status?.daily.status || "pending")}
            </div>
            <CardDescription>
              10 Jahre OHLCV Daten für alle NASDAQ Symbole
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Fortschritt</span>
                <span>
                  {formatNumber(status?.daily.processed || 0)} / {formatNumber(status?.daily.total || 0)}
                </span>
              </div>
              <Progress
                value={status?.daily.total ? (status.daily.processed / status.daily.total) * 100 : 0}
              />
              {status?.daily.lastSymbol && status.daily.status === "in_progress" && (
                <p className="text-xs text-muted-foreground">
                  Aktuell: {status.daily.lastSymbol}
                </p>
              )}
            </div>
            <Button
              className="w-full"
              onClick={() => startBackfill("daily")}
              disabled={status?.daily.status === "in_progress" || starting === "daily"}
            >
              {starting === "daily" ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {status?.daily.status === "in_progress" ? "Läuft..." : "Starten"}
            </Button>
          </CardContent>
        </Card>

        {/* Earnings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <CardTitle>Earnings</CardTitle>
              </div>
              {getStatusBadge(status?.earnings.status || "pending")}
            </div>
            <CardDescription>
              EPS & Revenue Surprises für alle Quartale
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Verarbeitet</span>
                <span>{formatNumber(status?.earnings.processed || 0)}</span>
              </div>
              <Progress
                value={status?.earnings.status === "completed" ? 100 : status?.earnings.processed ? 50 : 0}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => startBackfill("earnings")}
              disabled={status?.earnings.status === "in_progress" || starting === "earnings"}
            >
              {starting === "earnings" ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {status?.earnings.status === "in_progress" ? "Läuft..." : "Starten"}
            </Button>
          </CardContent>
        </Card>

        {/* News */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-orange-500" />
                <CardTitle>News</CardTitle>
              </div>
              {getStatusBadge(status?.news.status || "pending")}
            </div>
            <CardDescription>
              Press Releases & Stock News (on-demand)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Verarbeitet</span>
                <span>{formatNumber(status?.news.processed || 0)}</span>
              </div>
              <Progress
                value={status?.news.status === "completed" ? 100 : status?.news.processed ? 50 : 0}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              News werden automatisch für erkannte Setups geladen
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Info Box */}
      <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="text-blue-700 dark:text-blue-300 flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backfill Informationen
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-600 dark:text-blue-400 space-y-2">
          <p>
            <strong>Daily Preise:</strong> ~4.300 Symbole x 2.500 Tage = ~10.7 Mio Datensätze.
            Geschätzte Zeit: 7-8 Stunden (Rate Limiting: 300 Requests/Minute)
          </p>
          <p>
            <strong>Earnings:</strong> 10 Jahre Earnings Calendar mit EPS/Revenue Surprises.
            Geschätzte Zeit: 30-60 Minuten
          </p>
          <p>
            <strong>Intraday:</strong> Wird nur für erkannte Setups geladen (60min + 5min).
            Spart massiv API Calls.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
