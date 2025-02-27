import { createErrorResponse } from './cors';
import { Env } from '../types';

export class RateLimiter {
  private state: DurableObjectState;
  private requests: Map<string, { count: number; lastReset: number }>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.requests = new Map();
  }

  /**
   * Handles fetch requests to check and update rate limits
   * @param request The HTTP request
   * @returns Response with rate limit status
   */
  async fetch(request: Request) {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const url = new URL(request.url);
    const now = Date.now();

    // different limits for different endpoints
    const limits: Record<string, { rpm: number; window: number }> = {
      '/v1/chat/completions': { rpm: 20, window: 60000 }, // 20 requests per minute for openai
      default: { rpm: 60, window: 60000 }, // 60 rpm for other endpoints
    };

    const limit = limits[url.pathname] || limits.default;

    // get or initialize request tracking
    let tracking = this.requests.get(ip) || { count: 0, lastReset: now };

    // reset if window expired
    if (now - tracking.lastReset > limit.window) {
      tracking = { count: 0, lastReset: now };
    }

    tracking.count++;
    this.requests.set(ip, tracking);

    const isAllowed = tracking.count <= limit.rpm;

    return new Response(
      JSON.stringify({
        allowed: isAllowed,
        remaining: Math.max(0, limit.rpm - tracking.count),
        reset_in: Math.ceil((tracking.lastReset + limit.window - now) / 1000),
      })
    );
  }
}

/**
 * Checks if the request exceeds rate limits
 * @param request The HTTP request
 * @param env Environment variables
 * @returns Object indicating if request is allowed and optional error response
 */
export async function checkRateLimit(request: Request, env: Env): Promise<{ allowed: boolean; response?: Response }> {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rateLimiterId = env.RATE_LIMITER.idFromName(ip);
  const rateLimiter = env.RATE_LIMITER.get(rateLimiterId);

  const rateLimitResponse = await rateLimiter.fetch(request.url);
  const rateLimitData = (await rateLimitResponse.json()) as { allowed: boolean; remaining: number; reset_in: number };

  if (!rateLimitData.allowed) {
    return { 
      allowed: false, 
      response: createErrorResponse(429, 'rate limit exceeded')
    };
  }

  return { allowed: true };
}