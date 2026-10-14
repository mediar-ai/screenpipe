// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { expect, it } from 'bun:test';
import { createProvider, resolveModelAlias, RETIRED_HOSTED_MODEL_FALLBACK } from '../providers';
import { AnthropicProvider } from '../providers/anthropic';
import { getModelCost } from '../services/cost-tracker';

it('routes Haiku 5.5 to Anthropic without reviving retired Haiku aliases', () => {
  expect(resolveModelAlias('claude-haiku-5-5')).toBe('claude-haiku-5-5');
  expect(resolveModelAlias('claude-haiku-4-5')).toBe(RETIRED_HOSTED_MODEL_FALLBACK);
  expect(createProvider('claude-haiku-5-5', { ANTHROPIC_API_KEY: 'synthetic' } as any)).toBeInstanceOf(AnthropicProvider);
});

it('prices Haiku across the 100k boundary including cached prompt tokens', () => {
  expect(getModelCost('claude-haiku-5-5', 100_000, 1_000)).toBeCloseTo(0.0105, 9);
  expect(getModelCost('claude-haiku-5-5', 100_001, 1_000)).toBeCloseTo(0.0525005, 9);
  expect(getModelCost('claude-haiku-5-5', 110_000, 1_000,
    { cache_read_tokens: 100_000, cache_creation_tokens: 5_000 })).toBeCloseTo(0.013125, 9);
});

for (const stream of [false, true]) {
  it(`uses Haiku's effort setting and valid sampling options, stream=${stream}`, async () => {
    const provider: any = new AnthropicProvider('synthetic');
    let sent: any;
    provider.client = { messages: { create: async (params: any) => {
      sent = params;
      return stream ? { async *[Symbol.asyncIterator]() {} } : {
        content: [{ type: 'thinking', thinking: '', signature: 'synthetic' }, { type: 'text', text: 'ok' }],
        usage: { input_tokens: 10, output_tokens: 2 }, stop_reason: 'end_turn',
      };
    } } };
    const body = { model: 'claude-haiku-5-5', temperature: 0.2, reasoning_effort: 'low',
      messages: [{ role: 'user', content: 'Say ok' }] };
    const response = stream ? new Response(await provider.createStreamingCompletion(body)) : await provider.createCompletion(body);
    await response.text();
    expect(sent.model).toBe('claude-haiku-5-5');
    expect(sent.temperature).toBeUndefined();
    expect(sent.output_config).toEqual({ effort: 'low' });
  });
}
