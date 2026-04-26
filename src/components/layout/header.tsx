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
import { getPageTitle } from "@/lib/navigation";

export function Header() {
  const pathname = usePathname();
  const pageTitle = getPageTitle(pathname);
  const showQuickAdd = !pathname.startsWith("/add-");

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:h-14 sm:px-4">
      <SidebarTrigger className="-ml-1 h-9 w-9 shrink-0" />
      <Separator orientation="vertical" className="mr-1 hidden h-4 sm:block" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="truncate text-sm font-medium sm:text-base">{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {showQuickAdd && (
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9 shrink-0 gap-2 px-2.5 sm:px-3" aria-label="Hinzufügen">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Hinzufügen</span>
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
