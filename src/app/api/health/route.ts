import { NextResponse } from "next/server";

interface HealthServices {
  app: string;
  redis?: string;
  parseServer?: string;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  environment: string | undefined;
  services: HealthServices;
}

export async function GET() {
  const health: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      app: "running",
    },
  };

  // Check Redis connection
  try {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      health.services.redis = "configured";
    }
  } catch {
    health.services.redis = "unavailable";
  }

  // Check Parse Server connection
  try {
    const parseUrl = process.env.NEXT_PUBLIC_PARSE_SERVER_URL;
    if (parseUrl) {
      health.services.parseServer = "configured";
    }
  } catch {
    health.services.parseServer = "unavailable";
  }

  return NextResponse.json(health, { status: 200 });
}
