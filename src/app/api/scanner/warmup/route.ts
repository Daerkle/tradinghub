import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getCachedScannerResults, getCachedSeededScannerResults } from "@/lib/redis-cache";
import { getStockSymbols, runFullScanWithCache, type ScanResult } from "@/lib/scanner-service";

type WarmupMode = "seeded" | "full";

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const mode: WarmupMode = params.get("mode") === "full" ? "full" : "seeded";
  const forceRefresh = params.get("refresh") === "true";
  const wait = params.get("wait") === "true";
  const limit = parsePositiveInt(params.get("limit"), mode === "full" ? 1200 : 350, mode === "full" ? 5000 : 800);

  try {
    if (!forceRefresh) {
      const full = await getCachedScannerResults<ScanResult>();
      if (full && full.stocks.length > 0) {
        return NextResponse.json({
          generatedAt: new Date().toISOString(),
          status: "fresh",
          mode,
          source: "cache-full",
          scanTime: new Date(full.scanTime).toISOString(),
          scannedCount: full.totalScanned,
        });
      }

      if (mode === "seeded") {
        const seeded = await getCachedSeededScannerResults<ScanResult>();
        if (seeded && seeded.stocks.length > 0) {
          return NextResponse.json({
            generatedAt: new Date().toISOString(),
            status: "fresh",
            mode,
            source: "cache-seeded",
            scanTime: new Date(seeded.scanTime).toISOString(),
            scannedCount: seeded.totalScanned,
          });
        }
      }
    }

    const symbols = await getStockSymbols(forceRefresh, limit);
    const task = runFullScanWithCache({
      useCache: true,
      forceRefresh: true,
      symbols,
      cacheKey: mode === "seeded" ? "seeded" : "full",
    });

    if (wait) {
      const result = await task;
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        status: "done",
        mode,
        source: result.fromCache ? "cache" : "scan",
        scanTime: new Date(result.scanTime).toISOString(),
        scannedCount: result.totalScanned,
      });
    }

    void task.catch((error) => {
      console.error("Scanner warmup failed:", error);
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      status: "started",
      mode,
      limit,
    });
  } catch (error) {
    console.error("Scanner warmup API error:", error);
    return NextResponse.json({ error: "Failed to warm up scanner" }, { status: 500 });
  }
}

