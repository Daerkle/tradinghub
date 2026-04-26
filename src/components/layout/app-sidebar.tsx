"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Settings,
  LogOut,
  Moon,
  Sun,
  ChevronDown,
} from "lucide-react";
import { useTheme } from "next-themes";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_GROUPS, isNavItemActive } from "@/lib/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { useUserSettingsStore } from "@/stores/user-settings-store";
import { TradingHubMark } from "@/components/brand/tradinghub-logo";


export function AppSidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuthStore();
  const saveSettings = useUserSettingsStore((state) => state.saveSettings);
  const { state, isMobile, setOpenMobile } = useSidebar();

  const handleMobileNav = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    saveSettings({ preferences: { theme: nextTheme } }).catch((error) => {
      console.error("Failed to persist theme toggle:", error);
    });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex h-11 items-center gap-2 px-2">
          <Link
            href="/dashboard"
            onClick={handleMobileNav}
            className="flex min-w-0 items-center gap-2 rounded-md outline-none ring-sidebar-ring transition-opacity hover:opacity-90 focus-visible:ring-2"
            aria-label="TradingHub Dashboard"
          >
            <TradingHubMark className="h-8 w-8" />
          {state === "expanded" && (
            <div className="flex min-w-0 flex-col leading-none">
              <div className="flex items-center text-base font-semibold tracking-tight">
                <span className="text-foreground">Trading</span>
                <span className="text-muted-foreground">Hub</span>
              </div>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Heat Scanner
              </span>
            </div>
          )}
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1 py-1">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="px-1.5 py-1">
            <SidebarGroupLabel className="h-6 px-2 text-[11px] font-semibold uppercase tracking-wide">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        tooltip={item.title}
                        isActive={isNavItemActive(pathname, item)}
                      >
                        <Link href={item.href} onClick={handleMobileNav} prefetch>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.avatar?.url} alt={user?.username ? `${user.username} Avatar` : "User Avatar"} />
                    <AvatarFallback>
                      {user?.username?.charAt(0).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {state === "expanded" && (
                    <>
                      <div className="flex min-w-0 flex-1 flex-col items-start text-sm">
                        <span className="max-w-full truncate font-medium">{user?.username}</span>
                        <span className="max-w-full truncate text-xs text-muted-foreground">
                          {user?.email}
                        </span>
                      </div>
                      <ChevronDown className="ml-auto h-4 w-4" />
                    </>
                  )}
                </SidebarMenuButton>
              </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  align="start"
                  className="w-56"
                >
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center gap-2" onClick={handleMobileNav}>
                    <Settings className="h-4 w-4" />
                    Einstellungen
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleThemeToggle}
                  className="flex items-center gap-2"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  {theme === "dark" ? "Hell" : "Dunkel"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="flex items-center gap-2 text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
