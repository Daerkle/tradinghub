"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

type IndexSnapshot = {
  symbol: "SPY" | "QQQ";
  price: number;
  ema10: number;
  ema20: number;
  aboveEma10: boolean;
  aboveEma20: boolean;
  ema10AboveEma20: boolean;
  trend: "bullish" | "bearish" | "mixed";
};

type SectorSummary = {
  sector: string;
  stockCount: number;
  avgHeat: number;
  avgMomentum3M: number;
  avgDistance52WHigh: number;
  leadersNearHigh: number;
  score: number;
};

type MatrixRow = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  price: number;
  changePercent: number;
  momentum1M: number;
  momentum3M: number;
  momentum6M: number;
  distanceFrom52WkHigh: number;
  sectorHeatScore: number;
  catalystScore: number;
};

type CorrectionResponse = {
  fetchedAt: string;
  source: {
    fromCache: boolean;
    totalScanned: number;
    stocks: number;
  };
  sentiment: {
    score: number;
    label: "Bullish" | "Bearish" | "Neutral";
    explanation: string;
  };
  indexes: IndexSnapshot[];
  breadth: {
    total: number;
    aboveEma10: number;
    aboveEma20: number;
    near52WHigh: number;
    pctAboveEma10: number;
    pctAboveEma20: number;
    pctNear52WHigh: number;
  };
  hotSectors: SectorSummary[];
  matrix: MatrixRow[];
};

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function trendTone(trend: IndexSnapshot["trend"]): string {
  if (trend === "bullish") return "text-emerald-500";
  if (trend === "bearish") return "text-red-500";
  return "text-amber-500";
}

function distanceTone(value: number): string {
  if (value >= 0) return "text-emerald-500";
  if (value >= -5) return "text-lime-500";
  if (value >= -10) return "text-amber-500";
  return "text-red-500";
}

export default function CorrectionPage() {
  const [data, setData] = useState<CorrectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");

  const loadData = async (forceRefresh: boolean = false) => {
    const query = forceRefresh ? "?refresh=true" : "";
    try {
      if (forceRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      const response = await fetch(`/api/scanner/correction${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as CorrectionResponse;
      setData(payload);
      setError(null);
    } catch (err) {
      console.error("Failed to load correction data:", err);
      setError("Korrektur-Daten konnten nicht geladen werden.");
      if (forceRefresh) {
        toast.error("Aktualisierung fehlgeschlagen");
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredMatrix = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();

    return data.matrix.filter((row) => {
      if (sectorFilter !== "all" && row.sector !== sectorFilter) return false;
      if (!query) return true;
      return (
        row.symbol.toLowerCase().includes(query) ||
        row.name.toLowerCase().includes(query) ||
        row.sector.toLowerCase().includes(query) ||
        row.industry.toLowerCase().includes(query)
      );
    });
  }, [data, search, sectorFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Korrektur & Sentiment</h1>
          <p className="text-muted-foreground">SPY/QQQ EMA-Lage und 52W-High-Matrix</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Korrektur & Sentiment</h1>
          <p className="text-muted-foreground">SPY/QQQ EMA-Lage und 52W-High-Matrix</p>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6 space-y-4">
            <p className="text-destructive">{error || "Keine Daten verfügbar"}</p>
            <Button variant="outline" onClick={() => loadData(true)}>
              Erneut versuchen
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Korrektur & Sentiment</h1>
          <p className="text-muted-foreground">
            SPY/QQQ EMA-Lage, Marktbreite und High-Flyer-Distanz zum 52W-Hoch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {new Date(data.fetchedAt).toLocaleString("de-DE")} • {data.source.fromCache ? "Cache" : "Fresh"}
          </p>
          <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={isRefreshing}>
            {isRefreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sentiment</CardTitle>
            <CardDescription>Gesamtscore: {data.sentiment.score}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {data.sentiment.label === "Bullish" ? (
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              ) : data.sentiment.label === "Bearish" ? (
                <TrendingDown className="h-5 w-5 text-red-500" />
              ) : (
                <Minus className="h-5 w-5 text-amber-500" />
              )}
              <span className="text-2xl font-bold">{data.sentiment.label}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data.sentiment.explanation}</p>
          </CardContent>
        </Card>

        {data.indexes.map((index) => (
          <Card key={index.symbol}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{index.symbol}</CardTitle>
              <CardDescription>
                ${index.price.toFixed(2)} • EMA10 ${index.ema10.toFixed(2)} • EMA20 ${index.ema20.toFixed(2)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className={`text-lg font-semibold ${trendTone(index.trend)}`}>{index.trend.toUpperCase()}</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={index.aboveEma10 ? "default" : "secondary"}>
                  {index.aboveEma10 ? "Über EMA10" : "Unter EMA10"}
                </Badge>
                <Badge variant={index.aboveEma20 ? "default" : "secondary"}>
                  {index.aboveEma20 ? "Über EMA20" : "Unter EMA20"}
                </Badge>
                <Badge variant={index.ema10AboveEma20 ? "default" : "secondary"}>
                  {index.ema10AboveEma20 ? "EMA10 > EMA20" : "EMA10 < EMA20"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Marktbreite</CardTitle>
            <CardDescription>{data.breadth.total} Aktien im Universum</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Über EMA10</span>
              <span>{data.breadth.pctAboveEma10.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Über EMA20</span>
              <span>{data.breadth.pctAboveEma20.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Nahe 52W-Hoch</span>
              <span>{data.breadth.pctNear52WHigh.toFixed(1)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Heiße Sektoren</CardTitle>
          <CardDescription>Top-Sektoren nach Heat-Score, Momentum und Nähe zum 52W-Hoch</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.hotSectors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Keine Sektor-Daten verfügbar.</p>
          ) : (
            data.hotSectors.map((sector) => (
              <div key={sector.sector} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <Badge variant="outline">{sector.sector}</Badge>
                <span className="text-xs text-muted-foreground">
                  Heat {sector.avgHeat.toFixed(1)} • 3M {formatPercent(sector.avgMomentum3M)} •
                  Nahe High: {sector.leadersNearHigh}/{sector.stockCount}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>High-Flyer Matrix</CardTitle>
          <CardDescription>
            Fokus auf Aktien aus heißen Sektoren und deren Abstand zum 52-Wochen-Hoch
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Symbol, Name, Sektor oder Industry suchen"
            />
            <Select value={sectorFilter} onValueChange={setSectorFilter}>
              <SelectTrigger className="w-full md:w-[260px]">
                <SelectValue placeholder="Sektor auswählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle heißen Sektoren</SelectItem>
                {data.hotSectors.map((sector) => (
                  <SelectItem key={sector.sector} value={sector.sector}>
                    {sector.sector}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead className="hidden md:table-cell">Sektor</TableHead>
                <TableHead className="hidden lg:table-cell">Industry</TableHead>
                <TableHead>Preis</TableHead>
                <TableHead>%Tag</TableHead>
                <TableHead className="hidden sm:table-cell">3M</TableHead>
                <TableHead>Abstand 52W-Hoch</TableHead>
                <TableHead className="hidden md:table-cell">Heat</TableHead>
                <TableHead className="hidden md:table-cell">Catalyst</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMatrix.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Keine Treffer für den aktuellen Filter.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMatrix.map((row) => (
                  <TableRow key={`${row.symbol}-${row.sector}`}>
                    <TableCell className="font-medium">{row.symbol}</TableCell>
                    <TableCell className="hidden md:table-cell">{row.sector}</TableCell>
                    <TableCell className="hidden lg:table-cell">{row.industry}</TableCell>
                    <TableCell>${row.price.toFixed(2)}</TableCell>
                    <TableCell className={row.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}>
                      {formatPercent(row.changePercent)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{formatPercent(row.momentum3M)}</TableCell>
                    <TableCell className={distanceTone(row.distanceFrom52WkHigh)}>
                      {formatPercent(row.distanceFrom52WkHigh)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{row.sectorHeatScore.toFixed(0)}</TableCell>
                    <TableCell className="hidden md:table-cell">{row.catalystScore.toFixed(0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
