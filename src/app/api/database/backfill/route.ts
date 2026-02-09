import { NextRequest, NextResponse } from 'next/server';
import {
  getBackfillStatus,
  getDataStatistics,
  backfillAllDailyPrices,
  backfillEarnings,
} from '@/lib/database/services/backfill-service';

export async function GET() {
  try {
    const [status, stats] = await Promise.all([
      getBackfillStatus(),
      getDataStatistics(),
    ]);

    return NextResponse.json({ status, stats });
  } catch (error) {
    console.error('Error getting backfill status:', error);
    return NextResponse.json(
      { error: 'Failed to get backfill status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, dataType } = body;

    if (action === 'start') {
      // Start backfill in background (don't await)
      if (dataType === 'daily') {
        backfillAllDailyPrices().catch(console.error);
      } else if (dataType === 'earnings') {
        backfillEarnings().catch(console.error);
      }

      return NextResponse.json({
        message: `Started ${dataType} backfill`,
        status: 'in_progress',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error starting backfill:', error);
    return NextResponse.json(
      { error: 'Failed to start backfill' },
      { status: 500 }
    );
  }
}
