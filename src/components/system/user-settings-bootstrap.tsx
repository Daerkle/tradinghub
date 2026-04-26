"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/auth-store";
import { useUserSettingsStore } from "@/stores/user-settings-store";

export function UserSettingsBootstrap() {
  const { isAuthenticated, _hasHydrated } = useAuthStore();
  const { preferences, hasLoaded, loadSettings, loadFxRates, reset } = useUserSettingsStore();
  const { setTheme } = useTheme();

  useEffect(() => {
    if (!_hasHydrated) return;

    if (!isAuthenticated) {
      reset();
      return;
    }

    if (!hasLoaded) {
      loadSettings().catch((error) => {
        console.error("Failed to load user settings:", error);
      });
    }

    loadFxRates().catch((error) => {
      console.error("Failed to load FX rates:", error);
    });
  }, [_hasHydrated, hasLoaded, isAuthenticated, loadFxRates, loadSettings, reset]);

  useEffect(() => {
    setTheme(preferences.theme);

    document.documentElement.dataset.density = preferences.compactMode ? "compact" : "comfortable";
  }, [preferences.compactMode, preferences.theme, setTheme]);

  return null;
}
