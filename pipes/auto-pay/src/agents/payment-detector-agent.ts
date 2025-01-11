import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { screenpipeSearch } from './tools/screenpipe-search';
import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { toast } from '@/components/ui/use-toast';
import { useCallback, useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import type { PaymentInfo } from '@/types/wise';
import type { Settings } from '@/types/settings';
import { getScreenpipeSettings } from '../../lib/screenpipe';
import { useSettings } from '@/hooks/use-settings';
import { usePaymentLifecycleStore } from '@/stores/payment-lifecycle-store';

// Zod schemas
const detectionSnippetSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  snippet: z.string().describe('Short text snippet with relevant keywords'),
  label: z
    .string()
    .describe('Small descriptor, e.g., "Possible invoice from X"'),
  confidence: z.number().min(0).max(100),
  timestamp: z.string().describe('When this payment-like text was detected'),
  source: z
    .object({
      app: z.string().optional(),
      window: z.string().optional(),
    })
    .optional(),
  amount: z.string().describe('The payment amount'),
  currency: z.string().describe('The payment currency'),
  description: z.string().describe('A description of the payment'),
});

const detectionAnswerSchema = z
  .object({
    detections: z.array(detectionSnippetSchema),
  })
  .describe('Submit the final list of detected payment-like snippets');

// Types derived from Zod schemas
export type DetectionSnippet = z.infer<typeof detectionSnippetSchema>;
export type DetectionAnswer = z.infer<typeof detectionAnswerSchema>;

export interface PaymentDetectionResult {
  detections: DetectionSnippet[];
  error?: string;
}

// Tool definition
const detectionAnswer = {
  description: 'Submit the final list of detected payment-like snippets',
  parameters: detectionAnswerSchema,
};

function getHumanActionFromToolCall(toolCall: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    return `Scanning for payment information${
      toolCall.args.query ? ` related to "${toolCall.args.query}"` : ''
    }`;
  }
  if (toolCall.toolName === 'detectionAnswer') {
    return 'Analyzing detected payment snippets';
  }
  return 'Processing...';
}

function getHumanResultFromToolCall(toolCall: any, result: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    if (Array.isArray(result) && result.length > 0) {
      return `Found ${result.length} potential matches`;
    }
    return 'No matches found';
  }
  if (toolCall.toolName === 'detectionAnswer') {
    const data = result as DetectionAnswer;
    return `Detected ${data.detections.length} potential payment(s)`;
  }
  return 'Step completed';
}

export async function runPaymentDetector(
  recognizedItemId: string,
  settings: Settings,
  addStep: (recognizedItemId: string, step: any) => void,
  updateStepResult: (
    recognizedItemId: string,
    stepId: string,
    result: string
  ) => void,
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<PaymentDetectionResult> {
  try {
    console.log('settings', settings);
    const openai = createOpenAI({
      apiKey: settings.openaiApiKey,
    });

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const { steps, toolCalls, toolResults } = await generateText({
      model: openai('gpt-4o'),
      tools: {
        screenpipeSearch,
        detectionAnswer,
      },
      toolChoice: 'required',
      maxSteps: 5,
      abortSignal: signal,
      system: `
      Time (UTC): ${new Date().toISOString()}

You are a specialized Payment Detection Agent. Your objective is to identify potential payment-related information from recent screen logs and captures provided by ScreenPipe.

SEARCH STRATEGY:
1. Start with a 2-minute window from the current time
2. If no results, expand to 4 minutes
3. If still no results, expand to 8 minutes
4. Continue doubling the window (16, 32, 64 minutes) until either:
   - Payment information is found
   - Or you reach 1024 minutes (about 17 hours)

DETECTION GUIDELINES:
• Focus on payment-specific keywords: invoice, amount, payment, transfer, due, balance
• Extract only essential context (100-200 chars) around payment information
• Include source metadata (app/window) when available
• Assign confidence scores based on:
  - Presence of specific amounts/currencies (higher confidence)
  - Payment-related keywords (medium confidence)
  - General financial terms (lower confidence)

IMPORTANT:
• DO NOT extract sensitive data (full account numbers, etc.)
• Each detection should be its own snippet
• Include timestamps for all detections
• Label each detection clearly (e.g., "Invoice from Company X")

Your final output must follow the \`detectionAnswer\` tool schema.
      `,
      prompt: `
        Search through recent screen activity to find payment-related information.
        Start with the last 2 minutes and progressively expand the search window if needed.
        Return focused snippets of payment-related text.
      `,
      onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
        const addStep = useAgentStepsStore.getState().addStep;
        const updateStepResult = useAgentStepsStore.getState().updateStepResult;

        toolCalls?.forEach((toolCall, index) => {
          const stepId = crypto.randomUUID();
          const humanAction = getHumanActionFromToolCall(toolCall);

          addStep(recognizedItemId, {
            text,
            toolCalls: [toolCall],
            toolResults: toolResults ? [toolResults[index]] : undefined,
            finishReason,
            usage,
            humanAction,
            tokenCount: usage?.totalTokens || 0,
          });

          if (toolResults?.[index]) {
            const humanResult = getHumanResultFromToolCall(
              toolCall,
              toolResults[index]
            );
            updateStepResult(recognizedItemId, stepId, humanResult);
          }

          if (onProgress) {
            const toolName =
              'toolName' in toolCall ? toolCall.toolName : 'unknown';
            onProgress(`Using tool: ${toolName}`);
          }
        });
      },
    });

    // Find the final detectionAnswer call
    const finalToolCall = toolCalls.find(
      (t) => 'toolName' in t && t.toolName === 'detectionAnswer'
    );
    if (!finalToolCall) {
      return {
        detections: [],
        error: 'No payments detected by the agent',
      };
    }

    // Get the detection results
    const answer = finalToolCall.args as DetectionAnswer;

    return {
      detections: answer.detections,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        detections: [],
        error: 'Payment detection was cancelled',
      };
    }
    console.error('0xHypr', 'Error in payment detection:', error);
    return {
      detections: [],
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error in payment detection',
    };
  }
}

// Hook to manage payment detection
export function usePaymentDetector(recognizedItemId: string) {
  const [result, setResult] = useState<PaymentDetectionResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const toastShownRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { settings } = useSettings();
  const addStep = useAgentStepsStore((state) => state.addStep);
  const updateStepResult = useAgentStepsStore((state) => state.updateStepResult);
  const addDetection = usePaymentLifecycleStore((state) => state.addDetection);
  const updateDetectionStatus = usePaymentLifecycleStore((state) => state.updateDetectionStatus);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
      toastShownRef.current = true;
      toast({
        title: 'Detection Aborted',
        description: 'Payment detection was cancelled.',
      });
    }
  }, []);

  const detectPayments = useCallback(async () => {
    try {
      if (!settings) {
        throw new Error('Settings not available');
      }

      setIsProcessing(true);
      setResult(null);
      toastShownRef.current = false;

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Show initial toast
      toast({
        title: 'Starting Detection',
        description: 'Scanning recent screen activity...',
      });
      toastShownRef.current = true;

      // Run detection
      const detectionResult = await runPaymentDetector(
        recognizedItemId,
        settings,
        addStep,
        updateStepResult,
        (message: string) => {
          toast({
            title: 'Detection Progress',
            description: message,
          });
        },
        abortControllerRef.current?.signal
      );

      console.log('0xHypr', 'Detection Result:', detectionResult);

      // Set result first before adding to lifecycle store
      setResult(detectionResult);

      // Add detections to lifecycle store if we have results
      if (detectionResult.detections.length > 0) {
        detectionResult.detections.forEach(snippet => {
          addDetection({
            status: 'detected',
            snippet,
          });
          // Update status immediately
          updateDetectionStatus(snippet.id, 'detected');
        });

        toast({
          title: 'Payments Detected',
          description: `Found ${detectionResult.detections.length} potential payment(s).`,
        });
      } else if (detectionResult.error) {
        toast({
          title: 'Detection Error',
          description: detectionResult.error,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'No Payments Found',
          description: 'No payment-related content was detected in recent activity.',
        });
      }

      return detectionResult;
    } catch (error) {
      console.error('0xHypr', 'Error in detectPayments:', error);
      const errorResult: PaymentDetectionResult = {
        detections: [],
        error: error instanceof Error ? error.message : 'Unknown error in payment detection',
      };
      
      // Set error result
      setResult(errorResult);
      
      toast({
        title: 'Detection Failed',
        description: errorResult.error,
        variant: 'destructive',
      });
      
      return errorResult;
    } finally {
      setIsProcessing(false);
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, [recognizedItemId, settings, addStep, updateStepResult, addDetection, updateDetectionStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Clear result on unmount
      setResult(null);
    };
  }, []);

  return {
    result,
    detectPayments,
    isProcessing,
    abort,
  };
}
