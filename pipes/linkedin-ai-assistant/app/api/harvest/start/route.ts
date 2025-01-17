import { NextResponse } from 'next/server';
import { startHarvesting } from '@/lib/logic-sequence/harvest-connections';
import { loadConnections, saveHarvestingState } from '@/lib/storage/storage';

export async function POST() {
  try {
    console.log('farming start endpoint called');
    const connections = await loadConnections();
    console.log('current harvesting status:', connections.harvestingStatus);
    
    // Check if already running first
    if (connections.harvestingStatus === 'running') {
      console.log('farming already in progress');
      return NextResponse.json(
        { 
          message: 'farming already in progress',
          harvestingStatus: 'running',
          weeklyLimitReached: false,
          dailyLimitReached: false,
          connectionsSent: connections.connectionsSent || 0
        },
        { status: 200 }
      );
    }

    // Check cooldown before starting
    if (connections.nextHarvestTime && new Date(connections.nextHarvestTime) > new Date()) {
      console.log('in cooldown period until:', connections.nextHarvestTime);
      return NextResponse.json(
        { 
          message: `farming cooldown active until ${new Date(connections.nextHarvestTime).toLocaleString()}`,
          harvestingStatus: 'cooldown',
          weeklyLimitReached: false,
          dailyLimitReached: false,
          connectionsSent: connections.connectionsSent || 0,
          nextHarvestTime: connections.nextHarvestTime
        },
        { status: 429 }
      );
    }

    // Set state to running and start harvest
    console.log('setting farming state to running');
    await saveHarvestingState('running');
    
    console.log('starting farming process');
    const result = await startHarvesting(35);
    console.log('harvest result:', result);

    // If in cooldown, return 429 but include all status info
    if (result.nextHarvestTime && new Date(result.nextHarvestTime) > new Date()) {
      return NextResponse.json(
        {
          message: `harvesting cooldown active until ${new Date(result.nextHarvestTime).toLocaleString()}`,
          nextHarvestTime: result.nextHarvestTime,
          connectionsSent: result.connectionsSent,
          weeklyLimitReached: result.weeklyLimitReached || false,
          dailyLimitReached: result.dailyLimitReached || false,
          harvestingStatus: 'cooldown'
        },
        { status: 429 }
      );
    }

    // Return detailed status messages based on the harvesting result
    let message = '';
    if (result.weeklyLimitReached) {
      message = `weekly limit reached, retrying at ${new Date(result.nextHarvestTime!).toLocaleString()}`;
    } else if (result.dailyLimitReached) {
      message = `daily limit of ${result.connectionsSent} connections reached, next farming at ${new Date(result.nextHarvestTime!).toLocaleString()}`;
    } else if (result.harvestingStatus === 'stopped') {
      message = "farming stopped";
    } else {
      message = `farming started, sent ${result.connectionsSent} connections so far`;
    }

    return NextResponse.json(
      {
        message,
        weeklyLimitReached: result.weeklyLimitReached,
        dailyLimitReached: result.dailyLimitReached,
        connectionsSent: result.connectionsSent,
        nextHarvestTime: result.nextHarvestTime,
        harvestingStatus: result.harvestingStatus
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error('error starting farming:', error);
    await saveHarvestingState('stopped');
    return NextResponse.json(
      { 
        message: (error as Error).message.toLowerCase(),
        weeklyLimitReached: false,
        dailyLimitReached: false,
        connectionsSent: 0,
        harvestingStatus: 'stopped'
      },
      { status: 500 }
    );
  }
}