import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { setups, earnings, priceRuns } from '@/lib/database/schema';
import { eq, desc, and, sql, or, ilike } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const setupType = searchParams.get('type');
    const outcome = searchParams.get('outcome');
    const search = searchParams.get('search');

    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];

    if (setupType) {
      conditions.push(eq(setups.setupType, setupType));
    }

    if (outcome) {
      conditions.push(eq(setups.outcome, outcome));
    }

    if (search) {
      conditions.push(ilike(setups.symbol, `%${search}%`));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get setups with related data
    const results = await db.select({
      id: setups.id,
      symbol: setups.symbol,
      setupType: setups.setupType,
      setupDate: setups.setupDate,
      catalystType: setups.catalystType,
      gapPercent: setups.gapPercent,
      volumeRatio: setups.volumeRatio,
      epsSurprisePercent: setups.epsSurprisePercent,
      outcome: setups.outcome,
      maxGainPercent: setups.maxGainPercent,
      stoppedOut: setups.stoppedOut,
      consolidationDays: setups.consolidationDays,
      priorRunPercent: setups.priorRunPercent,
      notes: setups.notes,
      tags: setups.tags,
      createdAt: setups.createdAt,
    })
      .from(setups)
      .where(whereClause)
      .orderBy(desc(setups.setupDate))
      .limit(limit)
      .offset(offset);

    // Get total count
    const [{ count }] = await db.select({
      count: sql<number>`count(*)`,
    })
      .from(setups)
      .where(whereClause);

    // Get statistics
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      winners: sql<number>`count(*) filter (where outcome = 'winner')`,
      losers: sql<number>`count(*) filter (where outcome = 'loser')`,
      pending: sql<number>`count(*) filter (where outcome = 'pending')`,
      avgGain: sql<number>`avg(max_gain_percent::numeric) filter (where outcome = 'winner')`,
    })
      .from(setups);

    return NextResponse.json({
      setups: results,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
      stats: {
        total: stats?.total || 0,
        winners: stats?.winners || 0,
        losers: stats?.losers || 0,
        pending: stats?.pending || 0,
        winRate: stats?.total > 0 ? ((stats?.winners || 0) / ((stats?.winners || 0) + (stats?.losers || 0)) * 100).toFixed(1) : '0',
        avgGain: stats?.avgGain?.toFixed(1) || '0',
      },
    });
  } catch (error) {
    console.error('Error fetching setups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch setups' },
      { status: 500 }
    );
  }
}
