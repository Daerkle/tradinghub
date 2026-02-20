import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getSPYPerformance } from "@/lib/scanner-service";

function deriveMarketRegime(spy: { m1: number; m3: number; m6: number }): {
  label: string;
  explanation: string;
} {
  const m1 = spy.m1;
  const m3 = spy.m3;

  if (m1 > 0 && m3 > 0) {
    return {
      label: "Risk-On",
      explanation: "SPY ist auf 1M und 3M positiv. Momentum-Setups funktionieren statistisch besser.",
    };
  }

  if (m1 < 0 && m3 < 0) {
    return {
      label: "Risk-Off",
      explanation: "SPY ist auf 1M und 3M negativ. Breakouts faulen haeufiger, Cash ist ein Setup.",
    };
  }

  return {
    label: "Uebergang",
    explanation: "Gemischtes Bild (1M/3M nicht beide gleich). Selektiv sein, auf Qualitaet achten.",
  };
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const spy = await getSPYPerformance();
  const regime = deriveMarketRegime(spy);

  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    benchmark: "SPY",
    spy,
    regime,
  });
}

