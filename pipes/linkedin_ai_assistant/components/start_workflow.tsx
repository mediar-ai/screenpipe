"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Play, Loader2 } from "lucide-react";

export function StartWorkflow() {
  const [status, setStatus] = useState<'running' | 'idle' | 'error'>('idle');

  const startWorkflow = async () => {
    try {
      setStatus('running');
      const response = await fetch('/api/workflow/start', { method: 'POST' });
      
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
        <Button
          onClick={startWorkflow}
          disabled={status === 'running'}
          className="flex items-center gap-2"
        >
          {status === 'running' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {status === 'running' ? 'running...' : 'start'}
        </Button>
      </div>

      {status === 'error' && (
        <div className="text-sm text-red-500">
          workflow failed
        </div>
      )}
    </div>
  );
}