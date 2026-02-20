"use client";

import {
  Zap, Calendar, TrendingUp, Target, Star, Activity, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FilterBadgesProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  totalCount: number;
  epCount: number;
  momentum1mCount: number;
  momentum3mCount: number;
  momentum6mCount: number;
  setupCount: number;
  rsCount: number;
  minerviniCount: number;
  canslimCount: number;
  chrisSwingsCount: number;
  squeezeCount: number;
  catalystCount: number;
}

const BADGES = [
  { key: "ep", label: "EP", icon: Zap, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "1m", label: "1M", icon: Calendar, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "3m", label: "3M", icon: TrendingUp, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "6m", label: "6M", icon: Target, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "setup", label: "Qulla", icon: Star, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "rs", label: "RS", icon: TrendingUp, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  {
    key: "minervini",
    label: "Minervini",
    icon: TrendingUp,
    title: "Minervini Trend Template: Preis > SMA150/200, SMA50 > SMA150 > SMA200, Leader-Charakter.",
    active: "bg-white text-black hover:bg-zinc-200",
    inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
  },
  {
    key: "canslim",
    label: "CANSLIM",
    icon: Target,
    title: "CANSLIM (heuristisch): Leader + Trend + nahe Hochs + Volumen + Wachstum/Momentum (wenn Daten da).",
    active: "bg-white text-black hover:bg-zinc-200",
    inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
  },
  { key: "catalyst", label: "Catalyst", icon: AlertCircle, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "chrisswings", label: "Swings", icon: Activity, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "squeeze", label: "Squeeze", icon: AlertCircle, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
] as const;

export function ScannerFilterBadges({
  activeTab, setActiveTab, totalCount,
  epCount, momentum1mCount, momentum3mCount, momentum6mCount,
  setupCount, rsCount, minerviniCount, canslimCount, chrisSwingsCount, squeezeCount, catalystCount,
}: FilterBadgesProps) {
  const counts: Record<string, number> = {
    ep: epCount, "1m": momentum1mCount, "3m": momentum3mCount, "6m": momentum6mCount,
    setup: setupCount,
    rs: rsCount,
    minervini: minerviniCount,
    canslim: canslimCount,
    catalyst: catalystCount,
    chrisswings: chrisSwingsCount,
    squeeze: squeezeCount,
  };

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      <Badge
        variant={activeTab === "all" ? "default" : "secondary"}
        className={cn(
          "cursor-pointer px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium transition-all",
          activeTab === "all" ? "bg-white text-black hover:bg-zinc-200" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
        )}
        onClick={() => setActiveTab("all")}
      >
        Alle ({totalCount})
      </Badge>

      {BADGES.map(({ key, label, icon: Icon, active, inactive, title }) => (
        <Badge
          key={key}
          variant={activeTab === key ? "default" : "secondary"}
          className={cn(
            "cursor-pointer px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium transition-all hover:scale-105 gap-1 sm:gap-1.5",
            activeTab === key ? active : inactive
          )}
          onClick={() => setActiveTab(key)}
          title={title}
        >
          <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          {label} ({counts[key]})
        </Badge>
      ))}
    </div>
  );
}
