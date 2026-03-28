import fs from "fs";
import { promises as fsp } from "fs";
import os from "os";
import path from "path";

type SnapshotEnvelope<T> = {
  savedAt: string;
  data: T;
};

const APP_CACHE_DIR = (process.env.APP_CACHE_DIR || "").trim() || path.join(os.tmpdir(), "tradinghub-cache");
const FALLBACK_CACHE_DIR = path.join(os.tmpdir(), "tradinghub-cache");
let resolvedAppCacheDir: string | null = null;

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "default";
}

export function getAppCacheDir(): string {
  if (resolvedAppCacheDir) {
    return resolvedAppCacheDir;
  }

  const candidates = Array.from(
    new Set([APP_CACHE_DIR, FALLBACK_CACHE_DIR, path.join(process.cwd(), ".cache-runtime")].filter(Boolean))
  );

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      resolvedAppCacheDir = candidate;
      return candidate;
    } catch {
      // try the next fallback
    }
  }

  throw new Error("No writable cache directory available for TradingHub.");
}

export function ensurePersistentDirSync(...segments: string[]): string {
  const dir = path.join(getAppCacheDir(), ...segments.map(sanitizeSegment));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function ensurePersistentDir(...segments: string[]): Promise<string> {
  const dir = path.join(getAppCacheDir(), ...segments.map(sanitizeSegment));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

function snapshotFilePath(namespace: string, key: string): string {
  return path.join(getAppCacheDir(), "snapshots", sanitizeSegment(namespace), `${sanitizeSegment(key)}.json`);
}

export async function readPersistentSnapshot<T>(
  namespace: string,
  key: string,
  options: { maxAgeMs?: number } = {}
): Promise<T | null> {
  try {
    const filePath = snapshotFilePath(namespace, key);
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as SnapshotEnvelope<T>;
    if (!parsed || typeof parsed !== "object" || parsed.data === undefined || typeof parsed.savedAt !== "string") {
      return null;
    }

    if (typeof options.maxAgeMs === "number" && Number.isFinite(options.maxAgeMs) && options.maxAgeMs > 0) {
      const savedAt = Date.parse(parsed.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > options.maxAgeMs) {
        return null;
      }
    }

    return parsed.data;
  } catch {
    return null;
  }
}

export async function writePersistentSnapshot<T>(namespace: string, key: string, data: T): Promise<void> {
  try {
    const dir = await ensurePersistentDir("snapshots", namespace);
    const filePath = path.join(dir, `${sanitizeSegment(key)}.json`);
    const payload: SnapshotEnvelope<T> = {
      savedAt: new Date().toISOString(),
      data,
    };

    await fsp.writeFile(filePath, JSON.stringify(payload), "utf8");
  } catch {
    // Best-effort only. Redis remains the primary cache.
  }
}
