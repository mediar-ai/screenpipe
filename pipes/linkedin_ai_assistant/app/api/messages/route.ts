import { loadMessages } from '@/lib/storage/storage';
import { NextResponse } from 'next/server';

export async function GET() {
  const messages = await loadMessages();
  return NextResponse.json(messages);
} 