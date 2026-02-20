"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { useAuthStore } from "@/stores/auth-store";

// Set to true to bypass auth during development
const DEV_BYPASS_AUTH = false;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);

  // Validate session once on mount to avoid hydration deadlocks
  useEffect(() => {
    if (!DEV_BYPASS_AUTH && !authChecked) {
      checkAuth().finally(() => setAuthChecked(true));
    }
  }, [authChecked, checkAuth]);

  // Redirect only after the auth check completed
  useEffect(() => {
    if (!DEV_BYPASS_AUTH && authChecked && !isAuthenticated) {
      router.push("/login");
    }
  }, [authChecked, isAuthenticated, router]);

  // Show spinner until auth check completes
  if (!DEV_BYPASS_AUTH && !authChecked) {
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
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-2 sm:p-3 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
