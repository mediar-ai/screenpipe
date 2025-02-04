import { NextResponse } from 'next/server';
import { setShouldStopRefresh } from '@/lib/storage/storage';

export async function POST() {
  console.log('stop requested');
  await setShouldStopRefresh(true);
  return NextResponse.json({ message: 'refresh stop requested' });
} 