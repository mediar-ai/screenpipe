import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { screenpipeSearch } from './tools/screenpipe-search';
import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { toast } from '@/components/ui/use-toast';
import { useCallback, useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import type { PaymentInfo } from '@/types/wise';
import { getScreenpipeSettings } from '../../lib/screenpipe';
import { useSettings } from '@/hooks/use-settings';

// Zod schemas
const bankDetailsSchema = z
  .object({
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    iban: z.string().optional(),
  })
  .describe('Bank account details for the payment');

const paymentDetailsSchema = z
  .object({
    amount: z.string(),
    currency: z.string(),
    recipient: z.string(),
    dueDate: z.string().optional(),
    bankDetails: bankDetailsSchema.optional(),
    reference: z.string().optional(),
  })
  .describe('Detailed payment information');

const paymentSchema = z.object({
  summary: z.string().describe('Clear description of what needs to be paid'),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence score (0-100) for this payment detection'),
  reason: z.string().describe('Explanation for the confidence score'),
  details: paymentDetailsSchema,
});

const paymentAnswerSchema = z
  .object({
    payments: z.array(paymentSchema),
  })
  .describe('Submit the final list of detected payments');

// Types derived from Zod schemas
export type BankDetails = z.infer<typeof bankDetailsSchema>;
export type PaymentDetails = z.infer<typeof paymentDetailsSchema>;
export type Payment = z.infer<typeof paymentSchema>;
export type PaymentAnswer = z.infer<typeof paymentAnswerSchema>;

export interface DetectedPayment {
  id: string;
  timestamp: string;
  summary: string;
  vitalInfo: string;
  confidence: number;
  source: {
    text: string;
    app: string;
    window: string;
  };
  details: PaymentDetails;
  paymentInfo: PaymentInfo;
}

export interface PaymentDetectionResult {
  payments: DetectedPayment[];
  error?: string;
}

function getHumanActionFromToolCall(toolCall: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    return `Scanning for payment information${
      toolCall.args.query ? ` related to "${toolCall.args.query}"` : ''
    }`;
  }
  if (toolCall.toolName === 'paymentAnswer') {
    return 'Analyzing detected payments';
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
  if (toolCall.toolName === 'paymentAnswer') {
    const data = result as PaymentAnswer;
    return `Detected ${data.payments.length} payment(s)`;
  }
  return 'Step completed';
}

const paymentAnswer = {
  description: 'Submit the final list of detected payments',
  parameters: paymentAnswerSchema,
};

function paymentDetailsToPaymentInfo(details: PaymentDetails): PaymentInfo {
  return {
    amount: details.amount || '0',
    currency: details.currency || 'USD',
    recipientName: details.recipient || 'Unknown Recipient',
    accountNumber: details.bankDetails?.accountNumber || '',
    routingNumber: details.bankDetails?.routingNumber || '',
    reference: details.reference,
  };
}

export async function runPaymentDetector(
  recognizedItemId: string,
  openaiApiKey: string,
  addStep: (recognizedItemId: string, step: any) => void,
  updateStepResult: (recognizedItemId: string, stepId: string, result: string) => void,
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<PaymentDetectionResult> {
  try {
    const openai = createOpenAI({ apiKey: openaiApiKey });

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const { steps, toolCalls, toolResults } = await generateText({
      model: openai('gpt-4o'),
      tools: {
        screenpipeSearch,
        paymentAnswer,
      },
      toolChoice: 'required',
      maxSteps: 5,
      abortSignal: signal,
      system: `
      ${new Date().toISOString()}
        You are a payment detection agent that looks for potential payments that need to be made.
        You can call "screenpipeSearch" to gather text from OCR/audio logs.
        Your goal is to find any mentions of:
        - Payments that need to be made
        - Invoices that need to be paid
        - Bank transfer requests
        - IBAN numbers or bank details
        - Payment amounts and currencies
        - Payment deadlines or due dates
    
        Stop as soon as you found 1 payment.

        Follow these steps:
        1. Start with broad searches for payment-related terms:
           - Use terms like "invoice", "payment", "transfer", "IBAN", "due", "amount"
           - Make sure queries are single elements that will be matched exactly
        
        2. When you find something, do focused searches to gather context:
           - Look for specific amounts and currencies
           - Search for recipient information
           - Find any payment references or notes
           - Check for due dates or deadlines
        
        3. For each potential payment:
           - Extract a clear summary
           - Note the source context
           - Calculate confidence based on completeness
           - Explain your confidence reasoning
        
        4. Once you have gathered all information:
           - Call paymentAnswer with the structured payment data
           - Include all found details (amount, recipient, due date, etc.)
           - Provide clear summaries and confidence scores
           - Explain your confidence reasoning

        BE THOROUGH BUT EFFICIENT
        FOCUS ON ACCURACY OVER SPEED
      `,
      prompt: `
        Search through recent screen activity to find any payments that need to be made.
        Focus on the last hour first, then expand if needed.
        Look for clear indicators of pending payments.
        
        For each potential payment found:
        1. Extract a clear summary of what needs to be paid
        2. Gather all vital payment information
        3. Note the source context
        4. Calculate a confidence score
      `,
      onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
        const addStep = useAgentStepsStore.getState().addStep;
        const updateStepResult = useAgentStepsStore.getState().updateStepResult;

        // For each tool call in the step
        toolCalls?.forEach((toolCall, index) => {
          const stepId = crypto.randomUUID();
          const humanAction = getHumanActionFromToolCall(toolCall);

          // Add the step with all information
          addStep(recognizedItemId, {
            text,
            toolCalls: [toolCall],
            toolResults: toolResults ? [toolResults[index]] : undefined,
            finishReason,
            usage,
            humanAction,
            tokenCount: usage?.totalTokens || 0,
          });

          // If we have results, update with human result
          if (toolResults?.[index]) {
            const humanResult = getHumanResultFromToolCall(
              toolCall,
              toolResults[index]
            );
            updateStepResult(recognizedItemId, stepId, humanResult);
          }

          // Notify progress
          if (onProgress) {
            const toolName =
              'toolName' in toolCall ? toolCall.toolName : 'unknown';
            onProgress(`Using tool: ${toolName}`);
          }
        });
      },
    });

    // Find the final paymentAnswer call
    const finalToolCall = toolCalls.find(
      (t) => 'toolName' in t && t.toolName === 'paymentAnswer'
    );
    if (!finalToolCall) {
      throw new Error('No payments detected by the agent');
    }

    // Convert the paymentAnswer results to DetectedPayment format
    const answer = finalToolCall.args as PaymentAnswer;
    const detectedPayments: DetectedPayment[] = answer.payments.map(
      (payment) => ({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        summary: payment.summary,
        vitalInfo: payment.reason,
        confidence: payment.confidence,
        source: {
          text: payment.reason,
          app: '',
          window: '',
        },
        details: payment.details,
        paymentInfo: paymentDetailsToPaymentInfo(payment.details),
      })
    );

    // Sort by confidence (most confident first)
    detectedPayments.sort((a, b) => b.confidence - a.confidence);

    return {
      payments: detectedPayments,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        payments: [],
        error: 'Payment detection was cancelled',
      };
    }
    console.error('0xHypr', 'Error in payment detection:', error);
    return {
      payments: [],
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
      setIsProcessing(true);
      setResult(null);
      toastShownRef.current = false;

      // Create new abort controller
      abortControllerRef.current = new AbortController();
      console.log('settings', settings);

      // Run the payment detection
      const result = await runPaymentDetector(
        recognizedItemId,
        settings?.openaiApiKey || '',
        addStep,
        updateStepResult,
        (message) => {
          if (!toastShownRef.current) {
            toast({
              title: 'Detection Progress',
              description: message,
            });
          }
        },
        abortControllerRef.current.signal
      );

      // Update state with result
      setResult(result);

      if (result.error && !toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Detection Failed',
          description: result.error,
          variant: 'destructive',
        });
      } else if (result.payments.length === 0 && !toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'No Payments Found',
          description: 'No pending payments were detected in recent activity.',
        });
      } else if (!toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Payments Detected',
          description: `Found ${result.payments.length} potential payment(s).`,
        });
      }

      return result;
    } catch (error) {
      console.error('0xHypr', 'Error detecting payments:', error);
      const errorResult = {
        payments: [],
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error detecting payments',
      };
      if (!toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Error',
          description: errorResult.error,
          variant: 'destructive',
        });
      }
      setResult(errorResult);
      return errorResult;
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  }, [recognizedItemId, settings?.openaiApiKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    result,
    detectPayments,
    isProcessing,
    abort,
  };
}
