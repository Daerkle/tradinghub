"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SectorRotationRow = {
  symbol: string;
  sector: string;
  name: string;
  m1: number;
  m3: number;
  m6: number;
  relM1: number;
  relM3: number;
  relM6: number;
  score: number;
};

type SectorRotationResponse = {
  fetchedAt: string;
  source: string;
  benchmark: { symbol: string; m1: number; m3: number; m6: number };
  sectors: SectorRotationRow[];
};

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) return "0.0";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
}

function translateSectorName(sector: string): string {
  const map: Record<string, string> = {
    "Communication Services": "Kommunikation",
    "Consumer Discretionary": "Zyklischer Konsum",
    "Consumer Staples": "Basiskonsum",
    Energy: "Energie",
    Financials: "Finanzen",
    "Health Care": "Gesundheit",
    Industrials: "Industrie",
    Materials: "Materialien",
    "Real Estate": "Immobilien",
    Technology: "Technologie",
    Utilities: "Versorger",
  };
  return map[sector] || sector;
}

function scoreTone(score: number): { box: string; badge: string } {
  if (score >= 6) return { box: "border-emerald-500/30 bg-emerald-500/10", badge: "border-emerald-500/30 text-emerald-200" };
  if (score >= 2) return { box: "border-emerald-500/20 bg-emerald-500/5", badge: "border-emerald-500/20 text-emerald-200/90" };
  if (score >= -2) return { box: "border-zinc-700/40 bg-muted/20", badge: "border-zinc-700/40 text-zinc-200/80" };
  if (score >= -6) return { box: "border-orange-500/25 bg-orange-500/10", badge: "border-orange-500/25 text-orange-200" };
  return { box: "border-rose-500/25 bg-rose-500/10", badge: "border-rose-500/25 text-rose-200" };
}

export function SectorRotationHeatmap({
  onSelect,
  compact = false,
  limit,
}: {
  onSelect?: (query: string) => void;
  compact?: boolean;
  limit?: number;
}) {
  const [data, setData] = useState<SectorRotationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/scanner/sector-rotation");
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = (await res.json()) as SectorRotationResponse;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const allRows = data?.sectors || [];
    return typeof limit === "number" ? allRows.slice(0, limit) : allRows;
  }, [data, limit]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">Sektor-Rotation (XL*)</div>
        {data && (
          <div className="text-[11px] text-muted-foreground">
            vs {data.benchmark.symbol}: 1M {data.benchmark.m1.toFixed(1)}% · 3M {data.benchmark.m3.toFixed(1)}% · 6M {data.benchmark.m6.toFixed(1)}%
          </div>
        )}
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: compact ? 4 : 8 }).map((_, i) => (
            <Skeleton key={i} className={cn("w-full", compact ? "h-12" : "h-16")} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">Rotation aktuell nicht verfuegbar.</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {rows.map((row) => {
            const tone = scoreTone(row.score);
            const button = (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{row.symbol}</span>
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", tone.badge)}>
                      Rel 3M {formatSigned(row.relM3)}%
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {translateSectorName(row.sector)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground">1M {formatSigned(row.m1)}%</div>
                  <div className="text-[11px] text-muted-foreground">6M {formatSigned(row.m6)}%</div>
                </div>
              </div>
            );

            const commonClassName = cn(
              "w-full text-left rounded-md border transition-colors",
              compact ? "p-1.5" : "p-2",
              tone.box,
              onSelect ? "hover:bg-muted/40 cursor-pointer" : ""
            );

            if (!onSelect) {
              return (
                <div key={row.symbol} className={commonClassName}>
                  {button}
                </div>
              );
            }

            return (
              <button
                key={row.symbol}
                type="button"
                className={commonClassName}
                onClick={() => onSelect(row.sector)}
                title={`Filter nach Sektor: ${row.sector}`}
              >
                {button}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
