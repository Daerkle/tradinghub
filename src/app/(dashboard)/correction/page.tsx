"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp, Minus, LayoutGrid, TableProperties } from "lucide-react";
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
import { SlimStatCard } from "@/components/dashboard/slim-stat-card";
import { readClientJsonCache, writeClientJsonCache } from "@/lib/client-json-cache";
import { cn } from "@/lib/utils";

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

const CORRECTION_CACHE_KEY = "correction";
const CORRECTION_MAX_AGE_MS = 2 * 60 * 1000;

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

type MatrixBoardRow =
  | "1-uptrend"
  | "2-bull-pullback"
  | "3-transition"
  | "4-early-base"
  | "5-downtrend";

type MatrixBoardColumn =
  | "up"
  | "strengthening"
  | "weakening"
  | "recovering"
  | "deteriorating"
  | "down";

const BOARD_ROWS: Array<{ key: MatrixBoardRow; label: string }> = [
  { key: "1-uptrend", label: "1-Uptrend" },
  { key: "2-bull-pullback", label: "2-Bull Pullback" },
  { key: "3-transition", label: "3-Transition" },
  { key: "4-early-base", label: "4-Early Base" },
  { key: "5-downtrend", label: "5-Downtrend" },
];

const BOARD_COLUMNS: Array<{ key: MatrixBoardColumn; label: string }> = [
  { key: "up", label: "Up" },
  { key: "strengthening", label: "Strengthening" },
  { key: "weakening", label: "Weakening" },
  { key: "recovering", label: "Recovering" },
  { key: "deteriorating", label: "Deteriorating" },
  { key: "down", label: "Down" },
];

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

function getBoardRow(row: MatrixRow): MatrixBoardRow {
  if (row.momentum3M >= 25 && row.distanceFrom52WkHigh >= -10) return "1-uptrend";
  if (row.momentum3M >= 10 && row.distanceFrom52WkHigh >= -20) return "2-bull-pullback";
  if (row.momentum3M >= 0 && row.distanceFrom52WkHigh >= -30) return "3-transition";
  if (row.momentum3M >= -10 && row.distanceFrom52WkHigh >= -45) return "4-early-base";
  return "5-downtrend";
}

function getBoardColumn(row: MatrixRow): MatrixBoardColumn {
  if (row.changePercent >= 1 && row.momentum1M > 10) return "up";
  if (row.momentum1M >= 0 && row.momentum3M > 0 && row.changePercent >= 0) return "strengthening";
  if (row.momentum3M > 0 && row.changePercent < 0) return "weakening";
  if (row.momentum1M > 0 && row.momentum3M <= 0) return "recovering";
  if (row.momentum1M < 0 && row.momentum3M > 0) return "deteriorating";
  return "down";
}

function getBoardScore(row: MatrixRow): number {
  return (
    Math.max(0, row.catalystScore) * 0.35 +
    Math.max(0, row.sectorHeatScore) * 0.2 +
    Math.max(0, row.momentum1M) * 0.15 +
    Math.max(0, row.momentum3M) * 0.2 +
    Math.max(0, 25 + row.distanceFrom52WkHigh) * 0.1
  );
}

function cellTone(column: MatrixBoardColumn): string {
  if (column === "up" || column === "strengthening" || column === "recovering") {
    return "border-emerald-500/20 bg-emerald-500/[0.08]";
  }
  if (column === "weakening") {
    return "border-amber-500/20 bg-amber-500/[0.07]";
  }
  if (column === "deteriorating" || column === "down") {
    return "border-rose-500/20 bg-rose-500/[0.08]";
  }
  return "border-border bg-card";
}

export default function CorrectionPage() {
  const [data, setData] = useState<CorrectionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [view, setView] = useState<"board" | "table">("board");

  const loadData = async (forceRefresh: boolean = false) => {
    const query = forceRefresh ? "?refresh=true" : "";
    const cached = !forceRefresh
      ? readClientJsonCache<CorrectionResponse>(CORRECTION_CACHE_KEY, {
          maxAgeMs: CORRECTION_MAX_AGE_MS,
          allowStale: true,
        })
      : null;

    try {
      if (cached) {
        setData(cached.data);
        setIsLoading(false);
        setIsRefreshing(true);
      } else if (forceRefresh) setIsRefreshing(true);
      else setIsLoading(true);

      const response = await fetch(`/api/scanner/correction${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as CorrectionResponse;
      setData(payload);
      writeClientJsonCache(CORRECTION_CACHE_KEY, payload);
      setError(null);
    } catch (err) {
      console.error("Failed to load correction data:", err);
      if (!cached) setError("Korrektur-Daten konnten nicht geladen werden.");
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

  const boardCells = useMemo(() => {
    const grouped = new Map<string, MatrixRow[]>();

    for (const row of filteredMatrix) {
      const key = `${getBoardRow(row)}:${getBoardColumn(row)}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    for (const [key, rows] of grouped.entries()) {
      grouped.set(
        key,
        rows.slice().sort((a, b) => getBoardScore(b) - getBoardScore(a)).slice(0, 8)
      );
    }

    return grouped;
  }, [filteredMatrix]);

  if (isLoading) {
    return (
      <div className="space-y-4">
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
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Korrektur & Sentiment</h1>
          <p className="text-muted-foreground">SPY/QQQ EMA-Lage und 52W-High-Matrix</p>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-4 space-y-4">
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
    <div className="space-y-4">
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

      <div className="grid gap-3 md:grid-cols-4">
        <SlimStatCard
          icon={data.sentiment.label === "Bullish" ? TrendingUp : data.sentiment.label === "Bearish" ? TrendingDown : Minus}
          label="Sentiment"
          value={`${data.sentiment.label} · ${data.sentiment.score}`}
          hint={data.sentiment.explanation}
          toneClassName={data.sentiment.label === "Bullish" ? "text-emerald-500" : data.sentiment.label === "Bearish" ? "text-red-500" : "text-amber-500"}
        />

        {data.indexes.map((index) => (
          <SlimStatCard
            key={index.symbol}
            icon={index.trend === "bullish" ? TrendingUp : index.trend === "bearish" ? TrendingDown : Minus}
            label={index.symbol}
            value={`${index.trend.toUpperCase()} · $${index.price.toFixed(2)}`}
            hint={`EMA10 ${index.ema10.toFixed(2)} · EMA20 ${index.ema20.toFixed(2)}`}
            toneClassName={trendTone(index.trend)}
          />
        ))}

        <SlimStatCard
          icon={LayoutGrid}
          label="Marktbreite"
          value={`${data.breadth.total} Aktien`}
          hint={`EMA10 ${data.breadth.pctAboveEma10.toFixed(1)}% · EMA20 ${data.breadth.pctAboveEma20.toFixed(1)}% · 52W ${data.breadth.pctNear52WHigh.toFixed(1)}%`}
        />
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
            <div className="flex gap-2">
              <Button
                variant={view === "board" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("board")}
                className="gap-2"
              >
                <LayoutGrid className="h-4 w-4" />
                Board
              </Button>
              <Button
                variant={view === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setView("table")}
                className="gap-2"
              >
                <TableProperties className="h-4 w-4" />
                Tabelle
              </Button>
            </div>
          </div>

          {view === "board" ? (
            <div className="overflow-x-auto pb-2">
              <div className="grid min-w-[1380px] grid-cols-[170px_repeat(6,minmax(190px,1fr))] gap-3">
                <Card className="border-dashed">
                  <CardContent className="flex h-full min-h-[68px] items-center px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold">EMA Trend x Regime</div>
                      <div className="text-xs text-muted-foreground">Kompakter Marktstruktur-Board</div>
                    </div>
                  </CardContent>
                </Card>

                {BOARD_COLUMNS.map((column) => (
                  <Card key={column.key}>
                    <CardContent className="min-h-[68px] px-4 py-3">
                      <div className="text-sm font-semibold">{column.label}</div>
                    </CardContent>
                  </Card>
                ))}

                {BOARD_ROWS.flatMap((boardRow) => {
                  return [
                    <Card key={`${boardRow.key}-label`}>
                      <CardContent className="min-h-[88px] px-4 py-4">
                        <div className="text-sm font-semibold">{boardRow.label}</div>
                      </CardContent>
                    </Card>,
                    ...BOARD_COLUMNS.map((column) => {
                      const cellRows = boardCells.get(`${boardRow.key}:${column.key}`) ?? [];

                      return (
                        <Card key={`${boardRow.key}-${column.key}`} className={cn("min-h-[88px] border", cellTone(column.key))}>
                          <CardContent className="px-3 py-3">
                            <div className="space-y-2">
                              {cellRows.length === 0 ? (
                                <div className="h-6 rounded-md border border-dashed border-muted-foreground/15 bg-background/20" />
                              ) : (
                                cellRows.map((row) => (
                                  <div
                                    key={`${boardRow.key}-${column.key}-${row.symbol}`}
                                    className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold">{row.symbol}</span>
                                      <span className="text-[11px] text-muted-foreground">{getBoardScore(row).toFixed(0)}</span>
                                    </div>
                                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                      <span className={row.changePercent >= 0 ? "text-emerald-500" : "text-red-500"}>
                                        {formatPercent(row.changePercent)}
                                      </span>
                                      <span className={distanceTone(row.distanceFrom52WkHigh)}>
                                        {formatPercent(row.distanceFrom52WkHigh)}
                                      </span>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }),
                  ];
                })}
              </div>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
