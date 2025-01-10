import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:9222/json/version');
    if (!response.ok) {
      return NextResponse.json({ status: 'not_connected' }, { status: 200 });
    }
    const data = await response.json() as { webSocketDebuggerUrl: string };

    const wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');

    return NextResponse.json({
      wsUrl,
      status: 'connected'
    });
  } catch {
    return NextResponse.json({ status: 'not_connected' }, { status: 200 });
  }
} 