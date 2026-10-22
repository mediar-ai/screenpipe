// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { RequestBody } from '../types';
import { AstraProvider } from './astra';

// Published API boundaries, not gateway guesses. See the corresponding model
// pages at https://developers.openai.com/api/docs/models/ .
export const OPENAI_PRO_NATIVE_FEATURES = {
  'gpt-5.4-pro': { streaming: true, structuredOutput: false },
  'gpt-5.5-pro': { streaming: false, structuredOutput: true },
} as const;

/** Keep the public Chat contract while using the Pro models' required Responses
 * API. Reuse existing image/tool conversion and response normalization. */
export class OpenAIProProvider extends AstraProvider {
  protected parameters(body: RequestBody): ResponseCreateParamsNonStreaming {
    this.responseModel = body.model;
    const features = OPENAI_PRO_NATIVE_FEATURES[body.model as keyof typeof OPENAI_PRO_NATIVE_FEATURES];
    if (!features) throw new Error('Unknown OpenAI Pro model');
    if (!features.structuredOutput && body.response_format && body.response_format.type !== 'text') {
      throw Object.assign(new Error(`${body.model} does not support structured output. Choose a model with native structured output support.`),
        { status: 400, transient: false, code: 'unsupported_response_format' });
    }
    const effort = body.reasoning_effort;
    if (effort !== undefined && effort !== 'medium' && effort !== 'high' && effort !== 'xhigh') {
      throw Object.assign(new Error(`${body.model} supports medium, high or xhigh reasoning effort.`),
        { status: 400, transient: false, code: 'unsupported_reasoning_effort' });
    }
    const params = super.parameters(body);
    // Preserve the provider's documented default when no effort was requested;
    // never inherit Astra's model-specific Low setting for a Pro model.
    // The installed SDK predates xhigh; the native Pro APIs document it.
    if (effort) params.reasoning = { effort } as ResponseCreateParamsNonStreaming['reasoning'];
    else delete params.reasoning;
    const budget = body.max_completion_tokens ?? body.max_tokens;
    if (budget !== undefined) params.max_output_tokens = budget;
    return params;
  }

  async createStreamingCompletion(body: RequestBody): Promise<ReadableStream> {
    if (body.model === 'gpt-5.4-pro') return super.createStreamingCompletion(body);
    // GPT-5.5 Pro has no native stream. Adapt its completed response to the
    // existing SSE contract without claiming incremental upstream generation.
    const result: any = await (await this.createCompletion(body)).json();
    const choice = result.choices[0];
    const message = choice.message;
    const chunk = { id: result.id, created: result.created, model: body.model, object: 'chat.completion.chunk' };
    const delta = { ...message, ...(message.tool_calls ? {
      tool_calls: message.tool_calls.map((call: any, index: number) => ({ index, ...call })),
    } : {}) };
    const events = [
      { ...chunk, choices: [{ index: 0, delta, finish_reason: null }] },
      { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }] },
      ...(result.usage ? [{ ...chunk, choices: [], usage: result.usage }] : []),
    ];
    const encoder = new TextEncoder();
    return new ReadableStream({ start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    } });
  }
}
