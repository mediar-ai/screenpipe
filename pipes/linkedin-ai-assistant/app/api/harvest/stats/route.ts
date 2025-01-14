import { NextResponse } from 'next/server';
import { loadConnections } from '@/lib/storage/storage';

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  try {
    const connectionsStore = await loadConnections();
    
    // Calculate stats using reduce
    const stats = Object.values(connectionsStore.connections).reduce((acc, connection) => {
      const status = connection.status || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      stats: {
        pending: stats?.pending || 0,
        accepted: stats?.accepted || 0,
        declined: stats?.declined || 0,
        email_required: stats?.email_required || 0,
        cooldown: stats?.cooldown || 0,
        total: Object.keys(connectionsStore.connections).length,
        lastRefreshDuration: connectionsStore.lastRefreshDuration,
        averageProfileCheckDuration: connectionsStore.averageProfileCheckDuration
      }
    });
  } catch (error) {
    console.error('stats check failed:', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
} 