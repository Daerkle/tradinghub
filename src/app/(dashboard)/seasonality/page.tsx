"use client";

import { useEffect, useState } from "react";
import { RefreshCw, CalendarDays, Landmark, TrendingUp, AlertCircle, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MarketSeasonalityOverview } from "@/types/market-seasonality";

const PRESETS = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "QQQ", label: "QQQ" },
  { symbol: "IWM", label: "IWM" },
  { symbol: "DIA", label: "DIA" },
  { symbol: "XLK", label: "XLK" },
  { symbol: "XLF", label: "XLF" },
  { symbol: "XLE", label: "XLE" },
  { symbol: "SMH", label: "SMH" },
];

const REFERENCE_SOURCES = [
  {
    title: "FOMC Meeting Calendars",
    category: "Offiziell",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
    note: "Offizielle Fed-Kalender für aktuelle und historische Sitzungstermine.",
  },
  {
    title: "FOMC Historical Materials",
    category: "Offiziell",
    url: "https://www.federalreserve.gov/monetarypolicy/fomc_historical.htm",
    note: "Historische FOMC-Unterlagen, Protokolle und Sitzungsarchive.",
  },
  {
    title: "Presidential Election Cycle",
    category: "Akademisch",
    url: "https://rpc.cfainstitute.org/research/financial-analysts-journal/1980/stock-market-returns-and-the-presidential-election-cycle-implications-for-market-efficiency",
    note: "Klassische Arbeit zum Börsenverhalten im US-Wahlzyklus.",
  },
  {
    title: "Turn-of-the-Month Effect",
    category: "Akademisch",
    url: "https://www.sciencedirect.com/science/article/pii/S154461231630054X",
    note: "Beispielstudie zum Turn-of-the-Month-Effekt mit Bezug auf die Literatur seit Ariel.",
  },
  {
    title: "Halloween Indicator",
    category: "Fachartikel",
    url: "https://blogs.cfainstitute.org/investor/2012/10/30/the-halloween-indicator-a-stock-market-anomaly-that-is-stronger-than-ever/",
    note: "Einordnung des Halloween-Effekts mit Verweis auf die Grundlagenliteratur.",
  },
  {
    title: "Halloween Effect Research",
    category: "Akademisch",
    url: "https://www.sciencedirect.com/science/article/pii/S1057521910000608",
    note: "Wissenschaftliche Untersuchung des Halloween-Effekts über viele Märkte.",
  },
  {
    title: "Santa Claus Rally",
    category: "Akademisch",
    url: "https://digitalcommons.cedarville.edu/business_administration_media_contributions/288/",
    note: "Forschung und Überblick zur Santa-Claus-Rally.",
  },
  {
    title: "Historical Presidential Charts",
    category: "Charts",
    url: "https://stockcharts.com/freecharts/historical/presidential.html",
    note: "Historische Vergleichscharts der Präsidentschaftszyklen.",
  },
  {
    title: "Yahoo History",
    category: "Marktdaten",
    url: "https://finance.yahoo.com/quote/%5EGSPC/history",
    note: "Direkte Kurs-Historie zum visuellen Abgleich mit der App.",
  },
  {
    title: "TradingView Charts",
    category: "Marktdaten",
    url: "https://www.tradingview.com/chart/?symbol=SP:SPX",
    note: "Chartansicht zum Nachvollziehen der historischen Phasen und Tiefs.",
  },
];

function formatPct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function toneClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-muted-foreground";
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function heatClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "bg-muted text-muted-foreground";
  if (value >= 1.5) return "bg-emerald-600 text-white";
  if (value >= 0.5) return "bg-emerald-500/80 text-white";
  if (value > 0) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  if (value <= -1.5) return "bg-rose-600 text-white";
  if (value <= -0.5) return "bg-rose-500/80 text-white";
  if (value < 0) return "bg-rose-500/20 text-rose-700 dark:text-rose-300";
  return "bg-muted text-muted-foreground";
}

type ComparisonEntry = {
  symbol: string;
  label: string;
  kind: "index" | "sector";
  bestMonth: string;
  bestMonthReturn: number | null;
  strongestEvent: string;
  strongestEventReturn: number | null;
  bestCycle: string;
  bestCycleReturn: number | null;
};

function SeasonalityHeatmap({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{ label: string; value: number | null | undefined; sublabel?: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border p-3 transition-colors ${heatClass(item.value)}`}
            >
              <div className="text-xs opacity-80">{item.label}</div>
              <div className="mt-1 text-lg font-semibold">{formatPct(item.value, 2)}</div>
              {item.sublabel ? <div className="mt-1 text-xs opacity-80">{item.sublabel}</div> : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SeasonalityPage() {
  const [symbolInput, setSymbolInput] = useState("^GSPC");
  const [activeSymbol, setActiveSymbol] = useState("^GSPC");
  const [data, setData] = useState<MarketSeasonalityOverview | null>(null);
  const [comparison, setComparison] = useState<ComparisonEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch(`/api/seasonality/market/${encodeURIComponent(activeSymbol)}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as MarketSeasonalityOverview;
        if (!cancelled) setData(payload);
      } catch (loadError) {
        console.error("Failed to load market seasonality", loadError);
        if (!cancelled) {
          setData(null);
          setError("Saisonalitäten konnten nicht geladen werden.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [activeSymbol]);

  useEffect(() => {
    let cancelled = false;

    async function loadComparison() {
      try {
        setComparisonLoading(true);
        const rows = await Promise.all(
          PRESETS.map(async (preset) => {
            const response = await fetch(`/api/seasonality/market/${encodeURIComponent(preset.symbol)}`);
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            const payload = (await response.json()) as MarketSeasonalityOverview;
            const bestCycle = payload.presidentialCycle.summary
              .slice()
              .sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null;
            return {
              symbol: preset.symbol,
              label: preset.label,
              kind: preset.symbol.startsWith("X") || preset.symbol === "SMH" ? "sector" : "index",
              bestMonth: payload.summary.bestMonth?.label ?? "-",
              bestMonthReturn: payload.summary.bestMonth?.avgReturnPct ?? null,
              strongestEvent: payload.summary.strongestEvent?.label ?? "-",
              strongestEventReturn: payload.summary.strongestEvent?.avgReturnPct ?? null,
              bestCycle: bestCycle?.label ?? "-",
              bestCycleReturn: bestCycle?.avgReturnPct ?? null,
            } satisfies ComparisonEntry;
          })
        );

        if (!cancelled) setComparison(rows);
      } catch (comparisonError) {
        console.error("Failed to load seasonality comparison", comparisonError);
        if (!cancelled) setComparison([]);
      } finally {
        if (!cancelled) setComparisonLoading(false);
      }
    }

    loadComparison();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Saisonalitäten</h1>
          <p className="text-muted-foreground mt-1">
            Wahlzyklen, Kalendereffekte und typische Marktfenster wie Turn of Month oder Santa Rally.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
            placeholder="z. B. ^GSPC oder QQQ"
            className="w-full sm:w-48"
          />
          <Button
            onClick={() => setActiveSymbol(symbolInput.trim().toUpperCase() || "^GSPC")}
            disabled={isLoading}
          >
            {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
            Laden
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button
            key={preset.symbol}
            variant={activeSymbol === preset.symbol ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setSymbolInput(preset.symbol);
              setActiveSymbol(preset.symbol);
            }}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {error && (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="flex items-center gap-2 py-4 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <SeasonalityHeatmap
            title="Monats-Heatmap"
            description="Schneller Überblick über die historische Monatsstärke."
            items={data.monthly.map((item) => ({
              label: item.label,
              value: item.avgReturnPct,
              sublabel: `Positiv ${formatPct(item.positiveRatePct, 0)}`,
            }))}
          />

          <SeasonalityHeatmap
            title="Zyklus-Heatmap"
            description="Die wichtigsten Saisonfenster für den aktuell gewählten Markt."
            items={data.eventCycles.map((item) => ({
              label: item.label,
              value: item.avgReturnPct,
              sublabel: `${item.sampleSize} Samples`,
            }))}
          />

          <SeasonalityHeatmap
            title="Wochentag-Heatmap"
            description="Historische durchschnittliche Tagesrenditen nach Wochentag."
            items={data.weekday.map((item) => ({
              label: item.label,
              value: item.avgReturnPct,
              sublabel: `Positiv ${formatPct(item.positiveRatePct, 0)}`,
            }))}
          />

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Symbol</CardDescription>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                  {data.symbol}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {data.historyYears} Jahre Historie, {data.tradingDays} Handelstage
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Bester Monat</CardDescription>
                <CardTitle className={toneClass(data.summary.bestMonth?.avgReturnPct)}>
                  {data.summary.bestMonth?.label ?? "-"} {formatPct(data.summary.bestMonth?.avgReturnPct)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Positive Rate {formatPct(data.summary.bestMonth?.positiveRatePct, 0)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Stärkster Zyklus</CardDescription>
                <CardTitle className={toneClass(data.summary.strongestEvent?.avgReturnPct)}>
                  {data.summary.strongestEvent?.label ?? "-"} {formatPct(data.summary.strongestEvent?.avgReturnPct)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {data.summary.strongestEvent?.description ?? "Keine Daten"}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Stärkster Wahlzyklus</CardDescription>
                <CardTitle className={toneClass(data.presidentialCycle.summary[0]?.avgReturnPct)}>
                  {data.presidentialCycle.summary
                    .slice()
                    .sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0]?.label ?? "-"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Midterm-Tabelle unten zeigt Drawdown und 12M-Erholung wie im Marktfoto.
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Vergleichsboard</CardTitle>
              <CardDescription>
                Direktvergleich von Indizes und Sektor-ETFs, damit du starke und schwache Saisonalitäten schneller findest.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {comparisonLoading ? (
                <div className="text-sm text-muted-foreground">Vergleichsdaten werden geladen...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Markt</TableHead>
                      <TableHead>Bester Monat</TableHead>
                      <TableHead>Stärkster Event-Zyklus</TableHead>
                      <TableHead>Bester Wahlzyklus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison.map((row) => (
                      <TableRow key={row.symbol}>
                        <TableCell>
                          <div className="font-medium">{row.label}</div>
                          <div className="text-xs text-muted-foreground">{row.symbol}</div>
                        </TableCell>
                        <TableCell className={toneClass(row.bestMonthReturn)}>
                          {row.bestMonth} {formatPct(row.bestMonthReturn, 1)}
                        </TableCell>
                        <TableCell className={toneClass(row.strongestEventReturn)}>
                          {row.strongestEvent} {formatPct(row.strongestEventReturn, 1)}
                        </TableCell>
                        <TableCell className={toneClass(row.bestCycleReturn)}>
                          {row.bestCycle} {formatPct(row.bestCycleReturn, 1)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Index Ranking</CardTitle>
                <CardDescription>Welche großen Märkte haben saisonal den stärksten Event-Rückenwind.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Index</TableHead>
                      <TableHead>Top Event</TableHead>
                      <TableHead>Bester Monat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison
                      .filter((row) => row.kind === "index")
                      .sort((a, b) => (b.strongestEventReturn ?? -Infinity) - (a.strongestEventReturn ?? -Infinity))
                      .map((row) => (
                        <TableRow key={row.symbol}>
                          <TableCell>
                            <div className="font-medium">{row.label}</div>
                            <div className="text-xs text-muted-foreground">{row.symbol}</div>
                          </TableCell>
                          <TableCell className={toneClass(row.strongestEventReturn)}>
                            {row.strongestEvent} {formatPct(row.strongestEventReturn, 1)}
                          </TableCell>
                          <TableCell className={toneClass(row.bestMonthReturn)}>
                            {row.bestMonth} {formatPct(row.bestMonthReturn, 1)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sektor Ranking</CardTitle>
                <CardDescription>Welche Sektor-ETFs saisonal die beste Struktur zeigen.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sektor</TableHead>
                      <TableHead>Top Event</TableHead>
                      <TableHead>Bester Monat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison
                      .filter((row) => row.kind === "sector")
                      .sort((a, b) => (b.strongestEventReturn ?? -Infinity) - (a.strongestEventReturn ?? -Infinity))
                      .map((row) => (
                        <TableRow key={row.symbol}>
                          <TableCell>
                            <div className="font-medium">{row.label}</div>
                            <div className="text-xs text-muted-foreground">{row.symbol}</div>
                          </TableCell>
                          <TableCell className={toneClass(row.strongestEventReturn)}>
                            {row.strongestEvent} {formatPct(row.strongestEventReturn, 1)}
                          </TableCell>
                          <TableCell className={toneClass(row.bestMonthReturn)}>
                            {row.bestMonth} {formatPct(row.bestMonthReturn, 1)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Seasonality Playbook</CardTitle>
              <CardDescription>Komprimierte Hinweise, welche Fenster im aktuellen Symbol historisch am ehesten für Momentum oder Mean Reversion taugen.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "Momentum-Fenster",
                  value: data.summary.strongestEvent,
                  note: "Historisch stärkster Kalendereffekt für dieses Symbol.",
                },
                {
                  title: "Bester Monat",
                  value: data.summary.bestMonth,
                  note: "Monat mit der besten durchschnittlichen Tagesstruktur.",
                },
                {
                  title: "Schwaches Fenster",
                  value: data.summary.weakestEvent,
                  note: "Hier eher defensiver planen oder nur mit starkem Trigger handeln.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">{item.title}</div>
                  <div className={`mt-2 text-lg font-semibold ${toneClass(item.value?.avgReturnPct)}`}>
                    {item.value?.label ?? "-"} {formatPct(item.value?.avgReturnPct, 2)}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{item.note}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quellenbibliothek</CardTitle>
              <CardDescription>
                Externe Vergleichsquellen zum Durchklicken: offizielle Kalender, historische Charts und akademische Arbeiten zu den wichtigsten Saisonalitäten.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {REFERENCE_SOURCES.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{source.title}</div>
                    <Badge variant="outline">{source.category}</Badge>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">{source.note}</div>
                </a>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Monatsmuster
                </CardTitle>
                <CardDescription>Historische durchschnittliche Tagesrenditen nach Monat.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Monat</TableHead>
                      <TableHead>Avg</TableHead>
                      <TableHead>Median</TableHead>
                      <TableHead>Positiv</TableHead>
                      <TableHead>Samples</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthly.map((bucket) => (
                      <TableRow key={bucket.label}>
                        <TableCell className="font-medium">{bucket.label}</TableCell>
                        <TableCell className={toneClass(bucket.avgReturnPct)}>{formatPct(bucket.avgReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(bucket.medianReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(bucket.positiveRatePct, 0)}</TableCell>
                        <TableCell>{bucket.sampleSize}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Event-Zyklen
                </CardTitle>
                <CardDescription>Kalendereffekte wie Turn of Month, Santa Rally und Halloween-Effekt.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zyklus</TableHead>
                      <TableHead>Avg</TableHead>
                      <TableHead>Median</TableHead>
                      <TableHead>Positiv</TableHead>
                      <TableHead>Samples</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.eventCycles.map((cycle) => (
                      <TableRow key={cycle.slug}>
                        <TableCell>
                          <div className="font-medium">{cycle.label}</div>
                          <div className="text-xs text-muted-foreground">{cycle.description}</div>
                        </TableCell>
                        <TableCell className={toneClass(cycle.avgReturnPct)}>{formatPct(cycle.avgReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(cycle.medianReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(cycle.positiveRatePct, 0)}</TableCell>
                        <TableCell>{cycle.sampleSize}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Alle Kalendereffekte</CardTitle>
              <CardDescription>
                Vollständige Liste der aktuell berechneten Marktzyklen für den ausgewählten Markt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.eventCycles
                  .slice()
                  .sort((a, b) => b.avgReturnPct - a.avgReturnPct)
                  .map((cycle) => (
                    <Badge key={cycle.slug} variant="secondary" className={toneClass(cycle.avgReturnPct)}>
                      {cycle.label} {formatPct(cycle.avgReturnPct, 2)}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Presidential Cycle</CardTitle>
              <CardDescription>
                US-Wahlzyklus mit Post-Election, Midterm, Pre-Election und Election Years.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jahrestyp</TableHead>
                    <TableHead>Avg Return</TableHead>
                    <TableHead>Median</TableHead>
                    <TableHead>Positiv</TableHead>
                    <TableHead>Avg Max DD</TableHead>
                    <TableHead>Samples</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.presidentialCycle.summary.map((row) => (
                    <TableRow key={row.cycleKey}>
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className={toneClass(row.avgReturnPct)}>{formatPct(row.avgReturnPct, 1)}</TableCell>
                      <TableCell>{formatPct(row.medianReturnPct, 1)}</TableCell>
                      <TableCell>{formatPct(row.positiveRatePct, 0)}</TableCell>
                      <TableCell className={toneClass(row.avgMaxDrawdownPct)}>{formatPct(row.avgMaxDrawdownPct, 1)}</TableCell>
                      <TableCell>{row.sampleSize}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Midterm Drawdowns & Recoveries</CardTitle>
              <CardDescription>
                Aehnlich wie in deinem Beispielbild: Midterm-Jahre mit maximalem Drawdown und 12-Monats-Forward-Return ab Tief.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jahr</TableHead>
                    <TableHead>Max Drawdown</TableHead>
                    <TableHead>Tief</TableHead>
                    <TableHead>1Y Forward ab Tief</TableHead>
                    <TableHead>Jahresreturn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.presidentialCycle.midtermYears.map((row) => (
                    <TableRow key={row.year}>
                      <TableCell className="font-medium">{row.year}</TableCell>
                      <TableCell className={toneClass(row.maxDrawdownPct)}>{formatPct(row.maxDrawdownPct, 1)}</TableCell>
                      <TableCell>{row.troughDate ?? "-"}</TableCell>
                      <TableCell className={toneClass(row.forward1yReturnPct)}>{formatPct(row.forward1yReturnPct, 1)}</TableCell>
                      <TableCell className={toneClass(row.annualReturnPct)}>{formatPct(row.annualReturnPct, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {data.sourceLinks.map((link) => (
              <Badge key={link.url} variant="secondary" className="text-xs">
                <a href={link.url} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              </Badge>
            ))}
          </div>

          <p className="text-sm text-muted-foreground">{data.disclaimer}</p>
        </>
      )}
    </div>
  );
}
