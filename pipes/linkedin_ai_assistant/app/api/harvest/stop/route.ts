import { NextResponse } from 'next/server';
import { stopHarvesting } from '@/lib/logic_sequence/harvest_connections';
import { saveHarvestingState } from '@/lib/storage/storage';

export async function POST() {
  try {
    stopHarvesting();
    await saveHarvestingState(false);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return NextResponse.json({ 
      message: 'stopping harvest process',
      isHarvesting: false 
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message.toLowerCase() }, { status: 500 });
  }
} 