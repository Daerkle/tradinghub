#!/usr/bin/env node

const baseUrl = process.argv[2] || process.env.AUDIT_BASE_URL || "http://127.0.0.1:3001";

const checks = [
  { name: "health", path: "/api/health" },
  { name: "scanner", path: "/api/scanner" },
  { name: "scanner-warmup", path: "/api/scanner/warmup" },
  { name: "scanner-alerts", path: "/api/scanner/alerts-feed" },
  { name: "scanner-catalyst", path: "/api/scanner/catalyst-feed" },
  { name: "scanner-correction", path: "/api/scanner/correction" },
  { name: "scanner-gappers", path: "/api/scanner/gappers-feed" },
  { name: "scanner-group-rankings", path: "/api/scanner/group-rankings" },
  { name: "scanner-market", path: "/api/scanner/market" },
  { name: "scanner-sector-rotation", path: "/api/scanner/sector-rotation" },
  { name: "scanner-symbol", path: "/api/scanner/AAPL" },
  { name: "scanner-chart", path: "/api/scanner/chart/SPY" },
  { name: "scanner-news", path: "/api/scanner/news/AAPL" },
  { name: "scanner-options", path: "/api/scanner/options/SPY" },
  { name: "scanner-seasonality", path: "/api/scanner/seasonality/SPY" },
  { name: "seasonality-market", path: "/api/seasonality/market/SPY" },
  { name: "database-setups", path: "/api/database/setups" },
];

const manualChecks = [
  { name: "database-setup-by-id", reason: "benötigt existierende ID" },
  { name: "scanner-stream", reason: "SSE-Stream, eigener Live-Test sinnvoll" },
  { name: "trades-flex-query", reason: "POST und Account-/Token-abhängig" },
  { name: "database-backfill", reason: "write-/side-effect-lastig, nicht als Read-Smoke-Test geeignet" },
];

function summarizeJson(payload) {
  if (Array.isArray(payload)) {
    return `array(${payload.length})`;
  }
  if (!payload || typeof payload !== "object") {
    return typeof payload;
  }

  const keys = Object.keys(payload).slice(0, 8);
  return `keys=${keys.join(",")}`;
}

async function runCheck({ name, path }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/event-stream,*/*",
      },
    });

    const elapsedMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();

    let summary = raw.slice(0, 180).replace(/\s+/g, " ");
    if (contentType.includes("application/json")) {
      try {
        const json = JSON.parse(raw);
        summary = summarizeJson(json);
      } catch {
        // keep text summary
      }
    }

    return {
      name,
      path,
      ok: response.ok,
      status: response.status,
      elapsedMs,
      contentType,
      summary,
    };
  } catch (error) {
    return {
      name,
      path,
      ok: false,
      status: "ERR",
      elapsedMs: Date.now() - startedAt,
      contentType: "",
      summary: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

console.log(`API audit base: ${baseUrl}`);

const results = [];
for (const check of checks) {
  results.push(await runCheck(check));
}

for (const result of results) {
  const status = result.ok ? "OK" : "FAIL";
  console.log(
    `${status.padEnd(4)} ${String(result.status).padEnd(5)} ${String(result.elapsedMs).padStart(5)}ms ${result.name} ${result.path} ${result.summary}`
  );
}

if (manualChecks.length > 0) {
  console.log("\nManual checks:");
  for (const item of manualChecks) {
    console.log(`SKIP ${item.name} - ${item.reason}`);
  }
}
