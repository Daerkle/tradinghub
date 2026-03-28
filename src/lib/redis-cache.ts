// Redis Cache Service for Scanner Data
// Provides caching layer to reduce API calls and improve performance

import Redis from "ioredis";

// Redis connection configuration
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Cache TTL (Time To Live) in seconds
export const CACHE_TTL = {
  SCANNER_DATA: 5 * 60,      // 5 minutes for scanner results
  STOCK_LIST: 24 * 60 * 60,  // 24 hours for stock symbol list
  QUOTES: 1 * 60,            // 1 minute for real-time quotes
  FINVIZ_DATA: 6 * 60 * 60,  // 6 hours for Finviz data (changes slowly; reduces scraping)
  NEWS: 10 * 60,             // 10 minutes for news
  MARKET_DATA: 2 * 60,       // 2 minutes for market data (gainers/losers)
};

// Cache keys
export const CACHE_KEYS = {
  STOCK_LIST: "scanner:stock_list",
  SCANNER_RESULTS: "scanner:results",
  SCANNER_RESULTS_SEEDED: "scanner:results:seeded",
  FINVIZ_PREFIX: "scanner:finviz:",
  QUOTE_PREFIX: "scanner:quote:",
  NEWS_PREFIX: "scanner:news:",
  MARKET_GAINERS: "scanner:market:gainers",
  MARKET_LOSERS: "scanner:market:losers",
  MARKET_ACTIVE: "scanner:market:active",
};

// Singleton Redis client
let redisClient: Redis | null = null;
let connectionFailed = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_DELAY_MS = 30_000; // Retry after 30 seconds

// Schedule a reconnection attempt after delay
function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectionFailed = false;
    // Dispose old client to allow fresh creation
    if (redisClient) {
      redisClient.disconnect();
      redisClient = null;
    }
    console.log("Redis reconnection scheduled - will retry on next access");
  }, RECONNECT_DELAY_MS);
}

// Get or create Redis client
export function getRedisClient(): Redis | null {
  if (connectionFailed) {
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          if (times > 3) {
            connectionFailed = true;
            console.warn("Redis connection failed after 3 retries, scheduling reconnect in 30s");
            scheduleReconnect();
            return null;
          }
          return Math.min(times * 100, 3000);
        },
        lazyConnect: true,
      });

      redisClient.on("error", (err) => {
        console.warn("Redis error:", err.message);
        if (err.message.includes("ECONNREFUSED")) {
          connectionFailed = true;
          scheduleReconnect();
        }
      });

      redisClient.on("connect", () => {
        console.log("Redis connected successfully");
        connectionFailed = false;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      });
    } catch (error) {
      console.warn("Failed to create Redis client:", error);
      connectionFailed = true;
      scheduleReconnect();
      return null;
    }
  }

  return redisClient;
}

// Check if Redis is available
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.ping();
    return true;
  } catch {
    return false;
  }
}

// Generic cache get function
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const data = await client.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
    return null;
  } catch (error) {
    console.warn(`Cache get error for ${key}:`, error);
    return null;
  }
}

// Generic cache set function
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = CACHE_TTL.SCANNER_DATA
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Cache set error for ${key}:`, error);
    return false;
  }
}

// Delete cache entry
export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.warn(`Cache delete error for ${key}:`, error);
    return false;
  }
}

// Delete cache entries by pattern
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;

  try {
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      return await client.del(...keys);
    }
    return 0;
  } catch (error) {
    console.warn(`Cache delete pattern error for ${pattern}:`, error);
    return 0;
  }
}

// Clear all scanner cache
export async function clearScannerCache(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await cacheDeletePattern("scanner:*");
    return true;
  } catch (error) {
    console.warn("Clear scanner cache error:", error);
    return false;
  }
}

// --- Scanner-specific cache functions ---

// Cache stock symbol list
export async function cacheStockList(symbols: string[]): Promise<boolean> {
  return cacheSet(CACHE_KEYS.STOCK_LIST, symbols, CACHE_TTL.STOCK_LIST);
}

export async function getCachedStockList(): Promise<string[] | null> {
  return cacheGet<string[]>(CACHE_KEYS.STOCK_LIST);
}

// Cache scanner results
export async function cacheScannerResults(results: unknown): Promise<boolean> {
  return cacheSet(CACHE_KEYS.SCANNER_RESULTS, results, CACHE_TTL.SCANNER_DATA);
}

export async function getCachedScannerResults<T>(): Promise<T | null> {
  return cacheGet<T>(CACHE_KEYS.SCANNER_RESULTS);
}

export async function cacheSeededScannerResults(results: unknown): Promise<boolean> {
  return cacheSet(CACHE_KEYS.SCANNER_RESULTS_SEEDED, results, CACHE_TTL.SCANNER_DATA);
}

export async function getCachedSeededScannerResults<T>(): Promise<T | null> {
  return cacheGet<T>(CACHE_KEYS.SCANNER_RESULTS_SEEDED);
}

// Cache individual Finviz data
export async function cacheFinvizData(
  symbol: string,
  data: unknown
): Promise<boolean> {
  return cacheSet(
    `${CACHE_KEYS.FINVIZ_PREFIX}${symbol}`,
    data,
    CACHE_TTL.FINVIZ_DATA
  );
}

export async function getCachedFinvizData<T>(symbol: string): Promise<T | null> {
  return cacheGet<T>(`${CACHE_KEYS.FINVIZ_PREFIX}${symbol}`);
}

// Cache multiple Finviz data at once
export async function cacheMultipleFinvizData(
  dataMap: Map<string, unknown>
): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;

  let count = 0;
  const pipeline = client.pipeline();

  dataMap.forEach((data, symbol) => {
    pipeline.setex(
      `${CACHE_KEYS.FINVIZ_PREFIX}${symbol}`,
      CACHE_TTL.FINVIZ_DATA,
      JSON.stringify(data)
    );
    count++;
  });

  try {
    await pipeline.exec();
    return count;
  } catch (error) {
    console.warn("Cache multiple Finviz data error:", error);
    return 0;
  }
}

// Get multiple cached Finviz data
export async function getMultipleCachedFinvizData<T>(
  symbols: string[]
): Promise<Map<string, T>> {
  const client = getRedisClient();
  const result = new Map<string, T>();

  if (!client || symbols.length === 0) return result;

  try {
    const keys = symbols.map((s) => `${CACHE_KEYS.FINVIZ_PREFIX}${s}`);
    const values = await client.mget(...keys);

    values.forEach((value, index) => {
      if (value) {
        try {
          result.set(symbols[index], JSON.parse(value) as T);
        } catch {
          // Skip invalid JSON
        }
      }
    });
  } catch (error) {
    console.warn("Get multiple cached Finviz data error:", error);
  }

  return result;
}

// Cache quote data
export async function cacheQuote(
  symbol: string,
  quote: unknown
): Promise<boolean> {
  return cacheSet(
    `${CACHE_KEYS.QUOTE_PREFIX}${symbol}`,
    quote,
    CACHE_TTL.QUOTES
  );
}

export async function getCachedQuote<T>(symbol: string): Promise<T | null> {
  return cacheGet<T>(`${CACHE_KEYS.QUOTE_PREFIX}${symbol}`);
}

// Cache news data
export async function cacheNews(
  symbol: string,
  news: unknown
): Promise<boolean> {
  return cacheSet(
    `${CACHE_KEYS.NEWS_PREFIX}${symbol}`,
    news,
    CACHE_TTL.NEWS
  );
}

export async function getCachedNews<T>(symbol: string): Promise<T | null> {
  return cacheGet<T>(`${CACHE_KEYS.NEWS_PREFIX}${symbol}`);
}

// Cache market data (gainers, losers, active)
export async function cacheMarketGainers(data: unknown): Promise<boolean> {
  return cacheSet(CACHE_KEYS.MARKET_GAINERS, data, CACHE_TTL.MARKET_DATA);
}

export async function getCachedMarketGainers<T>(): Promise<T | null> {
  return cacheGet<T>(CACHE_KEYS.MARKET_GAINERS);
}

export async function cacheMarketLosers(data: unknown): Promise<boolean> {
  return cacheSet(CACHE_KEYS.MARKET_LOSERS, data, CACHE_TTL.MARKET_DATA);
}

export async function getCachedMarketLosers<T>(): Promise<T | null> {
  return cacheGet<T>(CACHE_KEYS.MARKET_LOSERS);
}

export async function cacheMarketActive(data: unknown): Promise<boolean> {
  return cacheSet(CACHE_KEYS.MARKET_ACTIVE, data, CACHE_TTL.MARKET_DATA);
}

export async function getCachedMarketActive<T>(): Promise<T | null> {
  return cacheGet<T>(CACHE_KEYS.MARKET_ACTIVE);
}

// --- In-Memory Fallback Cache with LRU Eviction ---
// Used when Redis is not available

const MEMORY_CACHE_MAX_ENTRIES = 5000;
const memoryCache = new Map<string, { data: unknown; expires: number }>();

// LRU eviction: remove oldest entries when cache exceeds max size
function evictIfNeeded(): void {
  if (memoryCache.size <= MEMORY_CACHE_MAX_ENTRIES) return;

  const entriesToRemove = memoryCache.size - MEMORY_CACHE_MAX_ENTRIES;
  const iterator = memoryCache.keys();
  for (let i = 0; i < entriesToRemove; i++) {
    const { value: key, done } = iterator.next();
    if (done) break;
    memoryCache.delete(key);
  }
}

export function memoryCacheGet<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    memoryCache.delete(key);
    return null;
  }

  // Move to end for LRU (Map preserves insertion order)
  memoryCache.delete(key);
  memoryCache.set(key, entry);

  return entry.data as T;
}

export function memoryCacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): void {
  // Delete first to refresh insertion order (LRU)
  memoryCache.delete(key);
  memoryCache.set(key, {
    data: value,
    expires: Date.now() + ttlSeconds * 1000,
  });
  evictIfNeeded();
}

export function memoryCacheDelete(key: string): void {
  memoryCache.delete(key);
}

export function memoryCacheClear(): void {
  memoryCache.clear();
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (now > entry.expires) {
      memoryCache.delete(key);
    }
  }
}, 60000); // Every minute

// --- Unified Cache Interface ---
// Automatically falls back to memory cache if Redis is not available

export async function unifiedCacheGet<T>(key: string): Promise<T | null> {
  // Try Redis first
  const redisResult = await cacheGet<T>(key);
  if (redisResult !== null) {
    return redisResult;
  }

  // Fall back to memory cache
  return memoryCacheGet<T>(key);
}

export async function unifiedCacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number = CACHE_TTL.SCANNER_DATA
): Promise<boolean> {
  // Always set in memory cache as backup
  memoryCacheSet(key, value, ttlSeconds);

  // Try to set in Redis
  const redisSuccess = await cacheSet(key, value, ttlSeconds);

  return redisSuccess;
}

export interface SmartCacheEnvelope<T> {
  data: T;
  cachedAt: number;
  freshUntil: number;
  staleUntil: number;
}

export interface SmartCacheResult<T> {
  data: T | null;
  isStale: boolean;
  cachedAt: number | null;
}

export async function smartCacheSet<T>(
  key: string,
  value: T,
  options: {
    freshTtlSeconds: number;
    staleTtlSeconds: number;
  }
): Promise<boolean> {
  const now = Date.now();
  const envelope: SmartCacheEnvelope<T> = {
    data: value,
    cachedAt: now,
    freshUntil: now + options.freshTtlSeconds * 1000,
    staleUntil: now + options.staleTtlSeconds * 1000,
  };
  return unifiedCacheSet(key, envelope, options.staleTtlSeconds);
}

export async function smartCacheGet<T>(key: string): Promise<SmartCacheResult<T>> {
  const entry = await unifiedCacheGet<SmartCacheEnvelope<T>>(key);
  if (!entry) {
    return {
      data: null,
      isStale: true,
      cachedAt: null,
    };
  }

  return {
    data: entry.data,
    isStale: Date.now() > entry.freshUntil,
    cachedAt: entry.cachedAt,
  };
}

// Get cache stats
export async function getCacheStats(): Promise<{
  redisAvailable: boolean;
  memoryCacheSize: number;
  redisKeys?: number;
}> {
  const redisAvailable = await isRedisAvailable();
  const stats = {
    redisAvailable,
    memoryCacheSize: memoryCache.size,
    redisKeys: 0,
  };

  if (redisAvailable) {
    const client = getRedisClient();
    if (client) {
      try {
        const keys = await client.keys("scanner:*");
        stats.redisKeys = keys.length;
      } catch {
        // Ignore
      }
    }
  }

  return stats;
}

// --- Stale-While-Revalidate (SWR) Pattern ---
// Returns cached data immediately and validates in background

// Cache entry with metadata for SWR
interface SWRCacheEntry<T> {
  data: T;
  cachedAt: number;      // Timestamp when data was cached
  dataHash: string;      // Hash to detect changes
}

// Simple hash function for change detection
function simpleHash(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

// Set cache with SWR metadata
export async function swrCacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number
): Promise<boolean> {
  const entry: SWRCacheEntry<T> = {
    data: value,
    cachedAt: Date.now(),
    dataHash: simpleHash(value),
  };
  return unifiedCacheSet(key, entry, ttlSeconds);
}

// Get cache with SWR - returns data immediately if available
export async function swrCacheGet<T>(key: string): Promise<{
  data: T | null;
  isStale: boolean;
  cachedAt: number | null;
  hash: string | null;
}> {
  const entry = await unifiedCacheGet<SWRCacheEntry<T>>(key);

  if (!entry) {
    return { data: null, isStale: true, cachedAt: null, hash: null };
  }

  return {
    data: entry.data,
    isStale: false, // If in cache and not expired, it's not stale
    cachedAt: entry.cachedAt,
    hash: entry.dataHash,
  };
}

// Check if data has changed by comparing hashes
export function hasDataChanged<T>(oldHash: string | null, newData: T): boolean {
  if (!oldHash) return true;
  const newHash = simpleHash(newData);
  return oldHash !== newHash;
}

// Background revalidation queue to avoid duplicate fetches
const revalidationQueue = new Set<string>();

// Check if a key is currently being revalidated
export function isRevalidating(key: string): boolean {
  return revalidationQueue.has(key);
}

// Mark key as being revalidated
export function startRevalidation(key: string): boolean {
  if (revalidationQueue.has(key)) {
    return false; // Already revalidating
  }
  revalidationQueue.add(key);
  return true;
}

// Mark revalidation as complete
export function endRevalidation(key: string): void {
  revalidationQueue.delete(key);
}

// SWR helper for stock data - validates and updates if changed
export async function swrValidateStock<T>(
  symbol: string,
  cachedHash: string | null,
  fetchFn: () => Promise<T | null>,
  ttlSeconds: number
): Promise<{ updated: boolean; data: T | null }> {
  const key = `scanner:stock:${symbol}`;

  // Skip if already revalidating
  if (!startRevalidation(key)) {
    return { updated: false, data: null };
  }

  try {
    // Fetch fresh data
    const freshData = await fetchFn();

    if (!freshData) {
      endRevalidation(key);
      return { updated: false, data: null };
    }

    // Check if data actually changed
    if (hasDataChanged(cachedHash, freshData)) {
      // Data changed - update cache
      await swrCacheSet(key, freshData, ttlSeconds);
      endRevalidation(key);
      return { updated: true, data: freshData };
    }

    // Data unchanged - just update the timestamp
    endRevalidation(key);
    return { updated: false, data: freshData };

  } catch (error) {
    console.error(`SWR validation error for ${symbol}:`, error);
    endRevalidation(key);
    return { updated: false, data: null };
  }
}

// Batch SWR validation - checks multiple stocks in parallel
export async function swrValidateBatch<T>(
  symbols: string[],
  getCachedHash: (symbol: string) => Promise<string | null>,
  fetchFn: (symbol: string) => Promise<T | null>,
  ttlSeconds: number,
  concurrency: number = 10
): Promise<{ updated: string[]; unchanged: string[]; errors: string[] }> {
  const results = {
    updated: [] as string[],
    unchanged: [] as string[],
    errors: [] as string[],
  };

  // Process in batches for concurrency control
  for (let i = 0; i < symbols.length; i += concurrency) {
    const batch = symbols.slice(i, i + concurrency);

    await Promise.all(batch.map(async (symbol) => {
      try {
        const cachedHash = await getCachedHash(symbol);
        const result = await swrValidateStock(
          symbol,
          cachedHash,
          () => fetchFn(symbol),
          ttlSeconds
        );

        if (result.updated) {
          results.updated.push(symbol);
        } else {
          results.unchanged.push(symbol);
        }
      } catch (error) {
        console.error(`Batch validation error for ${symbol}:`, error);
        results.errors.push(symbol);
      }
    }));

    // Small delay between batches to avoid overwhelming APIs
    if (i + concurrency < symbols.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  return results;
}

// Get cached stock with SWR metadata
export async function getStockWithSWR<T>(symbol: string): Promise<{
  data: T | null;
  cachedAt: number | null;
  hash: string | null;
  needsRevalidation: boolean;
}> {
  const key = `scanner:stock:${symbol}`;
  const result = await swrCacheGet<T>(key);

  // Determine if revalidation is needed based on age
  // Stocks older than 4 hours should be revalidated in background
  const REVALIDATE_AFTER_MS = 4 * 60 * 60 * 1000; // 4 hours
  const needsRevalidation = result.cachedAt
    ? (Date.now() - result.cachedAt) > REVALIDATE_AFTER_MS
    : true;

  return {
    data: result.data,
    cachedAt: result.cachedAt,
    hash: result.hash,
    needsRevalidation,
  };
}
