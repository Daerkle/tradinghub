import { NextRequest, NextResponse } from "next/server";
import { scannerRateLimit } from "@/lib/rate-limiter";
import { getSectorRotation } from "@/lib/sector-rotation";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = scannerRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const data = await getSectorRotation();
  return NextResponse.json(data);
}

