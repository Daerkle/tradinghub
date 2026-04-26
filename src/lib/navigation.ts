import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Book,
  BookOpen,
  Calendar,
  CalendarDays,
  Database,
  FileText,
  Flame,
  Image,
  LayoutDashboard,
  NotebookPen,
  Radar,
  Rows3,
  Save,
  ScrollText,
  Video,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  title: string;
  icon: LucideIcon;
  matches?: string[];
  excludeMatches?: string[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Allgemein",
    items: [
      { href: "/dashboard", label: "Dashboard", title: "Dashboard", icon: LayoutDashboard },
      { href: "/calendar", label: "Kalender", title: "Kalender", icon: Calendar },
      { href: "/reports", label: "Reports", title: "Reports", icon: FileText },
    ],
  },
  {
    label: "Trading",
    items: [
      { href: "/trades", label: "Trades", title: "Trades", icon: Activity, matches: ["/trades/"] },
      { href: "/daily", label: "Täglich", title: "Täglich", icon: CalendarDays },
      { href: "/trading-plans", label: "Pläne", title: "Trading-Pläne", icon: ScrollText },
    ],
  },
  {
    label: "Logbuch",
    items: [
      { href: "/diary", label: "Tagebuch", title: "Tagebuch", icon: BookOpen, matches: ["/diary/"] },
      { href: "/notes", label: "Notizen", title: "Notizen", icon: NotebookPen, matches: ["/notes/"] },
      { href: "/playbook", label: "Playbook", title: "Playbook", icon: Book },
    ],
  },
  {
    label: "Medien",
    items: [
      { href: "/screenshots", label: "Screenshots", title: "Screenshots", icon: Image },
      { href: "/videos", label: "Videos", title: "Videos", icon: Video },
    ],
  },
  {
    label: "Markt",
    items: [
      { href: "/scanner", label: "Scanner", title: "Scanner", icon: Radar },
      { href: "/market-heat", label: "Market Heat", mobileLabel: "Heat", title: "Market Heat", icon: Flame },
      { href: "/top-groups", label: "Top Gruppen", title: "Top Gruppen", icon: BarChart3 },
      { href: "/seasonality", label: "Saisonalitäten", title: "Saisonalitäten", icon: CalendarDays },
      { href: "/correction", label: "Korrektur", title: "Korrektur & Sentiment", icon: BarChart3 },
      { href: "/market-dashboard", label: "Market Dashboard", title: "Market Dashboard", icon: BarChart3 },
      { href: "/edge-free", label: "Edge Free", title: "Edge Free", icon: Rows3 },
    ],
  },
  {
    label: "Daten",
    items: [
      {
        href: "/database",
        label: "Browser",
        title: "Setup-Browser",
        icon: Database,
        matches: ["/database/"],
        excludeMatches: ["/database/backfill"],
      },
      { href: "/database/backfill", label: "Backfill", title: "Backfill", icon: Save },
    ],
  },
];

export const MOBILE_PRIMARY_NAV: NavItem[] = [
  NAV_GROUPS[0].items[0],
  NAV_GROUPS[1].items[0],
  NAV_GROUPS[4].items[0],
  NAV_GROUPS[4].items[1],
];

export const ADD_ROUTE_TITLES: Record<string, string> = {
  "/add-trades": "Trades hinzufügen",
  "/add-diary": "Tagebuch hinzufügen",
  "/add-note": "Notiz hinzufügen",
  "/add-screenshot": "Screenshot hinzufügen",
  "/add-playbook": "Playbook hinzufügen",
  "/add-video": "Video hochladen",
};

const EXTRA_ROUTE_TITLES: Record<string, string> = {
  "/settings": "Einstellungen",
};

export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.excludeMatches?.some((match) => pathname.startsWith(match))) return false;
  if (pathname === item.href) return true;
  return item.matches?.some((match) => pathname.startsWith(match)) ?? false;
}

export function getPageTitle(pathname: string): string {
  if (ADD_ROUTE_TITLES[pathname]) return ADD_ROUTE_TITLES[pathname];
  if (EXTRA_ROUTE_TITLES[pathname]) return EXTRA_ROUTE_TITLES[pathname];

  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => isNavItemActive(pathname, entry));
    if (item) return item.title;
  }

  return "TradingHub";
}
