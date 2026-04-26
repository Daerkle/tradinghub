"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { UserSettingsBootstrap } from "@/components/system/user-settings-bootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <UserSettingsBootstrap />
      {children}
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  );
}
