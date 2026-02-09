"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CalendarService, DailyPnL } from "@/lib/models";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [pnlData, setPnlData] = useState<DailyPnL[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPnLData();
  }, [currentDate]);

  async function loadPnLData() {
    try {
      setIsLoading(true);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      const data = await CalendarService.getDailyPnL(startDate, endDate);
      setPnlData(data);
      setError(null);
    } catch (err) {
      console.error("Failed to load calendar data:", err);
      setError("Kalenderdaten konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const navigateMonth = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + direction);
    setCurrentDate(newDate);
  };

  const getPnLForDate = (date: Date): number | undefined => {
    const dateKey = formatDateKey(date);
    const dayData = pnlData.find((d) => d.date === dateKey);
    return dayData?.pnl;
  };

  const days = getDaysInMonth(currentDate);
  const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  const monthlyPnL = pnlData.reduce((sum, day) => sum + day.pnl, 0);

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
            <p className="text-muted-foreground">
              Visuelle Übersicht deiner Trading-Performance
            </p>
          </div>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Kalender</h1>
          <p className="text-sm text-muted-foreground">
            Visuelle Übersicht deiner Trading-Performance
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[130px] text-center text-sm font-medium">
            {currentDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigateMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Monatliches P&L</span>
            {isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <span className={cn(
                "text-base font-bold",
                monthlyPnL >= 0 ? "text-green-500" : "text-red-500"
              )}>
                {monthlyPnL >= 0 ? "+" : ""}${monthlyPnL.toFixed(2)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="grid grid-cols-7 gap-0.5">
              {weekdays.map((day) => (
                <div key={day} className="py-1 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-0.5">
              {weekdays.map((day) => (
                <div key={day} className="py-1 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              {days.map((day, index) => {
                if (!day) {
                  return <div key={`empty-${index}`} className="h-12" />;
                }

                const pnl = getPnLForDate(day);
                const hasTrades = pnl !== undefined;

                return (
                  <div
                    key={formatDateKey(day)}
                    className={cn(
                      "h-12 p-1 rounded border cursor-pointer transition-colors hover:bg-muted flex flex-col justify-center items-center",
                      hasTrades && pnl >= 0 && "bg-green-500/10 border-green-500/30",
                      hasTrades && pnl < 0 && "bg-red-500/10 border-red-500/30",
                      !hasTrades && "bg-muted/30"
                    )}
                  >
                    <div className="text-xs font-medium">{day.getDate()}</div>
                    {hasTrades && (
                      <div className={cn(
                        "text-[10px] font-medium",
                        pnl >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
          <span className="text-muted-foreground">Gewinn</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
          <span className="text-muted-foreground">Verlust</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-muted/30 border" />
          <span className="text-muted-foreground">Keine Trades</span>
        </div>
      </div>
    </div>
  );
}
