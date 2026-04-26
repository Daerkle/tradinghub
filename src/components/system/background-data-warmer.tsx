"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const INITIAL_DELAY_MS = 5_000;
const DESKTOP_INTERVAL_MS = 8 * 60 * 1000;
const MOBILE_INTERVAL_MS = 12 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 90 * 1000;

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

function getIntervalMs(): number {
  if (typeof window === "undefined") return DESKTOP_INTERVAL_MS;
  return window.innerWidth < 768 ? MOBILE_INTERVAL_MS : DESKTOP_INTERVAL_MS;
}

function canWarmOnConnection(): boolean {
  if (typeof navigator === "undefined") return true;
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection) return true;
  return !connection.saveData && connection.effectiveType !== "2g" && connection.effectiveType !== "slow-2g";
}

export function BackgroundDataWarmer() {
  const pathname = usePathname();
  const lastRunRef = useRef(0);
  const pauseWarmup = pathname.startsWith("/scanner");

  useEffect(() => {
    if (pauseWarmup) return;

    let cancelled = false;

    const warm = async (reason: string) => {
      if (cancelled || typeof document === "undefined") return;
      if (document.visibilityState === "hidden") return;
      if (!canWarmOnConnection()) return;

      const now = Date.now();
      if (now - lastRunRef.current < MIN_REQUEST_GAP_MS) return;
      lastRunRef.current = now;

      try {
        await fetch(`/api/scanner/background-refresh?scope=core&reason=${encodeURIComponent(reason)}`, {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Non-blocking background warmup.
      }
    };

    const initialTimer = window.setTimeout(() => {
      void warm("initial");
    }, INITIAL_DELAY_MS);

    const intervalId = window.setInterval(() => {
      void warm("interval");
    }, getIntervalMs());

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void warm("visible");
      }
    };

    const handleFocus = () => {
      void warm("focus");
    };

    const handleOnline = () => {
      void warm("online");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [pauseWarmup]);

  return null;
}
