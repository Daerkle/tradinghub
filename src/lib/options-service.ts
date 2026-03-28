import { readPersistentSnapshot, writePersistentSnapshot } from "@/lib/persistent-storage";
import { smartCacheGet, smartCacheSet } from "@/lib/redis-cache";
import { getYahooFinance } from "@/lib/yahoo-client";
import { fetchOpenBBOptionsChain, type OpenBBOptionChainRow } from "@/lib/openbb-service";
import type {
  OptionContractSnapshot,
  OptionExpirySummary,
  OptionStrikeLevel,
  OptionsBias,
  OptionsOverview,
} from "@/types/options";

const OPTIONS_CACHE_PREFIX = "scanner:options:v1:";
const OPTIONS_TIMEOUT_MS = 20_000;
const OPTIONS_MAX_EXPIRIES = 5;
const OPTIONS_MAX_DTE = 120;
const OPTIONS_MAX_HOT_CONTRACTS = 10;
const OPTIONS_MAX_STRIKE_LEVELS = 8;
const OPTIONS_FRESH_TTL_SECONDS = 5 * 60;
const OPTIONS_STALE_TTL_SECONDS = 2 * 60 * 60;
const OPTIONS_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const yahooFinance = getYahooFinance();

type YahooQuote = {
  regularMarketPrice?: number;
  currency?: string;
};

type YahooOptionRecord = {
  contractSymbol?: string;
  strike?: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  inTheMoney?: boolean;
  expiration?: string | number | Date;
};

type YahooOptionGroup = {
  expirationDate?: string | number | Date;
  calls?: YahooOptionRecord[];
  puts?: YahooOptionRecord[];
};

type YahooOptionsResult = {
  quote?: YahooQuote;
  expirationDates?: Array<string | number | Date>;
  options?: YahooOptionGroup[];
};

function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms${label ? `: ${label}` : ""}`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toPositiveInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

function normalizeIv(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value <= 3 ? value * 100 : value;
}

function normalizeDateInput(value: string | number | Date | undefined | null): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(value: string | number | Date | undefined | null): string | null {
  const date = normalizeDateInput(value);
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

function daysUntil(expiration: string): number {
  const [year, month, day] = expiration.split("-").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return 0;

  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const expiryUtc = Date.UTC(year, month - 1, day);
  return Math.max(0, Math.round((expiryUtc - todayUtc) / 86_400_000));
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

function sumBy<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((sum, item) => sum + getter(item), 0);
}

function average(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function pickClosestToSpot(
  contracts: OptionContractSnapshot[],
  spot: number
): OptionContractSnapshot | null {
  if (!Number.isFinite(spot) || spot <= 0) return null;

  let best: OptionContractSnapshot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const contract of contracts) {
    const distance = Math.abs(contract.strike - spot);
    if (distance < bestDistance) {
      best = contract;
      bestDistance = distance;
    }
  }

  return best;
}

function selectExpiries(expiries: string[]): string[] {
  const unique = Array.from(new Set(expiries)).sort();
  const withinHorizon = unique.filter((expiration) => daysUntil(expiration) <= OPTIONS_MAX_DTE);
  if (withinHorizon.length >= OPTIONS_MAX_EXPIRIES) {
    return withinHorizon.slice(0, OPTIONS_MAX_EXPIRIES);
  }
  return unique.slice(0, OPTIONS_MAX_EXPIRIES);
}

function normalizeContract(
  raw: YahooOptionRecord,
  side: "call" | "put",
  expiration: string,
  underlyingPrice: number
): OptionContractSnapshot | null {
  const strike = toFiniteNumber(raw.strike);
  if (strike === null || strike <= 0) return null;

  const bid = toFiniteNumber(raw.bid) ?? 0;
  const ask = toFiniteNumber(raw.ask) ?? 0;
  const lastPrice = toFiniteNumber(raw.lastPrice) ?? 0;
  const mark =
    bid > 0 && ask > 0
      ? (bid + ask) / 2
      : lastPrice > 0
        ? lastPrice
        : Math.max(bid, ask, 0);
  const volume = toPositiveInt(raw.volume);
  const openInterest = toPositiveInt(raw.openInterest);
  const gamma = toFiniteNumber(raw.gamma);
  const baseGammaExposure =
    gamma !== null && openInterest > 0 && underlyingPrice > 0
      ? gamma * openInterest * 100 * underlyingPrice * underlyingPrice * 0.01
      : null;

  return {
    contractSymbol: typeof raw.contractSymbol === "string" && raw.contractSymbol.trim()
      ? raw.contractSymbol
      : `${side.toUpperCase()}-${expiration}-${strike}`,
    side,
    strike,
    expiration,
    daysToExpiration: daysUntil(expiration),
    bid,
    ask,
    lastPrice,
    mark,
    volume,
    openInterest,
    volumeOiRatio: ratio(volume, openInterest),
    impliedVolatilityPct: normalizeIv(raw.impliedVolatility),
    delta: toFiniteNumber(raw.delta),
    gamma,
    theta: toFiniteNumber(raw.theta),
    vega: toFiniteNumber(raw.vega),
    inTheMoney: Boolean(raw.inTheMoney),
    distanceFromSpotPct: underlyingPrice > 0 ? ((strike / underlyingPrice) - 1) * 100 : null,
    premiumVolumeUsd: volume * mark * 100,
    gammaExposureEstimate:
      baseGammaExposure === null
        ? null
        : side === "call"
          ? baseGammaExposure
          : -baseGammaExposure,
  };
}

function normalizeGroupContracts(
  group: YahooOptionGroup,
  fallbackExpiration: string,
  underlyingPrice: number
): OptionContractSnapshot[] {
  const expiration = toIsoDate(group.expirationDate) ?? fallbackExpiration;
  const calls = (group.calls || [])
    .map((raw) => normalizeContract(raw, "call", expiration, underlyingPrice))
    .filter((contract): contract is OptionContractSnapshot => contract !== null);
  const puts = (group.puts || [])
    .map((raw) => normalizeContract(raw, "put", expiration, underlyingPrice))
    .filter((contract): contract is OptionContractSnapshot => contract !== null);
  return [...calls, ...puts];
}

function normalizeOpenBBContract(
  raw: OpenBBOptionChainRow,
  underlyingPrice: number
): OptionContractSnapshot | null {
  const expiration = toIsoDate(raw.expiration) ?? raw.expiration;
  const side = raw.optionType === "call" ? "call" : raw.optionType === "put" ? "put" : null;
  if (!expiration || !side) return null;

  return normalizeContract(
    {
      contractSymbol: raw.contractSymbol,
      strike: raw.strike,
      bid: raw.bid,
      ask: raw.ask,
      lastPrice: raw.lastTradePrice,
      volume: raw.volume,
      openInterest: raw.openInterest,
      impliedVolatility: raw.impliedVolatility ?? undefined,
      delta: raw.delta ?? undefined,
      gamma: raw.gamma ?? undefined,
      theta: raw.theta ?? undefined,
      vega: raw.vega ?? undefined,
      inTheMoney: raw.inTheMoney,
      expiration,
    },
    side,
    expiration,
    underlyingPrice
  );
}

function computeMaxPain(contracts: OptionContractSnapshot[]): number | null {
  const strikes = Array.from(new Set(contracts.map((contract) => contract.strike))).sort((a, b) => a - b);
  if (strikes.length === 0) return null;

  let bestStrike: number | null = null;
  let bestPain = Number.POSITIVE_INFINITY;

  for (const candidate of strikes) {
    let pain = 0;

    for (const contract of contracts) {
      if (contract.openInterest <= 0) continue;
      if (contract.side === "call") {
        pain += Math.max(0, candidate - contract.strike) * contract.openInterest;
      } else {
        pain += Math.max(0, contract.strike - candidate) * contract.openInterest;
      }
    }

    if (pain < bestPain) {
      bestPain = pain;
      bestStrike = candidate;
    }
  }

  return bestStrike;
}

function getWall(contracts: OptionContractSnapshot[], side: "call" | "put"): number | null {
  const byStrike = new Map<number, number>();

  for (const contract of contracts) {
    if (contract.side !== side) continue;
    byStrike.set(contract.strike, (byStrike.get(contract.strike) || 0) + contract.openInterest);
  }

  let bestStrike: number | null = null;
  let bestOi = -1;

  for (const [strike, openInterest] of byStrike.entries()) {
    if (openInterest > bestOi) {
      bestStrike = strike;
      bestOi = openInterest;
    }
  }

  return bestStrike;
}

function summarizeExpiry(
  expiration: string,
  contracts: OptionContractSnapshot[],
  underlyingPrice: number
): OptionExpirySummary {
  const calls = contracts.filter((contract) => contract.side === "call");
  const puts = contracts.filter((contract) => contract.side === "put");
  const closestCall = pickClosestToSpot(calls, underlyingPrice);
  const closestPut = pickClosestToSpot(puts, underlyingPrice);
  const netGexValues = contracts
    .map((contract) => contract.gammaExposureEstimate)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    expiration,
    daysToExpiration: daysUntil(expiration),
    contractCount: contracts.length,
    totalCallOi: sumBy(calls, (contract) => contract.openInterest),
    totalPutOi: sumBy(puts, (contract) => contract.openInterest),
    totalCallVolume: sumBy(calls, (contract) => contract.volume),
    totalPutVolume: sumBy(puts, (contract) => contract.volume),
    putCallOiRatio: ratio(
      sumBy(puts, (contract) => contract.openInterest),
      sumBy(calls, (contract) => contract.openInterest)
    ),
    putCallVolumeRatio: ratio(
      sumBy(puts, (contract) => contract.volume),
      sumBy(calls, (contract) => contract.volume)
    ),
    maxPain: computeMaxPain(contracts),
    callWall: getWall(contracts, "call"),
    putWall: getWall(contracts, "put"),
    atmIvPct: average([closestCall?.impliedVolatilityPct ?? null, closestPut?.impliedVolatilityPct ?? null]),
    skewPct:
      closestPut?.impliedVolatilityPct !== null &&
      closestPut?.impliedVolatilityPct !== undefined &&
      closestCall?.impliedVolatilityPct !== null &&
      closestCall?.impliedVolatilityPct !== undefined
        ? closestPut.impliedVolatilityPct - closestCall.impliedVolatilityPct
        : null,
    netGexEstimate:
      netGexValues.length > 0
        ? netGexValues.reduce((sum, value) => sum + value, 0)
        : null,
  };
}

function buildStrikeLevels(
  contracts: OptionContractSnapshot[],
  underlyingPrice: number
): OptionStrikeLevel[] {
  const byStrike = new Map<number, OptionStrikeLevel>();

  for (const contract of contracts) {
    const existing = byStrike.get(contract.strike) || {
      strike: contract.strike,
      callOi: 0,
      putOi: 0,
      callVolume: 0,
      putVolume: 0,
      totalOi: 0,
      netOi: 0,
      distanceFromSpotPct: underlyingPrice > 0 ? ((contract.strike / underlyingPrice) - 1) * 100 : null,
      netGexEstimate: 0,
    };

    if (contract.side === "call") {
      existing.callOi += contract.openInterest;
      existing.callVolume += contract.volume;
      existing.netOi += contract.openInterest;
    } else {
      existing.putOi += contract.openInterest;
      existing.putVolume += contract.volume;
      existing.netOi -= contract.openInterest;
    }

    existing.totalOi = existing.callOi + existing.putOi;
    if (typeof contract.gammaExposureEstimate === "number") {
      existing.netGexEstimate = (existing.netGexEstimate || 0) + contract.gammaExposureEstimate;
    }

    byStrike.set(contract.strike, existing);
  }

  return Array.from(byStrike.values())
    .filter((level) => level.totalOi > 0)
    .sort((a, b) => {
      if (b.totalOi !== a.totalOi) return b.totalOi - a.totalOi;
      const aDistance = Math.abs(a.distanceFromSpotPct ?? 999);
      const bDistance = Math.abs(b.distanceFromSpotPct ?? 999);
      return aDistance - bDistance;
    })
    .slice(0, OPTIONS_MAX_STRIKE_LEVELS);
}

function buildHotContracts(contracts: OptionContractSnapshot[]): OptionContractSnapshot[] {
  return [...contracts]
    .filter((contract) => contract.volume >= 25 || contract.openInterest >= 250)
    .sort((a, b) => {
      const scoreA =
        Math.min(a.volumeOiRatio ?? 0, 4) * 25 +
        Math.min(a.premiumVolumeUsd / 100_000, 40) +
        Math.min(Math.log10(a.openInterest + 1) * 10, 25) +
        Math.max(0, 12 - Math.abs(a.distanceFromSpotPct ?? 99));
      const scoreB =
        Math.min(b.volumeOiRatio ?? 0, 4) * 25 +
        Math.min(b.premiumVolumeUsd / 100_000, 40) +
        Math.min(Math.log10(b.openInterest + 1) * 10, 25) +
        Math.max(0, 12 - Math.abs(b.distanceFromSpotPct ?? 99));
      return scoreB - scoreA;
    })
    .slice(0, OPTIONS_MAX_HOT_CONTRACTS);
}

function computeExpectedMove(
  contracts: OptionContractSnapshot[],
  underlyingPrice: number
): { expectedMoveUsd: number | null; expectedMovePct: number | null } {
  if (!Number.isFinite(underlyingPrice) || underlyingPrice <= 0) {
    return { expectedMoveUsd: null, expectedMovePct: null };
  }

  const closestCall = pickClosestToSpot(contracts.filter((contract) => contract.side === "call"), underlyingPrice);
  const closestPut = pickClosestToSpot(contracts.filter((contract) => contract.side === "put"), underlyingPrice);
  if (!closestCall || !closestPut) {
    return { expectedMoveUsd: null, expectedMovePct: null };
  }

  const moveUsd = (closestCall.mark || 0) + (closestPut.mark || 0);
  if (!Number.isFinite(moveUsd) || moveUsd <= 0) {
    return { expectedMoveUsd: null, expectedMovePct: null };
  }

  return {
    expectedMoveUsd: moveUsd,
    expectedMovePct: (moveUsd / underlyingPrice) * 100,
  };
}

function computeOiConcentration(
  contracts: OptionContractSnapshot[],
  side: "call" | "put"
): number | null {
  const relevant = contracts.filter((contract) => contract.side === side);
  const totalOi = sumBy(relevant, (contract) => contract.openInterest);
  if (totalOi <= 0) return null;

  const byStrike = new Map<number, number>();
  for (const contract of relevant) {
    byStrike.set(contract.strike, (byStrike.get(contract.strike) || 0) + contract.openInterest);
  }

  const topThree = Array.from(byStrike.values())
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, value) => sum + value, 0);

  return (topThree / totalOi) * 100;
}

function computeGammaFlipZone(strikeLevels: OptionStrikeLevel[]): number | null {
  const sorted = [...strikeLevels]
    .filter((level) => typeof level.netGexEstimate === "number" && Number.isFinite(level.netGexEstimate))
    .sort((a, b) => a.strike - b.strike);

  for (let index = 1; index < sorted.length; index++) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    const prevGex = previous.netGexEstimate || 0;
    const currentGex = current.netGexEstimate || 0;

    if (prevGex === 0) return previous.strike;
    if (currentGex === 0) return current.strike;
    if ((prevGex < 0 && currentGex > 0) || (prevGex > 0 && currentGex < 0)) {
      return current.strike;
    }
  }

  return null;
}

function deriveBias(putCallOiRatio: number | null, putCallVolumeRatio: number | null): OptionsBias {
  const oiScore = putCallOiRatio === null ? 0 : putCallOiRatio - 1;
  const volumeScore = putCallVolumeRatio === null ? 0 : putCallVolumeRatio - 1;
  const composite = oiScore * 0.6 + volumeScore * 0.4;

  if (composite >= 0.15) return "put-skewed";
  if (composite <= -0.15) return "call-skewed";
  return "balanced";
}

function buildSummary(
  contracts: OptionContractSnapshot[],
  expiries: OptionExpirySummary[],
  strikeLevels: OptionStrikeLevel[],
  underlyingPrice: number
): OptionsOverview["summary"] {
  const totalCallOi = sumBy(contracts.filter((contract) => contract.side === "call"), (contract) => contract.openInterest);
  const totalPutOi = sumBy(contracts.filter((contract) => contract.side === "put"), (contract) => contract.openInterest);
  const totalCallVolume = sumBy(contracts.filter((contract) => contract.side === "call"), (contract) => contract.volume);
  const totalPutVolume = sumBy(contracts.filter((contract) => contract.side === "put"), (contract) => contract.volume);
  const gexValues = contracts
    .map((contract) => contract.gammaExposureEstimate)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const frontExpiry = expiries[0];
  const frontExpiryContracts = frontExpiry
    ? contracts.filter((contract) => contract.expiration === frontExpiry.expiration)
    : [];
  const callWall = strikeLevels.reduce<OptionStrikeLevel | null>((best, level) => {
    if (!best || level.callOi > best.callOi) return level;
    return best;
  }, null);
  const putWall = strikeLevels.reduce<OptionStrikeLevel | null>((best, level) => {
    if (!best || level.putOi > best.putOi) return level;
    return best;
  }, null);
  const expectedMove = computeExpectedMove(frontExpiryContracts, underlyingPrice);

  return {
    totalCallOi,
    totalPutOi,
    totalCallVolume,
    totalPutVolume,
    putCallOiRatio: ratio(totalPutOi, totalCallOi),
    putCallVolumeRatio: ratio(totalPutVolume, totalCallVolume),
    callWall: callWall?.strike ?? null,
    putWall: putWall?.strike ?? null,
    maxPain: frontExpiry?.maxPain ?? null,
    atmIvPct: frontExpiry?.atmIvPct ?? null,
    skewPct: frontExpiry?.skewPct ?? null,
    netGexEstimate:
      gexValues.length > 0
        ? gexValues.reduce((sum, value) => sum + value, 0)
        : null,
    grossGexEstimate:
      gexValues.length > 0
        ? gexValues.reduce((sum, value) => sum + Math.abs(value), 0)
        : null,
    expectedMoveUsd: expectedMove.expectedMoveUsd,
    expectedMovePct: expectedMove.expectedMovePct,
    gammaFlipZone: computeGammaFlipZone(strikeLevels),
    callOiConcentrationPct: computeOiConcentration(contracts, "call"),
    putOiConcentrationPct: computeOiConcentration(contracts, "put"),
  };
}

async function fetchRawOptions(symbol: string, expiration?: string): Promise<YahooOptionsResult> {
  const request = expiration
    ? yahooFinance.options(symbol, { date: new Date(`${expiration}T00:00:00Z`) })
    : yahooFinance.options(symbol);
  return withTimeout(request as Promise<YahooOptionsResult>, OPTIONS_TIMEOUT_MS, expiration ? `${symbol}-${expiration}` : symbol);
}

async function buildOverviewFromOpenBB(symbol: string): Promise<OptionsOverview> {
  const rows = await fetchOpenBBOptionsChain(symbol);
  if (rows.length === 0) {
    throw new Error(`No OpenBB option contracts available for ${symbol}`);
  }

  const underlyingPrice = rows.find((row) => row.underlyingPrice > 0)?.underlyingPrice ?? 0;
  if (underlyingPrice <= 0) {
    throw new Error(`No OpenBB underlying price available for ${symbol}`);
  }

  const currency = rows.find((row) => row.currency)?.currency || "USD";
  const availableExpiries = Array.from(
    new Set(rows.map((row) => toIsoDate(row.expiration)).filter((value): value is string => Boolean(value)))
  ).sort();
  const selectedExpiries = selectExpiries(availableExpiries);
  const contractsByExpiry = new Map<string, OptionContractSnapshot[]>();

  for (const expiration of selectedExpiries) {
    const contracts = rows
      .filter((row) => (toIsoDate(row.expiration) ?? row.expiration) === expiration)
      .map((row) => normalizeOpenBBContract(row, underlyingPrice))
      .filter((contract): contract is OptionContractSnapshot => contract !== null);
    if (contracts.length > 0) {
      contractsByExpiry.set(expiration, contracts);
    }
  }

  const trackedExpiries = selectedExpiries.filter((expiration) => (contractsByExpiry.get(expiration) || []).length > 0);
  const contracts = trackedExpiries.flatMap((expiration) => contractsByExpiry.get(expiration) || []);
  if (contracts.length === 0) {
    throw new Error(`No normalized OpenBB option contracts available for ${symbol}`);
  }

  const expiries = trackedExpiries.map((expiration) =>
    summarizeExpiry(expiration, contractsByExpiry.get(expiration) || [], underlyingPrice)
  );
  const strikeLevels = buildStrikeLevels(contracts, underlyingPrice);
  const summary = buildSummary(contracts, expiries, strikeLevels, underlyingPrice);

  return {
    symbol,
    source: "openbb/yfinance",
    fetchedAt: new Date().toISOString(),
    underlyingPrice,
    currency,
    availableExpiries: availableExpiries.length,
    trackedExpiries: trackedExpiries.length,
    horizonDays: trackedExpiries.reduce((max, expiration) => Math.max(max, daysUntil(expiration)), 0),
    nearestExpiry: trackedExpiries[0] ?? null,
    bias: deriveBias(summary.putCallOiRatio, summary.putCallVolumeRatio),
    summary,
    expiries,
    strikeLevels,
    hotContracts: buildHotContracts(contracts),
    sourceLinks: [
      { label: "Yahoo Options", url: `https://finance.yahoo.com/quote/${symbol}/options` },
      { label: "OCC Volume Query", url: "https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query" },
      { label: "OCC Account Type", url: "https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-by-account-type" },
      { label: "CFTC COT", url: "https://www.cftc.gov/dea/options/deacboesof.htm" },
    ],
    disclaimer:
      "Kostenlose Daten sind verzoegert und liefern kein echtes Live-Sweep-/Block-Feed. Walls, Max Pain und GEX sind aus OI, Volumen und Greeks abgeleitet.",
  };
}

export async function fetchOptionsOverview(
  symbol: string,
  options: { forceRefresh?: boolean } = {}
): Promise<OptionsOverview> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  const cacheKey = `${OPTIONS_CACHE_PREFIX}${normalizedSymbol}`;
  const cached = await smartCacheGet<OptionsOverview>(cacheKey);
  const persistedSnapshotPromise = readPersistentSnapshot<OptionsOverview>("options", normalizedSymbol, {
    maxAgeMs: OPTIONS_SNAPSHOT_MAX_AGE_MS,
  });

  if (!options.forceRefresh) {
    if (cached.data && !cached.isStale) {
      return cached.data;
    }
  }

  try {
    let overview: OptionsOverview;
    try {
      const base = await fetchRawOptions(normalizedSymbol);
      const underlyingPrice = toFiniteNumber(base.quote?.regularMarketPrice) ?? 0;
      const currency = typeof base.quote?.currency === "string" && base.quote.currency.trim()
        ? base.quote.currency
        : "USD";

      if (underlyingPrice <= 0) {
        throw new Error(`No options quote available for ${normalizedSymbol}`);
      }

      const availableExpiries = (base.expirationDates || [])
        .map((value) => toIsoDate(value))
        .filter((value): value is string => Boolean(value));
      const fallbackExpiriesFromGroups = (base.options || [])
        .map((group) => toIsoDate(group.expirationDate))
        .filter((value): value is string => Boolean(value));
      const selectedExpiries = selectExpiries(
        availableExpiries.length > 0 ? availableExpiries : fallbackExpiriesFromGroups
      );
      const contractsByExpiry = new Map<string, OptionContractSnapshot[]>();

      for (const group of base.options || []) {
        const expiration = toIsoDate(group.expirationDate);
        if (!expiration || !selectedExpiries.includes(expiration)) continue;
        contractsByExpiry.set(expiration, normalizeGroupContracts(group, expiration, underlyingPrice));
      }

      for (const expiration of selectedExpiries) {
        if (contractsByExpiry.has(expiration)) continue;

        const raw = await fetchRawOptions(normalizedSymbol, expiration);
        const group = raw.options?.find((entry) => (toIsoDate(entry.expirationDate) ?? expiration) === expiration);
        if (!group) continue;
        contractsByExpiry.set(expiration, normalizeGroupContracts(group, expiration, underlyingPrice));
      }

      const trackedExpiries = selectedExpiries.filter((expiration) => (contractsByExpiry.get(expiration) || []).length > 0);
      const contracts = trackedExpiries.flatMap((expiration) => contractsByExpiry.get(expiration) || []);

      if (contracts.length === 0) {
        throw new Error(`No option contracts available for ${normalizedSymbol}`);
      }

      const expiries = trackedExpiries.map((expiration) =>
        summarizeExpiry(expiration, contractsByExpiry.get(expiration) || [], underlyingPrice)
      );
      const strikeLevels = buildStrikeLevels(contracts, underlyingPrice);
      const summary = buildSummary(contracts, expiries, strikeLevels, underlyingPrice);
      overview = {
        symbol: normalizedSymbol,
        source: "yahoo-finance2",
        fetchedAt: new Date().toISOString(),
        underlyingPrice,
        currency,
        availableExpiries: availableExpiries.length,
        trackedExpiries: trackedExpiries.length,
        horizonDays: trackedExpiries.reduce((max, expiration) => Math.max(max, daysUntil(expiration)), 0),
        nearestExpiry: trackedExpiries[0] ?? null,
        bias: deriveBias(summary.putCallOiRatio, summary.putCallVolumeRatio),
        summary,
        expiries,
        strikeLevels,
        hotContracts: buildHotContracts(contracts),
        sourceLinks: [
          { label: "Yahoo Options", url: `https://finance.yahoo.com/quote/${normalizedSymbol}/options` },
          { label: "OCC Volume Query", url: "https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-query" },
          { label: "OCC Account Type", url: "https://www.theocc.com/market-data/market-data-reports/volume-and-open-interest/volume-by-account-type" },
          { label: "CFTC COT", url: "https://www.cftc.gov/dea/options/deacboesof.htm" },
        ],
        disclaimer:
          "Kostenlose Daten sind verzoegert und liefern kein echtes Live-Sweep-/Block-Feed. Walls, Max Pain und GEX sind aus OI, Volumen und Yahoo-Greeks abgeleitet.",
      };
    } catch {
      overview = await buildOverviewFromOpenBB(normalizedSymbol);
    }

    await smartCacheSet(cacheKey, overview, {
      freshTtlSeconds: OPTIONS_FRESH_TTL_SECONDS,
      staleTtlSeconds: OPTIONS_STALE_TTL_SECONDS,
    });
    await writePersistentSnapshot("options", normalizedSymbol, overview);
    return overview;
  } catch (error) {
    if (cached.data) {
      return cached.data;
    }
    const persistedSnapshot = await persistedSnapshotPromise;
    if (persistedSnapshot) {
      return persistedSnapshot;
    }
    throw error;
  }
}
