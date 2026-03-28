import { NextRequest, NextResponse } from "next/server";
import { fetchMarketSeasonalityOverview } from "@/lib/market-seasonality-service";

type RouteContext = {
  params: Promise<{
    symbol: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { symbol } = await context.params;
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const data = await fetchMarketSeasonalityOverview(symbol, { forceRefresh });
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("Market seasonality route error", symbol, error);
    return NextResponse.json(
      { error: "Failed to fetch market seasonality context" },
      { status: 500 }
    );
  }
}
