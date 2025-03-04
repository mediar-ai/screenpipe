import { Env } from '../types';
import { createProvider } from '../providers';
import { createSuccessResponse, createErrorResponse } from '../utils/cors';

/**
 * Handles model listing requests
 * @param env Environment variables
 * @returns Response with list of available AI models
 */
export async function handleModelListing(env: Env): Promise<Response> {
  try {
    const providers = {
      anthropic: createProvider('claude-3-5-sonnet-latest', env),
      openai: createProvider('gpt-4', env),
      gemini: createProvider('gemini-1.5-pro', env),
    };

    const results = await Promise.allSettled([
      providers.anthropic.listModels(),
      providers.openai.listModels(),
      providers.gemini.listModels(),
    ]);

    const models = results
      .filter(
        (result): result is PromiseFulfilledResult<{ id: string; name: string; provider: string }[]> =>
          result.status === 'fulfilled'
      )
      .flatMap((result) => result.value);

    return createSuccessResponse({ models });
  } catch (error) {
    console.error('Error fetching models:', error);
    return createErrorResponse(
      500, 
      `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}