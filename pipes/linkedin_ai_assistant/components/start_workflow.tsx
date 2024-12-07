"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Play, Loader2, Check } from "lucide-react";

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

export function StartWorkflow() {
  const [status, setStatus] = useState<'running' | 'idle' | 'error' | 'complete'>('idle');
  const [completedMode, setCompletedMode] = useState<'test' | 'full' | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    if (status === 'running') {
      const interval = setInterval(async () => {
        const statusRes = await fetch('/api/workflow/status');
        const data = await statusRes.json();
        
        setSteps(data.steps);
        setQueueStats(data.queueStats);
        
        if (!data.isRunning) {
          setStatus('complete');
          clearInterval(interval);
        }
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [status]);

  const startWorkflow = async (mode: 'test' | 'full') => {
    try {
      setStatus('running');
      setCompletedMode(null);
      const response = await fetch('/api/workflow/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode,
          allowTruncate: true
        })
      });
      
      if (!response.ok) {
        throw new Error('failed to start workflow');
      }
    } catch (error) {
      console.error('workflow error:', error);
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="text-sm">introduction requester:</span>
        <div className="flex gap-2">
          <Button
            onClick={() => startWorkflow('test')}
            disabled={status === 'running'}
            variant="outline"
            className="flex items-center gap-2"
          >
            {status === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === 'complete' && completedMode === 'test' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            test run (1 profile)
          </Button>
          <Button
            onClick={() => startWorkflow('full')}
            disabled={status === 'running'}
            className="flex items-center gap-2"
          >
            {status === 'running' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : status === 'complete' && completedMode === 'full' ? (
              <Check className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            full run
          </Button>
        </div>
      </div>

      {steps.length > 0 && (
        <div className="mt-4 space-y-2 text-sm">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
              {step.status === 'done' && <div className="w-3 h-3 rounded-full bg-green-500" />}
              {step.status === 'error' && <div className="w-3 h-3 rounded-full bg-red-500" />}
              <span className="font-medium">{step.step}:</span>
              <span className="text-gray-600">{step.details}</span>
            </div>
          ))}
          
          {queueStats && (
            <div className="mt-2 p-2 bg-gray-50 rounded-md">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>profiles in queue: {queueStats.currentQueueSize}</div>
                <div>total visited: {queueStats.totalVisited}</div>
                <div>newly queued: {queueStats.newlyQueued}</div>
                <div>already processed: {queueStats.alreadyVisited}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}