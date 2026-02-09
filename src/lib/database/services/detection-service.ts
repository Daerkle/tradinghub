import { db } from '../db';
import {
  dailyPrices,
  priceRuns,
  earnings,
  newsEvents,
  setups,
  NewPriceRun,
  NewSetup,
  SETUP_TYPES,
  DailyPrice,
} from '../schema';
import { eq, and, gte, lte, desc, sql, between } from 'drizzle-orm';
import { backfillNewsForSymbol, backfillIntradayForSetup } from './backfill-service';

// ============================================
// Price Run Detection
// ============================================

interface DetectedRun {
  symbol: string;
  startDate: string;
  startPrice: number;
  peakDate: string;
  peakPrice: number;
  totalGainPercent: number;
  durationDays: number;
  avgVolumeRatio: number;
}

/**
 * Detect significant price runs (>20% gain) for a symbol
 */
export async function detectPriceRuns(
  symbol: string,
  minGainPercent: number = 20
): Promise<DetectedRun[]> {
  // Get daily prices for the symbol, ordered by date
  const prices = await db.select()
    .from(dailyPrices)
    .where(eq(dailyPrices.symbol, symbol))
    .orderBy(dailyPrices.date);

  if (prices.length < 10) return [];

  const runs: DetectedRun[] = [];
  let i = 0;

  // Calculate average volume for relative comparison
  const avgVolume = prices.reduce((sum, p) => sum + (p.volume || 0), 0) / prices.length;

  while (i < prices.length - 1) {
    const startPrice = parseFloat(prices[i].close?.toString() || '0');
    if (startPrice <= 0) {
      i++;
      continue;
    }

    let peakIdx = i;
    let peakPrice = startPrice;
    let j = i + 1;

    // Find the peak from this starting point
    while (j < prices.length) {
      const currentPrice = parseFloat(prices[j].close?.toString() || '0');
      const currentGain = ((currentPrice - startPrice) / startPrice) * 100;

      if (currentPrice > peakPrice) {
        peakPrice = currentPrice;
        peakIdx = j;
      }

      // Check if we've dropped 20% from peak (end of run)
      if (peakPrice > startPrice) {
        const dropFromPeak = ((peakPrice - currentPrice) / peakPrice) * 100;
        if (dropFromPeak > 20) {
          break;
        }
      }

      j++;
    }

    const totalGain = ((peakPrice - startPrice) / startPrice) * 100;

    // Only record runs with significant gains
    if (totalGain >= minGainPercent) {
      // Calculate average volume ratio during the run
      const runPrices = prices.slice(i, peakIdx + 1);
      const runAvgVolume = runPrices.reduce((sum, p) => sum + (p.volume || 0), 0) / runPrices.length;
      const volumeRatio = avgVolume > 0 ? runAvgVolume / avgVolume : 1;

      runs.push({
        symbol,
        startDate: prices[i].date,
        startPrice,
        peakDate: prices[peakIdx].date,
        peakPrice,
        totalGainPercent: Math.round(totalGain * 100) / 100,
        durationDays: peakIdx - i,
        avgVolumeRatio: Math.round(volumeRatio * 100) / 100,
      });

      // Jump to after the peak for next potential run
      i = peakIdx + 1;
    } else {
      i++;
    }
  }

  return runs;
}

/**
 * Detect and save price runs for a symbol
 */
export async function detectAndSavePriceRuns(symbol: string): Promise<number> {
  const runs = await detectPriceRuns(symbol);

  if (runs.length === 0) return 0;

  const records: NewPriceRun[] = runs.map(run => ({
    symbol: run.symbol,
    startDate: run.startDate,
    peakDate: run.peakDate,
    startPrice: run.startPrice.toString(),
    peakPrice: run.peakPrice.toString(),
    totalGainPercent: run.totalGainPercent.toString(),
    durationDays: run.durationDays,
    avgVolumeRatio: run.avgVolumeRatio.toString(),
  }));

  await db.insert(priceRuns)
    .values(records)
    .onConflictDoNothing();

  return records.length;
}

// ============================================
// News/Earnings Correlation
// ============================================

interface CorrelationResult {
  priceRunId: string;
  catalystType: 'earnings_beat' | 'news' | 'both' | 'none';
  earningsId: number | null;
  newsIds: number[];
  correlationScore: number;
}

/**
 * Find earnings within time window of price run start
 */
async function findRelatedEarnings(
  symbol: string,
  runStartDate: string,
  daysBefore: number = 2,
  daysAfter: number = 1
): Promise<{ id: number; epsSurprise: number | null } | null> {
  const startDate = new Date(runStartDate);
  const fromDate = new Date(startDate);
  fromDate.setDate(fromDate.getDate() - daysBefore);
  const toDate = new Date(startDate);
  toDate.setDate(toDate.getDate() + daysAfter);

  const result = await db.select()
    .from(earnings)
    .where(and(
      eq(earnings.symbol, symbol),
      gte(earnings.date, fromDate.toISOString().split('T')[0]),
      lte(earnings.date, toDate.toISOString().split('T')[0])
    ))
    .limit(1);

  if (result.length === 0) return null;

  return {
    id: result[0].id,
    epsSurprise: result[0].epsSurprisePercent ? parseFloat(result[0].epsSurprisePercent.toString()) : null,
  };
}

/**
 * Find news within time window of price run start
 */
async function findRelatedNews(
  symbol: string,
  runStartDate: string,
  hoursBefore: number = 48
): Promise<number[]> {
  const startDate = new Date(runStartDate);
  const fromDate = new Date(startDate);
  fromDate.setHours(fromDate.getHours() - hoursBefore);

  const result = await db.select({ id: newsEvents.id })
    .from(newsEvents)
    .where(and(
      eq(newsEvents.symbol, symbol),
      gte(newsEvents.publishedDate, fromDate),
      lte(newsEvents.publishedDate, startDate)
    ))
    .orderBy(desc(newsEvents.publishedDate))
    .limit(10);

  return result.map(r => r.id);
}

/**
 * Calculate correlation score based on timing, earnings beat, and volume
 */
function calculateCorrelationScore(
  hasEarnings: boolean,
  epsSurprise: number | null,
  newsCount: number,
  volumeRatio: number
): number {
  let score = 0;

  // Earnings beat adds significant score
  if (hasEarnings) {
    score += 30;
    if (epsSurprise !== null) {
      if (epsSurprise > 20) score += 30; // Big beat
      else if (epsSurprise > 10) score += 20;
      else if (epsSurprise > 0) score += 10;
    }
  }

  // News presence
  if (newsCount > 0) {
    score += Math.min(newsCount * 5, 20);
  }

  // High volume confirms catalyst
  if (volumeRatio > 3) score += 20;
  else if (volumeRatio > 2) score += 15;
  else if (volumeRatio > 1.5) score += 10;

  return Math.min(score, 100);
}

/**
 * Correlate price runs with news and earnings
 */
export async function correlatePriceRunsWithCatalysts(symbol: string): Promise<void> {
  // First, ensure we have news for this symbol
  await backfillNewsForSymbol(symbol);

  // Get all price runs for the symbol
  const runs = await db.select()
    .from(priceRuns)
    .where(eq(priceRuns.symbol, symbol));

  for (const run of runs) {
    const relatedEarnings = await findRelatedEarnings(symbol, run.startDate);
    const relatedNewsIds = await findRelatedNews(symbol, run.startDate);

    const hasEarnings = relatedEarnings !== null;
    const hasNews = relatedNewsIds.length > 0;
    const volumeRatio = parseFloat(run.avgVolumeRatio?.toString() || '1');

    let catalystType: 'earnings_beat' | 'news' | 'both' | 'none';
    if (hasEarnings && hasNews) catalystType = 'both';
    else if (hasEarnings) catalystType = 'earnings_beat';
    else if (hasNews) catalystType = 'news';
    else catalystType = 'none';

    const correlationScore = calculateCorrelationScore(
      hasEarnings,
      relatedEarnings?.epsSurprise || null,
      relatedNewsIds.length,
      volumeRatio
    );

    // Update the price run with correlation data
    await db.update(priceRuns)
      .set({
        catalystType,
        earningsId: relatedEarnings?.id || null,
        newsIds: relatedNewsIds.length > 0 ? relatedNewsIds : null,
        correlationScore: correlationScore.toString(),
      })
      .where(eq(priceRuns.id, run.id));
  }
}

// ============================================
// Setup Classification
// ============================================

interface SetupCandidate {
  symbol: string;
  setupDate: string;
  setupType: typeof SETUP_TYPES[keyof typeof SETUP_TYPES];
  gapPercent: number;
  volumeRatio: number;
  epsSurprisePercent: number | null;
  priceRunId: string | null;
  earningsId: number | null;
  catalystType: 'earnings' | 'news' | 'both' | null;
  consolidationDays?: number;
  consolidationRange?: number;
  priorRunPercent?: number;
}

/**
 * Calculate gap percentage from previous close
 */
function calculateGap(prices: DailyPrice[], index: number): number {
  if (index === 0) return 0;
  const prevClose = parseFloat(prices[index - 1].close?.toString() || '0');
  const open = parseFloat(prices[index].open?.toString() || '0');
  if (prevClose === 0) return 0;
  return ((open - prevClose) / prevClose) * 100;
}

/**
 * Check if day closes near high (>70% of range)
 */
function closesNearHigh(price: DailyPrice): boolean {
  const high = parseFloat(price.high?.toString() || '0');
  const low = parseFloat(price.low?.toString() || '0');
  const close = parseFloat(price.close?.toString() || '0');
  const range = high - low;
  if (range === 0) return false;
  return ((close - low) / range) > 0.7;
}

/**
 * Detect EP (Episodic Pivot) setups
 * - Gap >5% on news/earnings
 * - Volume >2x average
 * - Catalyst within 24h
 */
async function detectEPSetups(symbol: string): Promise<SetupCandidate[]> {
  const setups: SetupCandidate[] = [];

  const prices = await db.select()
    .from(dailyPrices)
    .where(eq(dailyPrices.symbol, symbol))
    .orderBy(dailyPrices.date);

  if (prices.length < 50) return [];

  // Calculate 50-day average volume
  for (let i = 50; i < prices.length; i++) {
    const avgVolume = prices.slice(i - 50, i).reduce((sum, p) => sum + (p.volume || 0), 0) / 50;
    const currentVolume = prices[i].volume || 0;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

    const gap = calculateGap(prices, i);

    // EP criteria: Gap >5%, Volume >2x
    if (gap >= 5 && volumeRatio >= 2) {
      // Check for related earnings/news
      const relatedEarnings = await findRelatedEarnings(symbol, prices[i].date);

      if (relatedEarnings || gap >= 10) { // Strong gap or has earnings
        setups.push({
          symbol,
          setupDate: prices[i].date,
          setupType: SETUP_TYPES.EP,
          gapPercent: Math.round(gap * 100) / 100,
          volumeRatio: Math.round(volumeRatio * 100) / 100,
          epsSurprisePercent: relatedEarnings?.epsSurprise || null,
          priceRunId: null,
          earningsId: relatedEarnings?.id || null,
          catalystType: relatedEarnings ? 'earnings' : 'news',
        });
      }
    }
  }

  return setups;
}

/**
 * Detect Power Earnings Gap setups
 * - Gap >10% after earnings
 * - Positive EPS surprise
 * - Closes near high (>70% of range)
 */
async function detectPowerEarningsGapSetups(symbol: string): Promise<SetupCandidate[]> {
  const setups: SetupCandidate[] = [];

  const prices = await db.select()
    .from(dailyPrices)
    .where(eq(dailyPrices.symbol, symbol))
    .orderBy(dailyPrices.date);

  if (prices.length < 50) return [];

  for (let i = 50; i < prices.length; i++) {
    const avgVolume = prices.slice(i - 50, i).reduce((sum, p) => sum + (p.volume || 0), 0) / 50;
    const currentVolume = prices[i].volume || 0;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 0;

    const gap = calculateGap(prices, i);

    // Power Earnings Gap criteria: Gap >10%, closes near high
    if (gap >= 10 && closesNearHigh(prices[i])) {
      const relatedEarnings = await findRelatedEarnings(symbol, prices[i].date);

      // Must have positive earnings surprise
      if (relatedEarnings && relatedEarnings.epsSurprise !== null && relatedEarnings.epsSurprise > 0) {
        setups.push({
          symbol,
          setupDate: prices[i].date,
          setupType: SETUP_TYPES.POWER_EARNINGS_GAP,
          gapPercent: Math.round(gap * 100) / 100,
          volumeRatio: Math.round(volumeRatio * 100) / 100,
          epsSurprisePercent: relatedEarnings.epsSurprise,
          priceRunId: null,
          earningsId: relatedEarnings.id,
          catalystType: 'earnings',
        });
      }
    }
  }

  return setups;
}

/**
 * Detect Flag/Consolidation setups
 * - 3-8 weeks consolidation
 * - Range <25%
 * - Decreasing volume
 * - Near 52-week high
 */
async function detectFlagSetups(symbol: string): Promise<SetupCandidate[]> {
  const setups: SetupCandidate[] = [];

  const prices = await db.select()
    .from(dailyPrices)
    .where(eq(dailyPrices.symbol, symbol))
    .orderBy(dailyPrices.date);

  if (prices.length < 252) return []; // Need at least 1 year

  // Find 52-week high
  for (let i = 252; i < prices.length; i++) {
    const yearPrices = prices.slice(i - 252, i);
    const fiftyTwoWeekHigh = Math.max(...yearPrices.map(p => parseFloat(p.high?.toString() || '0')));
    const currentPrice = parseFloat(prices[i].close?.toString() || '0');

    // Check if within 15% of 52-week high
    if (currentPrice < fiftyTwoWeekHigh * 0.85) continue;

    // Look for consolidation pattern (3-8 weeks = 15-40 days)
    for (let consolidationDays = 15; consolidationDays <= 40; consolidationDays++) {
      if (i - consolidationDays < 0) continue;

      const consolidationPrices = prices.slice(i - consolidationDays, i + 1);
      const highInConsolidation = Math.max(...consolidationPrices.map(p => parseFloat(p.high?.toString() || '0')));
      const lowInConsolidation = Math.min(...consolidationPrices.map(p => parseFloat(p.low?.toString() || '0')));

      const range = lowInConsolidation > 0 ? ((highInConsolidation - lowInConsolidation) / lowInConsolidation) * 100 : 0;

      // Flag criteria: Range <25%
      if (range < 25) {
        // Check for prior run
        const priorPrices = prices.slice(Math.max(0, i - consolidationDays - 40), i - consolidationDays);
        if (priorPrices.length < 10) continue;

        const priorLow = Math.min(...priorPrices.map(p => parseFloat(p.low?.toString() || '0')));
        const priorRunPercent = priorLow > 0 ? ((highInConsolidation - priorLow) / priorLow) * 100 : 0;

        // Must have prior run of at least 30%
        if (priorRunPercent >= 30) {
          // Calculate average volume ratio (should be decreasing)
          const avgVolumeConsolidation = consolidationPrices.reduce((sum, p) => sum + (p.volume || 0), 0) / consolidationPrices.length;
          const avgVolumePrior = priorPrices.reduce((sum, p) => sum + (p.volume || 0), 0) / priorPrices.length;
          const volumeRatio = avgVolumePrior > 0 ? avgVolumeConsolidation / avgVolumePrior : 1;

          setups.push({
            symbol,
            setupDate: prices[i].date,
            setupType: SETUP_TYPES.FLAG,
            gapPercent: 0,
            volumeRatio: Math.round(volumeRatio * 100) / 100,
            epsSurprisePercent: null,
            priceRunId: null,
            earningsId: null,
            catalystType: null,
            consolidationDays,
            consolidationRange: Math.round(range * 100) / 100,
            priorRunPercent: Math.round(priorRunPercent * 100) / 100,
          });

          // Skip ahead to avoid duplicate detections
          break;
        }
      }
    }
  }

  return setups;
}

/**
 * Detect High Tight Flag setups
 * - Prior move >100% in 4-8 weeks
 * - Correction 10-25%
 * - Tight consolidation 3-5 weeks
 */
async function detectHighTightFlagSetups(symbol: string): Promise<SetupCandidate[]> {
  const setups: SetupCandidate[] = [];

  const prices = await db.select()
    .from(dailyPrices)
    .where(eq(dailyPrices.symbol, symbol))
    .orderBy(dailyPrices.date);

  if (prices.length < 100) return [];

  for (let i = 60; i < prices.length; i++) {
    // Look for prior 100%+ move in 4-8 weeks (20-40 days)
    const priorPrices = prices.slice(Math.max(0, i - 40), i - 15);
    if (priorPrices.length < 15) continue;

    const priorLow = Math.min(...priorPrices.map(p => parseFloat(p.low?.toString() || '0')));
    const priorHigh = Math.max(...priorPrices.map(p => parseFloat(p.high?.toString() || '0')));
    const priorRunPercent = priorLow > 0 ? ((priorHigh - priorLow) / priorLow) * 100 : 0;

    // Must have 100%+ prior move
    if (priorRunPercent < 100) continue;

    // Check for tight consolidation (15-25 days, 10-25% correction)
    const consolidationPrices = prices.slice(i - 25, i + 1);
    const consolidationHigh = Math.max(...consolidationPrices.map(p => parseFloat(p.high?.toString() || '0')));
    const consolidationLow = Math.min(...consolidationPrices.map(p => parseFloat(p.low?.toString() || '0')));
    const correction = consolidationHigh > 0 ? ((consolidationHigh - consolidationLow) / consolidationHigh) * 100 : 0;

    if (correction >= 10 && correction <= 25) {
      setups.push({
        symbol,
        setupDate: prices[i].date,
        setupType: SETUP_TYPES.HIGH_TIGHT_FLAG,
        gapPercent: 0,
        volumeRatio: 1,
        epsSurprisePercent: null,
        priceRunId: null,
        earningsId: null,
        catalystType: null,
        consolidationDays: 25,
        consolidationRange: Math.round(correction * 100) / 100,
        priorRunPercent: Math.round(priorRunPercent * 100) / 100,
      });
    }
  }

  return setups;
}

/**
 * Detect all setup types for a symbol and save to database
 */
export async function detectAllSetups(symbol: string): Promise<number> {
  const allSetups: SetupCandidate[] = [];

  // Run all detection algorithms
  const [epSetups, pegSetups, flagSetups, htfSetups] = await Promise.all([
    detectEPSetups(symbol),
    detectPowerEarningsGapSetups(symbol),
    detectFlagSetups(symbol),
    detectHighTightFlagSetups(symbol),
  ]);

  allSetups.push(...epSetups, ...pegSetups, ...flagSetups, ...htfSetups);

  if (allSetups.length === 0) return 0;

  // Convert to database records
  const records: NewSetup[] = allSetups.map(setup => ({
    symbol: setup.symbol,
    setupType: setup.setupType,
    setupDate: setup.setupDate,
    catalystType: setup.catalystType,
    earningsId: setup.earningsId,
    priceRunId: setup.priceRunId,
    gapPercent: setup.gapPercent.toString(),
    volumeRatio: setup.volumeRatio.toString(),
    epsSurprisePercent: setup.epsSurprisePercent?.toString(),
    consolidationDays: setup.consolidationDays,
    consolidationRange: setup.consolidationRange?.toString(),
    priorRunPercent: setup.priorRunPercent?.toString(),
    isAutoDetected: true,
    detectionConfidence: '80', // Default confidence
    outcome: 'pending',
  }));

  await db.insert(setups)
    .values(records)
    .onConflictDoNothing();

  // Load intraday data for detected setups
  for (const setup of allSetups.slice(0, 10)) { // Limit to first 10 to avoid API overload
    await backfillIntradayForSetup(setup.symbol, setup.setupDate);
  }

  return records.length;
}

/**
 * Track outcomes for detected setups
 */
export async function trackSetupOutcomes(symbol: string): Promise<void> {
  // Get all pending setups for the symbol
  const pendingSetups = await db.select()
    .from(setups)
    .where(and(
      eq(setups.symbol, symbol),
      eq(setups.outcome, 'pending')
    ));

  if (pendingSetups.length === 0) return;

  const prices = await db.select()
    .from(dailyPrices)
    .where(eq(dailyPrices.symbol, symbol))
    .orderBy(dailyPrices.date);

  for (const setup of pendingSetups) {
    const setupIndex = prices.findIndex(p => p.date === setup.setupDate);
    if (setupIndex === -1) continue;

    // Look at prices after setup date
    const futurePrices = prices.slice(setupIndex);
    if (futurePrices.length < 20) continue; // Need at least 20 days to evaluate

    const entryPrice = parseFloat(futurePrices[0].close?.toString() || '0');
    if (entryPrice === 0) continue;

    // Calculate max gain and check for stop-out
    let maxGain = 0;
    let stoppedOut = false;
    const stopLossPercent = -8; // 8% stop loss

    for (let i = 1; i < Math.min(futurePrices.length, 60); i++) {
      const currentLow = parseFloat(futurePrices[i].low?.toString() || '0');
      const currentHigh = parseFloat(futurePrices[i].high?.toString() || '0');

      const gainFromHigh = ((currentHigh - entryPrice) / entryPrice) * 100;
      const lossFromLow = ((currentLow - entryPrice) / entryPrice) * 100;

      if (gainFromHigh > maxGain) maxGain = gainFromHigh;

      if (lossFromLow <= stopLossPercent) {
        stoppedOut = true;
        break;
      }
    }

    // Determine outcome
    let outcome: 'winner' | 'loser';
    if (stoppedOut) {
      outcome = 'loser';
    } else if (maxGain >= 20) {
      outcome = 'winner';
    } else {
      outcome = 'loser'; // Didn't reach 20% gain
    }

    await db.update(setups)
      .set({
        outcome,
        entryPrice: entryPrice.toString(),
        maxGainPercent: Math.round(maxGain * 100) / 100 + '',
        stoppedOut,
        updatedAt: new Date(),
      })
      .where(eq(setups.id, setup.id));
  }
}
