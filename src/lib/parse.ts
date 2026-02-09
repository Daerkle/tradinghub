"use client";

import Parse from "parse";

// Polyfill for crypto.randomUUID (required by Parse SDK in some environments)
if (typeof window !== "undefined" && typeof crypto !== "undefined") {
  if (!crypto.randomUUID) {
    // @ts-expect-error - Polyfill for older browsers
    crypto.randomUUID = function randomUUID() {
      return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c: string) =>
        (
          Number(c) ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
        ).toString(16)
      );
    };
  }
}

// Initialize Parse - will be called once on client side
let initialized = false;

function getParseServerURL(): string {
  // Always derive from current browser location for client-side
  // This ensures it works in both local dev and docker deployment
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const protocol = window.location.protocol;
    return `${protocol}//${host}:28080/parse`;
  }

  // Server-side fallback (for SSR/API routes)
  if (process.env.INTERNAL_PARSE_SERVER_URL) {
    return process.env.INTERNAL_PARSE_SERVER_URL;
  }

  return "http://localhost:28080/parse";
}

export function initializeParse() {
  if (initialized || typeof window === "undefined") return;

  Parse.initialize(
    process.env.NEXT_PUBLIC_PARSE_APP_ID || "tradenote123",
    process.env.NEXT_PUBLIC_PARSE_JS_KEY || "tradenote123"
  );
  Parse.serverURL = getParseServerURL();

  initialized = true;
}

export { Parse };
