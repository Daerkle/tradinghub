import { NextRequest, NextResponse } from "next/server";
import { fetchChartOnly } from "@/lib/scanner-service";
import { symbolRateLimit } from "@/lib/rate-limiter";

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

  try {
    const chartData = await fetchChartOnly(symbol);

    if (chartData.length === 0) {
      return NextResponse.json(
        { error: "No chart data available" },
        { status: 404 }
      );
    }

    return NextResponse.json({ chartData });
  } catch (error) {
    console.error("Chart API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch chart data" },
      { status: 500 }
    );
  }
}
