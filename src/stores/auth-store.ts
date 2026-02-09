"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Parse, initializeParse } from "@/lib/parse";

const AUTH_REQUEST_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} Timeout. Bitte erneut versuchen.`));
    }, AUTH_REQUEST_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

interface User {
  id: string;
  username: string;
  email?: string;
  avatar?: { url: string };
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      isAuthenticated: false,
      _hasHydrated: false,

      login: async (username: string, password: string) => {
        initializeParse();
        set({ isLoading: true });
        try {
          const user = await withTimeout(Parse.User.logIn(username, password), "Login");
          set({
            user: {
              id: user.id ?? "",
              username: user.get("username") ?? username,
              email: user.get("email"),
              avatar: user.get("avatar"),
            },
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (
        username: string,
        email: string,
        password: string
      ) => {
        initializeParse();
        set({ isLoading: true });
        try {
          const user = new Parse.User();
          user.set("username", username);
          user.set("email", email);
          user.set("password", password);
          await withTimeout(user.signUp(), "Registrierung");
          set({
            user: {
              id: user.id ?? "",
              username: user.get("username") ?? username,
              email: user.get("email") ?? email,
            },
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        initializeParse();
        try { await Parse.User.logOut(); } catch { /* ignore */ }
        set({ user: null, isAuthenticated: false });
      },

      checkAuth: async () => {
        initializeParse();
        set({ isLoading: true });
        try {
          const currentUser = Parse.User.current();
          if (currentUser) {
            // Validate session token directly against Parse API
            try {
              const sessionToken = currentUser.getSessionToken();
              if (sessionToken) {
                await withTimeout(currentUser.fetch({ sessionToken }), "Session-Check");
              }
            } catch (e: unknown) {
              const code = (e as { code?: number })?.code;
              if (code === 209) {
                // Invalid session token - clear and redirect to login
                try { await Parse.User.logOut(); } catch { /* ignore */ }
                set({ user: null, isAuthenticated: false, isLoading: false });
                return;
              }
              // Other errors (network etc.) - keep user logged in
            }
            set({
              user: {
                id: currentUser.id ?? "",
                username: currentUser.get("username") ?? "",
                email: currentUser.get("email"),
                avatar: currentUser.get("avatar"),
              },
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({ user: null, isAuthenticated: false, isLoading: false });
          }
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => {
        return () => {
          useAuthStore.setState({ _hasHydrated: true, isLoading: false });
        };
      },
    }
  )
);
