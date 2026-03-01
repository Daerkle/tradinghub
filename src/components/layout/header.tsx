"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus } from "lucide-react";
import Link from "next/link";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/daily": "Täglich",
  "/correction": "Korrektur & Sentiment",
  "/market-dashboard": "Market Dashboard",
  "/calendar": "Kalender",
  "/screenshots": "Screenshots",
  "/videos": "Videos",
  "/diary": "Tagebuch",
  "/notes": "Notizen",
  "/playbook": "Playbook",
  "/settings": "Einstellungen",
  "/add-trades": "Trades hinzufügen",
  "/add-diary": "Tagebuch hinzufügen",
  "/add-screenshot": "Screenshot hinzufügen",
  "/add-playbook": "Playbook hinzufügen",
  "/add-video": "Video hochladen",
};

export function Header() {
  const pathname = usePathname();
  const pageTitle = pageTitles[pathname] || "TradingHub";
  const showQuickAdd = !pathname.startsWith("/add-");

  return (
    <header className="flex h-12 sm:h-14 shrink-0 items-center gap-2 border-b bg-background px-3 sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {showQuickAdd && (
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden md:inline">Hinzufügen</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/add-trades">Trades</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/add-diary">Tagebucheintrag</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/add-screenshot">Screenshot</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/add-playbook">Playbook</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/add-video">Video</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </header>
  );
}
