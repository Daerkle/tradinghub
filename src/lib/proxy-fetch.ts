import { ProxyAgent } from "undici";

type ProxyProvider = "scraperapi" | "brightdata";

interface StickySessionState {
  id: string;
  expiresAt: number;
  requests: number;
}

interface ProxyFetchOptions {
  preferProxy?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

const SCRAPERAPI_KEY = (process.env.SCRAPERAPI_KEY || "").trim();
const SCRAPERAPI_ENDPOINT = (process.env.SCRAPERAPI_ENDPOINT || "http://api.scraperapi.com").trim();
const SCRAPERAPI_COUNTRY = (process.env.SCRAPERAPI_COUNTRY || "").trim();
const SCRAPERAPI_PREMIUM = (process.env.SCRAPERAPI_PREMIUM || "").toLowerCase() === "true";

const BRIGHTDATA_PROXY_HOST = (process.env.BRIGHTDATA_PROXY_HOST || "").trim();
const BRIGHTDATA_PROXY_PORT = Number.parseInt(process.env.BRIGHTDATA_PROXY_PORT || "22225", 10);
const BRIGHTDATA_PROXY_USERNAME = (process.env.BRIGHTDATA_PROXY_USERNAME || "").trim();
const BRIGHTDATA_PROXY_PASSWORD = (process.env.BRIGHTDATA_PROXY_PASSWORD || "").trim();
const BRIGHTDATA_PROXY_PROTOCOL = (process.env.BRIGHTDATA_PROXY_PROTOCOL || "http").trim();

const PROXY_PRIMARY = (process.env.YAHOO_PROXY_PRIMARY || "scraperapi").toLowerCase();
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.YAHOO_PROXY_TIMEOUT_MS || "18000", 10);
const DEFAULT_MAX_RETRIES = Number.parseInt(process.env.YAHOO_PROXY_MAX_RETRIES || "2", 10);
const SESSION_TTL_MS = Number.parseInt(process.env.YAHOO_PROXY_SESSION_TTL_MS || `${8 * 60 * 1000}`, 10);
const SESSION_MAX_REQUESTS = Number.parseInt(process.env.YAHOO_PROXY_SESSION_MAX_REQUESTS || "80", 10);
const RETRY_BASE_MS = Number.parseInt(process.env.YAHOO_PROXY_RETRY_BASE_MS || "500", 10);
const RETRY_MAX_MS = Number.parseInt(process.env.YAHOO_PROXY_RETRY_MAX_MS || "5000", 10);

const stickySessions = new Map<ProxyProvider, StickySessionState>();
let brightDataAgent: ProxyAgent | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoffMs(attempt: number): number {
  const exp = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * Math.max(100, Math.floor(exp * 0.25)));
  return exp + jitter;
}

function supportsProxy(): boolean {
  return Boolean(SCRAPERAPI_KEY) || Boolean(getBrightDataAgent());
}

function hasScraperApi(): boolean {
  return Boolean(SCRAPERAPI_KEY);
}

function getBrightDataAgent(): ProxyAgent | null {
  if (
    !BRIGHTDATA_PROXY_HOST ||
    !Number.isFinite(BRIGHTDATA_PROXY_PORT) ||
    BRIGHTDATA_PROXY_PORT <= 0 ||
    !BRIGHTDATA_PROXY_USERNAME ||
    !BRIGHTDATA_PROXY_PASSWORD
  ) {
    return null;
  }

  if (!brightDataAgent) {
    const username = encodeURIComponent(BRIGHTDATA_PROXY_USERNAME);
    const password = encodeURIComponent(BRIGHTDATA_PROXY_PASSWORD);
    const proxyUrl = `${BRIGHTDATA_PROXY_PROTOCOL}://${username}:${password}@${BRIGHTDATA_PROXY_HOST}:${BRIGHTDATA_PROXY_PORT}`;
    brightDataAgent = new ProxyAgent(proxyUrl);
  }

  return brightDataAgent;
}

function getProviderOrder(): ProxyProvider[] {
  const available: ProxyProvider[] = [];
  if (hasScraperApi()) available.push("scraperapi");
  if (getBrightDataAgent()) available.push("brightdata");
  if (available.length <= 1) return available;

  if (PROXY_PRIMARY === "brightdata") {
    return available.sort((a, b) => (a === "brightdata" ? -1 : b === "brightdata" ? 1 : 0));
  }

  return available.sort((a, b) => (a === "scraperapi" ? -1 : b === "scraperapi" ? 1 : 0));
}

function buildSessionId(): string {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function getStickySession(provider: ProxyProvider, rotate: boolean): string {
  const now = Date.now();
  const current = stickySessions.get(provider);

  if (
    rotate ||
    !current ||
    current.expiresAt <= now ||
    current.requests >= SESSION_MAX_REQUESTS
  ) {
    const next: StickySessionState = {
      id: buildSessionId(),
      expiresAt: now + SESSION_TTL_MS,
      requests: 1,
    };
    stickySessions.set(provider, next);
    return next.id;
  }

  current.requests += 1;
  return current.id;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function canRetryRequest(init: RequestInit | undefined): boolean {
  const method = (init?.method || "GET").toUpperCase();
  const hasBody = init?.body !== undefined && init.body !== null;
  return !hasBody && (method === "GET" || method === "HEAD");
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

function isYahooHost(input: RequestInfo | URL): boolean {
  try {
    const host = new URL(toUrlString(input)).hostname.toLowerCase();
    return host.endsWith("yahoo.com") || host.endsWith("yahoo.net");
  } catch {
    return false;
  }
}

function sanitizeHeaders(headers: Headers): Headers {
  const cleaned = new Headers(headers);
  cleaned.delete("host");
  cleaned.delete("content-length");
  return cleaned;
}

function mergedHeaders(inputHeaders?: HeadersInit): Headers {
  return sanitizeHeaders(new Headers(inputHeaders));
}

type NodeRequestInit = RequestInit & { dispatcher?: unknown };

async function fetchWithTimeout(input: RequestInfo | URL, init: NodeRequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    } as RequestInit);
  } finally {
    clearTimeout(timeout);
  }
}

function buildScraperApiUrl(targetUrl: string, sessionId: string): string {
  const endpoint = new URL(SCRAPERAPI_ENDPOINT);
  endpoint.searchParams.set("api_key", SCRAPERAPI_KEY);
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("keep_headers", "true");
  endpoint.searchParams.set("session_number", sessionId);
  if (SCRAPERAPI_COUNTRY) endpoint.searchParams.set("country_code", SCRAPERAPI_COUNTRY);
  if (SCRAPERAPI_PREMIUM) endpoint.searchParams.set("premium", "true");
  return endpoint.toString();
}

async function fetchViaProvider(
  provider: ProxyProvider,
  targetUrl: string,
  init: RequestInit | undefined,
  sessionId: string,
  timeoutMs: number
): Promise<Response> {
  const requestInit: NodeRequestInit = {
    ...init,
    headers: mergedHeaders(init?.headers),
  };

  if (provider === "scraperapi") {
    const scraperUrl = buildScraperApiUrl(targetUrl, sessionId);
    return fetchWithTimeout(scraperUrl, requestInit, timeoutMs);
  }

  const agent = getBrightDataAgent();
  if (!agent) {
    throw new Error("Bright Data proxy is not configured");
  }

  requestInit.dispatcher = agent;
  return fetchWithTimeout(targetUrl, requestInit, timeoutMs);
}

async function fetchDirectWithRetry(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
  maxRetries: number
): Promise<Response> {
  const retryable = canRetryRequest(init);
  const attempts = retryable ? Math.max(0, maxRetries) + 1 : 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(input, { ...init }, timeoutMs);
      if (response.ok || !isRetryableStatus(response.status) || attempt === attempts - 1) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }

    await sleep(nextBackoffMs(attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("Direct fetch failed");
}

export async function fetchWithProxyFallback(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: ProxyFetchOptions = {}
): Promise<Response> {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? (options.timeoutMs as number) : DEFAULT_TIMEOUT_MS;
  const maxRetries = Number.isFinite(options.maxRetries) ? (options.maxRetries as number) : DEFAULT_MAX_RETRIES;
  const shouldUseProxy = Boolean(options.preferProxy);

  if (!shouldUseProxy || !supportsProxy()) {
    return fetchDirectWithRetry(input, init, timeoutMs, maxRetries);
  }

  const providers = getProviderOrder();
  const retryable = canRetryRequest(init);
  const attempts = retryable ? Math.max(0, maxRetries) + 1 : 1;
  const targetUrl = toUrlString(input);
  let lastError: unknown = null;

  for (const provider of providers) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const sessionId = getStickySession(provider, attempt > 0);
        const response = await fetchViaProvider(provider, targetUrl, init, sessionId, timeoutMs);
        if (response.ok || !isRetryableStatus(response.status) || attempt === attempts - 1) {
          return response;
        }
      } catch (error) {
        lastError = error;
        if (attempt === attempts - 1) break;
      }

      await sleep(nextBackoffMs(attempt));
    }
  }

  // Last fallback: direct request
  try {
    return await fetchDirectWithRetry(input, init, timeoutMs, maxRetries);
  } catch (error) {
    lastError = error;
  }

  throw lastError instanceof Error ? lastError : new Error("Proxy + direct fetch fallback failed");
}

export function createYahooProxyFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const preferProxy = isYahooHost(input);
    return fetchWithProxyFallback(input, init, {
      preferProxy,
    });
  };
}

