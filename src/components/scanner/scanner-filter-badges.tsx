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
  momentum1yCount: number;
  setupCount: number;
  stockbeeCount: number;
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
  { key: "1y", label: "1Y", icon: TrendingUp, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "setup", label: "Qulla", icon: Star, title: undefined, active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
  { key: "stockbee", label: "Stockbee", icon: Zap, title: "Stockbee: EP + Momentum Burst + Expansion Breakout mit Trend/Liquiditaet.", active: "bg-white text-black hover:bg-zinc-200", inactive: "bg-zinc-800 text-zinc-400 hover:bg-zinc-700" },
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
  epCount, momentum1mCount, momentum3mCount, momentum6mCount, momentum1yCount,
  setupCount, stockbeeCount, rsCount, minerviniCount, canslimCount, chrisSwingsCount, squeezeCount, catalystCount,
}: FilterBadgesProps) {
  const counts: Record<string, number> = {
    ep: epCount, "1m": momentum1mCount, "3m": momentum3mCount, "6m": momentum6mCount, "1y": momentum1yCount,
    setup: setupCount,
    stockbee: stockbeeCount,
    rs: rsCount,
    minervini: minerviniCount,
    canslim: canslimCount,
    catalyst: catalystCount,
    chrisswings: chrisSwingsCount,
    squeeze: squeezeCount,
  };

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max gap-1.5">
        <Badge
          variant={activeTab === "all" ? "default" : "secondary"}
          className={cn(
            "cursor-pointer gap-1 px-2 py-1 text-xs font-medium transition-colors",
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
              "cursor-pointer gap-1 px-2 py-1 text-xs font-medium transition-colors",
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
    </div>
  );
}
