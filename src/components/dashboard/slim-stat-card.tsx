"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SlimStatCard({
  icon: Icon,
  label,
  value,
  hint,
  toneClassName,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  toneClassName?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
          <span>{label}</span>
        </div>
        <div className={cn("truncate text-lg font-semibold leading-none", toneClassName)}>{value}</div>
        {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export function SlimMetricRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium", valueClassName)}>{value}</span>
    </div>
  );
}
