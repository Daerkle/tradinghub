"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { MOBILE_PRIMARY_NAV, isNavItemActive } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-1.5 shadow-[0_-8px_24px_rgba(0,0,0,0.18)] backdrop-blur supports-[backdrop-filter]:bg-background/85 md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {MOBILE_PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 flex-col items-center justify-center rounded-md px-1 text-[11px] font-medium text-muted-foreground transition-colors",
                active && "bg-primary text-primary-foreground"
              )}
            >
              <Icon className="mb-0.5 h-4 w-4" />
              <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          className="flex min-h-11 flex-col gap-0.5 px-1 text-[11px] font-medium text-muted-foreground"
          onClick={() => setOpenMobile(true)}
          aria-label="Mehr Menü öffnen"
        >
          <Menu className="h-4 w-4" />
          <span>Mehr</span>
        </Button>
      </div>
    </nav>
  );
}
