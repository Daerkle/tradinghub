// Hook für Streaming Scanner mit progressivem Loading
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StockData } from "@/lib/scanner-service";

export interface ScanProgress {
  phase: "idle" | "init" | "cache_check" | "fetching" | "complete" | "error";
  message: string;
  total?: number;
  processed?: number;
  percent?: number;
  cached?: number;
  toFetch?: number;
}

export interface ScanStats {
  totalStocks: number;
  totalScanned: number;
  fromCache: number;
  freshlyFetched: number;
  scanTime: string;
  fromSnapshot?: boolean;
  backgroundRefresh?: boolean;
  snapshotAgeSeconds?: number | null;
}

export interface UseScannerStreamOptions {
  scanType?: string;
  batchSize?: number;
  onStocksReceived?: (stocks: StockData[], source: "cached" | "batch") => void;
  onComplete?: (stats: ScanStats) => void;
  onError?: (error: string) => void;
}

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;

export function useScannerStream(options: UseScannerStreamOptions = {}) {
  const {
    scanType = "all",
    batchSize = 25,
    onStocksReceived,
    onComplete,
    onError,
  } = options;

  const [stocks, setStocks] = useState<StockData[]>([]);
  const [progress, setProgress] = useState<ScanProgress>({
    phase: "idle",
    message: "Bereit",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<ScanStats | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const onStocksReceivedRef = useRef(onStocksReceived);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStocksReceivedRef.current = onStocksReceived;
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onStocksReceived, onComplete, onError]);

  const startScan = useCallback(async (forceRefresh = false) => {
    // Cancel any existing scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setIsLoading(true);
    // Don't clear stocks on refresh - keep existing data visible
    // so the non-blocking indicator shows instead of the full spinner
    setStats(null);
    setProgress({ phase: "init", message: "Scanner startet..." });

    // Local accumulator for incoming stocks (avoids duplicates on refresh)
    const incomingBySymbol = new Map<string, StockData>();
    let pendingStockCommit: number | null = null;
    let isRetrying = false;

    const commitStocksNow = () => {
      if (pendingStockCommit !== null) {
        window.cancelAnimationFrame(pendingStockCommit);
        pendingStockCommit = null;
      }
      if (incomingBySymbol.size > 0) {
        setStocks(Array.from(incomingBySymbol.values()));
      }
    };

    const queueStocksCommit = () => {
      if (pendingStockCommit !== null) return;
      pendingStockCommit = window.requestAnimationFrame(() => {
        pendingStockCommit = null;
        setStocks(Array.from(incomingBySymbol.values()));
      });
    };

    const appendStocks = (nextStocks: StockData[], source: "cached" | "batch") => {
      for (const stock of nextStocks) {
        incomingBySymbol.set(stock.symbol, stock);
      }
      queueStocksCommit();
      onStocksReceivedRef.current?.(nextStocks, source);
    };

    try {
      const url = `/api/scanner/stream?type=${scanType}&batchSize=${batchSize}${forceRefresh ? "&refresh=true" : ""}`;

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events
        const events = buffer.split("\n\n");
        buffer = events.pop() || ""; // Keep incomplete event in buffer

        for (const eventStr of events) {
          if (!eventStr.trim()) continue;

          const lines = eventStr.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7);
            } else if (line.startsWith("data: ")) {
              eventData = line.slice(6);
            }
          }

          if (!eventType || !eventData) continue;

          try {
            const data = JSON.parse(eventData);

            switch (eventType) {
              case "status":
                setProgress({
                  phase: data.phase || "init",
                  message: data.message || "",
                  total: data.total,
                  cached: data.cached,
                  toFetch: data.toFetch,
                });
                break;

              case "cached":
                if (data.stocks && Array.isArray(data.stocks)) {
                  appendStocks(data.stocks, "cached");
                }
                setProgress(prev => ({
                  ...prev,
                  phase: "cache_check",
                  message: data.message || `${data.count} aus Cache`,
                }));
                break;

              case "batch":
                if (data.stocks && Array.isArray(data.stocks)) {
                  appendStocks(data.stocks, "batch");
                }
                if (data.progress) {
                  setProgress(prev => ({
                    ...prev,
                    phase: "fetching",
                    message: `${data.progress.processed}/${data.progress.total} geladen (${data.progress.percent}%)`,
                    processed: data.progress.processed,
                    total: data.progress.total,
                    percent: data.progress.percent,
                  }));
                }
                break;

              case "complete":
                commitStocksNow();
                const scanStats: ScanStats = {
                  totalStocks: data.totalStocks || 0,
                  totalScanned: data.totalScanned || 0,
                  fromCache: data.fromCache || 0,
                  freshlyFetched: data.freshlyFetched || 0,
                  scanTime: data.scanTime || new Date().toISOString(),
                  fromSnapshot: Boolean(data.fromSnapshot),
                  backgroundRefresh: Boolean(data.backgroundRefresh),
                  snapshotAgeSeconds: data.snapshotAgeSeconds ?? null,
                };
                setStats(scanStats);
                setProgress({
                  phase: "complete",
                  message: scanStats.fromSnapshot
                    ? `Datenbestand bereit: ${scanStats.totalStocks} Aktien aus Cache${scanStats.backgroundRefresh ? " - Refresh läuft im Hintergrund" : ""}`
                    : `Fertig: ${scanStats.totalStocks} Aktien (${scanStats.fromCache} aus Cache)`,
                  percent: 100,
                });
                onCompleteRef.current?.(scanStats);
                retryCountRef.current = 0;
                break;

              case "error":
                console.error("Scanner error:", data);
                setProgress({
                  phase: "error",
                  message: data.message || data.error || "Fehler beim Scannen",
                });
                onErrorRef.current?.(data.message || data.error || "Unbekannter Fehler");
                break;
            }
          } catch (parseError) {
            console.error("Error parsing SSE event:", parseError, eventData);
          }
        }
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        setProgress({ phase: "idle", message: "Scan abgebrochen" });
        retryCountRef.current = 0;
      } else if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current - 1);
        console.warn(`Scanner stream error, retry ${retryCountRef.current}/${MAX_RETRIES} in ${delay}ms:`, error);
        setProgress({
          phase: "error",
          message: `Verbindungsfehler, Wiederholung ${retryCountRef.current}/${MAX_RETRIES}...`,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        abortControllerRef.current = null;
        isRetrying = true;
        return startScan(forceRefresh);
      } else {
        console.error("Scanner stream error (max retries reached):", error);
        setProgress({
          phase: "error",
          message: String(error),
        });
        onErrorRef.current?.(String(error));
        retryCountRef.current = 0;
      }
    } finally {
      // Don't reset loading state if we're retrying (recursive call handles it)
      if (!isRetrying) {
        if (pendingStockCommit !== null) {
          window.cancelAnimationFrame(pendingStockCommit);
        }
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    }
  }, [scanType, batchSize]);

  const cancelScan = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setProgress({ phase: "idle", message: "Scan abgebrochen" });
  }, []);

  const refresh = useCallback(() => {
    startScan(true);
  }, [startScan]);

  return {
    stocks,
    progress,
    isLoading,
    stats,
    startScan,
    cancelScan,
    refresh,
  };
}
