import { NextRequest, NextResponse } from "next/server";
import { symbolRateLimit } from "@/lib/rate-limiter";
import { fetchSeasonalityOverview } from "@/lib/seasonality-service";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = symbolRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { symbol } = await params;
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const data = await fetchSeasonalityOverview(symbol, { forceRefresh });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Seasonality API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch seasonality context" },
      { status: 503 }
    );
  }
}
