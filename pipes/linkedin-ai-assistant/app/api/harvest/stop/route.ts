import { NextResponse } from 'next/server';
import { stopHarvesting } from '@/lib/logic-sequence/harvest-connections';
import { saveHarvestingState, setStopRequested } from '@/lib/storage/storage';

export async function POST() {
  try {
    await setStopRequested(true);
    await stopHarvesting();
    await saveHarvestingState('stopped');
    
    // Give time for state to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return NextResponse.json({ 
      message: 'stopping farming process',
      harvestingStatus: 'stopped'
    });
  } catch (error: unknown) {
    return NextResponse.json({ message: (error as Error).message.toLowerCase() }, { status: 500 });
  }
} 