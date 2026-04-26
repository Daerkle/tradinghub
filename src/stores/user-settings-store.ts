"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Parse } from "@/lib/parse";
import {
  DEFAULT_FX_RATES,
  DEFAULT_USER_PROFILE,
  DEFAULT_USER_PREFERENCES,
  sanitizeFxRates,
  sanitizeUserPreferences,
  sanitizeUserProfile,
  type FxRatesPayload,
  type SaveUserSettingsPayload,
  type UserPreferences,
  type UserProfile,
} from "@/lib/user-settings";

interface UserSettingsState {
  profile: UserProfile;
  preferences: UserPreferences;
  fxRates: FxRatesPayload;
  isLoading: boolean;
  isSaving: boolean;
  hasLoaded: boolean;
  loadSettings: (force?: boolean) => Promise<void>;
  saveSettings: (payload: SaveUserSettingsPayload) => Promise<{ profile: UserProfile; preferences: UserPreferences }>;
  loadFxRates: (force?: boolean) => Promise<void>;
  patchPreferences: (preferences: Partial<UserPreferences>) => void;
  reset: () => void;
}

async function fetchWithSessionToken<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const sessionToken = Parse.User.current()?.getSessionToken();
  if (!sessionToken) {
    throw new Error("Nicht authentifiziert");
  }

  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-parse-session-token": sessionToken,
      ...(init?.headers || {}),
    },
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};

  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "Request fehlgeschlagen");
  }

  return payload as T;
}

export const useUserSettingsStore = create<UserSettingsState>()(
  persist(
    (set, get) => ({
      profile: DEFAULT_USER_PROFILE,
      preferences: DEFAULT_USER_PREFERENCES,
      fxRates: DEFAULT_FX_RATES,
      isLoading: false,
      isSaving: false,
      hasLoaded: false,

      loadSettings: async (force = false) => {
        if (get().isLoading) return;
        if (get().hasLoaded && !force) return;
        if (!Parse.User.current()) {
          set({ hasLoaded: false, profile: DEFAULT_USER_PROFILE, preferences: DEFAULT_USER_PREFERENCES });
          return;
        }

        set({ isLoading: true });
        try {
          const payload = await fetchWithSessionToken<{ profile: UserProfile; preferences: UserPreferences }>("/api/user-settings");
          set({
            profile: sanitizeUserProfile(payload.profile),
            preferences: sanitizeUserPreferences(payload.preferences),
            isLoading: false,
            hasLoaded: true,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      saveSettings: async (payload) => {
        set({ isSaving: true });
        try {
          const current = get();
          const response = await fetchWithSessionToken<{ profile: UserProfile; preferences: UserPreferences }>("/api/user-settings", {
            method: "PUT",
            body: JSON.stringify({
              profile: {
                ...current.profile,
                ...(payload.profile || {}),
              },
              preferences: {
                ...current.preferences,
                ...(payload.preferences || {}),
              },
              password: payload.password,
            }),
          });

          const nextProfile = sanitizeUserProfile(response.profile);
          const nextPreferences = sanitizeUserPreferences(response.preferences);
          set({
            profile: nextProfile,
            preferences: nextPreferences,
            isSaving: false,
            hasLoaded: true,
          });
          return { profile: nextProfile, preferences: nextPreferences };
        } catch (error) {
          set({ isSaving: false });
          throw error;
        }
      },

      loadFxRates: async (force = false) => {
        const currentRates = get().fxRates;
        const ageMs = Date.now() - new Date(currentRates.updatedAt).getTime();
        if (!force && Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 1000 * 60 * 60 * 6) {
          return;
        }

        try {
          const response = await fetch("/api/fx-rates", { cache: "no-store" });
          const payload = await response.json();
          set({ fxRates: sanitizeFxRates(payload) });
        } catch {
          set({ fxRates: DEFAULT_FX_RATES });
        }
      },

      patchPreferences: (preferences) => {
        set((state) => ({
          preferences: sanitizeUserPreferences({
            ...state.preferences,
            ...preferences,
          }),
        }));
      },

      reset: () => {
        set({
          profile: DEFAULT_USER_PROFILE,
          preferences: DEFAULT_USER_PREFERENCES,
          fxRates: DEFAULT_FX_RATES,
          isLoading: false,
          isSaving: false,
          hasLoaded: false,
        });
      },
    }),
    {
      name: "user-settings-storage",
      partialize: (state) => ({
        profile: state.profile,
        preferences: state.preferences,
        fxRates: state.fxRates,
        hasLoaded: state.hasLoaded,
      }),
    }
  )
);
