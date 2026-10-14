// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { describe, expect, it, spyOn } from 'bun:test';
import { createProvider, resolveModelAlias } from '../providers';
import { GeminiProvider } from '../providers/gemini';
import { argonPricing, argonVertexConfig } from '../providers/gemini-argon';
import { getHostedChatGatewayConnection, gatewayProviderForModel, isCloudflareSpendLimitError } from '../services/cloudflare-ai-gateway';
import { getHostedAiAllowedModels } from '../services/hosted-ai-policy';
import { getModelCost, hasPricing } from '../services/cost-tracker';
import { handleModelListing } from '../handlers/models';

const model = 'gemini-4-argon';
const db = { prepare: () => ({ all: async () => ({ results: [] }) }) };
const env = { DB: db, VERTEX_AUTH_MODE: 'wif', WIF_SIGNING_KEY: 'synthetic-key', WIF_PROJECT_ID: 'synthetic-project',
  CLOUDFLARE_AI_GATEWAY_ID: 'test', AI: { gateway: () => ({ getUrl: async () => 'https://gateway.ai.cloudflare.com/v1/account/test/google-vertex-ai' }) } } as any;
const context = { user_id: 'synthetic', plan: 'business', lane: 'explicit', workload: 'interactive', trial: false } as const;

async function provider() {
  const connection = await getHostedChatGatewayConnection(env, 'google-vertex-ai', context);
  const result = createProvider(model, env, connection) as any;
  result.vertexProvider.getAccessToken = async () => 'synthetic-access-token';
  return result;
}

describe('Argon hosted Vertex route', () => {
  it('keeps Argon canonical while older Gemini IDs stay retired', () => {
    expect(resolveModelAlias('GEMINI-4-ARGON')).toBe(model);
    expect(resolveModelAlias('gemini-3.5-flash')).toBe('gpt-5.6-luna');
    expect(gatewayProviderForModel(model)).toBe('google-vertex-ai');
    expect(() => createProvider(model, env)).toThrow('Cloudflare AI Gateway');
    expect(argonVertexConfig({ ...env, WIF_SIGNING_KEY: '' })).toBeUndefined();
    expect(argonVertexConfig({ ...env, WIF_SIGNING_KEY: 'placeholder' })).toBeUndefined();
  });
  it('uses global Vertex via Cloudflare for both response modes and preserves query auth', async () => {
    const p = await provider();
    expect(p).toBeInstanceOf(GeminiProvider);
    for (const stream of [false, true]) {
      const url = new URL(p.getEndpointUrl(model, stream));
      expect(url.hostname).toBe('gateway.ai.cloudflare.com');
      expect(url.pathname).toBe(`/v1/account/test/google-vertex-ai/v1/projects/synthetic-project/locations/global/publishers/google/models/${model}:${stream ? 'streamGenerateContent' : 'generateContent'}`);
      expect(url.searchParams.has('alt')).toBe(stream);
    }
    p.connection.baseURL += '?token=synthetic';
    expect(new URL(p.getEndpointUrl(model, true)).searchParams.get('token')).toBe('synthetic');
    const headers = await p.getAuthHeaders();
    expect(headers.Authorization).toBe('Bearer synthetic-access-token');
    expect(JSON.parse(headers['cf-aig-metadata'])).toEqual(context);
    expect(headers['cf-aig-collect-log-payload']).toBe('false');
    expect(headers['cf-aig-byok-alias']).toBeUndefined();
    expect(headers['X-Vertex-AI-LLM-Shared-Request-Type']).toBeUndefined();
    expect(JSON.parse(headers['cf-aig-custom-cost']).per_token_out).toBe(argonPricing().output / 1e6);
  });
  it('caps each response mode and maps supported reasoning levels', async () => {
    const p = await provider();
    for (const stream of [false, true]) {
      const request = p.buildRequestBody({ model, stream, max_tokens: 128000, reasoning_effort: 'low', messages: [{ role: 'user', content: 'hello' }] });
      expect(request.generationConfig.maxOutputTokens).toBe(stream ? 65536 : 32768);
      expect(request.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
      expect(request.generationConfig.temperature).toBeUndefined();
    }
  });
  it('preserves spend-limit errors for both response modes without converting them to generic failures', async () => {
    const p = await provider();
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ name: 'AiGatewayError', internalCode: 2041 }, { status: 429 }));
    try {
      for (const stream of [false, true]) {
        let failure;
        try { await p[stream ? 'createStreamingCompletion' : 'createCompletion']({ model, stream, messages: [] }); } catch (e) { failure = e; }
        expect(isCloudflareSpendLimitError(failure)).toBe(true);
      }
    } finally { fetch.mockRestore(); }
  });
  it('includes thinking tokens and cache hits in non-streaming and streaming usage', async () => {
    const p = await provider();
    const response = { modelVersion: model, candidates: [{ content: { parts: [{ text: 'hello' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 25, totalTokenCount: 135, cachedContentTokenCount: 60 } };
    expect(p.formatResponse(response, false).usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 35, total_tokens: 135, prompt_tokens_details: { cached_tokens: 60 } });
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(`data: ${JSON.stringify(response)}\n\n`));
    try {
      const text = await new Response(await p.createStreamingCompletion({ model, stream: true, messages: [] })).text();
      expect(text).toContain('"completion_tokens":35');
      expect(text).toContain('"cached_tokens":60');
      expect(text).toContain('[DONE]');
    } finally { fetch.mockRestore(); }
  });
  it('advertises Argon only with configured auth and gateway, with Business gating', async () => {
    for (const tier of ['logged_in', 'subscribed'] as const) {
      const res = await handleModelListing(env, tier);
      const body = await res.json() as any;
      expect(body.data.find((entry: any) => entry.id === model)).toMatchObject({ name: 'Gemini 4 Argon', context_window: 1048576, max_output_tokens: 32768 });
      expect(!!body.data.find((entry: any) => entry.id === model).locked).toBe(tier === 'logged_in');
    }
    for (const overrides of [{ WIF_SIGNING_KEY: '' }, { CLOUDFLARE_AI_GATEWAY_ID: '' }, { AI: undefined }]) {
      const body = await (await handleModelListing({ ...env, ...overrides })).json() as any;
      expect(body.data.some((entry: any) => entry.id === model)).toBe(false);
    }
    expect(getHostedAiAllowedModels('basic')).not.toContain(model);
    expect(getHostedAiAllowedModels('enterprise')).toContain(model);
  });
  it('accounts for the launch-price expiry and discounted cached input', () => {
    expect(argonPricing(Date.UTC(2026, 10, 30, 23, 59, 59))).toEqual({ input: 2, output: 10, cacheRead: 0.05 });
    expect(argonPricing(Date.UTC(2026, 11, 1))).toEqual({ input: 4, output: 20, cacheRead: 0.05 });
    expect(hasPricing(model)).toBe(true);
    const price = argonPricing();
    expect(getModelCost(model, 1000000, 1000000, { cache_read_tokens: 1000000 })).toBeCloseTo(price.input * .05 + price.output);
  });
});
