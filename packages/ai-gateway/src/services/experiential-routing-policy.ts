// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import type { RequestBody } from '../types';
import { getFlatGatewayTokenRates } from './cost-tracker';

/** Only tiered pricing still requires the original provider's usage settlement. */
export function originalGatewayReason(model: string, _body?: Pick<RequestBody, 'messages'>): string | null {
  return getFlatGatewayTokenRates(model) ? null : 'native_context_pricing';
}
