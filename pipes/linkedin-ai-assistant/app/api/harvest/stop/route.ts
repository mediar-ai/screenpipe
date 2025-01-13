import { NextResponse } from 'next/server';
import { stopHarvesting } from '@/lib/logic-sequence/harvest-connections';
import { saveHarvestingState } from '@/lib/storage/storage';

export async function POST() {
  try {
    stopHarvesting();
    await saveHarvestingState('stopped');
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return NextResponse.json({ 
      message: 'stopping harvest process',
      harvestingStatus: 'stopped'
    });
  } catch (error: unknown) {
    return NextResponse.json({ message: (error as Error).message.toLowerCase() }, { status: 500 });
  }
} 