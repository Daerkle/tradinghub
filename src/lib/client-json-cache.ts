"use client";

const CACHE_PREFIX = "tradinghub:json-cache:v1:";
const CACHE_VERSION = 1;

type CachedJsonEntry<T> = {
  version: number;
  savedAt: string;
  data: T;
};

export type ClientJsonCacheHit<T> = {
  data: T;
  savedAt: string;
  ageMs: number;
  isStale: boolean;
};

const memoryCache = new Map<string, CachedJsonEntry<unknown>>();

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readClientJsonCache<T>(
  key: string,
  options: { maxAgeMs?: number; allowStale?: boolean } = {}
): ClientJsonCacheHit<T> | null {
  const maxAgeMs = options.maxAgeMs ?? Number.POSITIVE_INFINITY;
  const allowStale = options.allowStale ?? true;
  const fullKey = cacheKey(key);
  let entry = memoryCache.get(fullKey) as CachedJsonEntry<T> | undefined;

  if (!entry) {
    const store = storage();
    if (!store) return null;

    try {
      const raw = store.getItem(fullKey);
      if (!raw) return null;
      entry = JSON.parse(raw) as CachedJsonEntry<T>;
      memoryCache.set(fullKey, entry);
    } catch {
      store.removeItem(fullKey);
      return null;
    }
  }

  if (entry.version !== CACHE_VERSION) {
    storage()?.removeItem(fullKey);
    memoryCache.delete(fullKey);
    return null;
  }

  const savedAtTime = new Date(entry.savedAt).getTime();
  const ageMs = Date.now() - savedAtTime;
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;

  const isStale = ageMs > maxAgeMs;
  if (isStale && !allowStale) return null;

  return {
    data: entry.data,
    savedAt: entry.savedAt,
    ageMs,
    isStale,
  };
}

export function writeClientJsonCache<T>(key: string, data: T): void {
  const fullKey = cacheKey(key);
  const entry: CachedJsonEntry<T> = {
    version: CACHE_VERSION,
    savedAt: new Date().toISOString(),
    data,
  };

  memoryCache.set(fullKey, entry);

  const store = storage();
  if (!store) return;

  try {
    store.setItem(fullKey, JSON.stringify(entry));
  } catch {
    // Keep the in-memory cache if persistent storage is full or blocked.
  }
}
