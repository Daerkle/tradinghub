import { NextResponse } from "next/server";
import { DEFAULT_FX_RATES, sanitizeFxRates } from "@/lib/user-settings";

export const revalidate = 3600;

export async function GET() {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP", {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      throw new Error(`FX feed HTTP ${response.status}`);
    }

    const payload = await response.json();
    const rates = sanitizeFxRates({
      baseCurrency: "USD",
      rates: {
        USD: 1,
        EUR: payload?.rates?.EUR,
        GBP: payload?.rates?.GBP,
      },
      updatedAt: typeof payload?.date === "string" ? `${payload.date}T00:00:00.000Z` : new Date().toISOString(),
      source: "frankfurter.app",
    });

    return NextResponse.json(rates);
  } catch (error) {
    console.error("FX rate fetch failed:", error);
    return NextResponse.json({
      ...DEFAULT_FX_RATES,
      updatedAt: new Date().toISOString(),
    });
  }
}
