import { loadState } from '@/lib/storage/storage';
import { NextResponse } from 'next/server';

export async function GET() {
  const state = await loadState();
  return NextResponse.json(state);
} 