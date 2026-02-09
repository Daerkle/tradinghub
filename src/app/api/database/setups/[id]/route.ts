import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { setups, dailyPrices, intradayPrices, earnings, newsEvents } from '@/lib/database/schema';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get setup
    const [setup] = await db.select()
      .from(setups)
      .where(eq(setups.id, id));

    if (!setup) {
      return NextResponse.json(
        { error: 'Setup not found' },
        { status: 404 }
      );
    }

    // Calculate date range for chart data
    const setupDate = new Date(setup.setupDate);
    const fromDate = new Date(setupDate);
    fromDate.setDate(fromDate.getDate() - 90); // 3 months before
    const toDate = new Date(setupDate);
    toDate.setDate(toDate.getDate() + 60); // 2 months after

    // Get daily prices
    const daily = await db.select()
      .from(dailyPrices)
      .where(and(
        eq(dailyPrices.symbol, setup.symbol),
        gte(dailyPrices.date, fromDate.toISOString().split('T')[0]),
        lte(dailyPrices.date, toDate.toISOString().split('T')[0])
      ))
      .orderBy(dailyPrices.date);

    // Get intraday prices (if available)
    const hourly = await db.select()
      .from(intradayPrices)
      .where(and(
        eq(intradayPrices.symbol, setup.symbol),
        eq(intradayPrices.timeframe, '1hour'),
        gte(intradayPrices.datetime, fromDate),
        lte(intradayPrices.datetime, toDate)
      ))
      .orderBy(intradayPrices.datetime);

    const fiveMin = await db.select()
      .from(intradayPrices)
      .where(and(
        eq(intradayPrices.symbol, setup.symbol),
        eq(intradayPrices.timeframe, '5min'),
        gte(intradayPrices.datetime, fromDate),
        lte(intradayPrices.datetime, toDate)
      ))
      .orderBy(intradayPrices.datetime);

    // Get related earnings
    let earningsData = null;
    if (setup.earningsId) {
      const [e] = await db.select()
        .from(earnings)
        .where(eq(earnings.id, setup.earningsId));
      earningsData = e;
    }

    // Get related news (around setup date)
    const newsFromDate = new Date(setupDate);
    newsFromDate.setDate(newsFromDate.getDate() - 3);
    const newsToDate = new Date(setupDate);
    newsToDate.setDate(newsToDate.getDate() + 1);

    const news = await db.select()
      .from(newsEvents)
      .where(and(
        eq(newsEvents.symbol, setup.symbol),
        gte(newsEvents.publishedDate, newsFromDate),
        lte(newsEvents.publishedDate, newsToDate)
      ))
      .orderBy(desc(newsEvents.publishedDate))
      .limit(10);

    // Format chart data
    const formatOHLC = (data: typeof daily) => data.map(d => ({
      time: d.date,
      open: parseFloat(d.open?.toString() || '0'),
      high: parseFloat(d.high?.toString() || '0'),
      low: parseFloat(d.low?.toString() || '0'),
      close: parseFloat(d.close?.toString() || '0'),
      volume: d.volume || 0,
    }));

    const formatIntradayOHLC = (data: typeof hourly) => data.map(d => ({
      time: Math.floor(d.datetime.getTime() / 1000),
      open: parseFloat(d.open?.toString() || '0'),
      high: parseFloat(d.high?.toString() || '0'),
      low: parseFloat(d.low?.toString() || '0'),
      close: parseFloat(d.close?.toString() || '0'),
      volume: d.volume || 0,
    }));

    return NextResponse.json({
      setup,
      chartData: {
        daily: formatOHLC(daily),
        hourly: formatIntradayOHLC(hourly),
        fiveMin: formatIntradayOHLC(fiveMin),
      },
      earnings: earningsData,
      news,
    });
  } catch (error) {
    console.error('Error fetching setup:', error);
    return NextResponse.json(
      { error: 'Failed to fetch setup' },
      { status: 500 }
    );
  }
}
