import { NextRequest, NextResponse } from "next/server";
import { refreshBackgroundCaches, type BackgroundRefreshScope } from "@/lib/background-refresh";
import { scannerRateLimit } from "@/lib/rate-limiter";

function parseScope(value: string | null): BackgroundRefreshScope {
  return value === "full" ? "full" : "core";
}

async function handle(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const scope = parseScope(request.nextUrl.searchParams.get("scope"));
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    const result = await refreshBackgroundCaches(scope, { forceRefresh });
    return NextResponse.json({
      fetchedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("Background refresh API error:", error);
    return NextResponse.json({ error: "Background-Refresh fehlgeschlagen." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
