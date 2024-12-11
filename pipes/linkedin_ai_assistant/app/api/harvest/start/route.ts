import { NextRequest, NextResponse } from 'next/server';
import { startHarvesting } from '@/lib/logic_sequence/harvest_connections';

export async function POST(req: NextRequest) {
  try {
    const result = await startHarvesting(35);

    // If nextHarvestTime exists but no connections were sent, it means we're in cooldown
    if (result.nextHarvestTime && result.connectionsSent === 0) {
      return NextResponse.json(
        {
          message: `harvesting cooldown active until ${new Date(result.nextHarvestTime).toLocaleString()}`,
          nextHarvestTime: result.nextHarvestTime,
          connectionsSent: 0
        },
        { status: 429 } // Too Many Requests
      );
    }

    // Return detailed status messages based on the harvesting result
    let message = '';
    if (result.weeklyLimitReached) {
      message = `weekly limit reached, retrying at ${new Date(result.nextHarvestTime!).toLocaleString()}`;
    } else if (result.dailyLimitReached) {
      message = `daily limit of ${result.connectionsSent} connections reached, next harvest at ${new Date(result.nextHarvestTime!).toLocaleString()}`;
    } else if (result.connectionsSent === 0) {
      message = "no new connections found to harvest";
    } else {
      message = `sent ${result.connectionsSent} connections.`;
    }

    return NextResponse.json(
      {
        message,
        weeklyLimitReached: result.weeklyLimitReached,
        dailyLimitReached: result.dailyLimitReached,
        connectionsSent: result.connectionsSent,
        nextHarvestTime: result.nextHarvestTime,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('error starting harvesting:', error);
    return NextResponse.json(
      { message: error.message.toLowerCase() },
      { status: 500 }
    );
  }
}