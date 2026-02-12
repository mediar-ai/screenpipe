import { Env, RequestBody } from '../types';
import { createProvider } from '../providers';
import { addCorsHeaders } from '../utils/cors';

/**
 * Handles chat completion requests
 * @param body Request body containing chat messages and parameters
 * @param env Environment variables
 * @returns Response containing AI completion
 */
export async function handleChatCompletions(body: RequestBody, env: Env): Promise<Response> {
  const provider = createProvider(body.model, env);

  let response: Response;

  if (body.stream) {
    const stream = await provider.createStreamingCompletion(body);
    response = new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } else {
    response = await provider.createCompletion(body);
  }

  return addCorsHeaders(response);
}
