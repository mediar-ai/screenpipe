import { Env, UserTier, TierLimits, UsageResult, UsageStatus } from '../types';

// Tier configuration - models and limits per tier
export const TIER_CONFIG: Record<UserTier, TierLimits> = {
  anonymous: {
    dailyQueries: 25,
    rpm: 5,
    allowedModels: [
      'claude-haiku-4-5@20251001',
      'claude-3-haiku-20240307',
    ],
  },
  logged_in: {
    dailyQueries: 50,
    rpm: 10,
    allowedModels: [
      'claude-haiku-4-5@20251001',
      'claude-3-haiku-20240307',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'gpt-4o-mini',
    ],
  },
  subscribed: {
    dailyQueries: -1, // unlimited
    rpm: 30,
    allowedModels: ['*'], // all models
  },
};

// SQL schema for the usage table
export const USAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS usage (
  device_id TEXT PRIMARY KEY,
  user_id TEXT,
  daily_count INTEGER DEFAULT 0,
  last_reset TEXT,
  tier TEXT DEFAULT 'anonymous',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_usage_last_reset ON usage(last_reset);
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
`;

/**
 * Get today's date in UTC as ISO string (YYYY-MM-DD)
 */
function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get the reset time for the next day (midnight UTC)
 */
function getNextResetTime(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

/**
 * Track a request and check if it's within limits
 */
export async function trackUsage(
  env: Env,
  deviceId: string,
  tier: UserTier,
  userId?: string
): Promise<UsageResult> {
  const today = getTodayUTC();
  const limits = TIER_CONFIG[tier];

  // Subscribed users have unlimited queries
  if (tier === 'subscribed') {
    return {
      used: 0,
      limit: -1,
      remaining: -1,
      allowed: true,
      resetsAt: getNextResetTime(),
    };
  }

  try {
    // Try to get existing record
    const existing = await env.DB.prepare(
      'SELECT daily_count, last_reset FROM usage WHERE device_id = ?'
    ).bind(deviceId).first<{ daily_count: number; last_reset: string }>();

    let dailyCount = 0;

    if (existing) {
      // Check if we need to reset (new day)
      if (existing.last_reset < today) {
        // Reset count for new day
        await env.DB.prepare(
          'UPDATE usage SET daily_count = 1, last_reset = ?, tier = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE device_id = ?'
        ).bind(today, tier, userId || null, deviceId).run();
        dailyCount = 1;
      } else {
        // Increment count
        dailyCount = existing.daily_count + 1;
        await env.DB.prepare(
          'UPDATE usage SET daily_count = ?, tier = ?, user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE device_id = ?'
        ).bind(dailyCount, tier, userId || null, deviceId).run();
      }
    } else {
      // Create new record
      await env.DB.prepare(
        'INSERT INTO usage (device_id, user_id, daily_count, last_reset, tier) VALUES (?, ?, 1, ?, ?)'
      ).bind(deviceId, userId || null, today, tier).run();
      dailyCount = 1;
    }

    const allowed = dailyCount <= limits.dailyQueries;

    return {
      used: dailyCount,
      limit: limits.dailyQueries,
      remaining: Math.max(0, limits.dailyQueries - dailyCount),
      allowed,
      resetsAt: getNextResetTime(),
    };
  } catch (error) {
    console.error('Error tracking usage:', error);
    // On error, allow the request but log it
    return {
      used: 0,
      limit: limits.dailyQueries,
      remaining: limits.dailyQueries,
      allowed: true,
      resetsAt: getNextResetTime(),
    };
  }
}

/**
 * Get current usage status without incrementing
 */
export async function getUsageStatus(
  env: Env,
  deviceId: string,
  tier: UserTier
): Promise<UsageStatus> {
  const today = getTodayUTC();
  const limits = TIER_CONFIG[tier];

  let usedToday = 0;

  if (tier !== 'subscribed') {
    try {
      const existing = await env.DB.prepare(
        'SELECT daily_count, last_reset FROM usage WHERE device_id = ?'
      ).bind(deviceId).first<{ daily_count: number; last_reset: string }>();

      if (existing && existing.last_reset >= today) {
        usedToday = existing.daily_count;
      }
    } catch (error) {
      console.error('Error getting usage status:', error);
    }
  }

  const limitToday = tier === 'subscribed' ? -1 : limits.dailyQueries;
  const remaining = tier === 'subscribed' ? -1 : Math.max(0, limits.dailyQueries - usedToday);

  const status: UsageStatus = {
    tier,
    used_today: usedToday,
    limit_today: limitToday,
    remaining,
    resets_at: getNextResetTime(),
    model_access: limits.allowedModels,
  };

  // Add upgrade options for non-subscribed users
  if (tier === 'anonymous') {
    status.upgrade_options = {
      login: { benefit: '+25 daily queries, access to Sonnet model' },
      subscribe: { benefit: 'Unlimited queries, all models including GPT-4 and Claude Opus' },
    };
  } else if (tier === 'logged_in') {
    status.upgrade_options = {
      subscribe: { benefit: 'Unlimited queries, all models including GPT-4 and Claude Opus' },
    };
  }

  return status;
}

/**
 * Check if a model is allowed for a given tier
 */
export function isModelAllowed(model: string, tier: UserTier): boolean {
  const allowedModels = TIER_CONFIG[tier].allowedModels;

  // Subscribed users can use any model
  if (allowedModels.includes('*')) {
    return true;
  }

  // Check if the model is in the allowed list
  return allowedModels.some(allowed =>
    model.toLowerCase().includes(allowed.toLowerCase()) ||
    allowed.toLowerCase().includes(model.toLowerCase())
  );
}

/**
 * Initialize the database schema
 */
export async function initializeSchema(env: Env): Promise<void> {
  try {
    await env.DB.exec(USAGE_SCHEMA);
    console.log('Usage schema initialized');
  } catch (error) {
    console.error('Error initializing schema:', error);
  }
}
