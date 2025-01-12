import { NextResponse } from 'next/server';
import { startHarvesting } from '@/lib/logic-sequence/harvest-connections';
import { loadConnections, saveHarvestingState } from '@/lib/storage/storage';

export async function POST() {
  try {
    const connections = await loadConnections();
    
    // Only block start if in active cooldown
    if (connections.isHarvesting && connections.nextHarvestTime && new Date(connections.nextHarvestTime) > new Date()) {
      return NextResponse.json(
        { 
          message: `harvesting cooldown active until ${new Date(connections.nextHarvestTime).toLocaleString()}`,
          isHarvesting: true,
          weeklyLimitReached: false,
          dailyLimitReached: false,
          connectionsSent: connections.connectionsSent || 0,
          nextHarvestTime: connections.nextHarvestTime
        },
        { status: 429 }
      );
    }

    const result = await startHarvesting(35);

    // If in cooldown, return 429 but include all status info
    if (result.nextHarvestTime && result.connectionsSent === 0) {
      return NextResponse.json(
        {
          message: `harvesting cooldown active until ${new Date(result.nextHarvestTime).toLocaleString()}`,
          nextHarvestTime: result.nextHarvestTime,
          connectionsSent: 0,
          weeklyLimitReached: result.weeklyLimitReached || false,
          dailyLimitReached: result.dailyLimitReached || false,
          isHarvesting: false
        },
        { status: 429 }
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
  } catch (error: unknown) {
    console.error('error starting harvesting:', error);
    await saveHarvestingState(false);
    return NextResponse.json(
      { 
        message: (error as Error).message.toLowerCase(),
        weeklyLimitReached: false,
        dailyLimitReached: false,
        connectionsSent: 0,
        isHarvesting: false
      },
      { status: 500 }
    );
  }
}