import { NextResponse } from 'next/server';
import fetch from 'node-fetch';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:9222/json/version');
    if (!response.ok) {
      return NextResponse.json({ status: 'not_connected' }, { status: 200 });
    }
    const data = await response.json() as { webSocketDebuggerUrl: string };

    return NextResponse.json({
      wsUrl: data.webSocketDebuggerUrl,
      status: 'connected'
    });
  } catch {
    return NextResponse.json({ status: 'not_connected' }, { status: 200 });
  }
} 