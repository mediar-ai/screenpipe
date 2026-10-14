// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import type { Env } from '../types';
import { buildWifConfig } from './vertex';
import type { VertexGeminiConfig } from './gemini';

export const GEMINI_ARGON_MODEL = 'gemini-4-argon';

function configured(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() &&
    !['placeholder', 'changeme', 'change-me', 'todo', 'none', 'null', 'undefined'].includes(value.trim().toLowerCase());
}

/** Require the selected auth mode; never silently fall back from broken WIF. */
export function argonVertexConfig(env: Env): VertexGeminiConfig | undefined {
  if (env.VERTEX_AUTH_MODE === 'wif') {
    if (!configured(env.WIF_SIGNING_KEY)) return undefined;
    const wif = buildWifConfig(env)!;
    return { serviceAccountJson: '{}', projectId: wif.projectId, region: 'global', wif };
  }
  if (!configured(env.VERTEX_SERVICE_ACCOUNT_JSON) || !configured(env.VERTEX_PROJECT_ID)) return undefined;
  try {
    const account = JSON.parse(env.VERTEX_SERVICE_ACCOUNT_JSON);
    if (!configured(account.private_key) || !configured(account.client_email)) return undefined;
  } catch { return undefined; }
  return { serviceAccountJson: env.VERTEX_SERVICE_ACCOUNT_JSON, projectId: env.VERTEX_PROJECT_ID, region: 'global' };
}

export function isArgonConfigured(env: Env): boolean {
  return !!argonVertexConfig(env) && configured(env.CLOUDFLARE_AI_GATEWAY_ID) &&
    (!!env.AI?.gateway || configured(env.CLOUDFLARE_AI_GATEWAY_BASE_URL));
}

/** USD per million tokens. Introductory pricing ends after Nov 30, 2026.
 * https://cloud.google.com/blog/products/ai-machine-learning/gemini-4-argon-available-on-google-cloud
 */
export function argonPricing(now = Date.now()) {
  return now < Date.UTC(2026, 11, 1)
    ? { input: 2, output: 10, cacheRead: 0.05 }
    : { input: 4, output: 20, cacheRead: 0.05 };
}
