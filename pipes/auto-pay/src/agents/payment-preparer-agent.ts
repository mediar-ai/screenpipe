import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { screenpipeSearch } from './tools/screenpipe-search';
import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { toast } from '@/components/ui/use-toast';
import { useCallback, useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import type { PaymentInfo } from '@/types/wise';
import { useSettings } from '@/hooks/use-settings';
import { useSettingsStore } from '@/lib/settings';

// Zod schemas for Wise transfer data
const transferDetailsSchema = z.object({
  amount: z.string().describe('The amount to transfer'),
  currency: z.string().describe('The currency code (e.g. USD, EUR)'),
  targetAccount: z.object({
    accountHolderName: z.string().describe('Name of the account holder').nullable(),
    accountNumber: z.string().optional().describe('Account number if available').nullable(),
    routingNumber: z.string().optional().describe('Routing number if available').nullable(),
    iban: z.string().optional().describe('IBAN if available').nullable(),
    swiftCode: z.string().optional().describe('SWIFT/BIC code if available').nullable(),
    bankName: z.string().optional().describe('Name of the bank').nullable(),
    bankAddress: z.string().optional().describe('Address of the bank').nullable(),
  }),
  reference: z.string().optional().describe('Payment reference or note').nullable(),
  scheduledDate: z.string().optional().describe('When the transfer should be executed').nullable(),
}).describe('Details needed for a Wise transfer');

const transferPreparationSchema = z.object({
  transfer: transferDetailsSchema,
  confidence: z.number().min(0).max(100).describe('Confidence in the extracted details'),
  explanation: z.string().describe('Explanation of the confidence score and any missing details'),
}).describe('Complete transfer preparation result');

// Types derived from Zod schemas
export type TransferDetails = z.infer<typeof transferDetailsSchema>;
export type TransferPreparation = z.infer<typeof transferPreparationSchema>;

export interface PreparedTransfer {
  id: string;
  timestamp: string;
  details: TransferDetails;
  confidence: number;
  explanation: string;
  source: {
    text: string;
    app: string;
    window: string;
  };
}

export interface TransferPreparationResult {
  transfer?: PreparedTransfer;
  error?: string;
}

function getHumanActionFromToolCall(toolCall: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    return `Gathering payment details${toolCall.args.query ? ` for "${toolCall.args.query}"` : ''}`;
  }
  if (toolCall.toolName === 'transferPreparation') {
    return 'Preparing transfer details';
  }
  return 'Processing...';
}

function getHumanResultFromToolCall(toolCall: any, result: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    if (Array.isArray(result) && result.length > 0) {
      return `Found ${result.length} relevant details`;
    }
    return 'No additional details found';
  }
  if (toolCall.toolName === 'transferPreparation') {
    const data = result as TransferPreparation;
    return `Transfer prepared with ${data.confidence}% confidence`;
  }
  return 'Step completed';
}

const transferPreparation = {
  description: 'Submit the prepared transfer details',
  parameters: transferPreparationSchema,
};

export async function runPaymentPreparer(
  recognizedItemId: string,
  paymentContext: string,
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<TransferPreparationResult> {
  try {
    // Clear any existing steps for this item
    useAgentStepsStore.getState().clearSteps(recognizedItemId);
    const apiKey = useSettingsStore.getState().openaiApiKey;  
    const openai = createOpenAI({ apiKey: apiKey || undefined });

    // Check if already aborted
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const { steps, toolCalls, toolResults } = await generateText({
      model: openai('gpt-4o'),
      tools: {
        screenpipeSearch,
        transferPreparation,
      },
      toolChoice: 'required',
      maxSteps: 5,
      abortSignal: signal,
      system: `
      ${new Date().toISOString()}
        You are a payment preparation agent that extracts detailed transfer information.
        You have been given a payment context to analyze and prepare for a Wise transfer.
        
        Follow these steps:
        1. Analyze the provided payment context carefully
        2. Use screenpipeSearch to gather any missing details:
           - Look for specific amounts and currencies
           - Search for recipient bank details
           - Find any payment references or notes
           - Check for scheduling requirements
        
        3. For the transfer preparation:
           - Ensure all required fields are filled
           - Convert amounts to proper format
           - Validate bank details where possible
           - Include clear references
        
        4. Calculate confidence based on:
           - Completeness of required fields
           - Clarity of the information
           - Validation of bank details
           - Consistency across sources
        
        5. Provide detailed explanation of:
           - Why certain details were chosen
           - What might be missing
           - Any assumptions made
           - Validation results
        
        BE THOROUGH BUT EFFICIENT
        FOCUS ON ACCURACY OVER SPEED
      `,
      prompt: `
        Prepare a Wise transfer based on this payment context:
        ${paymentContext}
        
        Gather all necessary details and prepare them in the correct format.
        Be especially careful with:
        1. Amount and currency formatting
        2. Bank account details
        3. Payment references
        4. Scheduling requirements
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
            const humanResult = getHumanResultFromToolCall(toolCall, toolResults[index]);
            updateStepResult(recognizedItemId, stepId, humanResult);
          }

          // Notify progress
          if (onProgress) {
            const toolName = 'toolName' in toolCall ? toolCall.toolName : 'unknown';
            onProgress(`Using tool: ${toolName}`);
          }
        });
      },
    });

    // Find the final transferPreparation call
    const finalToolCall = toolCalls.find(t => 
      'toolName' in t && t.toolName === 'transferPreparation'
    );
    if (!finalToolCall) {
      throw new Error('Transfer preparation failed');
    }

    // Convert the transferPreparation results to PreparedTransfer format
    const preparation = finalToolCall.args as TransferPreparation;
    const preparedTransfer: PreparedTransfer = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      details: preparation.transfer,
      confidence: preparation.confidence,
      explanation: preparation.explanation,
      source: {
        text: preparation.explanation,
        app: '',
        window: '',
      }
    };

    return {
      transfer: preparedTransfer,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        error: 'Transfer preparation was cancelled',
      };
    }
    console.error('0xHypr', 'Error in transfer preparation:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error in transfer preparation',
    };
  }
}

// Hook to manage payment preparation
export function usePaymentPreparer(recognizedItemId: string) {
  const [result, setResult] = useState<TransferPreparationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const toastShownRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
      toastShownRef.current = true;
      toast({
        title: 'Preparation Aborted',
        description: 'Transfer preparation was cancelled.',
      });
    }
  }, []);

  const prepareTransfer = useCallback(async (paymentContext: string) => {
    try {
      setIsProcessing(true);
      setResult(null);
      toastShownRef.current = false;

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      // Run the payment preparation
      const result = await runPaymentPreparer(
        recognizedItemId,
        paymentContext,
        (message) => {
          if (!toastShownRef.current) {
            toast({
              title: 'Preparation Progress',
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
          title: 'Preparation Failed',
          description: result.error,
          variant: 'destructive',
        });
      } else if (!result.transfer && !toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Preparation Failed',
          description: 'Could not prepare transfer details.',
        });
      } else if (!toastShownRef.current) {
        toastShownRef.current = true;
        toast({
          title: 'Transfer Prepared',
          description: `Transfer details prepared with ${result.transfer?.confidence}% confidence.`,
        });
      }

      return result;
    } catch (error) {
      console.error('0xHypr', 'Error preparing transfer:', error);
      const errorResult = {
        error: error instanceof Error ? error.message : 'Unknown error preparing transfer',
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
  }, [recognizedItemId]);

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
    prepareTransfer,
    isProcessing,
    abort,
  };
}

function transferDetailsToPaymentInfo(details: TransferDetails): PaymentInfo {
    // Ensure we have non-null values for required fields
    if (!details.amount || !details.currency || !details.targetAccount.accountHolderName) {
        throw new Error('Missing required transfer details');
    }

    return {
        amount: details.amount,
        currency: details.currency,
        recipientName: details.targetAccount.accountHolderName,
        accountNumber: details.targetAccount.accountNumber || '',
        routingNumber: details.targetAccount.routingNumber || '',
        reference: details.reference || undefined,
        recipientEmail: undefined, // We don't have this in transfer details
    };
} 