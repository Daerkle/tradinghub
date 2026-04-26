"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CompactWatchlistItem = {
  symbol: string;
  name: string;
  href?: string;
  price?: number;
  changePercent?: number;
  volumeRatio?: number;
  momentum1M?: number;
  momentum3M?: number;
  momentum6M?: number;
  momentum1Y?: number;
  rsRating?: number;
  catalystScore?: number;
  heatScore?: number;
  score?: number;
  sector?: string;
  industry?: string;
  tags?: string[];
};

function formatPct(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

function formatPrice(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(2)}`;
}

function toneClass(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-muted-foreground";
  return value >= 0 ? "text-emerald-600" : "text-rose-600";
}

function metricTone(value: number | null | undefined, strongAt = 80): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-muted-foreground";
  if (value >= strongAt) return "text-foreground";
  return "text-muted-foreground";
}

function InlineMetric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="whitespace-nowrap tabular-nums">
      <span className="mr-1 text-muted-foreground">{label}</span>
      <span className={cn("font-medium", className)}>{value}</span>
    </div>
  );
}

export function CompactStockWatchlist({
  items,
  title = "Watchlist",
  description,
  selectedSymbol,
  onSelect,
  className,
  maxHeightClassName = "max-h-[48dvh]",
  showHeader = true,
}: {
  items: CompactWatchlistItem[];
  title?: string;
  description?: string;
  selectedSymbol?: string | null;
  onSelect?: (symbol: string) => void;
  className?: string;
  maxHeightClassName?: string;
  showHeader?: boolean;
}) {
  const symbols = useMemo(() => items.map((item) => item.symbol), [items]);
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const firstSymbol = symbols[0] ?? null;
  const requestedSymbol = selectedSymbol ?? internalSelected;
  const activeSymbol = requestedSymbol && symbols.includes(requestedSymbol) ? requestedSymbol : firstSymbol;

  const selectSymbol = (symbol: string) => {
    setInternalSelected(symbol);
    onSelect?.(symbol);
  };

  if (items.length === 0) {
    return (
      <div className={cn("rounded-md border px-3 py-6 text-center text-sm text-muted-foreground", className)}>
        Keine Aktien in dieser Watchlist.
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border bg-background", className)}>
      {showHeader && (
        <div className="space-y-2 border-b px-2 py-2 sm:px-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium leading-tight">{title}</div>
              {description ? (
                <div className="truncate text-[11px] text-muted-foreground">{description}</div>
              ) : null}
            </div>
            <Badge variant="outline" className="shrink-0">
              {items.length} Aktien
            </Badge>
          </div>

          {items.length > 1 && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-1">
                {items.map((item) => (
                  <Button
                    key={`${item.symbol}-watch-switch`}
                    type="button"
                    variant={activeSymbol === item.symbol ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-2 font-mono text-[11px]"
                    onClick={() => selectSymbol(item.symbol)}
                  >
                    {item.symbol}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={cn("overflow-auto", maxHeightClassName)}>
        <div className="min-w-[1180px] divide-y">
          {items.map((item) => {
            const active = activeSymbol === item.symbol;
            const tags = item.tags?.filter(Boolean).slice(0, 3) ?? [];

            return (
              <div
                key={`${item.symbol}-watch-row`}
                role="button"
                tabIndex={0}
                className={cn(
                  "grid w-full grid-cols-[100px_minmax(190px,1.3fr)_78px_72px_66px_70px_70px_70px_70px_56px_62px_58px_64px_48px] items-center gap-2 px-2 py-1.5 text-left text-[11px] leading-none transition-colors hover:bg-muted/40",
                  active && "bg-primary/10"
                )}
                onClick={() => selectSymbol(item.symbol)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectSymbol(item.symbol);
                  }
                }}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="font-mono text-sm font-semibold">{item.symbol}</span>
                  {tags.map((tag) => (
                    <Badge key={`${item.symbol}-${tag}`} variant="secondary" className="h-4 px-1 text-[9px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="min-w-0 truncate text-muted-foreground" title={[item.name, item.sector, item.industry].filter(Boolean).join(" · ")}>
                  {item.name}
                </div>
                <InlineMetric label="$" value={formatPrice(item.price).replace("$", "")} />
                <InlineMetric label="Tag" value={formatPct(item.changePercent, 1)} className={toneClass(item.changePercent)} />
                <InlineMetric label="Vol" value={`${formatNumber(item.volumeRatio, 1)}x`} />
                <InlineMetric label="1M" value={formatPct(item.momentum1M, 1)} className={toneClass(item.momentum1M)} />
                <InlineMetric label="3M" value={formatPct(item.momentum3M, 1)} className={toneClass(item.momentum3M)} />
                <InlineMetric label="6M" value={formatPct(item.momentum6M, 1)} className={toneClass(item.momentum6M)} />
                <InlineMetric label="1Y" value={formatPct(item.momentum1Y, 1)} className={toneClass(item.momentum1Y)} />
                <InlineMetric label="RS" value={formatNumber(item.rsRating, 0)} className={metricTone(item.rsRating)} />
                <InlineMetric label="Cat" value={formatNumber(item.catalystScore, 0)} className={metricTone(item.catalystScore)} />
                <InlineMetric label="Heat" value={formatNumber(item.heatScore, 0)} className={metricTone(item.heatScore)} />
                <InlineMetric label="Score" value={formatNumber(item.score, 1)} className={metricTone(item.score)} />
                <div className="flex justify-end">
                  {item.href ? (
                    <Link
                      href={item.href}
                      aria-label={`${item.symbol} im Scanner öffnen`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
