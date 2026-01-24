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
    // Only use Vertex AI which provides both Claude and Gemini
    const vertex = createProvider('claude-opus-4-20250514', env);
    const results = await Promise.allSettled([
      vertex.listModels(),
    ]);

    const models = results
      .filter(
        (result): result is PromiseFulfilledResult<{ id: string; name: string; provider: string }[]> =>
          result.status === 'fulfilled'
      )
      .flatMap((result) => result.value);

    // Return in OpenAI-compatible format (data array)
    return createSuccessResponse({ data: models });
  } catch (error) {
    console.error('Error fetching models:', error);
    return createErrorResponse(
      500, 
      `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}