// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import type { Env, RequestBody } from '../types';
import { getHostedChatGatewayConnection, type CloudflareGatewayProvider, type HostedChatGatewayContext } from './cloudflare-ai-gateway';
import { getFlatGatewayTokenRates } from './cost-tracker';
import { originalGatewayReason } from './experiential-routing-policy';

export const EXPERIENTIAL_INFERENCE_ORIGIN = 'https://api.experientiallabs.ai';
const EXPERIENTIAL_MODEL_ALIASES: Readonly<Record<string, string>> = {
  // Canonical UUID ffcde1be-a8de-4c40-b32a-e1fd08d1ad98: same native deployment.
  'claude-haiku-5-5': 'claude-haiku-5.5',
  // OpenAI documents the unsuffixed alias as Sol, not Terra/Luna:
  // https://developers.openai.com/api/docs/models/gpt-5.6-sol
  // Destination canonical UUID a8fb7577-00cf-4bf6-aef5-e3383cacd11c.
  'gpt-5.6': 'gpt-5.6-sol',
};

/** Hybrid routing keeps customer identity and spend enforcement on Cloudflare.
 * Unsupported features retain their original native provider. The older direct
 * Experiential mode remains an internal-service diagnostic canary only. */
export async function resolveHostedChatConnection(
  env: Env, provider: CloudflareGatewayProvider, context: HostedChatGatewayContext, model: string,
  body?: Pick<RequestBody, 'messages'>, forceOriginalReason?: string,
) {
  const hybrid = env.HOSTED_CHAT_GATEWAY === 'experiential';
  const nativeProvider = provider === 'openai' || provider === 'anthropic';
  const retainedReason = forceOriginalReason ?? (hybrid && nativeProvider ? originalGatewayReason(model, body) : null);
  if (hybrid && nativeProvider && !retainedReason) {
    const apiKey = env.EXPERIENTIAL_API_KEY?.trim();
    const slug = env.CLOUDFLARE_EXPERIENTIAL_PROVIDER?.trim();
    if (!apiKey || !/^xpl_[0-9a-f]{40}$/.test(apiKey) || !slug || !/^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
        !env.CLOUDFLARE_AI_GATEWAY_TOKEN?.trim()) {
      throw Object.assign(new Error('Experiential hybrid gateway credentials or custom provider are not configured'), { status: 503, transient: false });
    }
    const connection = await getHostedChatGatewayConnection(env, provider, context);
    const url = new URL(connection.baseURL);
    if (!url.pathname.endsWith(`/${provider}`)) throw new Error('Unexpected native Cloudflare provider URL');
    url.pathname = url.pathname.slice(0, -provider.length) + slug + (provider === 'openai' ? '/v1' : '');
    const defaultHeaders: Record<string, string | null> = { ...connection.defaultHeaders,
      Authorization: `Bearer ${apiKey}`,
      'cf-aig-custom-cost': JSON.stringify(getFlatGatewayTokenRates(model)),
      ...(provider === 'anthropic' ? { 'x-api-key': null } : {}),
    };
    delete defaultHeaders['cf-aig-byok-alias'];
    return { ...connection, baseURL: url.toString().replace(/\/$/, ''), apiKey, defaultHeaders,
      model: EXPERIENTIAL_MODEL_ALIASES[model] ?? model,
      gateway: 'experiential' as const, allowanceGateway: 'cloudflare' as const, gatewayReason: 'experiential_supported',
    };
  }
  if (hybrid || env.HOSTED_CHAT_GATEWAY === 'cloudflare' || forceOriginalReason || env.EXPERIENTIAL_CANARY_MODE !== 'internal' || context.plan !== 'internal' ||
      (provider !== 'openai' && provider !== 'anthropic')) {
    const connection = await getHostedChatGatewayConnection(env, provider, context);
    // getUrl() returns an address, not authentication. Dedicated canaries do
    // not copy production gateway tokens. Use the existing authenticated
    // gateway binding for their rollback while preserving native SDK payloads.
    // Customer traffic and token-configured production connections are unchanged.
    const binding = context.plan === 'internal' && env.EXPERIENTIAL_API_KEY &&
      !env.CLOUDFLARE_AI_GATEWAY_BASE_URL?.trim() && !env.CLOUDFLARE_AI_GATEWAY_TOKEN?.trim() &&
      (provider === 'openai' || provider === 'anthropic')
      ? env.AI.gateway(String(env.CLOUDFLARE_AI_GATEWAY_ID)) : undefined;
    const bindingFetch = binding && typeof binding.run === 'function'
      ? (async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          const prefix = connection.baseURL.replace(/\/$/, '') + '/';
          if (!url.startsWith(prefix) || init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') {
            throw new Error('Unexpected canary rollback SDK request');
          }
          const endpoint = url.slice(prefix.length);
          if (!['chat/completions','responses','v1/messages'].includes(endpoint)) {
            throw new Error('Unexpected canary rollback protocol');
          }
          const headers = Object.fromEntries([...new Headers(init.headers)].filter(([name]) => !name.startsWith('cf-aig-')));
          return binding.run({ provider, endpoint, headers, query: JSON.parse(init.body) }, {
            extraHeaders: Object.fromEntries(Object.entries(connection.defaultHeaders).filter(([name, value]) => name.startsWith('cf-aig-') && value !== null)),
          });
        }) as typeof fetch : undefined;
    return { ...connection, ...(bindingFetch ? { fetch: bindingFetch } : {}), gateway: 'cloudflare' as const, model,
      allowanceGateway: 'cloudflare' as const,
      gatewayReason: retainedReason ?? (hybrid ? 'retained_provider' : 'original_gateway'),
    };
  }
  const apiKey = env.EXPERIENTIAL_API_KEY?.trim();
  if (!apiKey || !/^xpl_[0-9a-f]{40}$/.test(apiKey)) {
    const error = new Error('EXPERIENTIAL_API_KEY is not configured for the internal canary');
    Object.assign(error, { status: 503, transient: false });
    throw error;
  }
  return {
    baseURL: provider === 'anthropic' ? EXPERIENTIAL_INFERENCE_ORIGIN : `${EXPERIENTIAL_INFERENCE_ORIGIN}/v1`,
    apiKey,
    maxRetries: 0,
    defaultHeaders: {
      Authorization: `Bearer ${apiKey}`,
      ...(provider === 'anthropic' ? { 'x-api-key': null } : {}),
    },
    model: EXPERIENTIAL_MODEL_ALIASES[model] ?? model,
    gateway: 'experiential' as const,
    allowanceGateway: undefined,
    gatewayReason: 'internal_canary',
  };
}
