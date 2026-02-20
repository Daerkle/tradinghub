"use client";

import { Parse, initializeParse } from "./parse";
import { getMarketDateKey, getMarketWeekdayIndex } from "./market-time";
import { buildTradeIdentityKey } from "./trade-import";

// Type definitions
export interface TradeData {
  id: string;
  symbol: string;
  side: "long" | "short";
  entryPrice: number;
  exitPrice: number;
  entryTime: Date;
  exitTime: Date;
  quantity: number;
  pnl: number;
  commission: number;
  setup?: string;
  notes?: string;
  screenshots?: string[];
  mfe?: number;
  mae?: number;
  importSource?: string;
  importHash?: string;
}

export interface DiaryData {
  id: string;
  date: Date;
  title: string;
  content: string;
  mood: "positive" | "neutral" | "negative";
  pnl: number;
  tags: string[];
  images?: string[];
  linkedTrades?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PlaybookData {
  id: string;
  name: string;
  description: string;
  rules: string[];
  winRate: number;
  avgPnl: number;
  trades: number;
  tags: string[];
}

export interface NoteData {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  folderId?: string;
  isPinned?: boolean;
  isTemplate?: boolean;
  templateName?: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteFolderData {
  id: string;
  name: string;
  icon: string;
  color: string;
  parentId?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  icon: string;
}

export interface ScreenshotData {
  id: string;
  title: string;
  description: string;
  date: Date;
  symbol: string;
  setup: string;
  imageUrl: string;
  tradeId?: string;
  createdAt: Date;
}

export interface VideoData {
  id: string;
  title: string;
  description: string;
  date: Date;
  duration: string;
  category: "recap" | "analysis" | "review" | "other";
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: Date;
}

export interface TradingPlanData {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  // Risk Management
  maxDailyLoss: number;
  maxDailyTrades: number;
  maxPositionSize: number;
  riskPerTrade: number;
  // Trading Rules
  entryRules: string[];
  exitRules: string[];
  stopLossRules: string[];
  // Session
  tradingHoursStart: string;
  tradingHoursEnd: string;
  tradingDays: string[];
  // Setup Conditions
  preferredSetups: string[];
  avoidConditions: string[];
  // Goals
  dailyProfitTarget: number;
  weeklyProfitTarget: number;
  monthlyProfitTarget: number;
  // Tracking
  createdAt: Date;
  updatedAt: Date;
}

export interface PerformanceByHour {
  hour: number;
  pnl: number;
  trades: number;
  winRate: number;
}

export interface DashboardStats {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  // Composite performance score
  performanceScore: number;
  consistency: number;
  riskReward: number;
  avgRMultiple: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winStreak: number;
  lossStreak: number;
  avgHoldTime: number; // in minutes
  expectancy: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  pnl: number;
  drawdown: number;
}

export interface PerformanceByDay {
  day: string;
  dayName: string;
  pnl: number;
  trades: number;
  winRate: number;
}

export interface PerformanceBySymbol {
  symbol: string;
  pnl: number;
  trades: number;
  winRate: number;
  avgPnl: number;
}

export interface PerformanceBySetup {
  setup: string;
  pnl: number;
  trades: number;
  winRate: number;
  avgPnl: number;
}

export interface DailyPnL {
  date: string;
  pnl: number;
  trades: number;
}

function isTradeSchemaAddFieldError(error: unknown): boolean {
  const message =
    typeof error === "object" && error && "message" in error && typeof error.message === "string"
      ? error.message
      : String(error ?? "");
  return /Permission denied for action addField on class trades/i.test(message);
}

function toLocalDateKey(value: Date | string): string {
  // Trades should be bucketed by market day (New York), not by the viewer's local time zone.
  // Otherwise after-hours trades can appear on "Saturday" in EU time zones.
  return getMarketDateKey(new Date(value));
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const normalizedSize = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += normalizedSize) {
    chunks.push(items.slice(i, i + normalizedSize));
  }
  return chunks;
}

// Trade Service
export const TradeService = {
  async getAll(): Promise<TradeData[]> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const query = new Parse.Query(Trade);
    query.equalTo("user", Parse.User.current());
    query.descending("exitTime");
    query.limit(1000);

    const results = await query.find();
    return results.map((trade) => ({
      id: trade.id ?? "",
      symbol: trade.get("symbol"),
      side: trade.get("side"),
      entryPrice: trade.get("entryPrice"),
      exitPrice: trade.get("exitPrice"),
      entryTime: trade.get("entryTime"),
      exitTime: trade.get("exitTime"),
      quantity: trade.get("quantity"),
      pnl: trade.get("pnl"),
      commission: trade.get("commission") || 0,
      setup: trade.get("setup"),
      notes: trade.get("notes"),
      screenshots: trade.get("screenshots"),
      mfe: trade.get("mfe"),
      mae: trade.get("mae"),
      importSource: trade.get("importSource"),
      importHash: trade.get("importHash"),
    }));
  },

  async getByDateRange(start: Date, end: Date): Promise<TradeData[]> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const query = new Parse.Query(Trade);
    query.equalTo("user", Parse.User.current());
    query.greaterThanOrEqualTo("exitTime", start);
    query.lessThanOrEqualTo("exitTime", end);
    query.descending("exitTime");

    const results = await query.find();
    return results.map((trade) => ({
      id: trade.id ?? "",
      symbol: trade.get("symbol"),
      side: trade.get("side"),
      entryPrice: trade.get("entryPrice"),
      exitPrice: trade.get("exitPrice"),
      entryTime: trade.get("entryTime"),
      exitTime: trade.get("exitTime"),
      quantity: trade.get("quantity"),
      pnl: trade.get("pnl"),
      commission: trade.get("commission") || 0,
      setup: trade.get("setup"),
      notes: trade.get("notes"),
      screenshots: trade.get("screenshots"),
      mfe: trade.get("mfe"),
      mae: trade.get("mae"),
      importSource: trade.get("importSource"),
      importHash: trade.get("importHash"),
    }));
  },

  async create(data: Omit<TradeData, "id">): Promise<TradeData> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const trade = new Trade();

    trade.set("user", Parse.User.current());
    trade.set("symbol", data.symbol);
    trade.set("side", data.side);
    trade.set("entryPrice", data.entryPrice);
    trade.set("exitPrice", data.exitPrice);
    trade.set("entryTime", data.entryTime);
    trade.set("exitTime", data.exitTime);
    trade.set("quantity", data.quantity);
    trade.set("pnl", data.pnl);
    trade.set("commission", data.commission);
    trade.set("setup", data.setup);
    trade.set("notes", data.notes);
    trade.set("screenshots", data.screenshots);
    trade.set("mfe", data.mfe);
    trade.set("mae", data.mae);
    if (data.importSource !== undefined) trade.set("importSource", data.importSource);
    if (data.importHash !== undefined) trade.set("importHash", data.importHash);

    let result;
    try {
      result = await trade.save();
    } catch (error) {
      if (!isTradeSchemaAddFieldError(error)) throw error;
      trade.unset("importSource");
      trade.unset("importHash");
      result = await trade.save();
    }
    return { ...data, id: result.id ?? "" };
  },

  async createBatch(trades: Omit<TradeData, "id">[]): Promise<TradeData[]> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const objects = trades.map((data) => {
      const trade = new Trade();
      trade.set("user", Parse.User.current());
      trade.set("symbol", data.symbol);
      trade.set("side", data.side);
      trade.set("entryPrice", data.entryPrice);
      trade.set("exitPrice", data.exitPrice);
      trade.set("entryTime", data.entryTime);
      trade.set("exitTime", data.exitTime);
      trade.set("quantity", data.quantity);
      trade.set("pnl", data.pnl);
      trade.set("commission", data.commission);
      trade.set("setup", data.setup);
      trade.set("notes", data.notes);
      trade.set("mfe", data.mfe);
      trade.set("mae", data.mae);
      if (data.importSource !== undefined) trade.set("importSource", data.importSource);
      if (data.importHash !== undefined) trade.set("importHash", data.importHash);
      return trade;
    });

    let results;
    try {
      results = await Parse.Object.saveAll(objects);
    } catch (error) {
      if (!isTradeSchemaAddFieldError(error)) throw error;
      for (const object of objects) {
        object.unset("importSource");
        object.unset("importHash");
      }
      results = await Parse.Object.saveAll(objects);
    }
    return results.map((result, i) => ({ ...trades[i], id: result.id ?? "" }));
  },

  async findExistingImportHashes(importHashes: string[]): Promise<Set<string>> {
    initializeParse();
    const uniqueHashes = [...new Set(importHashes.filter(Boolean))];
    const existing = new Set<string>();
    if (uniqueHashes.length === 0) return existing;

    const Trade = Parse.Object.extend("trades");
    const chunkSize = 100;

    for (let i = 0; i < uniqueHashes.length; i += chunkSize) {
      const chunk = uniqueHashes.slice(i, i + chunkSize);
      const query = new Parse.Query(Trade);
      query.equalTo("user", Parse.User.current());
      query.containedIn("importHash", chunk);
      query.select("importHash");
      query.limit(1000);

      const results = await query.find();
      for (const trade of results) {
        const hash = trade.get("importHash");
        if (typeof hash === "string" && hash.length > 0) {
          existing.add(hash);
        }
      }
    }

    return existing;
  },

  async findExistingTradeIdentityKeys(
    candidates: Array<Pick<TradeData, "symbol" | "side" | "entryPrice" | "exitPrice" | "entryTime" | "exitTime" | "quantity">>
  ): Promise<Set<string>> {
    initializeParse();
    const existing = new Set<string>();
    if (candidates.length === 0) return existing;

    const symbols = [
      ...new Set(
        candidates
          .map((trade) => trade.symbol.toUpperCase().trim())
          .filter((symbol) => symbol.length > 0)
      ),
    ];

    const timestamps = candidates
      .flatMap((trade) => [new Date(trade.entryTime).getTime(), new Date(trade.exitTime).getTime()])
      .filter((ts) => Number.isFinite(ts));

    if (symbols.length === 0 || timestamps.length === 0) return existing;

    const DAY_MS = 24 * 60 * 60 * 1000;
    const minDate = new Date(Math.min(...timestamps) - DAY_MS);
    const maxDate = new Date(Math.max(...timestamps) + DAY_MS);

    const Trade = Parse.Object.extend("trades");
    const symbolChunks = chunkArray(symbols, 40);
    const pageSize = 1000;

    for (const symbolChunk of symbolChunks) {
      let skip = 0;

      while (true) {
        const query = new Parse.Query(Trade);
        query.equalTo("user", Parse.User.current());
        query.containedIn("symbol", symbolChunk);
        query.greaterThanOrEqualTo("exitTime", minDate);
        query.lessThanOrEqualTo("entryTime", maxDate);
        query.select("symbol", "side", "entryPrice", "exitPrice", "entryTime", "exitTime", "quantity");
        query.limit(pageSize);
        query.skip(skip);

        const results = await query.find();
        if (results.length === 0) break;

        for (const trade of results) {
          const symbol = String(trade.get("symbol") || "").toUpperCase().trim();
          const sideRaw = trade.get("side");
          const side = sideRaw === "short" ? "short" : sideRaw === "long" ? "long" : null;
          const entryPrice = Number(trade.get("entryPrice"));
          const exitPrice = Number(trade.get("exitPrice"));
          const quantity = Number(trade.get("quantity"));
          const entryTime = trade.get("entryTime");
          const exitTime = trade.get("exitTime");

          if (!symbol || !side) continue;
          if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(quantity)) continue;
          if (!(entryTime instanceof Date) || !(exitTime instanceof Date)) continue;

          existing.add(
            buildTradeIdentityKey({
              symbol,
              side,
              entryPrice,
              exitPrice,
              entryTime,
              exitTime,
              quantity,
            })
          );
        }

        if (results.length < pageSize) break;
        skip += pageSize;
      }
    }

    return existing;
  },

  async getById(id: string): Promise<TradeData | null> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const query = new Parse.Query(Trade);

    try {
      const trade = await query.get(id);
      return {
        id: trade.id ?? "",
        symbol: trade.get("symbol"),
        side: trade.get("side"),
        entryPrice: trade.get("entryPrice"),
        exitPrice: trade.get("exitPrice"),
        entryTime: trade.get("entryTime"),
        exitTime: trade.get("exitTime"),
        quantity: trade.get("quantity"),
        pnl: trade.get("pnl"),
        commission: trade.get("commission") || 0,
        setup: trade.get("setup"),
        notes: trade.get("notes"),
        screenshots: trade.get("screenshots"),
        mfe: trade.get("mfe"),
        mae: trade.get("mae"),
        importSource: trade.get("importSource"),
        importHash: trade.get("importHash"),
      };
    } catch {
      return null;
    }
  },

  async update(id: string, data: Partial<TradeData>): Promise<void> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const query = new Parse.Query(Trade);
    const trade = await query.get(id);

    if (data.symbol) trade.set("symbol", data.symbol);
    if (data.side) trade.set("side", data.side);
    if (data.entryPrice !== undefined) trade.set("entryPrice", data.entryPrice);
    if (data.exitPrice !== undefined) trade.set("exitPrice", data.exitPrice);
    if (data.entryTime) trade.set("entryTime", data.entryTime);
    if (data.exitTime) trade.set("exitTime", data.exitTime);
    if (data.quantity !== undefined) trade.set("quantity", data.quantity);
    if (data.pnl !== undefined) trade.set("pnl", data.pnl);
    if (data.commission !== undefined) trade.set("commission", data.commission);
    if (data.setup !== undefined) trade.set("setup", data.setup);
    if (data.notes !== undefined) trade.set("notes", data.notes);
    if (data.screenshots) trade.set("screenshots", data.screenshots);
    if (data.mfe !== undefined) trade.set("mfe", data.mfe);
    if (data.mae !== undefined) trade.set("mae", data.mae);
    if (data.importSource !== undefined) trade.set("importSource", data.importSource);
    if (data.importHash !== undefined) trade.set("importHash", data.importHash);

    try {
      await trade.save();
    } catch (error) {
      if (!isTradeSchemaAddFieldError(error)) throw error;
      if (data.importSource !== undefined) trade.unset("importSource");
      if (data.importHash !== undefined) trade.unset("importHash");
      await trade.save();
    }
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const query = new Parse.Query(Trade);
    const trade = await query.get(id);
    await trade.destroy();
  },

  async getStats(): Promise<DashboardStats> {
    initializeParse();
    const trades = await this.getAll();

    if (trades.length === 0) {
      return {
        totalPnl: 0,
        winRate: 0,
        totalTrades: 0,
        profitFactor: 0,
        avgWin: 0,
        avgLoss: 0,
        bestTrade: 0,
        worstTrade: 0,
        performanceScore: 0,
        consistency: 0,
        riskReward: 0,
        avgRMultiple: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        winStreak: 0,
        lossStreak: 0,
        avgHoldTime: 0,
        expectancy: 0,
      };
    }

    const wins = trades.filter((t) => t.pnl > 0);
    const losses = trades.filter((t) => t.pnl < 0);
    const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const winRate = (wins.length / trades.length) * 100;
    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Calculate streaks
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    const sortedTrades = [...trades].sort((a, b) =>
      new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime()
    );

    for (const trade of sortedTrades) {
      if (trade.pnl > 0) {
        currentWinStreak++;
        currentLossStreak = 0;
        maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
      } else if (trade.pnl < 0) {
        currentLossStreak++;
        currentWinStreak = 0;
        maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
      }
    }

    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnl = 0;
    for (const trade of sortedTrades) {
      runningPnl += trade.pnl;
      if (runningPnl > peak) peak = runningPnl;
      const drawdown = peak > 0 ? ((peak - runningPnl) / peak) * 100 : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    // Calculate average hold time in minutes
    let totalHoldTime = 0;
    let validHoldTimes = 0;
    for (const trade of trades) {
      if (trade.entryTime && trade.exitTime) {
        const holdTime = (new Date(trade.exitTime).getTime() - new Date(trade.entryTime).getTime()) / 60000;
        if (holdTime > 0) {
          totalHoldTime += holdTime;
          validHoldTimes++;
        }
      }
    }
    const avgHoldTime = validHoldTimes > 0 ? totalHoldTime / validHoldTimes : 0;

    // Risk/Reward ratio
    const riskReward = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Expectancy (average $ won/lost per trade)
    const expectancy = trades.length > 0 ? totalPnl / trades.length : 0;

    // Sharpe Ratio (simplified)
    const returns = trades.map(t => t.pnl);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0; // Annualized

    // Consistency (percentage of profitable days)
    const dailyPnLMap = new Map<string, number>();
    for (const trade of trades) {
      const dateKey = toLocalDateKey(trade.exitTime);
      dailyPnLMap.set(dateKey, (dailyPnLMap.get(dateKey) || 0) + trade.pnl);
    }
    const profitableDays = Array.from(dailyPnLMap.values()).filter(pnl => pnl > 0).length;
    const consistency = dailyPnLMap.size > 0 ? (profitableDays / dailyPnLMap.size) * 100 : 0;

    // Average R-Multiple (if we had risk data, simplified here)
    const avgRMultiple = avgLoss > 0 ? expectancy / avgLoss : 0;

    // Performance Score (composite score 0-100)
    // Weighted formula based on key trading metrics
    const normalizedWinRate = Math.min(winRate / 100, 1) * 25; // max 25 points
    const normalizedProfitFactor = Math.min((profitFactor === Infinity ? 5 : profitFactor) / 5, 1) * 25; // max 25 points
    const normalizedConsistency = (consistency / 100) * 20; // max 20 points
    const normalizedRiskReward = Math.min((riskReward === Infinity ? 5 : riskReward) / 5, 1) * 15; // max 15 points
    const normalizedDrawdown = Math.max(0, (100 - maxDrawdown) / 100) * 15; // max 15 points (lower is better)
    const performanceScore = Math.round(normalizedWinRate + normalizedProfitFactor + normalizedConsistency + normalizedRiskReward + normalizedDrawdown);

    return {
      totalPnl,
      winRate,
      totalTrades: trades.length,
      profitFactor: profitFactor === Infinity ? 999 : profitFactor,
      avgWin,
      avgLoss,
      bestTrade: Math.max(...trades.map((t) => t.pnl)),
      worstTrade: Math.min(...trades.map((t) => t.pnl)),
      performanceScore,
      consistency,
      riskReward: riskReward === Infinity ? 999 : riskReward,
      avgRMultiple,
      maxDrawdown,
      sharpeRatio,
      winStreak: maxWinStreak,
      lossStreak: maxLossStreak,
      avgHoldTime,
      expectancy,
    };
  },

  async getEquityCurve(): Promise<EquityPoint[]> {
    initializeParse();
    const trades = await this.getAll();

    if (trades.length === 0) return [];

    const sortedTrades = [...trades].sort((a, b) =>
      new Date(a.exitTime).getTime() - new Date(b.exitTime).getTime()
    );

    let equity = 0;
    let peak = 0;
    const equityPoints: EquityPoint[] = [];

    for (const trade of sortedTrades) {
      equity += trade.pnl;
      if (equity > peak) peak = equity;
      const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

      equityPoints.push({
        date: toLocalDateKey(trade.exitTime),
        equity,
        pnl: trade.pnl,
        drawdown,
      });
    }

    return equityPoints;
  },

  async getPerformanceByDay(): Promise<PerformanceByDay[]> {
    initializeParse();
    const trades = await this.getAll();

    const dayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const dayStats = new Map<number, { pnl: number; wins: number; total: number }>();

    for (const trade of trades) {
      const day = getMarketWeekdayIndex(new Date(trade.exitTime));
      const current = dayStats.get(day) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += trade.pnl;
      current.total++;
      if (trade.pnl > 0) current.wins++;
      dayStats.set(day, current);
    }

    return Array.from(dayStats.entries())
      .map(([day, stats]) => ({
        day: String(day),
        dayName: dayNames[day],
        pnl: stats.pnl,
        trades: stats.total,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
      }))
      .sort((a, b) => parseInt(a.day) - parseInt(b.day));
  },

  async getPerformanceBySymbol(): Promise<PerformanceBySymbol[]> {
    initializeParse();
    const trades = await this.getAll();

    const symbolStats = new Map<string, { pnl: number; wins: number; total: number }>();

    for (const trade of trades) {
      const current = symbolStats.get(trade.symbol) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += trade.pnl;
      current.total++;
      if (trade.pnl > 0) current.wins++;
      symbolStats.set(trade.symbol, current);
    }

    return Array.from(symbolStats.entries())
      .map(([symbol, stats]) => ({
        symbol,
        pnl: stats.pnl,
        trades: stats.total,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        avgPnl: stats.total > 0 ? stats.pnl / stats.total : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  },

  async getPerformanceBySetup(): Promise<PerformanceBySetup[]> {
    initializeParse();
    const trades = await this.getAll();

    const setupStats = new Map<string, { pnl: number; wins: number; total: number }>();

    for (const trade of trades) {
      const setup = trade.setup || "Kein Setup";
      const current = setupStats.get(setup) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += trade.pnl;
      current.total++;
      if (trade.pnl > 0) current.wins++;
      setupStats.set(setup, current);
    }

    return Array.from(setupStats.entries())
      .map(([setup, stats]) => ({
        setup,
        pnl: stats.pnl,
        trades: stats.total,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
        avgPnl: stats.total > 0 ? stats.pnl / stats.total : 0,
      }))
      .sort((a, b) => b.pnl - a.pnl);
  },

  async getRecentTrades(limit: number = 10): Promise<TradeData[]> {
    initializeParse();
    const Trade = Parse.Object.extend("trades");
    const query = new Parse.Query(Trade);
    query.equalTo("user", Parse.User.current());
    query.descending("exitTime");
    query.limit(limit);

    const results = await query.find();
    return results.map((trade) => ({
      id: trade.id ?? "",
      symbol: trade.get("symbol"),
      side: trade.get("side"),
      entryPrice: trade.get("entryPrice"),
      exitPrice: trade.get("exitPrice"),
      entryTime: trade.get("entryTime"),
      exitTime: trade.get("exitTime"),
      quantity: trade.get("quantity"),
      pnl: trade.get("pnl"),
      commission: trade.get("commission") || 0,
      setup: trade.get("setup"),
      notes: trade.get("notes"),
      screenshots: trade.get("screenshots"),
      mfe: trade.get("mfe"),
      mae: trade.get("mae"),
    }));
  },
};

// Diary Service
export const DiaryService = {
  async getAll(): Promise<DiaryData[]> {
    initializeParse();
    const Diary = Parse.Object.extend("diaries");
    const query = new Parse.Query(Diary);
    query.equalTo("user", Parse.User.current());
    query.descending("date");

    const results = await query.find();
    return results.map((entry) => ({
      id: entry.id ?? "",
      date: entry.get("date"),
      title: entry.get("title"),
      content: entry.get("content"),
      mood: entry.get("mood"),
      pnl: entry.get("pnl") || 0,
      tags: entry.get("tags") || [],
      images: entry.get("images") || [],
      linkedTrades: entry.get("linkedTrades") || [],
      createdAt: entry.get("createdAt"),
      updatedAt: entry.get("updatedAt"),
    }));
  },

  async getById(id: string): Promise<DiaryData | null> {
    initializeParse();
    const Diary = Parse.Object.extend("diaries");
    const query = new Parse.Query(Diary);

    try {
      const entry = await query.get(id);
      return {
        id: entry.id ?? "",
        date: entry.get("date"),
        title: entry.get("title"),
        content: entry.get("content"),
        mood: entry.get("mood"),
        pnl: entry.get("pnl") || 0,
        tags: entry.get("tags") || [],
        images: entry.get("images") || [],
        linkedTrades: entry.get("linkedTrades") || [],
        createdAt: entry.get("createdAt"),
        updatedAt: entry.get("updatedAt"),
      };
    } catch {
      return null;
    }
  },

  async create(data: Omit<DiaryData, "id" | "createdAt" | "updatedAt">): Promise<DiaryData> {
    initializeParse();
    const Diary = Parse.Object.extend("diaries");
    const entry = new Diary();

    entry.set("user", Parse.User.current());
    entry.set("date", data.date);
    entry.set("title", data.title);
    entry.set("content", data.content);
    entry.set("mood", data.mood);
    entry.set("pnl", data.pnl);
    entry.set("tags", data.tags);
    entry.set("images", data.images || []);
    entry.set("linkedTrades", data.linkedTrades || []);

    const result = await entry.save();
    return {
      ...data,
      id: result.id ?? "",
      createdAt: result.get("createdAt"),
      updatedAt: result.get("updatedAt"),
    };
  },

  async update(id: string, data: Partial<DiaryData>): Promise<void> {
    initializeParse();
    const Diary = Parse.Object.extend("diaries");
    const query = new Parse.Query(Diary);
    const entry = await query.get(id);

    if (data.title !== undefined) entry.set("title", data.title);
    if (data.content !== undefined) entry.set("content", data.content);
    if (data.mood) entry.set("mood", data.mood);
    if (data.pnl !== undefined) entry.set("pnl", data.pnl);
    if (data.tags) entry.set("tags", data.tags);
    if (data.images) entry.set("images", data.images);
    if (data.linkedTrades) entry.set("linkedTrades", data.linkedTrades);

    await entry.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const Diary = Parse.Object.extend("diaries");
    const query = new Parse.Query(Diary);
    const entry = await query.get(id);
    await entry.destroy();
  },
};

// Playbook Service
export const PlaybookService = {
  async getAll(): Promise<PlaybookData[]> {
    initializeParse();
    const Playbook = Parse.Object.extend("playbooks");
    const query = new Parse.Query(Playbook);
    query.equalTo("user", Parse.User.current());
    query.descending("createdAt");

    const results = await query.find();
    return results.map((setup) => ({
      id: setup.id ?? "",
      name: setup.get("name"),
      description: setup.get("description"),
      rules: setup.get("rules") || [],
      winRate: setup.get("winRate") || 0,
      avgPnl: setup.get("avgPnl") || 0,
      trades: setup.get("trades") || 0,
      tags: setup.get("tags") || [],
    }));
  },

  async create(data: Omit<PlaybookData, "id">): Promise<PlaybookData> {
    initializeParse();
    const Playbook = Parse.Object.extend("playbooks");
    const setup = new Playbook();

    setup.set("user", Parse.User.current());
    setup.set("name", data.name);
    setup.set("description", data.description);
    setup.set("rules", data.rules);
    setup.set("winRate", data.winRate);
    setup.set("avgPnl", data.avgPnl);
    setup.set("trades", data.trades);
    setup.set("tags", data.tags);

    const result = await setup.save();
    return { ...data, id: result.id ?? "" };
  },

  async update(id: string, data: Partial<PlaybookData>): Promise<void> {
    initializeParse();
    const Playbook = Parse.Object.extend("playbooks");
    const query = new Parse.Query(Playbook);
    const setup = await query.get(id);

    if (data.name) setup.set("name", data.name);
    if (data.description) setup.set("description", data.description);
    if (data.rules) setup.set("rules", data.rules);
    if (data.winRate !== undefined) setup.set("winRate", data.winRate);
    if (data.avgPnl !== undefined) setup.set("avgPnl", data.avgPnl);
    if (data.trades !== undefined) setup.set("trades", data.trades);
    if (data.tags) setup.set("tags", data.tags);

    await setup.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const Playbook = Parse.Object.extend("playbooks");
    const query = new Parse.Query(Playbook);
    const setup = await query.get(id);
    await setup.destroy();
  },
};

// Note Service
export const NoteService = {
  async getAll(): Promise<NoteData[]> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    query.equalTo("user", Parse.User.current());
    query.descending("updatedAt");

    const results = await query.find();
    return results.map((note) => ({
      id: note.id ?? "",
      title: note.get("title"),
      content: note.get("content"),
      category: note.get("category") || "general",
      tags: note.get("tags") || [],
      folderId: note.get("folderId"),
      isPinned: note.get("isPinned") || false,
      isTemplate: note.get("isTemplate") || false,
      templateName: note.get("templateName"),
      color: note.get("color"),
      createdAt: note.get("createdAt"),
      updatedAt: note.get("updatedAt"),
    }));
  },

  async getByFolder(folderId: string | null): Promise<NoteData[]> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    query.equalTo("user", Parse.User.current());
    if (folderId) {
      query.equalTo("folderId", folderId);
    } else {
      query.doesNotExist("folderId");
    }
    query.descending("isPinned");
    query.addDescending("updatedAt");

    const results = await query.find();
    return results.map((note) => ({
      id: note.id ?? "",
      title: note.get("title"),
      content: note.get("content"),
      category: note.get("category") || "general",
      tags: note.get("tags") || [],
      folderId: note.get("folderId"),
      isPinned: note.get("isPinned") || false,
      isTemplate: note.get("isTemplate") || false,
      templateName: note.get("templateName"),
      color: note.get("color"),
      createdAt: note.get("createdAt"),
      updatedAt: note.get("updatedAt"),
    }));
  },

  async getById(id: string): Promise<NoteData | null> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    try {
      const note = await query.get(id);
      return {
        id: note.id ?? "",
        title: note.get("title"),
        content: note.get("content"),
        category: note.get("category") || "general",
        tags: note.get("tags") || [],
        folderId: note.get("folderId"),
        isPinned: note.get("isPinned") || false,
        isTemplate: note.get("isTemplate") || false,
        templateName: note.get("templateName"),
        color: note.get("color"),
        createdAt: note.get("createdAt"),
        updatedAt: note.get("updatedAt"),
      };
    } catch {
      return null;
    }
  },

  async create(data: Omit<NoteData, "id" | "createdAt" | "updatedAt">): Promise<NoteData> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const note = new Note();

    note.set("user", Parse.User.current());
    note.set("title", data.title);
    note.set("content", data.content);
    note.set("category", data.category);
    note.set("tags", data.tags);
    if (data.folderId) note.set("folderId", data.folderId);
    if (data.isPinned) note.set("isPinned", data.isPinned);
    if (data.isTemplate) note.set("isTemplate", data.isTemplate);
    if (data.templateName) note.set("templateName", data.templateName);
    if (data.color) note.set("color", data.color);

    const result = await note.save();
    return {
      ...data,
      id: result.id ?? "",
      createdAt: result.get("createdAt"),
      updatedAt: result.get("updatedAt"),
    };
  },

  async update(id: string, data: Partial<NoteData>): Promise<void> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    const note = await query.get(id);

    if (data.title !== undefined) note.set("title", data.title);
    if (data.content !== undefined) note.set("content", data.content);
    if (data.category !== undefined) note.set("category", data.category);
    if (data.tags !== undefined) note.set("tags", data.tags);
    if (data.folderId !== undefined) note.set("folderId", data.folderId);
    if (data.isPinned !== undefined) note.set("isPinned", data.isPinned);
    if (data.isTemplate !== undefined) note.set("isTemplate", data.isTemplate);
    if (data.templateName !== undefined) note.set("templateName", data.templateName);
    if (data.color !== undefined) note.set("color", data.color);

    await note.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    const note = await query.get(id);
    await note.destroy();
  },

  async togglePin(id: string): Promise<boolean> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    const note = await query.get(id);
    const newPinned = !note.get("isPinned");
    note.set("isPinned", newPinned);
    await note.save();
    return newPinned;
  },

  async moveToFolder(id: string, folderId: string | null): Promise<void> {
    initializeParse();
    const Note = Parse.Object.extend("notes");
    const query = new Parse.Query(Note);
    const note = await query.get(id);
    if (folderId) {
      note.set("folderId", folderId);
    } else {
      note.unset("folderId");
    }
    await note.save();
  },
};

// Note Folder Service
export const NoteFolderService = {
  async getAll(): Promise<NoteFolderData[]> {
    initializeParse();
    const NoteFolder = Parse.Object.extend("note_folders");
    const query = new Parse.Query(NoteFolder);
    query.equalTo("user", Parse.User.current());
    query.ascending("order");

    const results = await query.find();
    return results.map((folder) => ({
      id: folder.id ?? "",
      name: folder.get("name"),
      icon: folder.get("icon") || "folder",
      color: folder.get("color") || "gray",
      parentId: folder.get("parentId"),
      order: folder.get("order") || 0,
      createdAt: folder.get("createdAt"),
      updatedAt: folder.get("updatedAt"),
    }));
  },

  async create(data: Omit<NoteFolderData, "id" | "createdAt" | "updatedAt">): Promise<NoteFolderData> {
    initializeParse();
    const NoteFolder = Parse.Object.extend("note_folders");
    const folder = new NoteFolder();

    folder.set("user", Parse.User.current());
    folder.set("name", data.name);
    folder.set("icon", data.icon);
    folder.set("color", data.color);
    folder.set("order", data.order);
    if (data.parentId) folder.set("parentId", data.parentId);

    const result = await folder.save();
    return {
      ...data,
      id: result.id ?? "",
      createdAt: result.get("createdAt"),
      updatedAt: result.get("updatedAt"),
    };
  },

  async update(id: string, data: Partial<NoteFolderData>): Promise<void> {
    initializeParse();
    const NoteFolder = Parse.Object.extend("note_folders");
    const query = new Parse.Query(NoteFolder);
    const folder = await query.get(id);

    if (data.name !== undefined) folder.set("name", data.name);
    if (data.icon !== undefined) folder.set("icon", data.icon);
    if (data.color !== undefined) folder.set("color", data.color);
    if (data.order !== undefined) folder.set("order", data.order);
    if (data.parentId !== undefined) {
      if (data.parentId) {
        folder.set("parentId", data.parentId);
      } else {
        folder.unset("parentId");
      }
    }

    await folder.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const NoteFolder = Parse.Object.extend("note_folders");
    const query = new Parse.Query(NoteFolder);
    const folder = await query.get(id);
    await folder.destroy();
  },
};

// Note Templates (predefined, not stored in DB)
export const NoteTemplates: NoteTemplate[] = [
  {
    id: "trading-plan",
    name: "Trading Plan",
    description: "Täglicher Trading-Plan mit Zielen und Regeln",
    icon: "target",
    category: "setups",
    content: `# Trading Plan - ${new Date().toLocaleDateString("de-DE")}

## Marktanalyse
- **Trend:**
- **Key Levels:**
- **News/Events:**

## Meine Setups für heute
1.
2.
3.

## Regeln für heute
- [ ] Max. Risiko pro Trade: 1%
- [ ] Max. Trades: 3
- [ ] Stopp nach 2 Verlusten

## Emotionaler Check
- Stimmung:
- Energie:
- Fokus:

## Notizen
`,
  },
  {
    id: "trade-review",
    name: "Trade Review",
    description: "Detaillierte Analyse eines einzelnen Trades",
    icon: "chart",
    category: "review",
    content: `# Trade Review

## Trade Details
- **Symbol:**
- **Datum:**
- **Seite:** Long / Short
- **Entry:**
- **Exit:**
- **P&L:**

## Setup & Begründung
- **Setup-Typ:**
- **Entry-Signal:**
- **Exit-Signal:**

## Was lief gut?
-

## Was kann verbessert werden?
-

## Lessons Learned
-

## Screenshots
`,
  },
  {
    id: "weekly-review",
    name: "Wochenrückblick",
    description: "Wöchentliche Performance-Analyse",
    icon: "calendar",
    category: "review",
    content: `# Wochenrückblick - KW

## Performance Übersicht
| Tag | P&L | Trades | Win Rate |
|-----|-----|--------|----------|
| Mo  |     |        |          |
| Di  |     |        |          |
| Mi  |     |        |          |
| Do  |     |        |          |
| Fr  |     |        |          |

**Gesamt P&L:**
**Win Rate:**

## Top 3 Trades
1.
2.
3.

## Worst 3 Trades
1.
2.
3.

## Erkenntnisse der Woche
-

## Ziele für nächste Woche
-

## Regeländerungen
-
`,
  },
  {
    id: "setup-documentation",
    name: "Setup Dokumentation",
    description: "Neues Trading-Setup dokumentieren",
    icon: "book",
    category: "setups",
    content: `# Setup: [Name]

## Übersicht
- **Typ:** Reversal / Breakout / Trend
- **Zeitrahmen:**
- **Beste Marktphase:**

## Entry Kriterien
1.
2.
3.

## Exit Kriterien
### Take Profit
-

### Stop Loss
-

## Beispiele
### Beispiel 1
- Datum:
- Symbol:
- Ergebnis:

## Statistiken
- **Win Rate:**
- **Avg R-Multiple:**
- **Beste Zeit:**

## Notizen
`,
  },
  {
    id: "mistake-log",
    name: "Fehlerprotokoll",
    description: "Trading-Fehler dokumentieren und lernen",
    icon: "alert",
    category: "mistakes",
    content: `# Fehlerprotokoll

## Fehler
- **Datum:**
- **Typ:** Übertrading / FOMO / Regelverletzung / Anderes
- **Trade:**
- **Verlust:**

## Was ist passiert?


## Warum ist es passiert?


## Wie vermeide ich es in Zukunft?
1.
2.
3.

## Erinnerung an mich selbst

`,
  },
  {
    id: "market-notes",
    name: "Marktnotizen",
    description: "Schnelle Marktbeobachtungen",
    icon: "globe",
    category: "market",
    content: `# Marktnotizen - ${new Date().toLocaleDateString("de-DE")}

## Beobachtungen
-

## Interessante Levels
| Symbol | Support | Resistance | Notiz |
|--------|---------|------------|-------|
|        |         |            |       |

## Ideen für morgen
-

## News & Events
-
`,
  },
];

// Calendar Data
export const CalendarService = {
  async getDailyPnL(startDate: Date, endDate: Date): Promise<DailyPnL[]> {
    initializeParse();
    const trades = await TradeService.getByDateRange(startDate, endDate);
    const dailyPnLMap = new Map<string, { pnl: number; trades: number }>();

    trades.forEach((trade) => {
      const dateKey = toLocalDateKey(trade.exitTime);
      const current = dailyPnLMap.get(dateKey) || { pnl: 0, trades: 0 };
      dailyPnLMap.set(dateKey, {
        pnl: current.pnl + trade.pnl,
        trades: current.trades + 1,
      });
    });

    const result: DailyPnL[] = [];
    dailyPnLMap.forEach((value, date) => {
      result.push({ date, pnl: value.pnl, trades: value.trades });
    });

    return result;
  },
};

// Screenshot Service
export const ScreenshotService = {
  async getAll(): Promise<ScreenshotData[]> {
    initializeParse();
    const Screenshot = Parse.Object.extend("screenshots");
    const query = new Parse.Query(Screenshot);
    query.equalTo("user", Parse.User.current());
    query.descending("date");

    const results = await query.find();
    return results.map((screenshot) => ({
      id: screenshot.id ?? "",
      title: screenshot.get("title"),
      description: screenshot.get("description") || "",
      date: screenshot.get("date"),
      symbol: screenshot.get("symbol") || "",
      setup: screenshot.get("setup") || "",
      imageUrl: screenshot.get("imageUrl") || "",
      tradeId: screenshot.get("tradeId"),
      createdAt: screenshot.get("createdAt"),
    }));
  },

  async create(data: Omit<ScreenshotData, "id" | "createdAt">): Promise<ScreenshotData> {
    initializeParse();
    const Screenshot = Parse.Object.extend("screenshots");
    const screenshot = new Screenshot();

    screenshot.set("user", Parse.User.current());
    screenshot.set("title", data.title);
    screenshot.set("description", data.description);
    screenshot.set("date", data.date);
    screenshot.set("symbol", data.symbol);
    screenshot.set("setup", data.setup);
    screenshot.set("imageUrl", data.imageUrl);
    if (data.tradeId) screenshot.set("tradeId", data.tradeId);

    const result = await screenshot.save();
    return {
      ...data,
      id: result.id ?? "",
      createdAt: result.get("createdAt"),
    };
  },

  async update(id: string, data: Partial<ScreenshotData>): Promise<void> {
    initializeParse();
    const Screenshot = Parse.Object.extend("screenshots");
    const query = new Parse.Query(Screenshot);
    const screenshot = await query.get(id);

    if (data.title) screenshot.set("title", data.title);
    if (data.description) screenshot.set("description", data.description);
    if (data.symbol) screenshot.set("symbol", data.symbol);
    if (data.setup) screenshot.set("setup", data.setup);
    if (data.imageUrl) screenshot.set("imageUrl", data.imageUrl);

    await screenshot.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const Screenshot = Parse.Object.extend("screenshots");
    const query = new Parse.Query(Screenshot);
    const screenshot = await query.get(id);
    await screenshot.destroy();
  },
};

// Video Service
export const VideoService = {
  async getAll(): Promise<VideoData[]> {
    initializeParse();
    const Video = Parse.Object.extend("videos");
    const query = new Parse.Query(Video);
    query.equalTo("user", Parse.User.current());
    query.descending("date");

    const results = await query.find();
    return results.map((video) => ({
      id: video.id ?? "",
      title: video.get("title"),
      description: video.get("description") || "",
      date: video.get("date"),
      duration: video.get("duration") || "0:00",
      category: video.get("category") || "other",
      videoUrl: video.get("videoUrl") || "",
      thumbnailUrl: video.get("thumbnailUrl"),
      createdAt: video.get("createdAt"),
    }));
  },

  async create(data: Omit<VideoData, "id" | "createdAt">): Promise<VideoData> {
    initializeParse();
    const Video = Parse.Object.extend("videos");
    const video = new Video();

    video.set("user", Parse.User.current());
    video.set("title", data.title);
    video.set("description", data.description);
    video.set("date", data.date);
    video.set("duration", data.duration);
    video.set("category", data.category);
    video.set("videoUrl", data.videoUrl);
    if (data.thumbnailUrl) video.set("thumbnailUrl", data.thumbnailUrl);

    const result = await video.save();
    return {
      ...data,
      id: result.id ?? "",
      createdAt: result.get("createdAt"),
    };
  },

  async update(id: string, data: Partial<VideoData>): Promise<void> {
    initializeParse();
    const Video = Parse.Object.extend("videos");
    const query = new Parse.Query(Video);
    const video = await query.get(id);

    if (data.title) video.set("title", data.title);
    if (data.description) video.set("description", data.description);
    if (data.duration) video.set("duration", data.duration);
    if (data.category) video.set("category", data.category);
    if (data.videoUrl) video.set("videoUrl", data.videoUrl);
    if (data.thumbnailUrl) video.set("thumbnailUrl", data.thumbnailUrl);

    await video.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const Video = Parse.Object.extend("videos");
    const query = new Parse.Query(Video);
    const video = await query.get(id);
    await video.destroy();
  },
};

// Extended Trade Service for Reports
export const ReportService = {
  async getPerformanceByHour(): Promise<PerformanceByHour[]> {
    initializeParse();
    const trades = await TradeService.getAll();

    const hourStats = new Map<number, { pnl: number; wins: number; total: number }>();

    for (const trade of trades) {
      const hour = new Date(trade.entryTime).getHours();
      const current = hourStats.get(hour) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += trade.pnl;
      current.total++;
      if (trade.pnl > 0) current.wins++;
      hourStats.set(hour, current);
    }

    return Array.from(hourStats.entries())
      .map(([hour, stats]) => ({
        hour,
        pnl: stats.pnl,
        trades: stats.total,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.hour - b.hour);
  },

  async getPerformanceBySide(): Promise<{ side: string; pnl: number; trades: number; winRate: number }[]> {
    initializeParse();
    const trades = await TradeService.getAll();

    const sideStats = new Map<string, { pnl: number; wins: number; total: number }>();

    for (const trade of trades) {
      const side = trade.side === "long" ? "Long" : "Short";
      const current = sideStats.get(side) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += trade.pnl;
      current.total++;
      if (trade.pnl > 0) current.wins++;
      sideStats.set(side, current);
    }

    return Array.from(sideStats.entries()).map(([side, stats]) => ({
      side,
      pnl: stats.pnl,
      trades: stats.total,
      winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
    }));
  },

  async getMonthlyPerformance(): Promise<{ month: string; pnl: number; trades: number; winRate: number }[]> {
    initializeParse();
    const trades = await TradeService.getAll();

    const monthStats = new Map<string, { pnl: number; wins: number; total: number }>();

    for (const trade of trades) {
      const date = new Date(trade.exitTime);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const current = monthStats.get(monthKey) || { pnl: 0, wins: 0, total: 0 };
      current.pnl += trade.pnl;
      current.total++;
      if (trade.pnl > 0) current.wins++;
      monthStats.set(monthKey, current);
    }

    return Array.from(monthStats.entries())
      .map(([month, stats]) => ({
        month,
        pnl: stats.pnl,
        trades: stats.total,
        winRate: stats.total > 0 ? (stats.wins / stats.total) * 100 : 0,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  },

  async getWinLossDistribution(): Promise<{ range: string; count: number }[]> {
    initializeParse();
    const trades = await TradeService.getAll();

    const ranges = [
      { min: -Infinity, max: -500, label: "< -$500" },
      { min: -500, max: -200, label: "-$500 bis -$200" },
      { min: -200, max: -100, label: "-$200 bis -$100" },
      { min: -100, max: 0, label: "-$100 bis $0" },
      { min: 0, max: 100, label: "$0 bis $100" },
      { min: 100, max: 200, label: "$100 bis $200" },
      { min: 200, max: 500, label: "$200 bis $500" },
      { min: 500, max: Infinity, label: "> $500" },
    ];

    return ranges.map((range) => ({
      range: range.label,
      count: trades.filter((t) => t.pnl > range.min && t.pnl <= range.max).length,
    }));
  },
};

// Trading Plan Service
export const TradingPlanService = {
  async getAll(): Promise<TradingPlanData[]> {
    initializeParse();
    const TradingPlan = Parse.Object.extend("trading_plans");
    const query = new Parse.Query(TradingPlan);
    query.equalTo("user", Parse.User.current());
    query.descending("createdAt");

    const results = await query.find();
    return results.map((plan) => ({
      id: plan.id ?? "",
      name: plan.get("name"),
      description: plan.get("description") || "",
      isActive: plan.get("isActive") || false,
      maxDailyLoss: plan.get("maxDailyLoss") || 0,
      maxDailyTrades: plan.get("maxDailyTrades") || 0,
      maxPositionSize: plan.get("maxPositionSize") || 0,
      riskPerTrade: plan.get("riskPerTrade") || 1,
      entryRules: plan.get("entryRules") || [],
      exitRules: plan.get("exitRules") || [],
      stopLossRules: plan.get("stopLossRules") || [],
      tradingHoursStart: plan.get("tradingHoursStart") || "09:30",
      tradingHoursEnd: plan.get("tradingHoursEnd") || "16:00",
      tradingDays: plan.get("tradingDays") || ["Mo", "Di", "Mi", "Do", "Fr"],
      preferredSetups: plan.get("preferredSetups") || [],
      avoidConditions: plan.get("avoidConditions") || [],
      dailyProfitTarget: plan.get("dailyProfitTarget") || 0,
      weeklyProfitTarget: plan.get("weeklyProfitTarget") || 0,
      monthlyProfitTarget: plan.get("monthlyProfitTarget") || 0,
      createdAt: plan.get("createdAt"),
      updatedAt: plan.get("updatedAt"),
    }));
  },

  async getById(id: string): Promise<TradingPlanData | null> {
    initializeParse();
    const TradingPlan = Parse.Object.extend("trading_plans");
    const query = new Parse.Query(TradingPlan);

    try {
      const plan = await query.get(id);
      return {
        id: plan.id ?? "",
        name: plan.get("name"),
        description: plan.get("description") || "",
        isActive: plan.get("isActive") || false,
        maxDailyLoss: plan.get("maxDailyLoss") || 0,
        maxDailyTrades: plan.get("maxDailyTrades") || 0,
        maxPositionSize: plan.get("maxPositionSize") || 0,
        riskPerTrade: plan.get("riskPerTrade") || 1,
        entryRules: plan.get("entryRules") || [],
        exitRules: plan.get("exitRules") || [],
        stopLossRules: plan.get("stopLossRules") || [],
        tradingHoursStart: plan.get("tradingHoursStart") || "09:30",
        tradingHoursEnd: plan.get("tradingHoursEnd") || "16:00",
        tradingDays: plan.get("tradingDays") || ["Mo", "Di", "Mi", "Do", "Fr"],
        preferredSetups: plan.get("preferredSetups") || [],
        avoidConditions: plan.get("avoidConditions") || [],
        dailyProfitTarget: plan.get("dailyProfitTarget") || 0,
        weeklyProfitTarget: plan.get("weeklyProfitTarget") || 0,
        monthlyProfitTarget: plan.get("monthlyProfitTarget") || 0,
        createdAt: plan.get("createdAt"),
        updatedAt: plan.get("updatedAt"),
      };
    } catch {
      return null;
    }
  },

  async create(data: Omit<TradingPlanData, "id" | "createdAt" | "updatedAt">): Promise<TradingPlanData> {
    initializeParse();
    const TradingPlan = Parse.Object.extend("trading_plans");
    const plan = new TradingPlan();

    plan.set("user", Parse.User.current());
    plan.set("name", data.name);
    plan.set("description", data.description);
    plan.set("isActive", data.isActive);
    plan.set("maxDailyLoss", data.maxDailyLoss);
    plan.set("maxDailyTrades", data.maxDailyTrades);
    plan.set("maxPositionSize", data.maxPositionSize);
    plan.set("riskPerTrade", data.riskPerTrade);
    plan.set("entryRules", data.entryRules);
    plan.set("exitRules", data.exitRules);
    plan.set("stopLossRules", data.stopLossRules);
    plan.set("tradingHoursStart", data.tradingHoursStart);
    plan.set("tradingHoursEnd", data.tradingHoursEnd);
    plan.set("tradingDays", data.tradingDays);
    plan.set("preferredSetups", data.preferredSetups);
    plan.set("avoidConditions", data.avoidConditions);
    plan.set("dailyProfitTarget", data.dailyProfitTarget);
    plan.set("weeklyProfitTarget", data.weeklyProfitTarget);
    plan.set("monthlyProfitTarget", data.monthlyProfitTarget);

    const result = await plan.save();
    return {
      ...data,
      id: result.id ?? "",
      createdAt: result.get("createdAt"),
      updatedAt: result.get("updatedAt"),
    };
  },

  async update(id: string, data: Partial<TradingPlanData>): Promise<void> {
    initializeParse();
    const TradingPlan = Parse.Object.extend("trading_plans");
    const query = new Parse.Query(TradingPlan);
    const plan = await query.get(id);

    if (data.name !== undefined) plan.set("name", data.name);
    if (data.description !== undefined) plan.set("description", data.description);
    if (data.isActive !== undefined) plan.set("isActive", data.isActive);
    if (data.maxDailyLoss !== undefined) plan.set("maxDailyLoss", data.maxDailyLoss);
    if (data.maxDailyTrades !== undefined) plan.set("maxDailyTrades", data.maxDailyTrades);
    if (data.maxPositionSize !== undefined) plan.set("maxPositionSize", data.maxPositionSize);
    if (data.riskPerTrade !== undefined) plan.set("riskPerTrade", data.riskPerTrade);
    if (data.entryRules !== undefined) plan.set("entryRules", data.entryRules);
    if (data.exitRules !== undefined) plan.set("exitRules", data.exitRules);
    if (data.stopLossRules !== undefined) plan.set("stopLossRules", data.stopLossRules);
    if (data.tradingHoursStart !== undefined) plan.set("tradingHoursStart", data.tradingHoursStart);
    if (data.tradingHoursEnd !== undefined) plan.set("tradingHoursEnd", data.tradingHoursEnd);
    if (data.tradingDays !== undefined) plan.set("tradingDays", data.tradingDays);
    if (data.preferredSetups !== undefined) plan.set("preferredSetups", data.preferredSetups);
    if (data.avoidConditions !== undefined) plan.set("avoidConditions", data.avoidConditions);
    if (data.dailyProfitTarget !== undefined) plan.set("dailyProfitTarget", data.dailyProfitTarget);
    if (data.weeklyProfitTarget !== undefined) plan.set("weeklyProfitTarget", data.weeklyProfitTarget);
    if (data.monthlyProfitTarget !== undefined) plan.set("monthlyProfitTarget", data.monthlyProfitTarget);

    await plan.save();
  },

  async delete(id: string): Promise<void> {
    initializeParse();
    const TradingPlan = Parse.Object.extend("trading_plans");
    const query = new Parse.Query(TradingPlan);
    const plan = await query.get(id);
    await plan.destroy();
  },

  async setActive(id: string): Promise<void> {
    initializeParse();
    // First, deactivate all plans
    const TradingPlan = Parse.Object.extend("trading_plans");
    const query = new Parse.Query(TradingPlan);
    query.equalTo("user", Parse.User.current());
    query.equalTo("isActive", true);

    const activePlans = await query.find();
    for (const plan of activePlans) {
      plan.set("isActive", false);
      await plan.save();
    }

    // Then activate the selected plan
    const planQuery = new Parse.Query(TradingPlan);
    const plan = await planQuery.get(id);
    plan.set("isActive", true);
    await plan.save();
  },
};
