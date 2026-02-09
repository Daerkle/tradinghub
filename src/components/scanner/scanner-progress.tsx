"use client";

import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ScanProgress } from "@/hooks/use-scanner-stream";

interface ScannerProgressProps {
  progress: ScanProgress;
}

export function ScannerProgress({ progress }: ScannerProgressProps) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            <div className="flex flex-col">
              <span className="font-medium text-sm">
                {progress.phase === "idle" && "Bereit"}
                {progress.phase === "init" && "Initialisierung"}
                {progress.phase === "cache_check" && "Cache Prüfung"}
                {progress.phase === "fetching" && "Lade Daten"}
                {progress.phase === "complete" && "Fertig"}
                {progress.phase === "error" && "Fehler"}
              </span>
              <span className="text-xs text-muted-foreground line-clamp-1 max-w-[150px]">
                {progress.message || "Warte..."}
              </span>
            </div>
          </div>

          <div className="flex-1 w-full max-w-xl space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                {progress.processed !== undefined && progress.total !== undefined
                  ? `${progress.processed} / ${progress.total}`
                  : progress.cached !== undefined
                    ? `${progress.cached} Cached`
                    : "Berechne..."}
              </span>
              <span className="font-medium">{progress.percent ?? 0}%</span>
            </div>
            <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-zinc-400 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress.percent ?? 0}%` }}
              />
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-1.5">
            {[
              { key: "cache_check", label: "Cache" },
              { key: "fetching", label: "Netzwerk" },
              { key: "complete", label: "Fertig" },
            ].map((phase) => {
              const isActive = progress.phase === phase.key;
              const isCompleted =
                phase.key === "cache_check" ? ["fetching", "complete"].includes(progress.phase) :
                  phase.key === "fetching" ? progress.phase === "complete" :
                    false;

              return (
                <div
                  key={phase.key}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                    isActive && "bg-zinc-700 text-zinc-200 border-zinc-600",
                    isCompleted && "bg-zinc-800 text-zinc-400 border-zinc-700",
                    !isActive && !isCompleted && "bg-muted/30 text-muted-foreground border-transparent"
                  )}
                >
                  {phase.label}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
