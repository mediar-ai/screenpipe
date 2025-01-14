import { loadProfiles } from '@/lib/storage/storage';
import { NextResponse } from 'next/server';

export async function GET() {
  const profiles = await loadProfiles();
  return NextResponse.json(profiles);
} 