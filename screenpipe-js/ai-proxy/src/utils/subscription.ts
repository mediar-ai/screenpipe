import { Env } from '../types';

/**
 * Cache for subscription status to reduce API calls
 */
class SubscriptionCache {
  private cache: Map<string, { isValid: boolean; timestamp: number }>;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor() {
    this.cache = new Map();
  }

  get(userId: string): boolean | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.CACHE_TTL) {
      this.cache.delete(userId);
      return null;
    }

    return entry.isValid;
  }

  set(userId: string, isValid: boolean) {
    this.cache.set(userId, {
      isValid,
      timestamp: Date.now(),
    });
  }
}

export const subscriptionCache = new SubscriptionCache();

/**
 * Validates if a user has an active subscription
 * @param env Environment variables
 * @param userId User ID to validate
 * @returns Promise resolving to boolean indicating if subscription is valid
 */
export async function validateSubscription(env: Env, userId: string): Promise<boolean> {
  console.log('validating user id has cloud sub', userId);
  // Check cache first
  const cached = subscriptionCache.get(userId);
  if (cached !== null) {
    return cached;
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (UUID_REGEX.test(userId)) {
    try {
      const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/has_active_cloud_subscription`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input_user_id: userId }),
      });

      if (!response.ok) {
        console.error('Supabase error:', await response.text());
        return false;
      }

      const isValid: boolean = await response.json();
      subscriptionCache.set(userId, isValid);
      return isValid;
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  return false;
}