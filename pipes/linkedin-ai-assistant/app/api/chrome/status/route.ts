import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const logs: string[] = [];
const addLog = (msg: string) => {
  console.log(msg);
  logs.push(`${new Date().toISOString()} - ${msg}`);
};

export async function GET() {
  try {
    addLog('checking chrome connection status...');
    const response = await fetch('http://127.0.0.1:9222/json/version');
    
    if (!response.ok) {
      addLog('chrome not connected');
      return NextResponse.json({ 
        status: 'not_connected',
        logs 
      }, { status: 200 });
    }

    const data = await response.json() as { webSocketDebuggerUrl: string };
    addLog('chrome connected, getting websocket url');
    
    const wsUrl = data.webSocketDebuggerUrl.replace('ws://localhost:', 'ws://127.0.0.1:');
    addLog(`websocket url: ${wsUrl}`);

    return NextResponse.json({
      wsUrl,
      status: 'connected',
      logs
    });
  } catch (error) {
    addLog(`error checking status: ${error}`);
    return NextResponse.json({ 
      status: 'not_connected',
      error: String(error),
      logs 
    }, { status: 200 });
  }
} 