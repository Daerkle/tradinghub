import { NextRequest, NextResponse } from "next/server";
import { fetchOptionsOverview } from "@/lib/options-service";
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
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const data = await fetchOptionsOverview(symbol, { forceRefresh });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Options API error:", error);
    const message =
      error instanceof Error && /429|crumb/i.test(error.message)
        ? "Yahoo Options ist aktuell rate-limited. Fuer stabile Optionsdaten bitte Proxy/Caching fuer Yahoo aktivieren."
        : "Failed to fetch options positioning";
    return NextResponse.json(
      { error: message },
      { status: 503 }
    );
  }
}
