import type { DailyPnL } from "./models";

export interface CalendarDayData {
  dateKey: string;
  date: Date;
  pnl: number;
  trades: number;
  isActive: boolean;
  isPositive: boolean;
  isNegative: boolean;
}

export interface CalendarRangeSummary {
  totalPnl: number;
  totalTrades: number;
  activeDays: number;
  positiveDays: number;
  negativeDays: number;
  flatDays: number;
  avgPnlPerActiveDay: number;
  avgTradesPerActiveDay: number;
  bestDay: CalendarDayData | null;
  worstDay: CalendarDayData | null;
}

export interface CalendarMonthOverview {
  monthIndex: number;
  monthKey: string;
  label: string;
  pnl: number;
  trades: number;
  activeDays: number;
  positiveDays: number;
  negativeDays: number;
  days: CalendarDayData[];
}

const WEEK_STARTS_ON = 1; // Monday

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateToDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateKeyToDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeek(date: Date, weekStartsOn: number = WEEK_STARTS_ON): Date {
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  const offset = (current.getDay() - weekStartsOn + 7) % 7;
  current.setDate(current.getDate() - offset);
  return current;
}

export function buildDailyPnLMap(entries: DailyPnL[]): Map<string, DailyPnL> {
  return new Map(entries.map((entry) => [entry.date, entry]));
}

export function getCalendarDayData(date: Date, entryMap: Map<string, DailyPnL>): CalendarDayData {
  const dateKey = dateToDateKey(date);
  const entry = entryMap.get(dateKey);
  const pnl = entry?.pnl ?? 0;
  const trades = entry?.trades ?? 0;

  return {
    dateKey,
    date: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0),
    pnl,
    trades,
    isActive: trades > 0,
    isPositive: trades > 0 && pnl > 0,
    isNegative: trades > 0 && pnl < 0,
  };
}

export function getMonthMatrix(
  referenceDate: Date,
  entryMap: Map<string, DailyPnL>,
  weekStartsOn: number = WEEK_STARTS_ON
): Array<Array<CalendarDayData | null>> {
  const firstDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 12, 0, 0, 0);
  const lastDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 12, 0, 0, 0);
  const leadingDays = (firstDay.getDay() - weekStartsOn + 7) % 7;
  const totalSlots = Math.ceil((leadingDays + lastDay.getDate()) / 7) * 7;
  const rows: Array<Array<CalendarDayData | null>> = [];

  for (let slot = 0; slot < totalSlots; slot += 1) {
    const currentDate = addDays(firstDay, slot - leadingDays);
    const inCurrentMonth = currentDate.getMonth() === referenceDate.getMonth();
    const cell = inCurrentMonth ? getCalendarDayData(currentDate, entryMap) : null;
    const rowIndex = Math.floor(slot / 7);
    if (!rows[rowIndex]) {
      rows[rowIndex] = [];
    }
    rows[rowIndex].push(cell);
  }

  return rows;
}

export function getWeekDays(referenceDate: Date, entryMap: Map<string, DailyPnL>): CalendarDayData[] {
  const weekStart = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, index) => getCalendarDayData(addDays(weekStart, index), entryMap));
}

export function getMonthDays(referenceDate: Date, entryMap: Map<string, DailyPnL>): CalendarDayData[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: lastDay }, (_, index) => {
    return getCalendarDayData(new Date(year, month, index + 1, 12, 0, 0, 0), entryMap);
  });
}

export function getYearMonths(year: number, entryMap: Map<string, DailyPnL>, locale: string = "de-DE"): CalendarMonthOverview[] {
  return Array.from({ length: 12 }, (_, monthIndex) => {
    const date = new Date(year, monthIndex, 1, 12, 0, 0, 0);
    const days = getMonthDays(date, entryMap);
    const activeDays = days.filter((day) => day.isActive);

    return {
      monthIndex,
      monthKey: `${year}-${pad(monthIndex + 1)}`,
      label: date.toLocaleDateString(locale, { month: "long" }),
      pnl: activeDays.reduce((sum, day) => sum + day.pnl, 0),
      trades: activeDays.reduce((sum, day) => sum + day.trades, 0),
      activeDays: activeDays.length,
      positiveDays: activeDays.filter((day) => day.isPositive).length,
      negativeDays: activeDays.filter((day) => day.isNegative).length,
      days,
    };
  });
}

export function summarizeRange(days: CalendarDayData[]): CalendarRangeSummary {
  const activeDays = days.filter((day) => day.isActive);
  const totalPnl = activeDays.reduce((sum, day) => sum + day.pnl, 0);
  const totalTrades = activeDays.reduce((sum, day) => sum + day.trades, 0);
  const positiveDays = activeDays.filter((day) => day.isPositive).length;
  const negativeDays = activeDays.filter((day) => day.isNegative).length;
  const flatDays = activeDays.length - positiveDays - negativeDays;
  const sortedByPnl = [...activeDays].sort((left, right) => right.pnl - left.pnl);

  return {
    totalPnl,
    totalTrades,
    activeDays: activeDays.length,
    positiveDays,
    negativeDays,
    flatDays,
    avgPnlPerActiveDay: activeDays.length > 0 ? totalPnl / activeDays.length : 0,
    avgTradesPerActiveDay: activeDays.length > 0 ? totalTrades / activeDays.length : 0,
    bestDay: sortedByPnl[0] ?? null,
    worstDay: sortedByPnl.at(-1) ?? null,
  };
}

export function formatWeekRange(referenceDate: Date, locale: string = "de-DE"): string {
  const weekStart = startOfWeek(referenceDate);
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

  const startLabel = weekStart.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
  const endLabel = weekEnd.toLocaleDateString(locale, {
    day: "2-digit",
    month: sameMonth ? undefined : "short",
    year: "numeric",
  });

  return `${startLabel} - ${endLabel}`;
}

export function isSameDateKey(left: string, right: string): boolean {
  return left === right;
}
