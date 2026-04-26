"use client";

import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const METRIC_TOOLTIPS: Record<string, { title: string; description: string; good?: string }> = {
  symbol: {
    title: "Symbol",
    description: "Ticker-Symbol der Aktie an der Borse",
  },
  shortFloat: {
    title: "Short Float %",
    description: "Prozentsatz der frei handelbaren Aktien, die leerverkauft wurden. Hohe Werte konnen auf Short-Squeeze-Potenzial hindeuten.",
    good: ">20% = Hohe Short-Quote, Squeeze-Kandidat",
  },
  instOwn: {
    title: "Institutionelle Beteiligung",
    description: "Prozentsatz der Aktien im Besitz von institutionellen Investoren (Fonds, Banken, etc.).",
    good: ">50% = Starkes institutionelles Interesse",
  },
  insiderOwn: {
    title: "Insider-Beteiligung",
    description: "Prozentsatz der Aktien im Besitz von Unternehmensinsidern (Management, Vorstand).",
    good: ">10% = Management hat Skin in the Game",
  },
  shortRatio: {
    title: "Short Ratio (Days to Cover)",
    description: "Tage, die es bei normalem Volumen brauchen wurde, alle Short-Positionen einzudecken.",
    good: ">5 Tage = Potenzial fur Short-Squeeze",
  },
  earningsDate: {
    title: "Earnings Datum",
    description: "Nachster Termin fur die Veroffentlichung der Quartalszahlen.",
  },
  beta: {
    title: "Beta",
    description: "Mass fur die Volatilitat im Vergleich zum Gesamtmarkt. Beta >1 = volatiler als der Markt.",
    good: "1.5-2.5 fur Momentum-Trading",
  },
  price: {
    title: "Preis",
    description: "Aktueller Aktienkurs in USD",
  },
  changePercent: {
    title: "Tagesanderung",
    description: "Prozentuale Kursanderung gegenuber dem Vortagesschluss",
  },
  gapPercent: {
    title: "Gap %",
    description: "Prozentuale Lucke zwischen Vortagesschluss und heutigem Eroffnungskurs. Gaps zeigen oft katalytische Ereignisse (Earnings, News).",
    good: "\u22655% fur Episodic Pivots",
  },
  volumeRatio: {
    title: "Volume Ratio",
    description: "Heutiges Volumen im Verhaltnis zum 20-Tage-Durchschnitt. Zeigt institutionelles Interesse.",
    good: "\u22651.5x fur signifikante Bewegung, \u22652x fur starkes Interesse",
  },
  adrPercent: {
    title: "ADR% (Average Daily Range)",
    description: "Durchschnittliche tagliche Handelsspanne der letzten 20 Tage in Prozent. Berechnung: (High-Low)/Low * 100. Zeigt Volatilitat und Trading-Potenzial.",
    good: "\u22655% fur Swing Trading, \u22653% fur Position Trading",
  },
  momentum1M: {
    title: "1M Momentum",
    description: "Kursperformance der letzten 21 Handelstage (ca. 1 Monat). Zeigt kurzfristige Starke.",
    good: "\u226510% zeigt starkes kurzfristiges Momentum",
  },
  momentum3M: {
    title: "3M Momentum",
    description: "Kursperformance der letzten 63 Handelstage (ca. 3 Monate). Zeigt mittelfristige Starke.",
    good: "\u226520% zeigt starkes mittelfristiges Momentum",
  },
  momentum6M: {
    title: "6M Momentum",
    description: "Kursperformance der letzten 126 Handelstage (ca. 6 Monate). Zeigt langfristige Trendstarke.",
    good: "\u226530% zeigt starkes langfristiges Momentum",
  },
  momentum1Y: {
    title: "1Y Momentum",
    description: "Kursperformance der letzten 252 Handelstage (ca. 1 Jahr). Hilft zu sehen, ob der Leader auch im grossen Trend stark ist.",
    good: "\u226540% zeigt sehr starke 12M-Performance",
  },
  rsRating: {
    title: "RS Rating (Relative Strength)",
    description: "IBD-ahnliche RS-Bewertung als 1-99-Perzentil gegen das gesamte Aktienuniversum. Basis ist die 12M-Performance, wobei die juengsten 3 Monate hoeher gewichtet werden als die vorherigen 9 Monate.",
    good: "\u226580 = Top-Performer, \u226590 = Elite-Aktie",
  },
  setupScore: {
    title: "Setup Score (Qullamaggie)",
    description: "Bewertet Aktien nach Kristjan Kullamagi's Kriterien. Core-Kriterien (alle 6 mussen erfullt sein): Mindest-Liquiditat, Preis >$5, EMA50 uber EMA200, Preis uber EMA50 und EMA200, ADR \u22653%. Support-Kriterien (2 von 5): Starkes Momentum, steigende SMA200, nahe 52W-Hoch, uber 52W-Tief, niedrige Volatilitat.",
    good: "\u226585% = Starkes Setup, \u226570% = Solides Setup",
  },
  catalystScore: {
    title: "Catalyst Score",
    description: "Kombinierter Trigger-Score aus Gap, Relativvolumen, ADR, RS Rating, Setup-Qualitat, Momentum, Short-Interest und heutigen News-Hinweisen.",
    good: "\u226580 = starker Trigger, \u226565 = beobachtenswert",
  },
  rsi: {
    title: "RSI (Relative Strength Index)",
    description: "Oszillator der Kursbewegung misst. 14-Tage-Standard. Zeigt uberkaufte/uberverkaufte Zustande.",
    good: "30-70 neutral, <30 uberverkauft, >70 uberkauft",
  },
  ema10: {
    title: "EMA 10",
    description: "10-Tage Exponentieller Gleitender Durchschnitt. Kurzfristiger Trend-Indikator.",
  },
  ema20: {
    title: "EMA 20",
    description: "20-Tage Exponentieller Gleitender Durchschnitt. Mittelfristiger Trend-Indikator.",
  },
  sma50: {
    title: "SMA 50",
    description: "50-Tage Simple Moving Average. Wichtiger mittelfristiger Support/Resistance Level.",
  },
  sma200: {
    title: "SMA 200",
    description: "200-Tage Simple Moving Average. Langfristiger Trend-Indikator. Preis daruber = bullish, darunter = bearish.",
  },
  distanceFrom52WkHigh: {
    title: "Distanz 52W-Hoch",
    description: "Prozentuale Entfernung vom 52-Wochen-Hoch. Negative Werte = unter dem Hoch.",
    good: "Nahe 0% = Starke, nahe All-Time-High",
  },
  distanceFrom52WkLow: {
    title: "Distanz 52W-Tief",
    description: "Prozentuale Entfernung vom 52-Wochen-Tief. Positive Werte = uber dem Tief.",
    good: "\u226550% = Starke Erholung",
  },
  sector: {
    title: "Sektor",
    description: "Wirtschaftssektor der Aktie (z.B. Technology, Healthcare, Financial)",
  },
  industry: {
    title: "Industrie",
    description: "Spezifische Branche innerhalb des Sektors",
  },
  marketCap: {
    title: "Marktkapitalisierung",
    description: "Gesamtwert aller ausstehenden Aktien. Large Cap >$10B, Mid Cap $2-10B, Small Cap <$2B",
  },
  eps: {
    title: "EPS (Earnings Per Share)",
    description: "Gewinn pro Aktie. Wichtiger Fundamentalindikator fur Profitabilitat.",
  },
  peRatio: {
    title: "KGV (P/E Ratio)",
    description: "Kurs-Gewinn-Verhaltnis. Aktienpreis geteilt durch EPS. Zeigt Bewertung relativ zu Gewinnen.",
    good: "<25 = Fair bewertet (branchenabhangig)",
  },
  analystRating: {
    title: "Analysten-Rating",
    description: "Durchschnittliche Empfehlung von Wall Street Analysten (Strong Buy, Buy, Hold, Sell)",
  },
  targetPrice: {
    title: "Kursziel",
    description: "Durchschnittliches Kursziel der Analysten fur die nachsten 12 Monate",
  },
};

export const formatNumber = (num: number | null | undefined, decimals = 2): string => {
  if (num === null || num === undefined || isNaN(num)) return "-";
  return num.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatVolume = (vol: number | null): string => {
  if (!vol) return "-";
  if (vol >= 1000000000) return `${(vol / 1000000000).toFixed(2)}B`;
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(2)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol.toString();
};

export const formatMarketCap = (cap: number | null): string => {
  if (!cap) return "-";
  if (cap >= 1000000000000) return `$${(cap / 1000000000000).toFixed(2)}T`;
  if (cap >= 1000000000) return `$${(cap / 1000000000).toFixed(2)}B`;
  if (cap >= 1000000) return `$${(cap / 1000000).toFixed(2)}M`;
  return `$${cap.toLocaleString()}`;
};

export function getRSRatingColor(rating: number): string {
  if (rating >= 90) return "bg-white text-black";
  if (rating >= 80) return "bg-zinc-300 text-black";
  if (rating >= 70) return "bg-zinc-500 text-white";
  if (rating >= 60) return "bg-zinc-600 text-white";
  if (rating >= 50) return "bg-zinc-700 text-zinc-300";
  return "bg-zinc-800 text-zinc-400";
}

export function getSetupScoreColor(score: number): string {
  if (score >= 85) return "text-white font-bold";
  if (score >= 70) return "text-zinc-300";
  return "text-zinc-500";
}

export function MetricTooltip({ metricKey, children }: { metricKey: string; children: React.ReactNode }) {
  const tooltip = METRIC_TOOLTIPS[metricKey];
  if (!tooltip) return <>{children}</>;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-help">
            {children}
            <HelpCircle className="h-3 w-3 text-muted-foreground opacity-50" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{tooltip.title}</p>
            <p className="text-sm text-muted-foreground">{tooltip.description}</p>
            {tooltip.good && (
              <p className="text-sm text-zinc-400">Gut: {tooltip.good}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
