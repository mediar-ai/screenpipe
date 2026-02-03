import { Env, UserTier } from '../types';
import { createProvider } from '../providers';
import { createSuccessResponse, createErrorResponse, addCorsHeaders } from '../utils/cors';
import { TIER_CONFIG, isModelAllowed } from '../services/usage-tracker';

/**
 * Handles model listing requests
 * @param env Environment variables
 * @param tier User tier for filtering models
 * @returns Response with list of available AI models
 */
export async function handleModelListing(env: Env, tier: UserTier = 'subscribed'): Promise<Response> {
  try {
    // Only use Vertex AI which provides both Claude and Gemini
    const vertex = createProvider('claude-opus-4-20250514', env);
    const results = await Promise.allSettled([
      vertex.listModels(),
    ]);

    let models = results
      .filter(
        (result): result is PromiseFulfilledResult<{ id: string; name: string; provider: string }[]> =>
          result.status === 'fulfilled'
      )
      .flatMap((result) => result.value);

    // Filter models based on tier
    if (tier !== 'subscribed') {
      const allowedModels = TIER_CONFIG[tier].allowedModels;
      models = models.filter(model =>
        allowedModels.some(allowed =>
          model.id.toLowerCase().includes(allowed.toLowerCase()) ||
          allowed.toLowerCase().includes(model.id.toLowerCase())
        )
      );

      // Add metadata about tier restrictions
      models = models.map(model => ({
        ...model,
        tier_available: true,
      }));
    }

    // Return in OpenAI-compatible format (data array) with tier info
    return addCorsHeaders(createSuccessResponse({
      data: models,
      models: models, // Also include as 'models' for backwards compatibility
      tier,
      tier_limits: TIER_CONFIG[tier],
    }));
  } catch (error) {
    console.error('Error fetching models:', error);
    return addCorsHeaders(createErrorResponse(
      500,
      `Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`
    ));
  }
}
