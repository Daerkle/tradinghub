export interface SeasonalityBucket {
  label: string;
  index: number;
  avgReturnPct: number;
  medianReturnPct: number;
  positiveRatePct: number;
  sampleSize: number;
}

export interface DayOfMonthBucket {
  day: number;
  avgReturnPct: number;
  positiveRatePct: number;
  sampleSize: number;
}

export interface SeasonalityOverview {
  symbol: string;
  source: string;
  fetchedAt: string;
  historyYears: number;
  tradingDays: number;
  trailingReturnPct: {
    month1: number | null;
    month3: number | null;
    month6: number | null;
    year1: number | null;
  };
  currentContext: {
    monthIndex: number;
    monthLabel: string;
    weekdayIndex: number;
    weekdayLabel: string;
    dayOfMonth: number;
  };
  monthly: SeasonalityBucket[];
  weekday: SeasonalityBucket[];
  dayOfMonth: DayOfMonthBucket[];
  summary: {
    bestMonth: SeasonalityBucket | null;
    worstMonth: SeasonalityBucket | null;
    currentMonthSeasonality: SeasonalityBucket | null;
    bestWeekday: SeasonalityBucket | null;
    worstWeekday: SeasonalityBucket | null;
    currentWeekdaySeasonality: SeasonalityBucket | null;
    strongestDaysOfMonth: DayOfMonthBucket[];
    weakestDaysOfMonth: DayOfMonthBucket[];
  };
  sourceLinks: Array<{
    label: string;
    url: string;
  }>;
  disclaimer: string;
}
