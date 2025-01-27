import { NextResponse } from "next/server";
import { loadConnections, saveCronLog } from "../../../../lib/storage/storage";

export async function GET() {
  try {
    const connections = await loadConnections();
    const now = new Date();
    const nextHarvestTime = connections.nextHarvestTime ? new Date(connections.nextHarvestTime) : null;

    console.log('checking harvest conditions:', {
      nextHarvestTime: nextHarvestTime?.toISOString(),
      currentStatus: connections.harvestingStatus,
    });

    // If it's time to harvest
    if (nextHarvestTime && now >= nextHarvestTime) {
      // Don't start if already running
      if (connections.harvestingStatus === 'running') {
        await saveCronLog({
          timestamp: now.toISOString(),
          action: 'check',
          result: 'already running',
          nextHarvestTime: nextHarvestTime.toISOString()
        });
        return NextResponse.json({ message: 'harvest already running' });
      }

      console.log('starting harvest: next harvest time reached');
      
      const startResponse = await fetch('http://localhost:3000/api/harvest/start', {
        method: 'POST',
      });

      if (!startResponse.ok) {
        await saveCronLog({
          timestamp: now.toISOString(),
          action: 'check',
          result: 'failed to start',
          nextHarvestTime: nextHarvestTime.toISOString()
        });
        throw new Error('failed to start harvest');
      }

      await saveCronLog({
        timestamp: now.toISOString(),
        action: 'check',
        result: 'started harvest',
        nextHarvestTime: nextHarvestTime.toISOString()
      });

      return NextResponse.json({ message: 'harvest started' });
    }

    await saveCronLog({
      timestamp: now.toISOString(),
      action: 'check',
      result: 'not time yet',
      nextHarvestTime: nextHarvestTime?.toISOString()
    });

    return NextResponse.json({ 
      message: 'harvest check completed, not time yet',
      nextHarvestTime: nextHarvestTime?.toISOString()
    });

  } catch (error) {
    console.error('error in harvest check:', error);
    await saveCronLog({
      timestamp: new Date().toISOString(),
      action: 'check',
      result: `error: ${error}`
    });
    return NextResponse.json({ error: 'failed to check harvest status' }, { status: 500 });
  }
} 