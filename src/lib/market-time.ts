const MARKET_TIME_ZONE = "America/New_York";
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function safeDateKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;

    if (!year || !month || !day) {
      return date.toISOString().slice(0, 10);
    }

    return `${year}-${month}-${day}`;
  } catch {
    // If the runtime doesn't support IANA time zones (rare on minimal ICU builds),
    // fall back to UTC so we still behave deterministically.
    return date.toISOString().slice(0, 10);
  }
}

export function getMarketDateKey(date: Date): string {
  return safeDateKeyInTimeZone(date, MARKET_TIME_ZONE);
}

export function isSameMarketDay(date: Date, reference: Date = new Date()): boolean {
  return getMarketDateKey(date) === getMarketDateKey(reference);
}

export function getMarketWeekdayIndex(date: Date): number {
  try {
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: MARKET_TIME_ZONE,
      weekday: "short",
    }).format(date);
    return WEEKDAY_TO_INDEX[weekday] ?? date.getUTCDay();
  } catch {
    return date.getUTCDay();
  }
}

export function getMarketHour(date: Date): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      timeZone: MARKET_TIME_ZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(date);
    const parsed = Number.parseInt(hour, 10);
    return Number.isFinite(parsed) ? parsed : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}
