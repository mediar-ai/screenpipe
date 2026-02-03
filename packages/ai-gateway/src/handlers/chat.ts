import { Env, RequestBody } from '../types';
import { createProvider } from '../providers';
import { Langfuse } from 'langfuse-node';
import { addCorsHeaders } from '../utils/cors';

/**
 * Handles chat completion requests
 * @param body Request body containing chat messages and parameters
 * @param env Environment variables
 * @param langfuse Analytics client
 * @returns Response containing AI completion
 */
export async function handleChatCompletions(body: RequestBody, env: Env, langfuse: Langfuse): Promise<Response> {
  const provider = createProvider(body.model, env);
  const trace = langfuse.trace({
    id: 'ai_call_' + Date.now(),
    name: 'ai_call',
    metadata: {
      model: body.model,
      streaming: body.stream === true,
    },
  });

  try {
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

    trace.update({
      metadata: {
        completionStatus: 'success',
        completionTime: new Date().toISOString(),
        modelUsed: body.model,
        isStreaming: body.stream === true,
      },
      output: response.statusText,
    });

    // add CORS headers
    return addCorsHeaders(response);
  } catch (error: any) {
    trace.update({
      metadata: {
        completionStatus: 'error',
        errorTime: new Date().toISOString(),
        errorType: error.name,
        errorMessage: error.message,
      },
      output: error.message,
    });
    throw error;
  }
}