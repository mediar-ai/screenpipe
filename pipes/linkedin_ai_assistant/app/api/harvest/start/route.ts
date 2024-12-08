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
    const message = result.weeklyLimitReached 
      ? `weekly linkedin invitation limit reached, retrying at ${new Date(result.nextHarvestTime!).toLocaleString()}`
      : result.connectionsSent === 0
        ? "no new connections found to harvest"
        : `sent ${result.connectionsSent} connections.`;

    return NextResponse.json(
      {
        message,
        weeklyLimitReached: result.weeklyLimitReached,
        connectionsSent: result.connectionsSent,
        nextHarvestTime: result.nextHarvestTime,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('error starting harvesting:', error);
    return NextResponse.json({ message: error.message.toLowerCase() }, { status: 500 });
  }
}