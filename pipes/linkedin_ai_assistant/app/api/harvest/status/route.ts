import { NextResponse } from 'next/server';
import { loadConnections } from '@/lib/storage/storage';

export async function GET() {
  try {
    const connectionsStore = await loadConnections();
    return NextResponse.json({
      isHarvesting: connectionsStore.isHarvesting || false,
      nextHarvestTime: connectionsStore.nextHarvestTime,
      connectionsSent: connectionsStore.connectionsSent || 0
    });
  } catch (error: any) {
    return NextResponse.json({ message: error.message?.toLowerCase() }, { status: 500 });
  }
} 