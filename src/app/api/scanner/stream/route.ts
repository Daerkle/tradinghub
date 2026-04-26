// Streaming Scanner API - Progressive Loading mit Server-Sent Events
// Sendet gecachte Aktien sofort und neue Daten progressiv

import { NextRequest, NextResponse } from "next/server";
import {
  getCacheStats,
  cacheScannerResults,
  cacheSeededScannerResults,
  cacheStocksWithSWR,
  getCachedScannerResults,
  getCachedSeededScannerResults,
  getStocksWithSWRBatch,
} from "@/lib/redis-cache";
import { refreshBackgroundCaches, type BackgroundRefreshScope } from "@/lib/background-refresh";
import { streamRateLimit } from "@/lib/rate-limiter";
import {
  fetchStockData,
  fetchYahooQuoteSnapshotStocks,
  fetchOpenBBQuoteSnapshotStocksFallback,
  fetchStooqSnapshotStocks,
  applyCatalystMetrics,
  applyStockbeeMetrics,
  buildStockFromFinvizData,
  fetchFinvizDataWithCache,
  getStockSymbols,
  getSPYPerformance,
  type ScanResult,
  type StockData,
} from "@/lib/scanner-service";
import { filterByScanType } from "@/lib/scanner-filters";
import type { FinvizStockData } from "@/lib/finviz-service";

const STOCK_CACHE_TTL = 24 * 60 * 60; // 1 Tag per Stock (24 Stunden)
const DEFAULT_SYMBOL_LIMIT: number | null = null; // no default limit
const MAX_SYMBOL_LIMIT = 5000;
const MAX_STREAM_DURATION_MS = 20 * 60 * 1000; // allow full-universe scans by default
const MAX_FINVIZ_ENRICH_PER_BATCH = 8;
const SNAPSHOT_CHUNK_SIZE = 80;
const SNAPSHOT_REFRESH_AFTER_MS = 5 * 60 * 1000;
const SNAPSHOT_SEEDED_LIMIT = 800;

let snapshotRefreshInFlight: Promise<unknown> | null = null;

function parseSymbolLimit(raw: string | null): number | null {
  if (!raw) return DEFAULT_SYMBOL_LIMIT;

  const normalized = raw.trim().toLowerCase();
  if (normalized === "all" || normalized === "none" || normalized === "0") {
    return null; // unlimited
  }

  const limit = Number.parseInt(normalized, 10);
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_SYMBOL_LIMIT;
  return Math.min(limit, MAX_SYMBOL_LIMIT);
}

function selectFinvizSymbolsForBatch(stocks: StockData[]): string[] {
  const prioritized = stocks
    .filter((stock) =>
      stock.isEP ||
      stock.isQullaSetup ||
      stock.isStockbeeSetup ||
      stock.catalystScore >= 70 ||
      stock.volumeRatio >= 2.5 ||
      stock.sector === "Unknown" ||
      stock.industry === "Unknown"
    )
    .sort((a, b) => {
      const scoreA = a.catalystScore + (a.isQullaSetup ? 20 : 0) + (a.isStockbeeSetup ? 16 : 0) + (a.isEP ? 10 : 0) + Math.min(a.volumeRatio, 6) * 3;
      const scoreB = b.catalystScore + (b.isQullaSetup ? 20 : 0) + (b.isStockbeeSetup ? 16 : 0) + (b.isEP ? 10 : 0) + Math.min(b.volumeRatio, 6) * 3;
      return scoreB - scoreA;
    })
    .slice(0, MAX_FINVIZ_ENRICH_PER_BATCH);

  return prioritized.map((stock) => stock.symbol);
}

function getScanTimeMs(scanTime: ScanResult["scanTime"] | string | number | null | undefined): number {
  if (!scanTime) return 0;
  const date = scanTime instanceof Date ? scanTime : new Date(scanTime);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeCachedStock(stock: StockData): StockData {
  return applyCatalystMetrics({
    ...stock,
    catalystScore: stock.catalystScore ?? 0,
    catalystSignals: Array.isArray(stock.catalystSignals) ? stock.catalystSignals : [],
  });
}

function hasNonZeroPerformance(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function hasSnapshotPerformanceData(result: ScanResult): boolean {
  return result.stocks.some((stock) =>
    [
      stock.momentum1M,
      stock.momentum3M,
      stock.momentum6M,
      stock.momentum1Y,
    ].some(hasNonZeroPerformance)
  );
}

async function getBestCachedSnapshot(): Promise<{
  result: ScanResult;
  source: "full" | "seeded";
  ageMs: number;
} | null> {
  const [full, seeded] = await Promise.all([
    getCachedScannerResults<ScanResult>(),
    getCachedSeededScannerResults<ScanResult>(),
  ]);

  const candidates = [
    full?.stocks?.length ? { result: full, source: "full" as const } : null,
    seeded?.stocks?.length ? { result: seeded, source: "seeded" as const } : null,
  ].filter((candidate): candidate is { result: ScanResult; source: "full" | "seeded" } => Boolean(candidate));

  if (candidates.length === 0) return null;

  const candidatesWithPerformance = candidates.filter((candidate) => hasSnapshotPerformanceData(candidate.result));
  const pool = candidatesWithPerformance.length > 0 ? candidatesWithPerformance : candidates;

  pool.sort((left, right) => {
    const stockDelta = right.result.stocks.length - left.result.stocks.length;
    if (stockDelta !== 0) return stockDelta;
    return getScanTimeMs(right.result.scanTime) - getScanTimeMs(left.result.scanTime);
  });

  const best = pool[0];
  const scanTimeMs = getScanTimeMs(best.result.scanTime);
  return {
    ...best,
    ageMs: scanTimeMs ? Date.now() - scanTimeMs : Number.POSITIVE_INFINITY,
  };
}

function scheduleSnapshotRefresh(reason: string, scope: BackgroundRefreshScope): void {
  if (snapshotRefreshInFlight) return;

  snapshotRefreshInFlight = refreshBackgroundCaches(scope, { forceRefresh: true })
    .then((result) => {
      console.log(`Scanner snapshot refresh complete (${reason}):`, result);
      return result;
    })
    .catch((error) => {
      console.error(`Scanner snapshot refresh failed (${reason}):`, error);
    })
    .finally(() => {
      snapshotRefreshInFlight = null;
    });
}

// Merge Finviz data into stock data
// If stock has empty metrics (e.g. from Stooq fallback), fill from Finviz performance data
function mergeFinvizData(stock: StockData, finvizData: FinvizStockData | null): StockData {
  if (!finvizData) return stock;

  // If stock has no real momentum data (Stooq fallback), use Finviz performance metrics
  const needsPerformanceData =
    stock.momentum1M === 0 &&
    stock.momentum3M === 0 &&
    stock.momentum6M === 0 &&
    stock.momentum1Y === 0;
  const needsAdrBackfill = !Number.isFinite(stock.adrPercent) || stock.adrPercent <= 0;

  const merged: StockData = {
    ...stock,
    shortFloat: finvizData.shortFloat,
    insiderOwn: finvizData.insiderOwn,
    instOwn: finvizData.instOwn,
    shortRatio: finvizData.shortRatio,
    peg: finvizData.peg,
    priceToSales: finvizData.priceToSales,
    priceToBook: finvizData.priceToBook,
    beta: finvizData.beta,
    atr: finvizData.atr,
    relativeVolume: finvizData.relativeVolume,
    profitMargin: finvizData.profitMargin,
    operMargin: finvizData.operMargin,
    grossMargin: finvizData.grossMargin,
    returnOnEquity: finvizData.returnOnEquity,
    returnOnAssets: finvizData.returnOnAssets,
    epsGrowthThisYear: finvizData.epsGrowthThisYear,
    epsGrowthNextYear: finvizData.epsGrowthNextYear,
    epsGrowthNext5Y: finvizData.epsGrowthNext5Y,
    salesGrowthQoQ: finvizData.salesGrowthQoQ,
    earningsDate: finvizData.earningsDate,
  };

  if (needsPerformanceData) {
    merged.momentum1M = finvizData.perfMonth ?? 0;
    merged.momentum3M = finvizData.perfQuarter ?? 0;
    merged.momentum6M = finvizData.perfHalfY ?? 0;
    merged.momentum1Y = finvizData.perfYear ?? 0;
    merged.rsi = finvizData.rsi14 ?? stock.rsi;
    if (finvizData.volume && finvizData.avgVolume && finvizData.avgVolume > 0) {
      merged.volumeRatio = finvizData.volume / finvizData.avgVolume;
    }
    if (finvizData.marketCap) merged.marketCap = finvizData.marketCap;
    if (finvizData.sector) merged.sector = finvizData.sector;
    if (finvizData.industry) merged.industry = finvizData.industry;
    // Recalculate EP with real volume ratio
    merged.isEP = merged.gapPercent >= 5 && merged.volumeRatio >= 1.5;
  }

  if (needsAdrBackfill) {
    const priceForAdr = merged.price > 0 ? merged.price : (finvizData.price ?? 0);
    const finvizAdr =
      (finvizData.atr ?? 0) > 0 && priceForAdr > 0
        ? ((finvizData.atr || 0) / priceForAdr) * 100
        : (finvizData.volatilityMonth ?? finvizData.volatilityWeek ?? 0);
    if (Number.isFinite(finvizAdr) && finvizAdr > 0) {
      merged.adrPercent = finvizAdr;
    }
  }

  const withStockbee = applyStockbeeMetrics(merged, { forceRecompute: true });
  return applyCatalystMetrics(withStockbee);
}

// Process single stock with error handling
async function processStock(
  symbol: string,
  spyPerformance: { m1: number; m3: number; m6: number }
): Promise<StockData | null> {
  try {
    // Pass spyPerformance for RS Rating calculation
    return await fetchStockData(symbol, spyPerformance);
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error);
    return null;
  }
}

// Streaming Scanner mit SSE
export async function GET(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  const rl = streamRateLimit(ip);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const searchParams = request.nextUrl.searchParams;
  const forceRefresh = searchParams.get("refresh") === "true";
  const scanType = searchParams.get("type") || "all";
  const rawBatchSize = Number.parseInt(searchParams.get("batchSize") || "10", 10);
  const batchSize =
    Number.isFinite(rawBatchSize) && rawBatchSize > 0
      ? Math.min(rawBatchSize, 100)
      : 10;
  const symbolLimit = parseSymbolLimit(searchParams.get("limit"));

  // Create readable stream for SSE
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const streamStartTime = Date.now();
      let streamClosed = false;

      try {
        // Helper to send SSE event (safe: ignores writes after stream close)
        const sendEvent = (event: string, data: unknown) => {
          if (streamClosed) return;
          try {
            const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          } catch {
            streamClosed = true;
          }
        };

        const isTimedOut = () => Date.now() - streamStartTime > MAX_STREAM_DURATION_MS;

        // 1. Send initial status
        sendEvent("status", {
          phase: "init",
          message: "Scanner startet...",
          timestamp: new Date().toISOString()
        });

        const blockingRefresh = searchParams.get("blocking") === "true" || searchParams.get("live") === "true";

        // Fast path: always serve the last complete scanner snapshot first.
        // This keeps the Scanner page responsive even while a real refresh runs.
        if (!blockingRefresh) {
          const snapshot = await getBestCachedSnapshot();
          if (snapshot?.result.stocks.length) {
            const normalizedStocks = snapshot.result.stocks.map(normalizeCachedStock);
            const filteredSnapshot = filterByScanType(normalizedStocks, scanType);
            const ageSeconds = Number.isFinite(snapshot.ageMs) ? Math.max(0, Math.round(snapshot.ageMs / 1000)) : null;
            const shouldRefreshSnapshot = forceRefresh || snapshot.ageMs > SNAPSHOT_REFRESH_AFTER_MS;

            sendEvent("status", {
              phase: "snapshot",
              message: `${filteredSnapshot.length} Aktien aus ${snapshot.source === "full" ? "Full" : "Core"}-Snapshot geladen`,
              source: snapshot.source,
              ageSeconds,
              backgroundRefresh: shouldRefreshSnapshot,
            });

            for (let i = 0; i < filteredSnapshot.length; i += SNAPSHOT_CHUNK_SIZE) {
              const chunk = filteredSnapshot.slice(i, i + SNAPSHOT_CHUNK_SIZE);
              sendEvent("cached", {
                stocks: chunk,
                count: filteredSnapshot.length,
                source: `snapshot-${snapshot.source}`,
                progress: {
                  sent: i + chunk.length,
                  total: filteredSnapshot.length,
                },
                message: `${i + chunk.length}/${filteredSnapshot.length} aus Snapshot`,
              });
            }

            if (shouldRefreshSnapshot) {
              scheduleSnapshotRefresh(forceRefresh ? "manual-refresh" : "stale-snapshot", snapshot.source === "full" ? "full" : "core");
            }

            sendEvent("complete", {
              totalStocks: filteredSnapshot.length,
              totalScanned: snapshot.result.totalScanned ?? snapshot.result.stocks.length,
              fromCache: filteredSnapshot.length,
              freshlyFetched: 0,
              fromSnapshot: true,
              snapshotSource: snapshot.source,
              snapshotAgeSeconds: ageSeconds,
              backgroundRefresh: shouldRefreshSnapshot,
              scanTime: new Date().toISOString(),
              cacheStats: await getCacheStats(),
            });

            if (!streamClosed) {
              streamClosed = true;
              controller.close();
            }
            return;
          }
        }

        // 1.5 Get market context and symbols in parallel.
        sendEvent("status", { phase: "bootstrap", message: "Lade Markt- und Symbolbasis..." });
        const [spyPerformance, allSymbols] = await Promise.all([
          getSPYPerformance(),
          getStockSymbols(forceRefresh),
        ]);
        sendEvent("status", {
          phase: "spy_loaded",
          message: `SPY Performance geladen (1M: ${spyPerformance.m1.toFixed(1)}%, 3M: ${spyPerformance.m3.toFixed(1)}%, 6M: ${spyPerformance.m6.toFixed(1)}%)`
        });

        // 2. Get symbols to scan
        const symbols = symbolLimit ? allSymbols.slice(0, symbolLimit) : allSymbols;
        const totalSymbols = symbols.length;

        sendEvent("status", {
          phase: "symbols_loaded",
          message: `${totalSymbols} Symbole geladen${symbolLimit ? ` (Limit: ${symbolLimit})` : ""}`,
          total: totalSymbols
        });

        // 3. Check for cached stocks first. Manual refresh also serves cache first
        // unless explicitly requested as blocking/live.
        const cachedStocks: StockData[] = [];
        const symbolsToFetch: string[] = [];
        const symbolsToRevalidate = new Set<string>(); // Stocks that need background refresh

        if (!blockingRefresh) {
          sendEvent("status", { phase: "cache_check", message: "Prüfe Cache..." });

          // Check cache with Redis MGET batches (reduces roundtrips significantly).
          const cacheCheckBatchSize = 300;
          for (let i = 0; i < symbols.length; i += cacheCheckBatchSize) {
            const batch = symbols.slice(i, i + cacheCheckBatchSize);
            const cacheResults = await getStocksWithSWRBatch<StockData>(batch);

            for (const { symbol, data, needsRevalidation } of cacheResults) {
              if (data) {
                cachedStocks.push(applyCatalystMetrics({
                  ...data,
                  catalystScore: data.catalystScore ?? 0,
                  catalystSignals: Array.isArray(data.catalystSignals) ? data.catalystSignals : [],
                }));
                // Mark stale or incomplete cache entries for non-blocking refresh.
                if (
                  needsRevalidation ||
                  (data.momentum1M === 0 &&
                    data.momentum3M === 0 &&
                    data.momentum6M === 0 &&
                    data.momentum1Y === 0)
                ) {
                  symbolsToRevalidate.add(symbol);
                }
              } else {
                symbolsToFetch.push(symbol);
              }
            }
          }

          if (cachedStocks.length > 0) {
            // Apply filter before sending
            const filteredCached = filterByScanType(cachedStocks, scanType);

            // Send in smaller chunks for faster UI updates
            const chunkSize = 50;
            for (let i = 0; i < filteredCached.length; i += chunkSize) {
              const chunk = filteredCached.slice(i, i + chunkSize);
              sendEvent("cached", {
                stocks: chunk,
                count: filteredCached.length,
                progress: {
                  sent: i + chunk.length,
                  total: filteredCached.length
                },
                message: `${i + chunk.length}/${filteredCached.length} aus Cache`
              });
            }

            const minimumUsefulCache = Math.min(80, totalSymbols);
            const canServeInventoryCache = cachedStocks.length >= minimumUsefulCache;
            if (canServeInventoryCache) {
              const scanTime = new Date();
              const snapshotResult: ScanResult = {
                stocks: cachedStocks,
                scanTime,
                totalScanned: cachedStocks.length,
              };

              if (symbolLimit && symbolLimit <= SNAPSHOT_SEEDED_LIMIT) {
                await cacheSeededScannerResults(snapshotResult);
              } else {
                await cacheScannerResults(snapshotResult);
              }

              const shouldRefreshSnapshot = forceRefresh || symbolsToFetch.length > 0 || symbolsToRevalidate.size > 0;
              if (shouldRefreshSnapshot) {
                scheduleSnapshotRefresh(forceRefresh ? "manual-refresh" : "inventory-cache-miss", symbolLimit && symbolLimit <= SNAPSHOT_SEEDED_LIMIT ? "core" : "full");
              }

              sendEvent("complete", {
                totalStocks: filteredCached.length,
                totalScanned: cachedStocks.length,
                fromCache: cachedStocks.length,
                freshlyFetched: 0,
                fromSnapshot: true,
                snapshotSource: "stock-cache",
                stockCacheCoverage: {
                  cached: cachedStocks.length,
                  total: totalSymbols,
                  missing: symbolsToFetch.length,
                },
                needsRevalidation: symbolsToRevalidate.size,
                backgroundRefresh: shouldRefreshSnapshot,
                scanTime: scanTime.toISOString(),
                cacheStats: await getCacheStats(),
              });

              if (!streamClosed) {
                streamClosed = true;
                controller.close();
              }
              return;
            }
          }
        } else {
          // Force refresh - fetch all
          symbolsToFetch.push(...symbols);
        }

        sendEvent("status", {
          phase: "fetching",
          message: `Lade ${symbolsToFetch.length} Aktien...`,
          cached: cachedStocks.length,
          toFetch: symbolsToFetch.length
        });

        // 4. Fetch remaining stocks in batches
        const allFetchedStocks: StockData[] = [];
        let processedCount = 0;
        let consecutiveEmptyBatches = 0;

        for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
          if (streamClosed || isTimedOut()) {
            if (!streamClosed && isTimedOut()) {
              sendEvent("status", {
                phase: "timeout",
                message: `Stream-Zeitlimit erreicht (${Math.round(MAX_STREAM_DURATION_MS / 60000)}min). ${processedCount}/${symbolsToFetch.length} verarbeitet.`,
              });
            }
            break;
          }

          const batch = symbolsToFetch.slice(i, i + batchSize);

          try {
            // Process batch in parallel with spyPerformance for RS Rating
            const batchPromises = batch.map(symbol => processStock(symbol, spyPerformance));
            const batchResults = await Promise.all(batchPromises);

            // Filter out nulls and backfill missing symbols with Yahoo quote snapshot
            const validStocks = batchResults.filter((stock): stock is StockData => stock !== null);
            const presentSymbols = new Set(validStocks.map((stock) => stock.symbol.toUpperCase()));
            const missingSymbols = batch.filter((symbol) => !presentSymbols.has(symbol.toUpperCase()));
            const quoteFallbackStocks = missingSymbols.length > 0
              ? await fetchYahooQuoteSnapshotStocks(missingSymbols, spyPerformance)
              : [];
            const stillMissingAfterQuote = missingSymbols.filter((symbol) =>
              !quoteFallbackStocks.some((stock) => stock.symbol.toUpperCase() === symbol.toUpperCase())
            );
            const openbbFallbackStocks = stillMissingAfterQuote.length > 0
              ? await fetchOpenBBQuoteSnapshotStocksFallback(stillMissingAfterQuote, spyPerformance)
              : [];
            const stillMissingAfterOpenBB = stillMissingAfterQuote.filter((symbol) =>
              !openbbFallbackStocks.some((stock) => stock.symbol.toUpperCase() === symbol.toUpperCase())
            );
            const stooqFallbackStocks = stillMissingAfterOpenBB.length > 0
              ? await fetchStooqSnapshotStocks(stillMissingAfterOpenBB, spyPerformance)
              : [];
            const combinedStocks = [...validStocks];
            for (const stock of [...quoteFallbackStocks, ...openbbFallbackStocks, ...stooqFallbackStocks]) {
              if (!presentSymbols.has(stock.symbol.toUpperCase())) {
                combinedStocks.push(stock);
                presentSymbols.add(stock.symbol.toUpperCase());
              }
            }
            let mergedStocks: StockData[] = [];

            if (combinedStocks.length === 0) {
              // Yahoo + Stooq both failed: build stocks entirely from Finviz
              const finvizFallbackMap = batch.length > 0
                ? await fetchFinvizDataWithCache(batch).catch(() => new Map<string, FinvizStockData>())
                : new Map<string, FinvizStockData>();

              mergedStocks = batch
                .map((symbol) => {
                  const finviz = finvizFallbackMap.get(symbol) || finvizFallbackMap.get(symbol.toUpperCase());
                  if (!finviz) return null;
                  return buildStockFromFinvizData(symbol, finviz, spyPerformance);
                })
                .filter((stock): stock is StockData => stock !== null);
            } else {
              // Enrich ALL stocks with Finviz (not just top 8)
              // This is critical when stocks come from Stooq fallback (no momentum/RS data)
              const allSymbols = combinedStocks.map(s => s.symbol);
              const finvizDataMap = allSymbols.length > 0
                ? await fetchFinvizDataWithCache(allSymbols).catch(() => new Map<string, FinvizStockData>())
                : new Map<string, FinvizStockData>();
              mergedStocks = combinedStocks.map((stock) => {
                const finviz = finvizDataMap.get(stock.symbol) || finvizDataMap.get(stock.symbol.toUpperCase()) || null;
                return mergeFinvizData(stock, finviz);
              });
            }

            if (mergedStocks.length === 0) {
              consecutiveEmptyBatches += 1;
            } else {
              consecutiveEmptyBatches = 0;
            }

            // Cache each batch in a single Redis pipeline.
            await cacheStocksWithSWR(mergedStocks, STOCK_CACHE_TTL);
            allFetchedStocks.push(...mergedStocks);

            processedCount += batch.length;

            // Apply filter to batch results
            const filteredBatch = filterByScanType(mergedStocks, scanType);

            // Send batch update
            sendEvent("batch", {
              stocks: filteredBatch,
              progress: {
                processed: processedCount,
                total: symbolsToFetch.length,
                percent: Math.round((processedCount / symbolsToFetch.length) * 100)
              }
            });

            // Small delay to prevent overwhelming the API
            if (i + batchSize < symbolsToFetch.length) {
              await new Promise(resolve => setTimeout(resolve, 120));
            }

            // If multiple consecutive empty batches occur at the beginning, stop early.
            // This usually means the upstream market data source is currently rate-limited.
            if (allFetchedStocks.length === 0 && consecutiveEmptyBatches >= 3) {
              sendEvent("status", {
                phase: "source_limited",
                message: "Marktdatenquelle aktuell limitiert, Scan wird vorzeitig beendet.",
              });
              break;
            }

          } catch (batchError) {
            console.error(`Batch error for ${batch.join(",")}:`, batchError);
            sendEvent("error", {
              message: `Fehler bei Batch ${Math.floor(i / batchSize) + 1}`,
              symbols: batch
            });
          }
        }

        // 5. Combine all stocks
        const allStocks = [...cachedStocks, ...allFetchedStocks];

        // Filter by scan type if needed
        const filteredStocks = filterByScanType(allStocks, scanType);
        const scanTime = new Date();

        if (allStocks.length > 0) {
          const snapshotResult: ScanResult = {
            stocks: allStocks,
            scanTime,
            totalScanned: allStocks.length,
          };
          if (symbolLimit && symbolLimit <= SNAPSHOT_SEEDED_LIMIT) {
            await cacheSeededScannerResults(snapshotResult);
          } else {
            await cacheScannerResults(snapshotResult);
          }
        }

        // 6. Send final result
        sendEvent("complete", {
          totalStocks: filteredStocks.length,
          totalScanned: allStocks.length,
          fromCache: cachedStocks.length,
          freshlyFetched: allFetchedStocks.length,
          needsRevalidation: symbolsToRevalidate.size,
          scanTime: scanTime.toISOString(),
          cacheStats: await getCacheStats()
        });

        // 7. Background revalidation for stale cached stocks (async, non-blocking)
        // This runs after the stream is complete to update stale data
        if (symbolsToRevalidate.size > 0) {
          const revalidateSymbols = Array.from(symbolsToRevalidate);

          sendEvent("status", {
            phase: "background_revalidation",
            message: `Aktualisiere ${revalidateSymbols.length} veraltete Einträge im Hintergrund...`,
            count: revalidateSymbols.length
          });

          // Fire and forget - revalidate in background batches
          // Don't await this, let it run async after stream closes
          (async () => {
            const revalidateBatchSize = 10;
            let revalidatedCount = 0;
            let updatedCount = 0;

            for (let i = 0; i < revalidateSymbols.length; i += revalidateBatchSize) {
              const batch = revalidateSymbols.slice(i, i + revalidateBatchSize);

              try {
                const stockPromises = batch.map((symbol) => processStock(symbol, spyPerformance));
                const stockResults = await Promise.all(stockPromises);
                const validStocks = stockResults.filter((stock): stock is StockData => stock !== null);
                const presentSymbols = new Set(validStocks.map((stock) => stock.symbol.toUpperCase()));
                const missingSymbols = batch.filter((symbol) => !presentSymbols.has(symbol.toUpperCase()));
                const quoteFallbackStocks = missingSymbols.length > 0
                  ? await fetchYahooQuoteSnapshotStocks(missingSymbols, spyPerformance)
                  : [];
                const stillMissingAfterQuote = missingSymbols.filter((symbol) =>
                  !quoteFallbackStocks.some((stock) => stock.symbol.toUpperCase() === symbol.toUpperCase())
                );
                const openbbFallbackStocks = stillMissingAfterQuote.length > 0
                  ? await fetchOpenBBQuoteSnapshotStocksFallback(stillMissingAfterQuote, spyPerformance)
                  : [];
                const stillMissingAfterOpenBB = stillMissingAfterQuote.filter((symbol) =>
                  !openbbFallbackStocks.some((stock) => stock.symbol.toUpperCase() === symbol.toUpperCase())
                );
                const stooqFallbackStocks = stillMissingAfterOpenBB.length > 0
                  ? await fetchStooqSnapshotStocks(stillMissingAfterOpenBB, spyPerformance)
                  : [];
                const combinedStocks = [...validStocks];
                for (const stock of [...quoteFallbackStocks, ...openbbFallbackStocks, ...stooqFallbackStocks]) {
                  if (!presentSymbols.has(stock.symbol.toUpperCase())) {
                    combinedStocks.push(stock);
                    presentSymbols.add(stock.symbol.toUpperCase());
                  }
                }
                let merged: StockData[] = [];

                if (combinedStocks.length === 0) {
                  const fallbackSymbols = batch.slice(0, MAX_FINVIZ_ENRICH_PER_BATCH);
                  const finvizFallbackMap = fallbackSymbols.length > 0
                    ? await fetchFinvizDataWithCache(fallbackSymbols).catch(() => new Map<string, FinvizStockData>())
                    : new Map<string, FinvizStockData>();
                  merged = fallbackSymbols
                    .map((symbol) => {
                      const finviz = finvizFallbackMap.get(symbol) || finvizFallbackMap.get(symbol.toUpperCase());
                      if (!finviz) return null;
                      return buildStockFromFinvizData(symbol, finviz, spyPerformance);
                    })
                    .filter((stock): stock is StockData => stock !== null);
                } else {
                  const finvizSymbols = selectFinvizSymbolsForBatch(combinedStocks);
                  const finvizDataMap = finvizSymbols.length > 0
                    ? await fetchFinvizDataWithCache(finvizSymbols).catch(() => new Map<string, FinvizStockData>())
                    : new Map<string, FinvizStockData>();

                  merged = combinedStocks
                    .map((stock) => {
                      const finviz = finvizDataMap.get(stock.symbol) || finvizDataMap.get(stock.symbol.toUpperCase()) || null;
                      return mergeFinvizData(stock, finviz);
                    });
                }

                await cacheStocksWithSWR(merged, STOCK_CACHE_TTL);

                revalidatedCount += batch.length;
                updatedCount += merged.length;

                // Small delay between batches
                if (i + revalidateBatchSize < revalidateSymbols.length) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (error) {
                console.error(`Background revalidation error for batch:`, error);
              }
            }

            console.log(`Background revalidation complete: ${updatedCount}/${revalidatedCount} stocks updated`);
          })();
        }

        if (!streamClosed) {
          streamClosed = true;
          controller.close();
        }
      } catch (error) {
        console.error("Stream error:", error);
        if (!streamClosed) {
          try {
            const errorMessage = `event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`;
            controller.enqueue(encoder.encode(errorMessage));
            streamClosed = true;
            controller.close();
          } catch {
            // Stream already closed by client disconnect
          }
        }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
