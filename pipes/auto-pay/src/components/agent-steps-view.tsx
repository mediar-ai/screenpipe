import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, CheckCircle2, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { AgentStep } from '@/stores/agent-steps-store';

interface AgentStepsViewProps {
  recognizedItemId: string;
  className?: string;
}

export function AgentStepsView({ recognizedItemId, className }: AgentStepsViewProps) {
  const [localSteps, setLocalSteps] = useState<AgentStep[]>([]);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = useAgentStepsStore.subscribe((state) => {
      const steps = state.steps[recognizedItemId] || [];
      setLocalSteps(steps);
    });
    
    // Initial load
    const initialSteps = useAgentStepsStore.getState().steps[recognizedItemId] || [];
    setLocalSteps(initialSteps);

    return () => unsubscribe();
  }, [recognizedItemId]);

  const toggleStep = useCallback((stepId: string) => {
    setExpandedSteps(prev => ({
      ...prev,
      [stepId]: !prev[stepId]
    }));
  }, []);

  if (localSteps.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <div className="space-y-2">
        {localSteps.map((step) => (
          <div
            key={step.id}
            className="text-sm border rounded-lg p-3 space-y-2"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {step.finishReason ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(step.timestamp).toLocaleTimeString()}
                </span>
              </div>
              {step.usage && (
                <span className="text-xs text-muted-foreground">
                  {step.usage.totalTokens} tokens
                </span>
              )}
            </div>

            {step.humanAction && (
              <div className="font-medium text-sm text-primary">
                {step.humanAction}
              </div>
            )}

            {step.humanResult && (
              <div className="text-sm text-muted-foreground">
                {step.humanResult}
              </div>
            )}

            {(step.toolCalls?.length || step.text) && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start p-0 h-auto font-normal hover:bg-transparent"
                onClick={() => toggleStep(step.id)}
              >
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {expandedSteps[step.id] ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span>Technical Details</span>
                </div>
              </Button>
            )}

            {expandedSteps[step.id] && (
              <div className="pl-4 space-y-2">
                {step.text && (
                  <div className="text-sm">
                    {step.text}
                  </div>
                )}

                {step.toolCalls?.map((toolCall, index) => {
                  const toolResult = step.toolResults?.[index];
                  const displayText = typeof toolResult === 'string' 
                    ? toolResult 
                    : toolResult 
                      ? JSON.stringify(toolResult, null, 2)
                      : '';

                  return (
                    <div
                      key={`${step.id}-${index}`}
                      className="bg-muted/50 rounded p-2 text-xs space-y-1"
                    >
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Search className="h-3 w-3" />
                        {'toolName' in toolCall && (
                          <span>Using {toolCall.toolName}</span>
                        )}
                      </div>
                      {displayText && (
                        <div className="pl-5 pt-1 border-l text-xs">
                          <pre className="overflow-x-auto whitespace-pre-wrap">
                            {displayText}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {step.finishReason === 'error' && (
              <div className="flex items-center gap-2 text-destructive text-xs">
                <AlertCircle className="h-3 w-3" />
                <span>Error: {step.text}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 