export interface SeasonalityCase {
  label: string;
  startDate: string;
  endDate: string;
  returnPct: number;
}

export interface SeasonalityStatBucket {
  label: string;
  avgReturnPct: number;
  medianReturnPct: number;
  positiveRatePct: number;
  sampleSize: number;
  description?: string;
  sampleUnit?: string;
  cases?: SeasonalityCase[];
}

export interface CycleEventStat extends SeasonalityStatBucket {
  slug: string;
  description: string;
}

export interface PresidentialCycleSummary extends SeasonalityStatBucket {
  cycleKey: "post-election" | "midterm" | "pre-election" | "election";
  avgMaxDrawdownPct: number | null;
}

export interface PresidentialCycleYear {
  year: number;
  cycleKey: "post-election" | "midterm" | "pre-election" | "election";
  cycleLabel: string;
  annualReturnPct: number | null;
  maxDrawdownPct: number | null;
  troughDate: string | null;
  forward1yReturnPct: number | null;
}

export interface MarketSeasonalityOverview {
  symbol: string;
  source: string;
  fetchedAt: string;
  historyYears: number;
  tradingDays: number;
  historyStart?: string;
  historyEnd?: string;
  sourceDetail?: string;
  monthly: SeasonalityStatBucket[];
  weekday: SeasonalityStatBucket[];
  eventCycles: CycleEventStat[];
  presidentialCycle: {
    summary: PresidentialCycleSummary[];
    years: PresidentialCycleYear[];
    midtermYears: PresidentialCycleYear[];
  };
  summary: {
    bestMonth: SeasonalityStatBucket | null;
    worstMonth: SeasonalityStatBucket | null;
    bestWeekday: SeasonalityStatBucket | null;
    worstWeekday: SeasonalityStatBucket | null;
    strongestEvent: CycleEventStat | null;
    weakestEvent: CycleEventStat | null;
  };
  sourceLinks: Array<{
    label: string;
    url: string;
  }>;
  disclaimer: string;
}
