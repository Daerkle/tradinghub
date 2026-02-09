import {
  pgTable,
  serial,
  varchar,
  text,
  date,
  timestamp,
  decimal,
  bigint,
  integer,
  boolean,
  uuid,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// Daily OHLCV für alle NASDAQ Symbole (10 Jahre)
// ============================================
export const dailyPrices = pgTable('daily_prices', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  date: date('date').notNull(),
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: bigint('volume', { mode: 'number' }),
  changePercent: decimal('change_percent', { precision: 8, scale: 4 }),
  vwap: decimal('vwap', { precision: 12, scale: 4 }),
}, (table) => [
  uniqueIndex('daily_prices_symbol_date_idx').on(table.symbol, table.date),
  index('daily_prices_symbol_idx').on(table.symbol),
  index('daily_prices_date_idx').on(table.date),
]);

// ============================================
// Intraday nur für Setup-relevante Zeiträume
// ============================================
export const intradayPrices = pgTable('intraday_prices', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  datetime: timestamp('datetime', { withTimezone: true }).notNull(),
  timeframe: varchar('timeframe', { length: 10 }).notNull(), // '5min', '1hour'
  open: decimal('open', { precision: 12, scale: 4 }),
  high: decimal('high', { precision: 12, scale: 4 }),
  low: decimal('low', { precision: 12, scale: 4 }),
  close: decimal('close', { precision: 12, scale: 4 }),
  volume: bigint('volume', { mode: 'number' }),
}, (table) => [
  uniqueIndex('intraday_symbol_datetime_tf_idx').on(table.symbol, table.datetime, table.timeframe),
  index('intraday_symbol_tf_idx').on(table.symbol, table.timeframe),
]);

// ============================================
// Earnings mit EPS Surprise
// ============================================
export const earnings = pgTable('earnings', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  date: date('date').notNull(),
  epsActual: decimal('eps_actual', { precision: 10, scale: 4 }),
  epsEstimated: decimal('eps_estimated', { precision: 10, scale: 4 }),
  epsSurprisePercent: decimal('eps_surprise_percent', { precision: 8, scale: 4 }),
  revenueActual: bigint('revenue_actual', { mode: 'number' }),
  revenueEstimated: bigint('revenue_estimated', { mode: 'number' }),
  revenueSurprisePercent: decimal('revenue_surprise_percent', { precision: 8, scale: 4 }),
  timeOfDay: varchar('time_of_day', { length: 10 }), // 'BMO', 'AMC'
}, (table) => [
  uniqueIndex('earnings_symbol_date_idx').on(table.symbol, table.date),
  index('earnings_symbol_idx').on(table.symbol),
  index('earnings_surprise_idx').on(table.epsSurprisePercent),
]);

// ============================================
// News Events
// ============================================
export const newsEvents = pgTable('news_events', {
  id: serial('id').primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  publishedDate: timestamp('published_date', { withTimezone: true }).notNull(),
  title: text('title').notNull(),
  content: text('content'),
  url: text('url'),
  source: varchar('source', { length: 100 }),
  sentiment: varchar('sentiment', { length: 20 }), // 'positive', 'negative', 'neutral'
  sentimentScore: decimal('sentiment_score', { precision: 5, scale: 4 }),
}, (table) => [
  index('news_symbol_date_idx').on(table.symbol, table.publishedDate),
  index('news_symbol_idx').on(table.symbol),
]);

// ============================================
// Price Runs (automatisch erkannt)
// ============================================
export const priceRuns = pgTable('price_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  startDate: date('start_date').notNull(),
  peakDate: date('peak_date').notNull(),
  endDate: date('end_date'),
  startPrice: decimal('start_price', { precision: 12, scale: 4 }),
  peakPrice: decimal('peak_price', { precision: 12, scale: 4 }),
  totalGainPercent: decimal('total_gain_percent', { precision: 8, scale: 2 }),
  durationDays: integer('duration_days'),
  avgVolumeRatio: decimal('avg_volume_ratio', { precision: 8, scale: 2 }),
  // Korrelation
  catalystType: varchar('catalyst_type', { length: 50 }), // 'earnings_beat', 'news', 'sector_move'
  earningsId: integer('earnings_id').references(() => earnings.id),
  newsIds: integer('news_ids').array(),
  correlationScore: decimal('correlation_score', { precision: 5, scale: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('price_runs_symbol_idx').on(table.symbol),
  index('price_runs_gain_idx').on(table.totalGainPercent),
  index('price_runs_start_date_idx').on(table.startDate),
]);

// ============================================
// Setups (Haupttabelle)
// ============================================
export const setups = pgTable('setups', {
  id: uuid('id').defaultRandom().primaryKey(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  setupType: varchar('setup_type', { length: 50 }).notNull(), // 'EP', 'PowerEarningsGap', 'Flag', 'HighTightFlag'
  setupDate: date('setup_date').notNull(),

  // Catalyst Info (IMMER verknüpft)
  catalystType: varchar('catalyst_type', { length: 50 }), // 'earnings', 'news', 'both'
  earningsId: integer('earnings_id').references(() => earnings.id),
  priceRunId: uuid('price_run_id').references(() => priceRuns.id),

  // Metriken
  gapPercent: decimal('gap_percent', { precision: 8, scale: 2 }),
  volumeRatio: decimal('volume_ratio', { precision: 8, scale: 2 }),
  epsSurprisePercent: decimal('eps_surprise_percent', { precision: 8, scale: 2 }),

  // Pre-Setup Pattern
  consolidationDays: integer('consolidation_days'),
  consolidationRange: decimal('consolidation_range', { precision: 8, scale: 2 }),
  priorRunPercent: decimal('prior_run_percent', { precision: 8, scale: 2 }),

  // Outcome
  outcome: varchar('outcome', { length: 20 }), // 'winner', 'loser', 'pending'
  entryPrice: decimal('entry_price', { precision: 12, scale: 4 }),
  stopPrice: decimal('stop_price', { precision: 12, scale: 4 }),
  exitPrice: decimal('exit_price', { precision: 12, scale: 4 }),
  maxGainPercent: decimal('max_gain_percent', { precision: 8, scale: 2 }),
  actualGainPercent: decimal('actual_gain_percent', { precision: 8, scale: 2 }),
  stoppedOut: boolean('stopped_out').default(false),

  // Auto-Detection
  isAutoDetected: boolean('is_auto_detected').default(true),
  detectionConfidence: decimal('detection_confidence', { precision: 5, scale: 2 }),

  // Notes
  notes: text('notes'),
  tags: varchar('tags', { length: 50 }).array(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('setups_symbol_idx').on(table.symbol),
  index('setups_type_idx').on(table.setupType),
  index('setups_outcome_idx').on(table.outcome),
  index('setups_date_idx').on(table.setupDate),
]);

// ============================================
// Chart Snapshots
// ============================================
export const chartSnapshots = pgTable('chart_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  setupId: uuid('setup_id').references(() => setups.id).notNull(),
  timeframe: varchar('timeframe', { length: 10 }).notNull(), // 'daily', '60min', '5min'
  imageData: text('image_data'), // Base64 PNG
  annotations: jsonb('annotations'), // JSON mit Zeichnungen
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('snapshots_setup_idx').on(table.setupId),
]);

// ============================================
// Annotations (einzelne Zeichnungen)
// ============================================
export const annotations = pgTable('annotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  snapshotId: uuid('snapshot_id').references(() => chartSnapshots.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // 'trendline', 'horizontal', 'rectangle', 'text', 'marker'
  data: jsonb('data').notNull(), // Koordinaten, Farbe, etc.
  label: varchar('label', { length: 100 }),
  color: varchar('color', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('annotations_snapshot_idx').on(table.snapshotId),
]);

// ============================================
// Backfill Progress Tracking
// ============================================
export const backfillProgress = pgTable('backfill_progress', {
  id: serial('id').primaryKey(),
  dataType: varchar('data_type', { length: 50 }).notNull(), // 'daily', 'earnings', 'news', 'intraday'
  symbol: varchar('symbol', { length: 10 }),
  status: varchar('status', { length: 20 }).notNull(), // 'pending', 'in_progress', 'completed', 'failed'
  lastProcessedDate: date('last_processed_date'),
  totalRecords: integer('total_records'),
  processedRecords: integer('processed_records'),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('backfill_type_status_idx').on(table.dataType, table.status),
]);

// ============================================
// Relations
// ============================================
export const earningsRelations = relations(earnings, ({ many }) => ({
  priceRuns: many(priceRuns),
  setups: many(setups),
}));

export const priceRunsRelations = relations(priceRuns, ({ one, many }) => ({
  earnings: one(earnings, {
    fields: [priceRuns.earningsId],
    references: [earnings.id],
  }),
  setups: many(setups),
}));

export const setupsRelations = relations(setups, ({ one, many }) => ({
  earnings: one(earnings, {
    fields: [setups.earningsId],
    references: [earnings.id],
  }),
  priceRun: one(priceRuns, {
    fields: [setups.priceRunId],
    references: [priceRuns.id],
  }),
  snapshots: many(chartSnapshots),
}));

export const chartSnapshotsRelations = relations(chartSnapshots, ({ one, many }) => ({
  setup: one(setups, {
    fields: [chartSnapshots.setupId],
    references: [setups.id],
  }),
  annotations: many(annotations),
}));

export const annotationsRelations = relations(annotations, ({ one }) => ({
  snapshot: one(chartSnapshots, {
    fields: [annotations.snapshotId],
    references: [chartSnapshots.id],
  }),
}));

// ============================================
// Types
// ============================================
export type DailyPrice = typeof dailyPrices.$inferSelect;
export type NewDailyPrice = typeof dailyPrices.$inferInsert;

export type IntradayPrice = typeof intradayPrices.$inferSelect;
export type NewIntradayPrice = typeof intradayPrices.$inferInsert;

export type Earnings = typeof earnings.$inferSelect;
export type NewEarnings = typeof earnings.$inferInsert;

export type NewsEvent = typeof newsEvents.$inferSelect;
export type NewNewsEvent = typeof newsEvents.$inferInsert;

export type PriceRun = typeof priceRuns.$inferSelect;
export type NewPriceRun = typeof priceRuns.$inferInsert;

export type Setup = typeof setups.$inferSelect;
export type NewSetup = typeof setups.$inferInsert;

export type ChartSnapshot = typeof chartSnapshots.$inferSelect;
export type NewChartSnapshot = typeof chartSnapshots.$inferInsert;

export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;

export type BackfillProgress = typeof backfillProgress.$inferSelect;
export type NewBackfillProgress = typeof backfillProgress.$inferInsert;

// Setup Types
export const SETUP_TYPES = {
  EP: 'EP', // Episodic Pivot
  POWER_EARNINGS_GAP: 'PowerEarningsGap',
  FLAG: 'Flag',
  HIGH_TIGHT_FLAG: 'HighTightFlag',
} as const;

export type SetupType = typeof SETUP_TYPES[keyof typeof SETUP_TYPES];

// Outcome Types
export const OUTCOME_TYPES = {
  WINNER: 'winner',
  LOSER: 'loser',
  PENDING: 'pending',
} as const;

export type OutcomeType = typeof OUTCOME_TYPES[keyof typeof OUTCOME_TYPES];
