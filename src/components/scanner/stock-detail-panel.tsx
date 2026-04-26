"use client";

import { useState, useEffect } from "react";
import {
  Activity, BarChart3, Star, Building2, Users, Calendar, Newspaper, ExternalLink,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { translateNewsTag } from "@/lib/news-tags";
import { StockChart } from "@/components/scanner/stock-chart";
import { formatNumber, getRSRatingColor, getSetupScoreColor } from "@/components/scanner/metric-tooltip";
import type { StockData, NewsItem } from "@/types/scanner";
import type { OptionsOverview } from "@/types/options";
import type { SeasonalityOverview } from "@/types/seasonality";
import { useCurrencyFormatter } from "@/hooks/use-currency-formatter";

function NewsSection({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [todayNewsCount, setTodayNewsCount] = useState(0);
  const [totalNewsCount, setTotalNewsCount] = useState(0);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNews() {
      setLoading(true);
      try {
        const response = await fetch(`/api/scanner/news/${encodeURIComponent(symbol)}?today=true&max=10`);
        if (response.ok) {
          const data = await response.json();
          setNews(data.news || []);
          setTodayNewsCount(data.todayNewsCount || 0);
          setTotalNewsCount(data.totalNewsCount || 0);
          setTagCounts(data.tagCounts || {});
        }
      } catch (error) {
        console.error("Error loading news:", error);
      }
      setLoading(false);
    }
    loadNews();
  }, [symbol]);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-4">
        Keine News von heute gefunden
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground pb-1">
        Heute: {todayNewsCount} | Gesamt (letzte Treffer): {totalNewsCount}
      </div>
      {Object.keys(tagCounts).length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1">
          {Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([tag, count]) => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                {translateNewsTag(tag)} ({count})
              </Badge>
            ))}
        </div>
      )}
      {news.slice(0, 5).map((item, index) => (
        <a
          key={index}
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-2 rounded-md hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium line-clamp-2">{item.title}</p>
            <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1" />
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{item.publisher}</span>
            <span>-</span>
            <span>{new Date(item.publishedAt).toLocaleDateString("de-DE")}</span>
          </div>
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {translateNewsTag(tag)}
                </Badge>
              ))}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

function formatCompactNumber(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(decimals)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(decimals)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(decimals)}K`;
  return `${sign}${abs.toFixed(decimals)}`;
}

function formatMetricPercent(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

function formatSkew(value: number | null | undefined, decimals = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)} pp`;
}

function formatExpiryLabel(expiration: string | null | undefined): string {
  if (!expiration) return "-";
  const date = new Date(`${expiration}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return expiration;
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function getBiasLabel(bias: OptionsOverview["bias"]): string {
  switch (bias) {
    case "call-skewed":
      return "Call-lastig";
    case "put-skewed":
      return "Put-lastig";
    default:
      return "Ausgeglichen";
  }
}

function getBiasTone(bias: OptionsOverview["bias"]): string {
  switch (bias) {
    case "call-skewed":
      return "bg-green-500/10 text-green-300 border-green-500/20";
    case "put-skewed":
      return "bg-red-500/10 text-red-300 border-red-500/20";
    default:
      return "bg-zinc-800 text-zinc-300 border-zinc-700";
  }
}

function SeasonalitySection({ symbol }: { symbol: string }) {
  const [data, setData] = useState<SeasonalityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSeasonality() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/scanner/seasonality/${encodeURIComponent(symbol)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Seasonality nicht verfuegbar");
        }
        if (!cancelled) {
          setData(payload as SeasonalityOverview);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Seasonality konnte nicht geladen werden");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSeasonality();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <Card className="p-3">
        <div className="space-y-3">
          <Skeleton className="h-6 w-44" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-18 w-full" />
            ))}
          </div>
          <Skeleton className="h-36 w-full" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-3">
        <h4 className="text-sm font-medium">Seasonality</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          {error || "Keine Seasonality-Daten verfuegbar."}
        </p>
      </Card>
    );
  }

  const currentMonth = data.summary.currentMonthSeasonality;
  const currentWeekday = data.summary.currentWeekdaySeasonality;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 className="text-sm font-medium">Seasonality</h4>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.historyYears} Jahre / {data.tradingDays} Handelstage Tageshistorie
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Aktueller Monat {data.currentContext.monthLabel}</Badge>
            <Badge variant="outline">Heute {data.currentContext.weekdayLabel}</Badge>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OptionsMetric
            label="Bester Monat"
            value={data.summary.bestMonth ? `${data.summary.bestMonth.label} ${formatMetricPercent(data.summary.bestMonth.avgReturnPct, 2)}` : "-"}
            tone="text-green-300"
          />
          <OptionsMetric
            label="Schwaechster Monat"
            value={data.summary.worstMonth ? `${data.summary.worstMonth.label} ${formatMetricPercent(data.summary.worstMonth.avgReturnPct, 2)}` : "-"}
            tone="text-red-300"
          />
          <OptionsMetric
            label="Aktueller Monat"
            value={currentMonth ? `${formatMetricPercent(currentMonth.avgReturnPct, 2)} / ${currentMonth.positiveRatePct.toFixed(0)}% up` : "-"}
            tone={currentMonth && currentMonth.avgReturnPct >= 0 ? "text-green-300" : "text-red-300"}
          />
          <OptionsMetric
            label="Aktueller Wochentag"
            value={currentWeekday ? `${formatMetricPercent(currentWeekday.avgReturnPct, 2)} / ${currentWeekday.positiveRatePct.toFixed(0)}% up` : "-"}
            tone={currentWeekday && currentWeekday.avgReturnPct >= 0 ? "text-green-300" : "text-red-300"}
          />
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-black/10 p-3">
            <div className="mb-2 text-sm font-medium">Monate</div>
            <div className="space-y-2">
              {data.monthly.map((bucket) => (
                <div key={bucket.index} className="flex items-center justify-between text-sm">
                  <span>{bucket.label}</span>
                  <span className={cn(bucket.avgReturnPct >= 0 ? "text-green-300" : "text-red-300")}>
                    {formatMetricPercent(bucket.avgReturnPct, 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-black/10 p-3">
            <div className="mb-2 text-sm font-medium">Wochentage</div>
            <div className="space-y-2">
              {data.weekday.map((bucket) => (
                <div key={bucket.index} className="flex items-center justify-between text-sm">
                  <span>{bucket.label}</span>
                  <span className={cn(bucket.avgReturnPct >= 0 ? "text-green-300" : "text-red-300")}>
                    {formatMetricPercent(bucket.avgReturnPct, 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-sm font-medium">Tagesfenster im Monat</h5>
          <span className="text-xs text-muted-foreground">Beste / schlechteste Kalendertage</span>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          <div className="rounded-md border border-green-500/20 bg-green-500/5 p-3">
            <div className="mb-2 text-sm font-medium text-green-300">Stark</div>
            <div className="space-y-2">
              {data.summary.strongestDaysOfMonth.map((bucket) => (
                <div key={`strong-${bucket.day}`} className="flex items-center justify-between text-sm">
                  <span>Tag {bucket.day}</span>
                  <span>{formatMetricPercent(bucket.avgReturnPct, 2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <div className="mb-2 text-sm font-medium text-red-300">Schwach</div>
            <div className="space-y-2">
              {data.summary.weakestDaysOfMonth.map((bucket) => (
                <div key={`weak-${bucket.day}`} className="flex items-center justify-between text-sm">
                  <span>Tag {bucket.day}</span>
                  <span>{formatMetricPercent(bucket.avgReturnPct, 2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OptionsMetric label="1M Return" value={formatMetricPercent(data.trailingReturnPct.month1, 2)} />
          <OptionsMetric label="3M Return" value={formatMetricPercent(data.trailingReturnPct.month3, 2)} />
          <OptionsMetric label="6M Return" value={formatMetricPercent(data.trailingReturnPct.month6, 2)} />
          <OptionsMetric label="1Y Return" value={formatMetricPercent(data.trailingReturnPct.year1, 2)} />
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
    </div>
  );
}

function OptionsMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/10 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold", tone)}>{value}</div>
    </div>
  );
}

function percentTone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "text-zinc-400";
  return value >= 0 ? "text-green-300" : "text-red-300";
}

function CompactPerformanceMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/10 px-2 py-1.5">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-sm font-semibold", percentTone(value))}>{formatMetricPercent(value, 1)}</div>
    </div>
  );
}

function OptionsSection({ symbol }: { symbol: string }) {
  const { formatMoney, formatCompactMoney } = useCurrencyFormatter();
  const formatUsdValue = (value: number | null | undefined, decimals = 2) =>
    formatMoney(value, "USD", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  const [data, setData] = useState<OptionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/scanner/options/${encodeURIComponent(symbol)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Optionsdaten nicht verfuegbar");
        }
        if (!cancelled) {
          setData(payload as OptionsOverview);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Optionsdaten konnten nicht geladen werden");
          setData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadOptions();

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (loading) {
    return (
      <Card className="p-3">
        <div className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full" />
            ))}
          </div>
          <Skeleton className="h-44 w-full" />
        </div>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Options Positioning
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || "Keine kostenlosen Optionsdaten verfuegbar."}
            </p>
          </div>
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/options`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Yahoo extern
          </a>
        </div>
      </Card>
    );
  }

  const netGexTone =
    data.summary.netGexEstimate === null
      ? "text-zinc-300"
      : data.summary.netGexEstimate >= 0
        ? "text-green-300"
        : "text-red-300";
  const skewTone =
    data.summary.skewPct === null
      ? "text-zinc-300"
      : data.summary.skewPct >= 0
        ? "text-red-300"
        : "text-green-300";

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Options Positioning
            </h4>
            <p className="mt-1 text-xs text-muted-foreground">
              Gratis-Chain + abgeleitete Levels aus {data.trackedExpiries}/{data.availableExpiries} Expiries bis {data.horizonDays} DTE
            </p>
          </div>
          <a
            href={`https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/options`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Chain extern oeffnen
          </a>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OptionsMetric label="P/C OI" value={formatNumber(data.summary.putCallOiRatio, 2)} />
          <OptionsMetric label="P/C Vol" value={formatNumber(data.summary.putCallVolumeRatio, 2)} />
          <OptionsMetric label="Call Wall" value={data.summary.callWall !== null ? formatUsdValue(data.summary.callWall, 0) : "-"} />
          <OptionsMetric label="Put Wall" value={data.summary.putWall !== null ? formatUsdValue(data.summary.putWall, 0) : "-"} />
          <OptionsMetric label="Max Pain" value={data.summary.maxPain !== null ? formatUsdValue(data.summary.maxPain, 0) : "-"} />
          <OptionsMetric label="ATM IV" value={data.summary.atmIvPct !== null ? `${data.summary.atmIvPct.toFixed(1)}%` : "-"} />
          <OptionsMetric label="Skew" value={formatSkew(data.summary.skewPct)} tone={skewTone} />
          <OptionsMetric label="Net GEX est." value={formatCompactNumber(data.summary.netGexEstimate)} tone={netGexTone} />
          <OptionsMetric label="Expected Move" value={data.summary.expectedMoveUsd !== null ? `${formatUsdValue(data.summary.expectedMoveUsd, 2)} / ${formatMetricPercent(data.summary.expectedMovePct, 2)}` : "-"} />
          <OptionsMetric label="Gamma Flip" value={data.summary.gammaFlipZone !== null ? formatUsdValue(data.summary.gammaFlipZone, 0) : "-"} />
          <OptionsMetric label="Call OI Fokus" value={data.summary.callOiConcentrationPct !== null ? `${data.summary.callOiConcentrationPct.toFixed(0)}%` : "-"} />
          <OptionsMetric label="Put OI Fokus" value={data.summary.putOiConcentrationPct !== null ? `${data.summary.putOiConcentrationPct.toFixed(0)}%` : "-"} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Badge variant="secondary" className={cn("border", getBiasTone(data.bias))}>
            {getBiasLabel(data.bias)}
          </Badge>
          <Badge variant="outline">Spot {formatUsdValue(data.underlyingPrice, 2)}</Badge>
          {data.nearestExpiry && (
            <Badge variant="outline">Naechster Expiry {formatExpiryLabel(data.nearestExpiry)}</Badge>
          )}
          <Badge variant="outline">Quelle {data.source}</Badge>
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h5 className="text-sm font-medium">Expiry Snapshot</h5>
            <span className="text-xs text-muted-foreground">Front Expiries</span>
          </div>
          <div className="space-y-2">
            {data.expiries.map((expiry) => (
              <div key={expiry.expiration} className="rounded-md border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{formatExpiryLabel(expiry.expiration)}</div>
                    <div className="text-xs text-muted-foreground">{expiry.daysToExpiration} DTE</div>
                  </div>
                  <Badge variant="outline">P/C OI {formatNumber(expiry.putCallOiRatio, 2)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">Call OI</div>
                    <div className="font-medium">{formatCompactNumber(expiry.totalCallOi, 1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Put OI</div>
                    <div className="font-medium">{formatCompactNumber(expiry.totalPutOi, 1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Max Pain</div>
                    <div className="font-medium">{expiry.maxPain !== null ? formatUsdValue(expiry.maxPain, 0) : "-"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">ATM IV</div>
                    <div className="font-medium">{expiry.atmIvPct !== null ? `${expiry.atmIvPct.toFixed(1)}%` : "-"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <h5 className="text-sm font-medium">Key Strikes</h5>
            <span className="text-xs text-muted-foreground">Nach Open Interest</span>
          </div>
          <div className="space-y-2">
            {data.strikeLevels.map((level) => (
              <div key={level.strike} className="rounded-md border border-white/10 bg-black/10 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{formatUsdValue(level.strike, 0)}</div>
                  <Badge variant="outline">{formatMetricPercent(level.distanceFromSpotPct, 1)}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div>
                    <div className="text-muted-foreground">Call OI</div>
                    <div className="font-medium">{formatCompactNumber(level.callOi, 1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Put OI</div>
                    <div className="font-medium">{formatCompactNumber(level.putOi, 1)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Net OI</div>
                    <div className={cn("font-medium", level.netOi >= 0 ? "text-green-300" : "text-red-300")}>
                      {formatCompactNumber(level.netOi, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Net GEX</div>
                    <div className={cn("font-medium", (level.netGexEstimate || 0) >= 0 ? "text-green-300" : "text-red-300")}>
                      {formatCompactNumber(level.netGexEstimate, 1)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-sm font-medium">Hot Contracts</h5>
          <span className="text-xs text-muted-foreground">Volumen, OI und Naehe zum Spot</span>
        </div>
        {data.hotContracts.length === 0 ? (
          <div className="text-sm text-muted-foreground">Keine auffaelligen Contracts im kostenlosen Feed.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ</TableHead>
                <TableHead>Strike</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Vol</TableHead>
                <TableHead>OI</TableHead>
                <TableHead>Vol/OI</TableHead>
                <TableHead>IV</TableHead>
                <TableHead>Premium</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.hotContracts.map((contract) => (
                <TableRow key={contract.contractSymbol}>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border",
                        contract.side === "call"
                          ? "border-green-500/20 bg-green-500/10 text-green-300"
                          : "border-red-500/20 bg-red-500/10 text-red-300"
                      )}
                    >
                      {contract.side === "call" ? "CALL" : "PUT"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatUsdValue(contract.strike, 0)}</TableCell>
                  <TableCell>{formatExpiryLabel(contract.expiration)}</TableCell>
                  <TableCell>{formatCompactNumber(contract.volume, 1)}</TableCell>
                  <TableCell>{formatCompactNumber(contract.openInterest, 1)}</TableCell>
                  <TableCell>{formatNumber(contract.volumeOiRatio, 2)}</TableCell>
                  <TableCell>{contract.impliedVolatilityPct !== null ? `${contract.impliedVolatilityPct.toFixed(1)}%` : "-"}</TableCell>
                  <TableCell>{formatCompactMoney(contract.premiumVolumeUsd, "USD", 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <div className="flex flex-wrap gap-2">
        {data.sourceLinks.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            {link.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{data.disclaimer}</p>
    </div>
  );
}

interface StockDetailPanelProps {
  stock: StockData;
}

function ChartSection({ stock }: { stock: StockData }) {
  const [chartData, setChartData] = useState(() => stock.chartData || []);
  const [failed, setFailed] = useState(false);
  const [chartMode, setChartMode] = useState<"journal" | "tradingview">("journal");
  const loading = chartMode === "journal" && !failed && chartData.length === 0;

  useEffect(() => {
    if (chartData.length > 0 || failed) return;

    let cancelled = false;

    fetch(`/api/scanner/chart/${encodeURIComponent(stock.symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Not found");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data.chartData?.length > 0) {
          setChartData(data.chartData);
        } else if (!cancelled) {
          setFailed(true);
          setChartMode("tradingview");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setChartMode("tradingview");
        }
      });

    return () => { cancelled = true; };
  }, [stock.symbol, chartData.length, failed]);

  const tradingViewSrc = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_detail_${stock.symbol.replace(
    /[^a-zA-Z0-9_]/g,
    "_"
  )}&symbol=${encodeURIComponent(
    stock.symbol
  )}&interval=D&range=12M&theme=dark&style=1&locale=de_DE&enable_publishing=false&hide_top_toolbar=false&hide_legend=false&hide_side_toolbar=false&allow_symbol_change=true&save_image=false&withdateranges=true&show_popup_button=true`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border p-0.5 bg-muted/20">
          <Button
            type="button"
            size="sm"
            variant={chartMode === "journal" ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setChartMode("journal")}
          >
            Journal
          </Button>
          <Button
            type="button"
            size="sm"
            variant={chartMode === "tradingview" ? "default" : "ghost"}
            className="h-7 px-2 text-xs"
            onClick={() => setChartMode("tradingview")}
          >
            TradingView
          </Button>
        </div>
        <a
          href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(stock.symbol)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Extern öffnen
        </a>
      </div>

      {chartMode === "journal" && (
        <>
          {loading && (
            <div className="flex h-[220px] items-center justify-center rounded-md bg-muted">
              <Skeleton className="h-full w-full rounded-md" />
            </div>
          )}

          {!loading && chartData.length > 0 && (
            <div className="h-[220px]">
              <StockChart data={chartData} symbol={stock.symbol} height={220} />
            </div>
          )}

          {!loading && chartData.length === 0 && (
            <div className="flex h-[220px] items-center justify-center rounded-md bg-muted px-3 text-center text-sm">
              <span className="text-muted-foreground">
                Keine Journal-Chart-Daten verfügbar. Bitte TradingView nutzen.
              </span>
            </div>
          )}
        </>
      )}

      {chartMode === "tradingview" && (
        <div className="h-[220px] overflow-hidden rounded-md border bg-black">
          <iframe
            title={`TradingView ${stock.symbol}`}
            src={tradingViewSrc}
            className="h-full w-full border-0"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}

export function StockDetailPanel({ stock }: StockDetailPanelProps) {
  const { formatMoney } = useCurrencyFormatter();
  return (
    <div className="border-t bg-muted/30 p-3 sm:p-4">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4" />
              Chart (100 Tage)
            </h4>
            <ChartSection key={stock.symbol} stock={stock} />
          </div>

          <OptionsSection symbol={stock.symbol} />
          <SeasonalitySection symbol={stock.symbol} />
        </div>

        <div className="space-y-3">
          <Card className="p-3">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <Star className="h-4 w-4 text-zinc-500" />
              Ratings
            </h4>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm">RS Rating</span>
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm", getRSRatingColor(stock.rsRating))}>
                  {stock.rsRating}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Setup Score</span>
                <span className={cn("font-bold text-lg", getSetupScoreColor(stock.setupScore))}>
                  {formatNumber(stock.setupScore, 0)}%
                </span>
              </div>
              {stock.stockbeeScore !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Stockbee Score</span>
                  <span className={cn(
                    "font-bold text-lg",
                    stock.stockbeeScore >= 80 ? "text-white" : stock.stockbeeScore >= 65 ? "text-zinc-300" : "text-zinc-500"
                  )}>
                    {formatNumber(stock.stockbeeScore, 0)}%
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm">Catalyst Score</span>
                <span className={cn(
                  "font-bold text-lg",
                  stock.catalystScore >= 80 ? "text-white" : stock.catalystScore >= 65 ? "text-zinc-300" : "text-zinc-500"
                )}>
                  {formatNumber(stock.catalystScore, 0)}
                </span>
              </div>
              {stock.stockbee && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {stock.stockbee.isEpisodicPivot && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Stockbee EP</Badge>}
                  {stock.stockbee.isMomentumBurst && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Momentum Burst</Badge>}
                  {stock.stockbee.isRangeExpansionBreakout && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Range Breakout</Badge>}
                  {stock.stockbee.qullaAlignment?.alignsWithQullamaggie && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Qulla Align: {[
                        stock.stockbee.qullaAlignment.month1 ? "1M" : null,
                        stock.stockbee.qullaAlignment.month3 ? "3M" : null,
                        stock.stockbee.qullaAlignment.month6 ? "6M" : null,
                      ].filter(Boolean).join("/")}
                    </Badge>
                  )}
                </div>
              )}
              {stock.catalystSignals && stock.catalystSignals.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {stock.catalystSignals.slice(0, 5).map((signal) => (
                    <Badge key={signal} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {signal}
                    </Badge>
                  ))}
                </div>
              )}
              {stock.analystRating && stock.analystRating !== "N/A" && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Analysten</span>
                  <Badge variant="secondary" className="capitalize">
                    {stock.analystRating} ({stock.numAnalysts})
                  </Badge>
                </div>
              )}
              {stock.targetPrice > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Kursziel</span>
                  <span className="font-medium">{formatMoney(stock.targetPrice, "USD")}</span>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-3">
            <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-400">
              <BarChart3 className="h-4 w-4 text-zinc-500" />
              Performance
            </h4>
            <div className="grid grid-cols-2 gap-1.5">
              <CompactPerformanceMetric label="Tag" value={stock.changePercent} />
              <CompactPerformanceMetric label="1M" value={stock.momentum1M} />
              <CompactPerformanceMetric label="3M" value={stock.momentum3M} />
              <CompactPerformanceMetric label="6M" value={stock.momentum6M} />
              <CompactPerformanceMetric label="1Y" value={stock.momentum1Y} />
              <CompactPerformanceMetric label="ADR" value={stock.adrPercent} />
            </div>
          </Card>

          <Card className="p-3">
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Sektor & Industrie
            </h4>
            <div className="space-y-2">
              <div>
                <span className="text-xs text-muted-foreground">Sektor</span>
                <p className="font-medium">{stock.sector}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Industrie</span>
                <p className="font-medium">{stock.industry}</p>
              </div>
            </div>
          </Card>

          {(stock.shortFloat || stock.instOwn || stock.insiderOwn || stock.earningsDate) && (
            <Card className="p-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Ownership & Shorts
              </h4>
              <div className="space-y-2 text-sm">
                {stock.shortFloat !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Short Float</span>
                    <span className={cn("font-medium", stock.shortFloat >= 20 ? "text-foreground" : "text-zinc-400")}>
                      {stock.shortFloat.toFixed(1)}%
                    </span>
                  </div>
                )}
                {stock.shortRatio !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Days to Cover</span>
                    <span className={cn("font-medium", stock.shortRatio >= 5 ? "text-foreground" : "text-zinc-400")}>
                      {stock.shortRatio.toFixed(1)} Tage
                    </span>
                  </div>
                )}
                {stock.instOwn !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Institutionell</span>
                    <span className={cn("font-medium", stock.instOwn >= 70 ? "text-foreground" : "text-zinc-400")}>
                      {stock.instOwn.toFixed(1)}%
                    </span>
                  </div>
                )}
                {stock.insiderOwn !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Insider</span>
                    <span className="font-medium">{stock.insiderOwn.toFixed(1)}%</span>
                  </div>
                )}
                {stock.beta !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Beta</span>
                    <span className={cn("font-medium", stock.beta >= 2 ? "text-foreground" : "text-zinc-400")}>
                      {stock.beta.toFixed(2)}
                    </span>
                  </div>
                )}
                {stock.earningsDate && (
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />Earnings
                    </span>
                    <span className="font-medium text-foreground">{stock.earningsDate}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {stock.proxyPlays && stock.proxyPlays.length > 0 && (
            <Card className="p-3">
              <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />Proxy Plays
              </h4>
              <div className="flex flex-wrap gap-2">
                {stock.proxyPlays.map((sym) => (
                  <a key={sym} href={`https://www.tradingview.com/chart/?symbol=${sym}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors text-sm font-medium">
                    {sym}<ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Starke Aktien im gleichen Sektor/Industrie</p>
            </Card>
          )}

          <Card className="p-3">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Technische Daten</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">EMA 10</span><span>{formatMoney(stock.ema10, "USD")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">EMA 20</span><span>{formatMoney(stock.ema20, "USD")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SMA 50</span><span>{formatMoney(stock.sma50, "USD")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">SMA 200</span><span>{formatMoney(stock.sma200, "USD")}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">RSI</span>
                <span className={cn(stock.rsi > 70 || stock.rsi < 30 ? "text-foreground" : "text-zinc-400")}>{formatNumber(stock.rsi, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ADR%</span>
                <span className={stock.adrPercent >= 5 ? "text-foreground" : "text-zinc-400"}>{formatNumber(stock.adrPercent)}%</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">52W High</span><span>{formatNumber(stock.distanceFrom52WkHigh)}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">52W Low</span><span>+{formatNumber(stock.distanceFrom52WkLow)}%</span></div>
            </div>
          </Card>

          <Card className="p-3">
            <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
              <Newspaper className="h-4 w-4" />News
            </h4>
            <NewsSection symbol={stock.symbol} />
          </Card>
        </div>
      </div>
    </div>
  );
}
