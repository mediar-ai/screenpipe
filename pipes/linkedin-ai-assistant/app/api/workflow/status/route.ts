import { setRunningState, currentSteps, queueStats } from './state';

let isRunning = false;

export async function GET() {
  return new Response(JSON.stringify({ 
    isRunning,
    steps: currentSteps,
    queueStats
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: Request) {
  const { state } = await request.json();
  setRunningState(state);
  return new Response(JSON.stringify({ success: true }));
} 