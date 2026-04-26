"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { BackgroundDataWarmer } from "@/components/system/background-data-warmer";
import { useAuthStore } from "@/stores/auth-store";
import { useUserSettingsStore } from "@/stores/user-settings-store";

// Set to true to bypass auth during development
const DEV_BYPASS_AUTH = false;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const compactMode = useUserSettingsStore((state) => state.preferences.compactMode);
  const [authChecked, setAuthChecked] = useState(false);

  // Validate session once on mount to avoid hydration deadlocks
  useEffect(() => {
    if (!DEV_BYPASS_AUTH && !authChecked) {
      checkAuth().finally(() => setAuthChecked(true));
    }
  }, [authChecked, checkAuth]);

  // Redirect only after the auth check completed
  useEffect(() => {
    if (!DEV_BYPASS_AUTH && authChecked && !isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [authChecked, isLoading, isAuthenticated, router]);

  // Show spinner until auth check completes
  if (!DEV_BYPASS_AUTH && (!authChecked || isLoading)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!DEV_BYPASS_AUTH && !isAuthenticated) {
    return null;
  }

  return (
    <SidebarProvider>
      <BackgroundDataWarmer />
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main
          className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain ${
            compactMode
              ? "px-2.5 pb-24 pt-2.5 sm:px-3 sm:pt-3 md:px-4 md:pb-4 md:pt-4"
              : "px-3 pb-24 pt-3 sm:px-4 sm:pt-4 md:px-5 md:pb-5 md:pt-5"
          }`}
        >
          {children}
        </main>
        <MobileBottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
