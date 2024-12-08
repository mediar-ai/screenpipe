import { NextResponse } from 'next/server';

type WorkflowStep = {
  step: string;
  status: 'pending' | 'running' | 'done' | 'error';
  details?: string;
};

type QueueStats = {
  total: number;
  alreadyVisited: number;
  alreadyQueued: number;
  newlyQueued: number;
  currentQueueSize: number;
  totalVisited: number;
};

let isRunning = false;
let currentSteps: WorkflowStep[] = [];
let queueStats: QueueStats | null = null;

export function setRunningState(state: boolean) {
  isRunning = state;
  if (state) {
    currentSteps = [];
    queueStats = null;
  }
}

export function updateWorkflowStep(step: string, status: WorkflowStep['status'], details?: string) {
  const existingStep = currentSteps.find(s => s.step === step);
  if (existingStep) {
    existingStep.status = status;
    existingStep.details = details;
  } else {
    currentSteps.push({ step, status, details });
  }
}

export function updateQueueStats(stats: QueueStats) {
  queueStats = stats;
}

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