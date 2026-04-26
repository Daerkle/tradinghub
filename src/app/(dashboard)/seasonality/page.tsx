"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Database,
  Filter,
  Grid3X3,
  Landmark,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { readClientJsonCache, writeClientJsonCache } from "@/lib/client-json-cache";
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

const SEASONALITY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
  {
    title: "Polygon Aggregates",
    category: "Pro-Daten",
    url: "https://polygon.io/docs/rest/stocks/aggregates/custom-bars",
    note: "Offizielle OHLCV-Aggregate für historische Tagesbars und intraday Bars.",
  },
  {
    title: "Nasdaq Data Link",
    category: "Pro-Daten",
    url: "https://docs.data.nasdaq.com/docs/getting-started",
    note: "Datenmarktplatz mit APIs für historische, verzögerte und Echtzeit-Datenprodukte.",
  },
  {
    title: "Alpha Vantage Daily Adjusted",
    category: "API",
    url: "https://www.alphavantage.co/documentation/",
    note: "Daily Adjusted OHLCV inklusive Split- und Dividenden-Adjustments.",
  },
  {
    title: "EODHD End-of-Day",
    category: "API",
    url: "https://eodhd.com/knowledgebase/",
    note: "EOD-, Delayed- und historische Preisdaten mit globaler Aktien- und ETF-Abdeckung.",
  },
];

const FILTERS = [
  { key: "all", label: "Alles" },
  { key: "month", label: "Monate" },
  { key: "event", label: "Wochen/Fenster" },
  { key: "weekday", label: "Tage" },
  { key: "cycle", label: "Wahljahre" },
] as const;

const MONTH_LABELS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const WEEKDAY_LABELS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

const METHOD_SUMMARY = [
  {
    label: "Monate",
    value: "1 Monatsreturn pro Jahr",
    detail: "Zeigt, ob ein kompletter Kalendermonat historisch Rückenwind oder Gegenwind hatte.",
  },
  {
    label: "Wochen/Fenster",
    value: "3-10 Handelstage",
    detail: "Turn of Month, OpEx, Earnings, Santa Rally und Quartalsfenster werden als echte Handelsfenster gemessen.",
  },
  {
    label: "Tage",
    value: "einzelne Tagesreturns",
    detail: "Wochentage zeigen Timing-Bias, aber keine eigenständige Marktmeinung.",
  },
  {
    label: "Jahre",
    value: "US-Wahlzyklus",
    detail: "Post-Election, Midterm, Pre-Election und Election werden als Jahrestypen verglichen.",
  },
];

const SEASONALITY_GLOSSARY: Array<{
  labels: string[];
  title: string;
  short: string;
  details: string;
}> = [
  {
    labels: ["Turn of Month"],
    title: "Turn of Month",
    short: "Letzter Handelstag des alten Monats plus die ersten Handelstage des neuen Monats.",
    details: "Dieses Fenster wird oft untersucht, weil zum Monatswechsel Gehalts-, Sparplan- und Fondsflüsse in den Markt laufen können.",
  },
  {
    labels: ["Turn of Quarter"],
    title: "Turn of Quarter",
    short: "Letzte Handelstage eines Quartals plus die ersten des neuen Quartals.",
    details: "Ähnlich wie Turn of Month, nur auf Quartalsebene. Kann durch Rebalancing, Window Dressing und institutionelle Umschichtungen beeinflusst sein.",
  },
  {
    labels: ["Monatsstart", "Erster Handelstag", "Erste Woche", "Erste Monatshälfte"],
    title: "Monatsstart-Fenster",
    short: "Frühe Handelstage eines Monats.",
    details: "Hier schaut man, ob ein Markt zu Beginn eines Monats typischerweise stärker oder schwächer läuft als im Rest des Monats.",
  },
  {
    labels: ["Monatsende", "Letzter Handelstag", "Letzte Woche", "Zweite Monatshälfte"],
    title: "Monatsende-Fenster",
    short: "Spätere Handelstage eines Monats.",
    details: "Hilft beim Vergleich, ob Stärke eher früh oder spät im Monatsverlauf auftritt.",
  },
  {
    labels: ["January Effect", "Erste 5 Tage Januar"],
    title: "January Effect",
    short: "Die Idee, dass Januar oder die ersten Januar-Tage besonders stark sein können.",
    details: "Historisch wird oft untersucht, ob frische Jahresallokationen, Steuer-Effekte und neue Positionierungen zu besonderer Stärke zum Jahresanfang führen.",
  },
  {
    labels: ["OpEx-Woche", "OpEx-Freitag", "OpEx-Folgewoche"],
    title: "OpEx",
    short: "Options Expiration, also der Verfallstag bzw. die Verfallswoche von Optionen.",
    details: "Dabei schaut man, ob Verfallstermine und das Abwickeln von Optionspositionen den Markt kurzfristig beeinflussen.",
  },
  {
    labels: ["Triple Witching"],
    title: "Triple Witching",
    short: "Quartalsverfall in März, Juni, September und Dezember.",
    details: "An diesen Terminen laufen mehrere Derivate-Arten gleichzeitig aus. Dadurch können Volumen und kurzfristige Kursverzerrungen steigen.",
  },
  {
    labels: ["Earnings Season"],
    title: "Earnings Season",
    short: "Die ersten Wochen einer Quartalsberichtssaison.",
    details: "Hier wird gemessen, ob Märkte in typischen Berichtssaisons überdurchschnittlich stark oder schwach tendieren.",
  },
  {
    labels: ["Santa Rally"],
    title: "Santa Rally",
    short: "Letzte Handelstage im Dezember plus die ersten Handelstage im Januar.",
    details: "Ein bekanntes saisonales Fenster rund um Jahresende, das oft mit dünneren Märkten, positiver Stimmung und frischen Zuflüssen begründet wird.",
  },
  {
    labels: ["Nov bis Apr", "Mai bis Okt"],
    title: "Halloween-Effekt",
    short: "Vergleich des Winterhalbjahrs gegen das Sommerhalbjahr.",
    details: "Die bekannte Faustregel dahinter ist sinngemäß 'Sell in May'. Gemessen wird, ob November bis April historisch stärker war als Mai bis Oktober.",
  },
  {
    labels: ["FOMC-Fenster", "FOMC -1", "FOMC +1", "FOMC +2"],
    title: "FOMC",
    short: "Sitzung der US-Notenbank Fed, bei der Zinsentscheidungen und geldpolitische Signale kommen.",
    details: "Diese Fenster messen, wie sich Märkte vor und nach Fed-Terminen im Durchschnitt verhalten haben.",
  },
  {
    labels: ["Post-Election", "Midterm", "Pre-Election", "Election", "Midterm Drawdowns & Recoveries"],
    title: "US-Wahlzyklus",
    short: "Vierjahreszyklus innerhalb einer US-Präsidentschaft.",
    details: "Dabei wird verglichen, wie Märkte in Post-Election-, Midterm-, Pre-Election- und Election-Jahren historisch gelaufen sind.",
  },
  {
    labels: ["Mo", "Di", "Mi", "Do", "Fr"],
    title: "Wochentagseffekt",
    short: "Vergleich der durchschnittlichen Renditen nach Handelstag.",
    details: "Damit sieht man, ob bestimmte Wochentage historisch häufiger Stärke oder Schwäche gezeigt haben.",
  },
];

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

type EventYearComparisonColumn = {
  id: string;
  slug: string;
  label: string;
  avgReturnPct: number;
};

type EventYearComparisonRow = {
  year: number;
  values: Record<string, { avgReturnPct: number | null; caseCount: number }>;
  compositeAvgReturnPct: number | null;
};

type EventAlignmentRow = {
  slug: string;
  label: string;
  values: Record<string, { agreementPct: number | null; overlapYears: number }>;
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

function formatDateLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDateTimeLabel(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = average(values);
  if (mean === null) return null;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function shortenLabel(label: string, maxLength = 18): string {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}…`;
}

function sampleQuality(sampleSize: number, sampleUnit: string): { label: string; className: string } {
  const robustLimit = sampleUnit === "Handelstage" ? 120 : sampleUnit === "Fenster" ? 30 : 12;
  const usefulLimit = sampleUnit === "Handelstage" ? 60 : sampleUnit === "Fenster" ? 12 : 8;
  if (sampleSize >= robustLimit) {
    return { label: "belastbar", className: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" };
  }
  if (sampleSize >= usefulLimit) {
    return { label: "brauchbar", className: "border-amber-500/50 text-amber-700 dark:text-amber-300" };
  }
  return { label: "dünn", className: "border-rose-500/50 text-rose-700 dark:text-rose-300" };
}

function getThirdFridayDay(year: number, month: number): number {
  let fridayCount = 0;
  for (let day = 1; day <= 31; day++) {
    const date = new Date(year, month, day);
    if (date.getMonth() !== month) break;
    if (date.getDay() === 5) fridayCount += 1;
    if (fridayCount === 3) return day;
  }
  return 0;
}

function addUniqueSlug(slugs: string[], slug: string) {
  if (!slugs.includes(slug)) slugs.push(slug);
}

function currentEventSlugs(date: Date): string[] {
  const slugs: string[] = [];
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();

  if (day <= 3) addUniqueSlug(slugs, "turn-of-month");
  if (day <= 7) {
    addUniqueSlug(slugs, "month-start");
    addUniqueSlug(slugs, "first-week");
  }
  if (day >= lastDay - 2) addUniqueSlug(slugs, "month-end");
  if (day >= lastDay - 6) addUniqueSlug(slugs, "last-week");

  if ([0, 3, 6, 9].includes(month) && day <= 15) addUniqueSlug(slugs, "earnings-season");
  if ([0, 3, 6, 9].includes(month) && day <= 7) addUniqueSlug(slugs, "quarter-start-week");
  if ([2, 5, 8, 11].includes(month) && day >= lastDay - 6) addUniqueSlug(slugs, "quarter-end-week");
  if (month === 0 && day <= 10) {
    addUniqueSlug(slugs, "january-effect");
    addUniqueSlug(slugs, "first-five-january");
  }
  if ((month === 11 && day >= 22) || (month === 0 && day <= 5)) addUniqueSlug(slugs, "santa-rally");
  if (month >= 10 || month <= 3) addUniqueSlug(slugs, "nov-apr");
  if (month >= 4 && month <= 9) addUniqueSlug(slugs, "may-oct");

  const thirdFriday = getThirdFridayDay(year, month);
  if (thirdFriday > 0) {
    const diffDays = Math.floor(
      (new Date(year, month, day).getTime() - new Date(year, month, thirdFriday).getTime()) / (24 * 60 * 60 * 1000)
    );
    if (diffDays >= -4 && diffDays <= 0) addUniqueSlug(slugs, "opex-week");
    if (diffDays === 0) addUniqueSlug(slugs, "opex-friday");
    if (diffDays > 0 && diffDays <= 7) addUniqueSlug(slugs, "opex-next-week");
    if ([2, 5, 8, 11].includes(month) && diffDays >= -4 && diffDays <= 0) addUniqueSlug(slugs, "triple-witching");
  }

  return slugs;
}

type CalendarInsight = {
  id: string;
  label: string;
  type: string;
  reason: string;
  avgReturnPct: number | null;
  positiveRatePct: number | null;
  sampleSize: number;
  sampleUnit: string;
};

function buildCurrentCalendarInsights(data: MarketSeasonalityOverview | null, date: Date | null): CalendarInsight[] {
  if (!data || !date) return [];
  const items: CalendarInsight[] = [];
  const monthLabel = MONTH_LABELS[date.getMonth()];
  const monthBucket = data.monthly.find((bucket) => bucket.label === monthLabel);
  if (monthBucket) {
    items.push({
      id: `month:${monthBucket.label}`,
      label: monthBucket.label,
      type: "Monat",
      reason: "aktueller Kalendermonat",
      avgReturnPct: monthBucket.avgReturnPct,
      positiveRatePct: monthBucket.positiveRatePct,
      sampleSize: monthBucket.sampleSize,
      sampleUnit: monthBucket.sampleUnit ?? "Jahre",
    });
  }

  const weekdayLabel = WEEKDAY_LABELS[date.getDay()];
  const weekdayBucket = data.weekday.find((bucket) => bucket.label === weekdayLabel);
  if (weekdayBucket) {
    items.push({
      id: `weekday:${weekdayBucket.label}`,
      label: weekdayBucket.label,
      type: "Tag",
      reason: "aktueller Wochentag",
      avgReturnPct: weekdayBucket.avgReturnPct,
      positiveRatePct: weekdayBucket.positiveRatePct,
      sampleSize: weekdayBucket.sampleSize,
      sampleUnit: weekdayBucket.sampleUnit ?? "Handelstage",
    });
  }

  for (const slug of currentEventSlugs(date)) {
    const cycle = data.eventCycles.find((item) => item.slug === slug);
    if (!cycle) continue;
    items.push({
      id: `event:${cycle.slug}`,
      label: cycle.label,
      type: "Fenster",
      reason: "kalendernahes Wochen-/Eventfenster",
      avgReturnPct: cycle.avgReturnPct,
      positiveRatePct: cycle.positiveRatePct,
      sampleSize: cycle.sampleSize,
      sampleUnit: cycle.sampleUnit ?? "Fenster",
    });
  }

  return items;
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

function getGlossaryEntry(label: string | null | undefined) {
  if (!label) return null;
  const normalized = label.toLowerCase().trim();
  return (
    SEASONALITY_GLOSSARY.find((entry) =>
      entry.labels.some((candidate) => candidate.toLowerCase() === normalized)
    ) ?? null
  );
}

function buildInsightGuidance(insight: SeasonalityInsight | null, dispersionPct: number | null) {
  if (!insight) return null;

  const avg = insight.avgReturnPct ?? 0;
  const median = insight.medianReturnPct ?? 0;
  const positiveRate = insight.positiveRatePct ?? 0;
  const sampleSize = insight.sampleSize;
  const sampleIsRobust =
    insight.sampleUnit === "Handelstage"
      ? sampleSize >= 120
      : insight.sampleUnit === "Fenster"
        ? sampleSize >= 30
        : sampleSize >= 12;
  const stable = typeof dispersionPct === "number" ? dispersionPct < 4 : false;
  const supportive = avg > 0 && median > 0 && positiveRate >= 55;
  const strongSupport = avg > 0 && median > 0 && positiveRate >= 60 && sampleIsRobust;
  const headwind = avg < 0 && median <= 0 && positiveRate < 50;

  const useCase =
    insight.group === "weekday"
      ? "Für Timing und Tagesgewichtung. Nicht als alleinige Marktmeinung."
      : insight.group === "cycle"
        ? "Als Makro-Kontext für Wahljahre und Regime, nicht für Intraday-Einstiege."
        : "Als Kontextfilter für Bias, Watchlist und Positionsgröße.";

  if (strongSupport) {
    return {
      badge: "Nützlich",
      headline: "Statistischer Rückenwind",
      summary: "Das Muster war historisch mehrheitlich positiv und der Median bestätigt den Durchschnitt.",
      useCase,
      caution: stable
        ? "Trotzdem kein Einstiegssignal. Nutze es als Rückenwind für Setups, die technisch und fundamental passen."
        : "Der Rückenwind ist da, aber die Schwankung zwischen den Jahren war spürbar. Also nicht blind darauf verlassen.",
    };
  }

  if (headwind) {
    return {
      badge: "Vorsicht",
      headline: "Eher Gegenwind",
      summary: "Historisch war dieses Fenster eher schwach. Durchschnitt, Median und Positivquote sprechen nicht für Rückenwind.",
      useCase:
        insight.group === "weekday"
          ? "Nützlich, um schwächere Tage eher defensiv zu handeln oder zu meiden."
          : "Nützlich, um Longs kritischer zu filtern oder Gewinne schneller zu sichern.",
      caution: sampleIsRobust
        ? "Das ist ein brauchbarer Warnhinweis, aber kein Short-Signal für sich allein."
        : "Das Muster wirkt schwach, aber die Stichprobe ist nicht groß genug für harte Regeln.",
    };
  }

  if (supportive) {
    return {
      badge: "Kontext",
      headline: "Positiv, aber nicht glasklar",
      summary: "Es gibt einen positiven Bias, aber nicht stark genug für ein aggressives Urteil.",
      useCase,
      caution: sampleIsRobust
        ? "Gut als Zusatzfilter, aber nicht stark genug, um allein Entscheidungen darauf aufzubauen."
        : "Kleine oder mittlere Stichprobe. Eher als Hintergrundwissen nutzen.",
    };
  }

  return {
    badge: "Neutral",
    headline: "Gemischtes Muster",
    summary: "Die Kennzahlen widersprechen sich oder liefern kein klares Bild.",
    useCase: "Hilft eher beim Einordnen als beim Handeln. Andere Signale sollten hier klar wichtiger sein.",
    caution: "Wenn Durchschnitt und Median auseinanderlaufen oder die Positivquote nur um 50% liegt, ist das meist kein belastbarer Edge.",
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

function extractCaseYear(caseItem: SeasonalityCase): number | null {
  const source = caseItem.startDate || caseItem.endDate || caseItem.label;
  const match = source.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : null;
}

function buildEventYearComparison(data: MarketSeasonalityOverview | null): {
  columns: EventYearComparisonColumn[];
  rows: EventYearComparisonRow[];
} {
  if (!data) return { columns: [], rows: [] };

  const columns = data.eventCycles
    .filter((cycle) => (cycle.cases?.length ?? 0) > 0)
    .slice()
    .sort((a, b) => {
      const strengthDiff = Math.abs(b.avgReturnPct) - Math.abs(a.avgReturnPct);
      if (strengthDiff !== 0) return strengthDiff;
      return b.sampleSize - a.sampleSize;
    })
    .slice(0, 6)
    .map((cycle) => ({
      id: `event:${cycle.slug}`,
      slug: cycle.slug,
      label: cycle.label,
      avgReturnPct: cycle.avgReturnPct,
    }));

  const yearEventValues = new Map<number, Map<string, number[]>>();
  for (const cycle of data.eventCycles) {
    for (const caseItem of cycle.cases ?? []) {
      const year = extractCaseYear(caseItem);
      if (year === null) continue;
      const perYear = yearEventValues.get(year) ?? new Map<string, number[]>();
      const returns = perYear.get(cycle.slug) ?? [];
      returns.push(caseItem.returnPct);
      perYear.set(cycle.slug, returns);
      yearEventValues.set(year, perYear);
    }
  }

  const rows = Array.from(yearEventValues.keys())
    .sort((a, b) => b - a)
    .slice(0, 15)
    .map((year) => {
      const perYear = yearEventValues.get(year) ?? new Map<string, number[]>();
      const values: EventYearComparisonRow["values"] = {};

      for (const column of columns) {
        const returns = perYear.get(column.slug) ?? [];
        values[column.slug] = {
          avgReturnPct: average(returns),
          caseCount: returns.length,
        };
      }

      const yearlyReturns = Object.values(values)
        .map((entry) => entry.avgReturnPct)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      return {
        year,
        values,
        compositeAvgReturnPct: average(yearlyReturns),
      };
    });

  return { columns, rows };
}

function buildEventYearAverageMap(cases: SeasonalityCase[]): Map<number, number> {
  const yearValues = new Map<number, number[]>();

  for (const caseItem of cases) {
    const year = extractCaseYear(caseItem);
    if (year === null) continue;
    const values = yearValues.get(year) ?? [];
    values.push(caseItem.returnPct);
    yearValues.set(year, values);
  }

  const averages = new Map<number, number>();
  for (const [year, values] of yearValues.entries()) {
    const avg = average(values);
    if (avg !== null) averages.set(year, avg);
  }
  return averages;
}

function buildEventAlignmentMatrix(
  cycles: Array<{ slug: string; label: string; cases?: SeasonalityCase[] }>
): EventAlignmentRow[] {
  const perEvent = new Map(cycles.map((cycle) => [cycle.slug, buildEventYearAverageMap(cycle.cases ?? [])]));

  return cycles.map((left) => {
    const leftYears = perEvent.get(left.slug) ?? new Map<number, number>();
    const values: EventAlignmentRow["values"] = {};

    for (const right of cycles) {
      const rightYears = perEvent.get(right.slug) ?? new Map<number, number>();
      const overlap = Array.from(leftYears.keys()).filter((year) => rightYears.has(year));
      if (overlap.length === 0) {
        values[right.slug] = { agreementPct: null, overlapYears: 0 };
        continue;
      }

      let sameDirection = 0;
      for (const year of overlap) {
        const leftValue = leftYears.get(year) ?? 0;
        const rightValue = rightYears.get(year) ?? 0;
        if ((leftValue >= 0 && rightValue >= 0) || (leftValue < 0 && rightValue < 0)) {
          sameDirection += 1;
        }
      }

      values[right.slug] = {
        agreementPct: (sameDirection / overlap.length) * 100,
        overlapYears: overlap.length,
      };
    }

    return {
      slug: left.slug,
      label: left.label,
      values,
    };
  });
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
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="pb-2 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Grid3X3 className="h-4 w-4 sm:h-5 sm:w-5" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`${title}: ${item.label}`}
              title={`${title}: ${item.label}`}
              onClick={() => onSelect(item.id)}
              className={`min-h-[72px] rounded-md border px-2.5 py-2 text-left transition-all hover:border-primary/60 sm:min-h-[80px] ${
                item.id === selectedId ? "ring-2 ring-primary/70" : ""
              } ${heatClass(item.value)}`}
            >
              <div className="break-words text-[11px] leading-tight opacity-85 sm:text-xs">{item.label}</div>
              <div className="mt-1 text-sm font-semibold sm:text-base">{formatPct(item.value, 2)}</div>
              {item.sublabel ? (
                <div className="mt-1 line-clamp-2 text-[10px] leading-tight opacity-80 sm:text-[11px]">{item.sublabel}</div>
              ) : null}
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
  const [insightDialogOpen, setInsightDialogOpen] = useState(false);
  const [caseQuery, setCaseQuery] = useState("");
  const [selectedEventSlugs, setSelectedEventSlugs] = useState<string[]>([]);
  const [calendarIso, setCalendarIso] = useState<string | null>(null);
  const deferredInsightQuery = useDeferredValue(insightQuery);
  const deferredCaseQuery = useDeferredValue(caseQuery);

  useEffect(() => {
    setCalendarIso(new Date().toISOString());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const cacheKey = `seasonality:v2:${activeSymbol}`;
      const cached = readClientJsonCache<MarketSeasonalityOverview>(cacheKey, {
        maxAgeMs: SEASONALITY_MAX_AGE_MS,
        allowStale: true,
      });

      if (cached) {
        setData(cached.data);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }

      try {
        setError(null);
        const response = await fetch(`/api/seasonality/market/${encodeURIComponent(activeSymbol)}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as MarketSeasonalityOverview;
        if (!cancelled) {
          setData(payload);
          writeClientJsonCache(cacheKey, payload);
        }
      } catch (loadError) {
        console.error("Failed to load market seasonality", loadError);
        if (!cancelled && !cached) {
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
      const cacheKey = "seasonality:v2:comparison";
      const cached = readClientJsonCache<ComparisonEntry[]>(cacheKey, {
        maxAgeMs: SEASONALITY_MAX_AGE_MS,
        allowStale: true,
      });

      if (cached) {
        setComparison(cached.data);
        setComparisonLoading(false);
      } else {
        setComparisonLoading(true);
      }

      try {
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

        if (!cancelled) {
          setComparison(rows);
          writeClientJsonCache(cacheKey, rows);
        }
      } catch (comparisonError) {
        console.error("Failed to load seasonality comparison", comparisonError);
        if (!cancelled && !cached) setComparison([]);
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
  const eventYearComparison = buildEventYearComparison(data);
  const selectedInsight = findSelectedInsight(insights, selectedInsightId, activeFilter, deferredInsightQuery);
  const filteredCases =
    selectedInsight?.cases.filter((entry) => {
      const query = deferredCaseQuery.trim().toLowerCase();
      if (!query) return true;
      return `${entry.label} ${entry.startDate} ${entry.endDate}`.toLowerCase().includes(query);
    }) ?? [];
  const monthChartData =
    data?.monthly.map((bucket) => ({
      id: `month:${bucket.label}`,
      label: bucket.label,
      avgReturnPct: Number(bucket.avgReturnPct.toFixed(2)),
      medianReturnPct: Number(bucket.medianReturnPct.toFixed(2)),
      positiveRatePct: Number(bucket.positiveRatePct.toFixed(0)),
    })) ?? [];
  const eventRankingData =
    data?.eventCycles
      .map((cycle) => ({
        id: `event:${cycle.slug}`,
        label: cycle.label,
        shortLabel: shortenLabel(cycle.label, 16),
        avgReturnPct: Number(cycle.avgReturnPct.toFixed(2)),
        positiveRatePct: Number(cycle.positiveRatePct.toFixed(0)),
      }))
      .sort((a, b) => b.avgReturnPct - a.avgReturnPct) ?? [];
  const comparisonChartData = comparison
    .slice()
    .sort((a, b) => (b.strongestEventReturn ?? -Infinity) - (a.strongestEventReturn ?? -Infinity))
    .map((row) => ({
      label: row.label,
      symbol: row.symbol,
      strongestEventReturn: Number((row.strongestEventReturn ?? 0).toFixed(2)),
    }));
  const selectedCaseValues = selectedInsight?.cases.map((entry) => entry.returnPct) ?? [];
  const selectedCaseStats = {
    bestCase: selectedInsight?.cases.slice().sort((a, b) => b.returnPct - a.returnPct)[0] ?? null,
    worstCase: selectedInsight?.cases.slice().sort((a, b) => a.returnPct - b.returnPct)[0] ?? null,
    dispersionPct: standardDeviation(selectedCaseValues),
    recentAveragePct: average(selectedCaseValues.slice(-5)),
  };
  const selectedCaseChartData =
    selectedInsight?.cases
      .slice()
      .reverse()
      .map((entry) => ({
        label: shortenLabel(entry.label, 14),
        fullLabel: entry.label,
        returnPct: Number(entry.returnPct.toFixed(2)),
      })) ?? [];
  const topPositiveCases = selectedInsight?.cases.slice().sort((a, b) => b.returnPct - a.returnPct).slice(0, 5) ?? [];
  const topNegativeCases = selectedInsight?.cases.slice().sort((a, b) => a.returnPct - b.returnPct).slice(0, 5) ?? [];
  const selectedInsightGuidance = buildInsightGuidance(selectedInsight, selectedCaseStats.dispersionPct);
  const selectedEvents =
    data?.eventCycles
      .filter((cycle) => selectedEventSlugs.includes(cycle.slug))
      .sort((a, b) => selectedEventSlugs.indexOf(a.slug) - selectedEventSlugs.indexOf(b.slug)) ?? [];
  const selectedEventAlignment = buildEventAlignmentMatrix(selectedEvents);
  const bestPresidentialCycle =
    data?.presidentialCycle.summary.slice().sort((a, b) => b.avgReturnPct - a.avgReturnPct)[0] ?? null;
  const currentCalendarDate = calendarIso ? new Date(calendarIso) : null;
  const currentCalendarInsights = buildCurrentCalendarInsights(data, currentCalendarDate);

  useEffect(() => {
    if (!data) {
      setSelectedInsightId(null);
      setSelectedEventSlugs([]);
      return;
    }
    setSelectedInsightId(data.summary.strongestEvent ? `event:${data.summary.strongestEvent.slug}` : `month:${data.monthly[0]?.label ?? "Jan"}`);
    setSelectedEventSlugs(
      data.eventCycles
        .slice()
        .sort((a, b) => Math.abs(b.avgReturnPct) - Math.abs(a.avgReturnPct))
        .slice(0, 4)
        .map((cycle) => cycle.slug)
    );
    setCaseQuery("");
  }, [data]);

  const handleSymbolLoad = (symbol: string) => {
    const normalized = symbol.trim().toUpperCase() || "^GSPC";
    setSymbolInput(normalized);
    setActiveSymbol(normalized);
  };

  const handleInsightSelect = (id: string) => {
    const nextFilter = (id.split(":")[0] ?? "all") as InsightFilter;
    if (nextFilter === "month" || nextFilter === "event" || nextFilter === "weekday" || nextFilter === "cycle") {
      setActiveFilter(nextFilter);
    } else {
      setActiveFilter("all");
    }
    setInsightQuery("");
    setSelectedInsightId(id);
    setCaseQuery("");
    setInsightDialogOpen(true);
  };

  const toggleEventSelection = (slug: string) => {
    setSelectedEventSlugs((current) => {
      if (current.includes(slug)) {
        if (current.length === 1) return current;
        return current.filter((entry) => entry !== slug);
      }
      if (current.length >= 6) {
        return [...current.slice(1), slug];
      }
      return [...current, slug];
    });
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden [&_[data-slot=card]]:min-w-0 [&_[data-slot=card]]:overflow-hidden [&_[data-slot=card-content]]:min-w-0 [&_[data-slot=table-container]]:max-w-full">
      <Dialog open={insightDialogOpen && Boolean(selectedInsight)} onOpenChange={setInsightDialogOpen}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-hidden p-0 sm:max-w-4xl">
          {selectedInsight ? (
            <div className="flex max-h-[92dvh] flex-col">
              <DialogHeader className="border-b px-5 py-4 sm:px-6">
                <DialogTitle>{selectedInsight.label}</DialogTitle>
                <DialogDescription>{selectedInsight.description}</DialogDescription>
              </DialogHeader>

              <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
                {getGlossaryEntry(selectedInsight.label) ? (
                  <div className="rounded-md border border-sky-500/20 bg-sky-500/10 p-4 text-sm">
                    <div className="font-medium">{getGlossaryEntry(selectedInsight.label)?.title}</div>
                    <div className="mt-1 text-muted-foreground">{getGlossaryEntry(selectedInsight.label)?.short}</div>
                    <div className="mt-2 text-muted-foreground">{getGlossaryEntry(selectedInsight.label)?.details}</div>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md border p-3">
                    <div className="text-sm text-muted-foreground">Durchschnitt</div>
                    <div className={`mt-2 text-2xl font-semibold ${toneClass(selectedInsight.avgReturnPct)}`}>
                      {formatPct(selectedInsight.avgReturnPct, 2)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-sm text-muted-foreground">Median</div>
                    <div className={`mt-2 text-2xl font-semibold ${toneClass(selectedInsight.medianReturnPct)}`}>
                      {formatPct(selectedInsight.medianReturnPct, 2)}
                    </div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-sm text-muted-foreground">Positivquote</div>
                    <div className="mt-2 text-2xl font-semibold">{formatPct(selectedInsight.positiveRatePct, 0)}</div>
                  </div>
                  <div className="rounded-md border p-3">
                    <div className="text-sm text-muted-foreground">Historische Fälle</div>
                    <div className="mt-2 text-2xl font-semibold">
                      {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}
                    </div>
                  </div>
                </div>

                <div className="rounded-md border p-3 text-sm text-muted-foreground">
                  <div>
                    `Historische Fälle` ist die echte Stichprobe hinter der Zahl. Du siehst also keine Behauptung, sondern
                    eine Auswertung über {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}.
                  </div>
                  <div className="mt-2">
                    Wenn `Durchschnitt` und `Median` beide positiv sind und die `Positivquote` hoch ist, ist das Muster
                    meist stabiler. Wenn der Durchschnitt stark positiv, der Median aber schwach ist, wurde das Muster eher
                    von wenigen Ausreißerjahren getragen.
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fallverlauf</CardTitle>
                      <CardDescription>
                        Zeitlicher Verlauf der historischen Fälle des ausgewählten Musters.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="h-[300px] sm:h-[300px]">
                      {selectedCaseChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={selectedCaseChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.08)" vertical={false} />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 10 }}
                              axisLine={false}
                              tickLine={false}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              tickFormatter={(value) => `${value}%`}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip
                              formatter={(value: number) => [`${value.toFixed(2)}%`, "Return"]}
                              labelFormatter={(label) => {
                                const match = selectedCaseChartData.find((entry) => entry.label === label);
                                return match?.fullLabel ?? String(label);
                              }}
                            />
                            <Bar dataKey="returnPct" radius={[6, 6, 0, 0]}>
                              {selectedCaseChartData.map((entry) => (
                                <Cell
                                  key={`${entry.fullLabel}-${entry.label}`}
                                  fill={entry.returnPct >= 0 ? "oklch(0.63 0.18 160)" : "oklch(0.63 0.23 20)"}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Für dieses Muster liegen keine Fallreihen vor.
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Statistik-Board</CardTitle>
                      <CardDescription>Stabilität und Extremfälle des ausgewählten Musters.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-md border p-3">
                        <div className="text-sm text-muted-foreground">Bester Fall</div>
                        <div className={`mt-2 text-xl font-semibold ${toneClass(selectedCaseStats.bestCase?.returnPct)}`}>
                          {formatPct(selectedCaseStats.bestCase?.returnPct, 2)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{selectedCaseStats.bestCase?.label ?? "-"}</div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-sm text-muted-foreground">Schlechtester Fall</div>
                        <div className={`mt-2 text-xl font-semibold ${toneClass(selectedCaseStats.worstCase?.returnPct)}`}>
                          {formatPct(selectedCaseStats.worstCase?.returnPct, 2)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{selectedCaseStats.worstCase?.label ?? "-"}</div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-sm text-muted-foreground">Streuung</div>
                        <div className="mt-2 text-xl font-semibold">{formatPct(selectedCaseStats.dispersionPct, 2)}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Hohe Streuung heißt: das Muster war historisch deutlich ungleichmäßiger.
                        </div>
                      </div>
                      <div className="rounded-md border p-3">
                        <div className="text-sm text-muted-foreground">Ø letzte 5 Fälle</div>
                        <div className={`mt-2 text-xl font-semibold ${toneClass(selectedCaseStats.recentAveragePct)}`}>
                          {formatPct(selectedCaseStats.recentAveragePct, 2)}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Schnellcheck, ob das Muster in jüngerer Vergangenheit noch funktioniert hat.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {selectedInsight.cases.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Historische Einzelfälle</CardTitle>
                      <CardDescription>
                        Suche nach Jahren oder Teilzeiträumen und prüfe die realen historischen Fälle.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="relative w-full sm:max-w-xs">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={caseQuery}
                          onChange={(event) => setCaseQuery(event.target.value)}
                          placeholder="2022, 2024-03, 1950 ..."
                          className="pl-9"
                        />
                      </div>
                      <div className="max-h-[42dvh] overflow-y-auto rounded-md border">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background">
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
                        </div>
                      </div>
                      {selectedInsight.sampleSize > selectedInsight.cases.length ? (
                        <div className="text-xs text-muted-foreground">
                          Gezeigt werden {selectedInsight.cases.length} neuere Fälle von insgesamt{" "}
                          {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}.
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Top-Fälle</CardTitle>
                      <CardDescription>Die stärksten historischen Treffer.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fall</TableHead>
                              <TableHead>Zeitraum</TableHead>
                              <TableHead>Return</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topPositiveCases.map((entry) => (
                              <TableRow key={`${entry.label}-${entry.startDate}-top`}>
                                <TableCell className="font-medium">{entry.label}</TableCell>
                                <TableCell>{formatPeriod(entry.startDate, entry.endDate)}</TableCell>
                                <TableCell className={toneClass(entry.returnPct)}>{formatPct(entry.returnPct, 2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Flop-Fälle</CardTitle>
                      <CardDescription>Die schwächsten historischen Ausprägungen.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Fall</TableHead>
                              <TableHead>Zeitraum</TableHead>
                              <TableHead>Return</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topNegativeCases.map((entry) => (
                              <TableRow key={`${entry.label}-${entry.startDate}-flop`}>
                                <TableCell className="font-medium">{entry.label}</TableCell>
                                <TableCell>{formatPeriod(entry.startDate, entry.endDate)}</TableCell>
                                <TableCell className={toneClass(entry.returnPct)}>{formatPct(entry.returnPct, 2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-lg font-bold sm:text-2xl">Saisonalitäten</h1>
          <p className="hidden text-sm text-muted-foreground sm:mt-1 sm:block">
            Wahlzyklen, Kalendereffekte und typische Marktfenster wie Turn of Month oder Santa Rally.
          </p>
        </div>
        <div className="flex flex-row gap-2 sm:items-center">
          <Input
            value={symbolInput}
            onChange={(event) => setSymbolInput(event.target.value.toUpperCase())}
            placeholder="z. B. ^GSPC oder QQQ"
            className="h-9 min-w-0 flex-1 sm:w-48 sm:flex-none"
          />
          <Button
            onClick={() => handleSymbolLoad(symbolInput)}
            disabled={isLoading}
            size="sm"
            className="h-9 shrink-0 px-2.5 sm:px-3"
            aria-label="Saisonalitäten laden"
          >
            <RefreshCw className={`h-4 w-4 sm:mr-2 ${isLoading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Laden</span>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="inline-flex gap-2 whitespace-nowrap">
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
          <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Database className="h-4 w-4 sm:h-5 sm:w-5" />
                  Datenbasis & Logik
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {data.symbol}: {formatDateLabel(data.historyStart)} bis {formatDateLabel(data.historyEnd)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div className="rounded-md border p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Historie</div>
                    <div className="mt-1 text-base font-semibold">{data.historyYears} Jahre</div>
                    <div className="text-xs text-muted-foreground">{data.tradingDays} Handelstage</div>
                  </div>
                  <div className="rounded-md border p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Quelle</div>
                    <div className="mt-1 line-clamp-2 text-sm font-semibold">{data.source}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{data.sourceDetail ?? "Tägliche OHLCV-Historie"}</div>
                  </div>
                  <div className="rounded-md border p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Datenstand</div>
                    <div className="mt-1 text-sm font-semibold">{formatDateTimeLabel(data.fetchedAt)}</div>
                    <div className="text-xs text-muted-foreground">Servercache + lokaler Browsercache</div>
                  </div>
                  <div className="rounded-md border p-2.5">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Lesart</div>
                    <div className="mt-1 text-sm font-semibold">Ø + Median + Positivquote</div>
                    <div className="text-xs text-muted-foreground">Ausreißer werden sichtbar statt versteckt.</div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {METHOD_SUMMARY.map((item) => (
                    <div key={item.label} className="rounded-md border bg-muted/20 p-2.5">
                      <div className="font-medium">{item.label}</div>
                      <Badge variant="outline" className="mt-1 max-w-full whitespace-normal text-left text-[10px] leading-tight">
                        {item.value}
                      </Badge>
                      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <Landmark className="h-4 w-4 sm:h-5 sm:w-5" />
                  Jetzt relevant
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Kalenderkontext für heute plus die stärksten historischen Muster.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      data.summary.strongestEvent ? handleInsightSelect(`event:${data.summary.strongestEvent.slug}`) : undefined
                    }
                    className="rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Stärkstes Fenster</div>
                    <div className={`mt-1 break-words text-sm font-semibold ${toneClass(data.summary.strongestEvent?.avgReturnPct)}`}>
                      {data.summary.strongestEvent?.label ?? "-"} {formatPct(data.summary.strongestEvent?.avgReturnPct, 2)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      data.summary.bestMonth ? handleInsightSelect(`month:${data.summary.bestMonth.label}`) : undefined
                    }
                    className="rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Bester Monat</div>
                    <div className={`mt-1 text-sm font-semibold ${toneClass(data.summary.bestMonth?.avgReturnPct)}`}>
                      {data.summary.bestMonth?.label ?? "-"} {formatPct(data.summary.bestMonth?.avgReturnPct, 2)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      data.summary.bestWeekday ? handleInsightSelect(`weekday:${data.summary.bestWeekday.label}`) : undefined
                    }
                    className="rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Bester Tag</div>
                    <div className={`mt-1 text-sm font-semibold ${toneClass(data.summary.bestWeekday?.avgReturnPct)}`}>
                      {data.summary.bestWeekday?.label ?? "-"} {formatPct(data.summary.bestWeekday?.avgReturnPct, 2)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => (bestPresidentialCycle ? handleInsightSelect(`cycle:${bestPresidentialCycle.cycleKey}`) : undefined)}
                    className="rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Bestes Wahljahr</div>
                    <div className={`mt-1 break-words text-sm font-semibold ${toneClass(bestPresidentialCycle?.avgReturnPct)}`}>
                      {bestPresidentialCycle?.label ?? "-"} {formatPct(bestPresidentialCycle?.avgReturnPct, 1)}
                    </div>
                  </button>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Heute im Kalender</div>
                  {currentCalendarInsights.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {currentCalendarInsights.map((item) => {
                        const quality = sampleQuality(item.sampleSize, item.sampleUnit);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleInsightSelect(item.id)}
                            className={`rounded-md border p-2.5 text-left transition-colors hover:bg-muted/40 ${heatClass(item.avgReturnPct)}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="break-words text-sm font-semibold">{item.label}</div>
                                <div className="mt-0.5 text-[11px] opacity-80">
                                  {item.type} · {item.reason}
                                </div>
                              </div>
                              <Badge variant="outline" className={`shrink-0 bg-background/70 text-[10px] ${quality.className}`}>
                                {quality.label}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                              <span>Ø {formatPct(item.avgReturnPct, 2)}</span>
                              <span>Positiv {formatPct(item.positiveRatePct, 0)}</span>
                              <span>{formatCount(item.sampleSize, item.sampleUnit)}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-md border p-2.5 text-sm text-muted-foreground">
                      Heute liegt kein klarer Tages- oder Wochenfilter an. Nutze die Monats- und Fensterauswahl unten.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="hidden xl:block">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Filter className="h-4 w-4" />
                Glossar
              </CardTitle>
              <CardDescription>Die wichtigsten Begriffe kompakt, Details erscheinen zusätzlich im jeweiligen Dialog.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {SEASONALITY_GLOSSARY.slice(0, 8).map((entry) => (
                <div key={entry.title} className="rounded-md border p-2.5">
                  <div className="text-sm font-medium">{entry.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.short}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="text-base sm:text-lg">Muster prüfen</CardTitle>
              <CardDescription className="hidden sm:block">
                Suche nach `FOMC`, `Januar`, `Midterm` oder `OpEx` und tippe dann auf eine Kachel oder Tabellenzeile.
                Die Details zeigen Chart, Einzelfälle und Statistik.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="overflow-x-auto pb-1">
                  <div className="inline-flex gap-2 whitespace-nowrap">
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
                    <CardTitle>{selectedInsight?.label ?? "Keine Auswahl"}</CardTitle>
                    <CardDescription>
                      {selectedInsight?.description ??
                        "Passe den Filter an oder tippe auf eine Monats-, Wochen-/Fenster- oder Wahljahr-Kachel."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {selectedInsight ? (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-md border p-3">
                            <div className="text-sm text-muted-foreground">Durchschnitt</div>
                            <div className={`mt-2 text-2xl font-semibold ${toneClass(selectedInsight.avgReturnPct)}`}>
                              {formatPct(selectedInsight.avgReturnPct, 2)}
                            </div>
                          </div>
                          <div className="rounded-md border p-3">
                            <div className="text-sm text-muted-foreground">Median</div>
                            <div className={`mt-2 text-2xl font-semibold ${toneClass(selectedInsight.medianReturnPct)}`}>
                              {formatPct(selectedInsight.medianReturnPct, 2)}
                            </div>
                          </div>
                          <div className="rounded-md border p-3">
                            <div className="text-sm text-muted-foreground">Positivquote</div>
                            <div className="mt-2 text-2xl font-semibold">{formatPct(selectedInsight.positiveRatePct, 0)}</div>
                          </div>
                          <div className="rounded-md border p-3">
                            <div className="text-sm text-muted-foreground">Historische Fälle</div>
                            <div className="mt-2 text-2xl font-semibold">
                              {formatCount(selectedInsight.sampleSize, selectedInsight.sampleUnit)}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">
                          <div className="text-sm text-muted-foreground">Was das praktisch heißt</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{selectedInsightGuidance?.badge ?? "Kontext"}</Badge>
                            <span className="font-medium text-foreground">{selectedInsightGuidance?.headline ?? "Einordnung folgt"}</span>
                          </div>
                          <div className="mt-3 text-sm text-muted-foreground">
                            {selectedInsightGuidance?.summary}
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Nutzen:</span> {selectedInsightGuidance?.useCase}
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Wichtig:</span> {selectedInsightGuidance?.caution}
                          </div>
                        </div>
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">
                          Öffne die Details, um Fallverlauf, Tabellen und historische Einzelfälle zu sehen.
                        </div>
                        <Button className="w-full sm:w-auto" onClick={() => setInsightDialogOpen(true)}>
                          Details
                        </Button>
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
                    <div className="rounded-md border p-3">
                      <div className="text-sm text-muted-foreground">Ansicht</div>
                      <div className="mt-2 text-lg font-semibold">
                        {FILTERS.find((filter) => filter.key === activeFilter)?.label ?? "Alles"}
                      </div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-sm text-muted-foreground">Suche</div>
                      <div className="mt-2 text-lg font-semibold">{deferredInsightQuery || "Keine"}</div>
                    </div>
                    <div className="rounded-md border p-3">
                      <div className="text-sm text-muted-foreground">Ausgewählt</div>
                      <div className="mt-2 text-lg font-semibold">{selectedInsight?.label ?? "-"}</div>
                    </div>
                    <div className="rounded-md border p-3 text-sm text-muted-foreground">
                      Klicke im Vergleichsboard weiter unten auf einen Markt, um die gesamte Seite direkt darauf
                      umzuschalten.
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Monatsprofil</CardTitle>
                <CardDescription>
                  Monatsreturns als Balken, Median als Linie und Positivquote als Kontext. So siehst du sofort, welche Monate
                  nicht nur stark, sondern auch stabil sind.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${value}%`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${value}%`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `${value.toFixed(name === "positiveRatePct" ? 0 : 2)}%`,
                        name === "avgReturnPct"
                          ? "Durchschnitt"
                          : name === "medianReturnPct"
                            ? "Median"
                            : "Positivquote",
                      ]}
                    />
                    <Bar yAxisId="left" dataKey="avgReturnPct" radius={[6, 6, 0, 0]}>
                      {monthChartData.map((entry) => (
                        <Cell
                          key={entry.label}
                          className="cursor-pointer"
                          fill={entry.avgReturnPct >= 0 ? "oklch(0.63 0.18 160)" : "oklch(0.63 0.23 20)"}
                          onClick={() => handleInsightSelect(entry.id)}
                        />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="medianReturnPct"
                      stroke="oklch(0.78 0.15 80)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="positiveRatePct"
                      stroke="oklch(0.75 0.04 250)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Fenster-Ranking</CardTitle>
                <CardDescription>
                  Alle Wochen- und Eventfenster nach Durchschnitt sortiert. Damit erkennst du sofort, welche Kalenderfenster historisch den
                  größten Rückenwind oder Gegenwind hatten.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={eventRankingData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.08)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(value) => `${value}%`}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortLabel"
                      width={120}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(2)}%`, "Durchschnitt"]}
                      labelFormatter={(label) => {
                        const match = eventRankingData.find((entry) => entry.shortLabel === label);
                        return match?.label ?? String(label);
                      }}
                    />
                    <Bar dataKey="avgReturnPct" radius={[0, 6, 6, 0]}>
                      {eventRankingData.map((entry) => (
                        <Cell
                          key={entry.label}
                          className="cursor-pointer"
                          fill={entry.avgReturnPct >= 0 ? "oklch(0.63 0.18 160)" : "oklch(0.63 0.23 20)"}
                          onClick={() => handleInsightSelect(entry.id)}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

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
            title="Wochen-/Fenster-Heatmap"
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
            title="Tages-Heatmap"
            description="Tagesreturns nach Wochentag. Hier sind die Stichproben einzelne historische Handelstage."
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
              <CardTitle>Fenster- und Jahresvergleich</CardTitle>
              <CardDescription>
                Zeilen sind Jahre, Spalten sind Eventfenster. So siehst du direkt, welche Muster im selben Jahr zusammen
                stark oder schwach waren.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {eventYearComparison.columns.length > 0 && eventYearComparison.rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Jahr</TableHead>
                        {eventYearComparison.columns.map((column) => (
                          <TableHead key={column.slug}>
                            <button
                              type="button"
                              className="text-left"
                              onClick={() => handleInsightSelect(column.id)}
                            >
                              {shortenLabel(column.label, 16)}
                            </button>
                          </TableHead>
                        ))}
                        <TableHead>Ø Fenster</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventYearComparison.rows.map((row) => (
                        <TableRow key={row.year}>
                          <TableCell className="font-medium">{row.year}</TableCell>
                          {eventYearComparison.columns.map((column) => {
                            const cell = row.values[column.slug];
                            return (
                              <TableCell key={`${row.year}-${column.slug}`}>
                                <button
                                  type="button"
                                  className={`min-w-[72px] rounded-lg px-1.5 py-1 text-left sm:min-w-[80px] ${heatClass(cell?.avgReturnPct)}`}
                                  onClick={() => handleInsightSelect(column.id)}
                                  title={
                                    cell?.caseCount
                                      ? `${column.label} ${row.year}: ${formatPct(cell.avgReturnPct, 2)} aus ${cell.caseCount} Fällen`
                                      : `${column.label} ${row.year}: keine Fälle`
                                  }
                                >
                                  <div className="text-xs font-medium sm:text-sm">{formatPct(cell?.avgReturnPct, 2)}</div>
                                  <div className="text-[10px] opacity-80">{cell?.caseCount ?? 0} Fälle</div>
                                </button>
                              </TableCell>
                            );
                          })}
                          <TableCell className={toneClass(row.compositeAvgReturnPct)}>
                            {formatPct(row.compositeAvgReturnPct, 2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Noch nicht genug historische Fenster-Fälle für einen Jahresvergleich.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fenster vergleichen</CardTitle>
              <CardDescription>
                Wähle bis zu sechs Fenster aus und vergleiche sie direkt nebeneinander. Fokus liegt auf den internen
                Wochen- und Eventfenstern der App.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-x-auto pb-1">
                <div className="inline-flex gap-2 whitespace-nowrap">
                  {data.eventCycles.map((cycle) => {
                    const selected = selectedEventSlugs.includes(cycle.slug);
                    return (
                      <Button
                        key={cycle.slug}
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        onClick={() => toggleEventSelection(cycle.slug)}
                      >
                        {cycle.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {selectedEvents.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kennzahl</TableHead>
                        {selectedEvents.map((cycle) => (
                          <TableHead key={cycle.slug}>{shortenLabel(cycle.label, 18)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Durchschnitt</TableCell>
                        {selectedEvents.map((cycle) => (
                          <TableCell key={`${cycle.slug}-avg`} className={toneClass(cycle.avgReturnPct)}>
                            {formatPct(cycle.avgReturnPct, 2)}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Median</TableCell>
                        {selectedEvents.map((cycle) => (
                          <TableCell key={`${cycle.slug}-median`}>{formatPct(cycle.medianReturnPct, 2)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Positivquote</TableCell>
                        {selectedEvents.map((cycle) => (
                          <TableCell key={`${cycle.slug}-positive`}>{formatPct(cycle.positiveRatePct, 0)}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Historische Fälle</TableCell>
                        {selectedEvents.map((cycle) => (
                          <TableCell key={`${cycle.slug}-cases`}>{formatCount(cycle.sampleSize, cycle.sampleUnit ?? "Fenster")}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Ø letzte 5 Fälle</TableCell>
                        {selectedEvents.map((cycle) => {
                          const recentAverage = average((cycle.cases ?? []).slice(-5).map((entry) => entry.returnPct));
                          return (
                            <TableCell key={`${cycle.slug}-recent`} className={toneClass(recentAverage)}>
                              {formatPct(recentAverage, 2)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Bester Fall</TableCell>
                        {selectedEvents.map((cycle) => {
                          const best = (cycle.cases ?? []).slice().sort((a, b) => b.returnPct - a.returnPct)[0] ?? null;
                          return (
                            <TableCell key={`${cycle.slug}-best`} className={toneClass(best?.returnPct)}>
                              {best ? `${formatPct(best.returnPct, 2)} · ${best.label}` : "-"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Schlechtester Fall</TableCell>
                        {selectedEvents.map((cycle) => {
                          const worst = (cycle.cases ?? []).slice().sort((a, b) => a.returnPct - b.returnPct)[0] ?? null;
                          return (
                            <TableCell key={`${cycle.slug}-worst`} className={toneClass(worst?.returnPct)}>
                              {worst ? `${formatPct(worst.returnPct, 2)} · ${worst.label}` : "-"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              ) : null}

              {selectedEventAlignment.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fenster</TableHead>
                        {selectedEvents.map((cycle) => (
                          <TableHead key={`${cycle.slug}-align-head`}>{shortenLabel(cycle.label, 14)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedEventAlignment.map((row) => (
                        <TableRow key={`${row.slug}-align-row`}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          {selectedEvents.map((cycle) => {
                            const cell = row.values[cycle.slug];
                            return (
                              <TableCell key={`${row.slug}-${cycle.slug}-align`}>
                                <div
                                  className={`rounded-lg px-2 py-1 ${heatClass(
                                    typeof cell?.agreementPct === "number" ? cell.agreementPct - 50 : null
                                  )}`}
                                >
                                  <div className="font-medium">{formatPct(cell?.agreementPct, 0)}</div>
                                  <div className="text-[10px] opacity-80">{cell?.overlapYears ?? 0} Jahre</div>
                                </div>
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>

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
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Markt</TableHead>
                        <TableHead>Bester Monat</TableHead>
                        <TableHead>Stärkstes Fenster</TableHead>
                        <TableHead>Bestes Wahljahr</TableHead>
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
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Marktvergleich als Diagramm</CardTitle>
              <CardDescription>
                Ranking der Presets nach ihrem stärksten Fenster. Ein schneller Überblick, welcher Markt historisch den
                besten saisonalen Rückenwind hatte.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparisonChartData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 0.08)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) => `${value}%`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={90}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)}%`, "Stärkstes Fenster"]}
                    labelFormatter={(label) => {
                      const match = comparisonChartData.find((entry) => entry.label === label);
                      return match ? `${match.label} (${match.symbol})` : String(label);
                    }}
                  />
                  <Bar dataKey="strongestEventReturn" radius={[0, 6, 6, 0]}>
                    {comparisonChartData.map((entry) => (
                      <Cell
                        key={`${entry.symbol}-${entry.label}`}
                        fill={entry.strongestEventReturn >= 0 ? "oklch(0.63 0.18 160)" : "oklch(0.63 0.23 20)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Monatsmuster
                </CardTitle>
                <CardDescription>Sortierbare Bezugstabelle für Monatsergebnisse über viele Jahre.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
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
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Wochen- und Eventfenster
                </CardTitle>
                <CardDescription>Kalendereffekte wie Turn of Month, Santa Rally, FOMC und OpEx.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fenster</TableHead>
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
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Alle Kalendereffekte</CardTitle>
              <CardDescription>Klick auf ein Badge springt direkt in die Detailansicht dieses Fensters.</CardDescription>
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
              <div className="overflow-x-auto">
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
              </div>
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
              <div className="overflow-x-auto">
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
              </div>
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
                  className="rounded-md border p-3 transition-colors hover:bg-muted/40"
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
