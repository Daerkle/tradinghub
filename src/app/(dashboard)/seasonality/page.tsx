"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Filter,
  Grid3X3,
  Landmark,
  MousePointerClick,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  MarketSeasonalityOverview,
  SeasonalityCase,
  SeasonalityStatBucket,
} from "@/types/market-seasonality";

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

const FILTERS = [
  { key: "all", label: "Alles" },
  { key: "month", label: "Monate" },
  { key: "event", label: "Zyklen" },
  { key: "weekday", label: "Wochentage" },
  { key: "cycle", label: "Wahlzyklus" },
] as const;

type InsightGroup = "month" | "event" | "weekday" | "cycle";
type InsightFilter = (typeof FILTERS)[number]["key"];

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

type SeasonalityInsight = {
  id: string;
  group: InsightGroup;
  label: string;
  description: string;
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  positiveRatePct: number | null;
  sampleSize: number;
  sampleUnit: string;
  cases: SeasonalityCase[];
};

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
  if (value >= 6) return "bg-emerald-600 text-white";
  if (value >= 2) return "bg-emerald-500/80 text-white";
  if (value > 0) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300";
  if (value <= -6) return "bg-rose-600 text-white";
  if (value <= -2) return "bg-rose-500/80 text-white";
  if (value < 0) return "bg-rose-500/20 text-rose-700 dark:text-rose-300";
  return "bg-muted text-muted-foreground";
}

function formatCount(count: number, unit: string): string {
  if (unit === "Jahre") return `${count} ${count === 1 ? "Jahr" : "Jahre"}`;
  if (unit === "Handelstage") return `${count} ${count === 1 ? "Handelstag" : "Handelstage"}`;
  if (unit === "Fenster") return `${count} Fenster`;
  return `${count} Fälle`;
}

function formatPeriod(startDate: string, endDate: string): string {
  if (startDate === endDate) return startDate;
  return `${startDate} bis ${endDate}`;
}

function buildInsightFromBucket(
  group: InsightGroup,
  id: string,
  bucket: SeasonalityStatBucket,
  fallbackDescription: string,
  fallbackUnit: string
): SeasonalityInsight {
  return {
    id,
    group,
    label: bucket.label,
    description: bucket.description ?? fallbackDescription,
    avgReturnPct: bucket.avgReturnPct,
    medianReturnPct: bucket.medianReturnPct,
    positiveRatePct: bucket.positiveRatePct,
    sampleSize: bucket.sampleSize,
    sampleUnit: bucket.sampleUnit ?? fallbackUnit,
    cases: bucket.cases ?? [],
  };
}

function buildInsights(data: MarketSeasonalityOverview | null): SeasonalityInsight[] {
  if (!data) return [];

  const monthInsights = data.monthly.map((bucket) =>
    buildInsightFromBucket(
      "month",
      `month:${bucket.label}`,
      bucket,
      "Kompletter Monatsreturn über alle historischen Jahre.",
      "Jahre"
    )
  );

  const eventInsights = data.eventCycles.map((bucket) =>
    buildInsightFromBucket(
      "event",
      `event:${bucket.slug}`,
      bucket,
      "Historisches Kalenderfenster für den ausgewählten Markt.",
      "Fenster"
    )
  );

  const weekdayInsights = data.weekday.map((bucket) =>
    buildInsightFromBucket(
      "weekday",
      `weekday:${bucket.label}`,
      bucket,
      "Tagesreturn aller historischen Handelstage dieses Wochentags.",
      "Handelstage"
    )
  );

  const cycleInsights = data.presidentialCycle.summary.map((bucket) => {
    const cases = data.presidentialCycle.years
      .filter((row) => row.cycleKey === bucket.cycleKey && typeof row.annualReturnPct === "number")
      .map((row) => ({
        label: String(row.year),
        startDate: `${row.year}-01-01`,
        endDate: `${row.year}-12-31`,
        returnPct: row.annualReturnPct ?? 0,
      }));

    return {
      id: `cycle:${bucket.cycleKey}`,
      group: "cycle" as const,
      label: bucket.label,
      description: `Durchschnittlicher Jahresreturn dieses Wahlzyklus. Durchschnittlicher Max Drawdown: ${formatPct(
        bucket.avgMaxDrawdownPct,
        1
      )}.`,
      avgReturnPct: bucket.avgReturnPct,
      medianReturnPct: bucket.medianReturnPct,
      positiveRatePct: bucket.positiveRatePct,
      sampleSize: bucket.sampleSize,
      sampleUnit: "Jahre",
      cases,
    };
  });

  return [...monthInsights, ...eventInsights, ...weekdayInsights, ...cycleInsights];
}

function findSelectedInsight(
  insights: SeasonalityInsight[],
  selectedId: string | null,
  activeFilter: InsightFilter,
  query: string
): SeasonalityInsight | null {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = insights.filter((insight) => {
    const matchesGroup = activeFilter === "all" || insight.group === activeFilter;
    const haystack = `${insight.label} ${insight.description}`.toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    return matchesGroup && matchesQuery;
  });

  if (filtered.length === 0) return null;
  return filtered.find((insight) => insight.id === selectedId) ?? filtered[0];
}

function SeasonalityHeatmap({
  title,
  description,
  items,
  selectedId,
  onSelect,
}: {
  title: string;
  description: string;
  items: Array<{
    id: string;
    label: string;
    value: number | null | undefined;
    sublabel?: string;
  }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
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
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`rounded-xl border p-3 text-left transition-all hover:border-primary/60 ${
                item.id === selectedId ? "ring-2 ring-primary/70" : ""
              } ${heatClass(item.value)}`}
            >
              <div className="text-xs opacity-80">{item.label}</div>
              <div className="mt-1 text-lg font-semibold">{formatPct(item.value, 2)}</div>
              {item.sublabel ? <div className="mt-1 text-xs opacity-80">{item.sublabel}</div> : null}
            </button>
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
  const [activeFilter, setActiveFilter] = useState<InsightFilter>("all");
  const [insightQuery, setInsightQuery] = useState("");
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);
  const [caseQuery, setCaseQuery] = useState("");
  const deferredInsightQuery = useDeferredValue(insightQuery);
  const deferredCaseQuery = useDeferredValue(caseQuery);

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
            const bestCycle =
              payload.presidentialCycle.summary.slice().sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null;
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

  const insights = buildInsights(data);
  const selectedInsight = findSelectedInsight(insights, selectedInsightId, activeFilter, deferredInsightQuery);
  const filteredCases =
    selectedInsight?.cases.filter((entry) => {
      const query = deferredCaseQuery.trim().toLowerCase();
      if (!query) return true;
      return `${entry.label} ${entry.startDate} ${entry.endDate}`.toLowerCase().includes(query);
    }) ?? [];

  useEffect(() => {
    if (!data) {
      setSelectedInsightId(null);
      return;
    }
    setSelectedInsightId(data.summary.strongestEvent ? `event:${data.summary.strongestEvent.slug}` : `month:${data.monthly[0]?.label ?? "Jan"}`);
    setCaseQuery("");
  }, [data]);

  const handleSymbolLoad = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase() || "^GSPC";
    setSymbolInput(normalized);
    setActiveSymbol(normalized);
  };

  const handleInsightSelect = (id: string) => {
    setSelectedInsightId(id);
    setCaseQuery("");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Saisonalitäten</h1>
          <p className="mt-1 text-muted-foreground">
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
          <Button onClick={() => handleSymbolLoad(symbolInput)} disabled={isLoading}>
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
            onClick={() => handleSymbolLoad(preset.symbol)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {error ? (
        <Card className="border-red-500 bg-red-500/10">
          <CardContent className="flex items-center gap-2 py-4 text-red-500">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MousePointerClick className="h-5 w-5" />
                  Wie du diese Seite liest
                </CardTitle>
                <CardDescription>
                  Die Seite ist jetzt klickbar. Wähle oben einen Markt, filtere unten nach Monat, Zyklus oder Wahljahr und
                  klicke eine Kachel oder Tabellenzeile an.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Historische Fälle</div>
                  <div className="mt-2 font-medium">
                    `Samples` heißt hier: wie oft dieses Muster in der Historie wirklich vorkam.
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Beispiel: `33 Jahre` beim Januar, `398 Fenster` beim Turn of Month, `42 Fenster` beim FOMC-Fenster.
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Durchschnitt vs. Median</div>
                  <div className="mt-2 font-medium">
                    Durchschnitt ist der Mittelwert aller Fälle. Median ist der mittlere Fall und robuster gegen Ausreißer.
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    Wenn beide ähnlich sind, ist das Muster meist sauberer. Wenn sie stark abweichen, verzerren einzelne Jahre.
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Landmark className="h-5 w-5" />
                  Markt-Kontext
                </CardTitle>
                <CardDescription>Basis der aktuellen Auswertung für {data.symbol}.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Historie</div>
                  <div className="mt-2 text-2xl font-semibold">{data.historyYears} Jahre</div>
                  <div className="mt-1 text-sm text-muted-foreground">{data.tradingDays} Handelstage</div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Stärkster Zyklus</div>
                  <button
                    type="button"
                    onClick={() =>
                      data.summary.strongestEvent ? handleInsightSelect(`event:${data.summary.strongestEvent.slug}`) : undefined
                    }
                    className={`mt-2 text-left text-2xl font-semibold ${toneClass(data.summary.strongestEvent?.avgReturnPct)}`}
                  >
                    {data.summary.strongestEvent?.label ?? "-"} {formatPct(data.summary.strongestEvent?.avgReturnPct, 2)}
                  </button>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {data.summary.strongestEvent?.description ?? "Keine Daten"}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Bester Monat</div>
                  <button
                    type="button"
                    onClick={() =>
                      data.summary.bestMonth ? handleInsightSelect(`month:${data.summary.bestMonth.label}`) : undefined
                    }
                    className={`mt-2 text-left text-2xl font-semibold ${toneClass(data.summary.bestMonth?.avgReturnPct)}`}
                  >
                    {data.summary.bestMonth?.label ?? "-"} {formatPct(data.summary.bestMonth?.avgReturnPct, 2)}
                  </button>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Positivquote {formatPct(data.summary.bestMonth?.positiveRatePct, 0)}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <div className="text-sm text-muted-foreground">Wahlzyklus</div>
                  <button
                    type="button"
                    onClick={() => handleInsightSelect("cycle:midterm")}
                    className="mt-2 text-left text-2xl font-semibold text-foreground"
                  >
                    Midterm Drawdowns
                  </button>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Die Detailtabelle unten zeigt Tiefpunkt und 12M-Erholung wie in deinem Beispielbild.
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Interaktive Analyse</CardTitle>
              <CardDescription>
                Suche nach einem Begriff wie `FOMC`, `Januar`, `Midterm` oder `OpEx` und klicke anschließend auf eine
                Kachel, um die historischen Fälle direkt darunter zu sehen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {FILTERS.map((filter) => (
                    <Button
                      key={filter.key}
                      size="sm"
                      variant={activeFilter === filter.key ? "default" : "outline"}
                      onClick={() => setActiveFilter(filter.key)}
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      {filter.label}
                    </Button>
                  ))}
                </div>
                <div className="relative w-full lg:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={insightQuery}
                    onChange={(event) => setInsightQuery(event.target.value)}
                    placeholder="FOMC, Januar, Midterm, OpEx ..."
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                <Card>
                  <CardHeader>
                    <CardTitle>{selectedInsight?.label ?? "Kein Treffer"}</CardTitle>
                    <CardDescription>
                      {selectedInsight?.description ??
                        "Passe den Filter an oder klicke auf eine Monats-, Zyklus- oder Wahljahr-Kachel."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedInsight ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-xl border p-4">
                            <div className="text-sm text-muted-foreground">Durchschnitt</div>
                            <div className={`mt-2 text-2xl font-semibold ${toneClass(selectedInsight.avgReturnPct)}`}>
                              {formatPct(selectedInsight.avgReturnPct, 2)}
                            </div>
                          </div>
                          <div className="rounded-xl border p-4">
                            <div className="text-sm text-muted-foreground">Median</div>
                            <div className={`mt-2 text-2xl font-semibold ${toneClass(selectedInsight.medianReturnPct)}`}>
                              {formatPct(selectedInsight.medianReturnPct, 2)}
                            </div>
                          </div>
                          <div className="rounded-xl border p-4">
                            <div className="text-sm text-muted-foreground">Positivquote</div>
                            <div className="mt-2 text-2xl font-semibold">{formatPct(selectedInsight.positiveRatePct, 0)}</div>
                          </div>
                          <div className="rounded-xl border p-4">
                            <div className="text-sm text-muted-foreground">Historische Fälle</div>
                            <div className="mt-2 text-2xl font-semibold">
                              {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                          <div>
                            `Historische Fälle` ist die echte Stichprobe hinter der Zahl. Du siehst also nicht einfach eine
                            Behauptung, sondern eine Auswertung über {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}.
                          </div>
                          <div className="mt-2">
                            Wenn `Durchschnitt` und `Median` beide positiv sind und die `Positivquote` hoch ist, ist das Muster meist
                            stabiler. Wenn der Durchschnitt stark positiv, der Median aber schwach ist, war das Muster eher von wenigen
                            Ausreißerjahren getrieben.
                          </div>
                        </div>

                        {selectedInsight.cases.length > 0 ? (
                          <div className="space-y-3">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="text-sm text-muted-foreground">
                                Historische Einzelfälle für {selectedInsight.label}. Wenn mehr Fälle existieren als unten sichtbar,
                                werden die neuesten gezeigt.
                              </div>
                              <div className="relative w-full lg:max-w-xs">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                  value={caseQuery}
                                  onChange={(event) => setCaseQuery(event.target.value)}
                                  placeholder="2022, 2024-03, 1950 ..."
                                  className="pl-9"
                                />
                              </div>
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Fall</TableHead>
                                  <TableHead>Zeitraum</TableHead>
                                  <TableHead>Return</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {filteredCases.length > 0 ? (
                                  filteredCases.map((entry) => (
                                    <TableRow key={`${entry.label}-${entry.startDate}-${entry.endDate}`}>
                                      <TableCell className="font-medium">{entry.label}</TableCell>
                                      <TableCell>{formatPeriod(entry.startDate, entry.endDate)}</TableCell>
                                      <TableCell className={toneClass(entry.returnPct)}>{formatPct(entry.returnPct, 2)}</TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                                      Keine historischen Fälle für den aktuellen Suchbegriff gefunden.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                            {selectedInsight.sampleSize > selectedInsight.cases.length ? (
                              <div className="text-xs text-muted-foreground">
                                Gezeigt werden {selectedInsight.cases.length} neuere Fälle von insgesamt{" "}
                                {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Für den aktuellen Filter gibt es keinen Treffer. Nimm `Alles` oder suche breiter.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Aktiver Filter</CardTitle>
                    <CardDescription>
                      Die Kacheln unten reagieren auf deinen Filter und bleiben anklickbar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border p-4">
                      <div className="text-sm text-muted-foreground">Ansicht</div>
                      <div className="mt-2 text-lg font-semibold">
                        {FILTERS.find((filter) => filter.key === activeFilter)?.label ?? "Alles"}
                      </div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-sm text-muted-foreground">Suche</div>
                      <div className="mt-2 text-lg font-semibold">{deferredInsightQuery || "Keine"}</div>
                    </div>
                    <div className="rounded-xl border p-4">
                      <div className="text-sm text-muted-foreground">Ausgewählt</div>
                      <div className="mt-2 text-lg font-semibold">{selectedInsight?.label ?? "-"}</div>
                    </div>
                    <div className="rounded-xl border p-4 text-sm text-muted-foreground">
                      Tipp: Klicke im Vergleichsboard weiter unten auf einen Markt, um die gesamte Seite direkt darauf
                      umzuschalten.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <SeasonalityHeatmap
            title="Monats-Heatmap"
            description="Echte Monatsfenster pro Jahr. Klick auf einen Monat zeigt dir die historischen Einzelfälle und Kennzahlen."
            selectedId={selectedInsight?.id ?? null}
            onSelect={handleInsightSelect}
            items={data.monthly.map((item) => ({
              id: `month:${item.label}`,
              label: item.label,
              value: item.avgReturnPct,
              sublabel: `${formatCount(item.sampleSize, item.sampleUnit ?? "Jahre")} · Positiv ${formatPct(
                item.positiveRatePct,
                0
              )}`,
            }))}
          />

          <SeasonalityHeatmap
            title="Zyklus-Heatmap"
            description="Turn of Month, FOMC, OpEx und andere Marktfenster. Klickbar für Detailansicht und historische Fälle."
            selectedId={selectedInsight?.id ?? null}
            onSelect={handleInsightSelect}
            items={data.eventCycles.map((item) => ({
              id: `event:${item.slug}`,
              label: item.label,
              value: item.avgReturnPct,
              sublabel: `${formatCount(item.sampleSize, item.sampleUnit ?? "Fenster")} · Median ${formatPct(
                item.medianReturnPct,
                2
              )}`,
            }))}
          />

          <SeasonalityHeatmap
            title="Wochentag-Heatmap"
            description="Tagesreturns nach Wochentag. Hier sind die Samples einzelne historische Handelstage."
            selectedId={selectedInsight?.id ?? null}
            onSelect={handleInsightSelect}
            items={data.weekday.map((item) => ({
              id: `weekday:${item.label}`,
              label: item.label,
              value: item.avgReturnPct,
              sublabel: `${formatCount(item.sampleSize, item.sampleUnit ?? "Handelstage")} · Positiv ${formatPct(
                item.positiveRatePct,
                0
              )}`,
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle>Vergleichsboard</CardTitle>
              <CardDescription>
                Klick auf eine Zeile lädt den Markt. So findest du direkt, welcher Index oder Sektor saisonal besser passt.
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
                      <TableRow
                        key={row.symbol}
                        className="cursor-pointer"
                        onClick={() => handleSymbolLoad(row.symbol)}
                      >
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
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Monatsmuster
                </CardTitle>
                <CardDescription>Sortierbare Bezugstabelle für Monatsergebnisse über viele Jahre.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Monat</TableHead>
                      <TableHead>Durchschnitt</TableHead>
                      <TableHead>Median</TableHead>
                      <TableHead>Positiv</TableHead>
                      <TableHead>Fälle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.monthly.map((bucket) => (
                      <TableRow
                        key={bucket.label}
                        className="cursor-pointer"
                        onClick={() => handleInsightSelect(`month:${bucket.label}`)}
                      >
                        <TableCell className="font-medium">{bucket.label}</TableCell>
                        <TableCell className={toneClass(bucket.avgReturnPct)}>{formatPct(bucket.avgReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(bucket.medianReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(bucket.positiveRatePct, 0)}</TableCell>
                        <TableCell>{formatCount(bucket.sampleSize, bucket.sampleUnit ?? "Jahre")}</TableCell>
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
                <CardDescription>Kalendereffekte wie Turn of Month, Santa Rally, FOMC und OpEx.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Zyklus</TableHead>
                      <TableHead>Durchschnitt</TableHead>
                      <TableHead>Median</TableHead>
                      <TableHead>Positiv</TableHead>
                      <TableHead>Fälle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.eventCycles.map((cycle) => (
                      <TableRow
                        key={cycle.slug}
                        className="cursor-pointer"
                        onClick={() => handleInsightSelect(`event:${cycle.slug}`)}
                      >
                        <TableCell>
                          <div className="font-medium">{cycle.label}</div>
                          <div className="text-xs text-muted-foreground">{cycle.description}</div>
                        </TableCell>
                        <TableCell className={toneClass(cycle.avgReturnPct)}>{formatPct(cycle.avgReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(cycle.medianReturnPct, 2)}</TableCell>
                        <TableCell>{formatPct(cycle.positiveRatePct, 0)}</TableCell>
                        <TableCell>{formatCount(cycle.sampleSize, cycle.sampleUnit ?? "Fenster")}</TableCell>
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
              <CardDescription>Klick auf ein Badge springt direkt in die Detailansicht dieses Zyklus.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.eventCycles
                  .slice()
                  .sort((a, b) => b.avgReturnPct - a.avgReturnPct)
                  .map((cycle) => (
                    <button key={cycle.slug} type="button" onClick={() => handleInsightSelect(`event:${cycle.slug}`)}>
                      <Badge variant="secondary" className={toneClass(cycle.avgReturnPct)}>
                        {cycle.label} {formatPct(cycle.avgReturnPct, 2)}
                      </Badge>
                    </button>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Presidential Cycle</CardTitle>
              <CardDescription>
                US-Wahlzyklus mit Post-Election, Midterm, Pre-Election und Election Years. Ebenfalls klickbar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Jahrestyp</TableHead>
                    <TableHead>Durchschnitt</TableHead>
                    <TableHead>Median</TableHead>
                    <TableHead>Positiv</TableHead>
                    <TableHead>Avg Max DD</TableHead>
                    <TableHead>Fälle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.presidentialCycle.summary.map((row) => (
                    <TableRow
                      key={row.cycleKey}
                      className="cursor-pointer"
                      onClick={() => handleInsightSelect(`cycle:${row.cycleKey}`)}
                    >
                      <TableCell className="font-medium">{row.label}</TableCell>
                      <TableCell className={toneClass(row.avgReturnPct)}>{formatPct(row.avgReturnPct, 1)}</TableCell>
                      <TableCell>{formatPct(row.medianReturnPct, 1)}</TableCell>
                      <TableCell>{formatPct(row.positiveRatePct, 0)}</TableCell>
                      <TableCell className={toneClass(row.avgMaxDrawdownPct)}>{formatPct(row.avgMaxDrawdownPct, 1)}</TableCell>
                      <TableCell>{formatCount(row.sampleSize, "Jahre")}</TableCell>
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
                Wie in deinem Beispielbild: Midterm-Jahre mit maximalem Drawdown, Tiefpunkt und 12-Monats-Return ab dem Tief.
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

          <Card>
            <CardHeader>
              <CardTitle>Quellenbibliothek</CardTitle>
              <CardDescription>
                Externe Vergleichsquellen zum Durchklicken: offizielle Kalender, historische Charts und akademische Arbeiten.
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
      ) : null}
    </div>
  );
}
