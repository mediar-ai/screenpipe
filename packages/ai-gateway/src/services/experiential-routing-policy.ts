// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import type { RequestBody } from '../types';
import { hasImages } from '../utils/message-content';
import { getFlatGatewayTokenRates } from './cost-tracker';

const TEXT_ONLY_EXPERIENTIAL_MODELS = new Set(['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5-mini', 'gpt-5-nano']);

/** The requested model stays unchanged when a feature uses the original route. */
export function originalGatewayReason(model: string, body?: Pick<RequestBody, 'messages'>): string | null {
  if (model === 'gpt-5.4-pro') return 'experiential_model_unavailable';
  if (body && hasImages(body) && TEXT_ONLY_EXPERIENTIAL_MODELS.has(model)) return 'experiential_vision_unavailable';
  if (!getFlatGatewayTokenRates(model)) return 'native_context_pricing';
  // The installed provider adds explicit breakpoints to leading instructions.
  // Experiential rejects those options. Keep the original request and caching.
  if (/^gpt-5\.6(?:$|[.-])/i.test(model) && body?.messages.some(message =>
    (message.role === 'system' || message.role === 'developer') &&
    (typeof message.content === 'string' ? message.content.length > 0 : Array.isArray(message.content) && message.content.length > 0))) {
    return 'native_prompt_caching';
  }
  return null;
}
