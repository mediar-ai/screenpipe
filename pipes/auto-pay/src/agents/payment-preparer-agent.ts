import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { screenpipeSearch } from './tools/screenpipe-search';
import { useAgentStepsStore } from '@/stores/agent-steps-store';
import { toast } from '@/components/ui/use-toast';
import { useCallback, useState, useRef, useEffect } from 'react';
import { z } from 'zod';
import { useSettings } from '@/hooks/use-settings';
import { useSettingsStore } from '@/lib/settings';
import { usePaymentLifecycleStore } from '@/stores/payment-lifecycle-store';
import type { Settings } from '@/types/settings';

// Zod schemas for payment preparation
const bankDetailsSchema = z
  .object({
    accountNumber: z.string().optional(),
    routingNumber: z.string().optional(),
    iban: z.string().optional(),
  })
  .describe('Bank account details extracted from the payment snippet');

const transferDetailsSchema = z
  .object({
    amount: z.string().describe('The payment amount'),
    currency: z.string().describe('The payment currency (e.g., USD)'),
    email: z.string().optional().describe('The email address of the recipient'),
    targetAccount: z
      .object({
        accountHolderName: z.string().optional(),
        accountNumber: z.string().optional(),
        routingNumber: z.string().optional(),
        iban: z.string().optional(),
      })
      .describe('Target account details'),
    reference: z.string().optional().describe('Payment reference or note'),
    dueDate: z.string().optional().describe('When the payment is due'),
  })
  .describe('Detailed transfer information extracted from the snippet');

// Add new schema for candidate fields
const candidateFieldSchema = z
  .object({
    field: z.string(),
    value: z.string(),
    confidence: z.number(),
    lineIndex: z.number(),
    source: z.string().describe('Where this value was found in the text'),
  })
  .describe('A candidate value for a payment field');

const transferAnswerSchema = z
  .object({
    transfer: z
      .object({
        details: transferDetailsSchema,
        confidence: z.number(),
        explanation: z.string().describe('Why these details were extracted'),
        candidates: z
          .array(candidateFieldSchema)
          .optional()
          .describe('All potential values found during extraction'),
      })
      .describe('The prepared transfer details with confidence score'),
  })
  .describe('Submit the extracted transfer details');

// Types derived from schemas
export type BankDetails = z.infer<typeof bankDetailsSchema>;
export type TransferDetails = z.infer<typeof transferDetailsSchema>;
export type PreparedTransferDetails = TransferDetails;
export type TransferAnswer = z.infer<typeof transferAnswerSchema>;

export interface PaymentPreparationResult {
  transfer?: {
    details: TransferDetails;
    confidence: number;
    explanation: string;
  };
  error?: string;
}

function getHumanActionFromToolCall(toolCall: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    return `Gathering additional context${
      toolCall.args.query ? ` for "${toolCall.args.query}"` : ''
    }`;
  }
  if (toolCall.toolName === 'transferAnswer') {
    return 'Extracting payment details';
  }
  return 'Processing...';
}

function getHumanResultFromToolCall(toolCall: any, result: any) {
  if (toolCall.toolName === 'screenpipeSearch') {
    if (Array.isArray(result) && result.length > 0) {
      return `Found ${result.length} relevant context items`;
    }
    return 'No additional context found';
  }
  if (toolCall.toolName === 'transferAnswer') {
    const data = result as TransferAnswer;
    return `Extracted payment details with ${data.transfer.confidence}% confidence`;
  }
  return 'Step completed';
}

// Tool definition
const transferAnswer = {
  description: 'Submit the extracted transfer details',
  parameters: transferAnswerSchema,
};

export async function runPaymentPreparer(
  recognizedItemId: string,
  snippet: string,
  openaiApiKey: string,
  addStep: (recognizedItemId: string, step: any) => void,
  updateStepResult: (
    recognizedItemId: string,
    stepId: string,
    result: string
  ) => void,
  onProgress?: (message: string) => void,
  signal?: AbortSignal
): Promise<PaymentPreparationResult> {
  try {
    const openai = createOpenAI({ apiKey: openaiApiKey });

    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const { steps, toolCalls, toolResults } = await generateText({
      model: openai('gpt-4o'),
      tools: {
        screenpipeSearch,
        transferAnswer,
      },
      toolChoice: 'required',
      maxSteps: 5,
      abortSignal: signal,
      system: `
        You are a payment preparation agent analyzing text to extract structured payment data.
        Your goal is to progressively build accurate payment details through multiple passes.
        Use screenpipeSearch to gather additional context to search for routing numbers, account numbers, and other payment details.
        Look for routing numbers, account numbers, and other payment details.
      

        You are the "Payment Preparation Agent" analyzing a messy OCR snippet.
        Always search screenpipe after analyzing the snippet
        search screenpipe for routing numbers, account numbers, and other payment details.

Rules:
1. Focus on lines or fragments mentioning "invoice #", "due date", "amount", "total", or "account/routing numbers".
2. The snippet is messy; partial matches in multiple lines likely belong to the same invoice if they are within ~3 lines or ~150 characters of each other.
3. If you see "INVOICE #05" in line 1 and "7.86" + "3.37" + "TOTAL 11.23 USD" in lines 2-6, combine them into a single invoice with total 11.23 USD.
4. If "BILLED TO: Different Al Inc" is also near "INVOICE #05," treat them as the same invoice context.
5. Return final details in 'transferAnswer' with:
   - invoiceNumber: '05'
   - amount: '11.23'
   - currency: 'USD'
   - reference or description: if found
   - confidence >= 80 if lines are adjacent.
6. If partial references contradict, pick the more complete or later line.

Now parse:
"INVOICE #05 ...
some partial lines

\"BILLED TO: Different Al Inc
   482, 166 Geary St
   STE 1500,
   SFranc
7.86 ?

$3.37 ???

TOTAL  11.23 USD ???

Payment ???


        ANALYSIS STRATEGY:
        1. First Pass - Collect All References:
           • Identify every mention of payment-related data
           • Track line numbers and context for each reference
           • Note confidence level for each piece of data

        2. Progressive Updates:
           • If new data contradicts old data, prefer:
             - More recent mentions (later in text)
             - More complete information
             - Higher confidence references
           • Update fields as you find better data
           • Combine partial information when appropriate

        3. Spatial Analysis:
           • Lines within 3 lines or ~200 chars are likely related
           • "INVOICE #05" followed by "Amount: $7.86" = same invoice
           • Bank details near each other likely form one set

        4. Confidence Scoring:
           • Full, clear numbers = 90%+ confidence
           • Partial or unclear = 60-80% confidence
           • Conflicting data = note in explanation
           • Adjacent, related data = boost confidence

        5. Final Verification:
           • Re-check all fields before finalizing
           • Ensure consistency across related fields
           • Prefer most recent, complete data
           • Document overrides in explanation

        IMPORTANT:
        • DO NOT finalize until entire snippet is processed
        • Track all candidate values with line numbers
        • Explain significant updates or overrides
        • Return both final details and candidate list
      `,
      prompt: `
        Analyze this payment-related text snippet:
        "${snippet}"

        Follow the multi-pass strategy:
        1. First collect ALL possible payment references
        2. Then progressively update with better data
        3. Finally return the most accurate, complete set

        Include candidates array to show your work.
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

    const finalToolCall = toolCalls.find(
      (t) => 'toolName' in t && t.toolName === 'transferAnswer'
    );
    if (!finalToolCall) {
      return {
        error: 'Could not extract payment details',
      };
    }

    const answer = finalToolCall.args as TransferAnswer;
    return {
      transfer: answer.transfer,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {
        error: 'Payment preparation was cancelled',
      };
    }
    console.error('0xHypr', 'Error in payment preparation:', error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error in payment preparation',
    };
  }
}

// Hook to manage payment preparation
export function usePaymentPreparer(recognizedItemId: string) {
  const [result, setResult] = useState<PaymentPreparationResult | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const { settings } = useSettings();
  const addStep = useAgentStepsStore((state) => state.addStep);
  const updateStepResult = useAgentStepsStore(
    (state) => state.updateStepResult
  );
  const { startPreparation, updatePreparation } = usePaymentLifecycleStore();

  const prepareTransfer = useCallback(
    async (snippet: string, detectionId: string) => {
      try {
        if (!settings?.openaiApiKey) {
          throw new Error('OpenAI API key not available');
        }

        setIsProcessing(true);
        setResult(null);
        setCandidates([]);

        // Start preparation in lifecycle store
        const preparationId = crypto.randomUUID();
        startPreparation(detectionId);

        // Run preparation
        const result = await runPaymentPreparer(
          recognizedItemId,
          snippet,
          settings.openaiApiKey,
          addStep,
          updateStepResult
        );

        // Store candidates if available
        if ('transfer' in result && result.transfer?.candidates) {
          setCandidates(result.transfer.candidates);
        }

        // Update preparation in lifecycle store with progressive details
        if ('transfer' in result && result.transfer) {
          updatePreparation(preparationId, {
            status: 'prepared',
            recipientDetails: {
              name:
                result.transfer.details.targetAccount.accountHolderName || '',
              email: '',
              routingNumber:
                result.transfer.details.targetAccount.routingNumber || '',
              accountNumber:
                result.transfer.details.targetAccount.accountNumber || '',
              accountType: 'businessChecking' as const,
              address: {
                country: 'US',
                postalCode: '',
                region: '',
                city: '',
                address1: '',
              },
            },
            paymentDetails: {
              amount: result.transfer.details.amount || '',
              currency: result.transfer.details.currency || '',
              description: result.transfer.details.reference || '',
            },
            confidence: result.transfer.confidence,
            explanation: result.transfer.explanation,
          });
        } else if ('error' in result) {
          updatePreparation(preparationId, {
            status: 'failed',
            error: result.error,
          });
        }

        setResult(result);
        return result;
      } catch (error) {
        console.error('0xHypr', 'Error in payment preparation:', error);
        const errorResult = {
          error:
            error instanceof Error
              ? error.message
              : 'Unknown error in payment preparation',
        };
        setResult(errorResult);
        return errorResult;
      } finally {
        setIsProcessing(false);
      }
    },
    [
      settings,
      recognizedItemId,
      addStep,
      updateStepResult,
      startPreparation,
      updatePreparation,
    ]
  );

  return {
    result,
    candidates,
    prepareTransfer,
    isProcessing,
  };
}
