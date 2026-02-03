/**
 * Screenpipe Supabase Read-Only Agent
 *
 * Safe database queries for public data only.
 * Never commit API keys - use Vercel CLI to pull .env.local
 *
 * Usage:
 *   vercel env pull
 *   const agent = new SupabaseAgent()
 *   await agent.getActiveFeatures()
 */

import { createClient } from "@supabase/supabase-js";

interface SupabaseAgent {
  queryPublicAnalytics(filters: {
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]>;

  getActiveFeatures(): Promise<Feature[]>;

  getPricingTiers(): Promise<PricingTier[]>;

  getFeatureStatus(featureName: string): Promise<boolean>;
}

interface Feature {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

interface PricingTier {
  id: string;
  name: string;
  monthly_price: number;
  features: Record<string, boolean>;
  storage_gb: number;
  api_calls_month: number;
  created_at: string;
}

interface AnalyticsEvent {
  id: string;
  event_type: string;
  event_count: number;
  date: string;
  created_at: string;
}

/**
 * Initialize Supabase client with public key only.
 * Private keys should NEVER be used in agents/published code.
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const publicKey = process.env.SUPABASE_PUBLIC_KEY;

  if (!url || !publicKey) {
    throw new Error(
      "Missing Supabase environment variables. Run: vercel env pull"
    );
  }

  return createClient(url, publicKey);
}

/**
 * Query public analytics data with optional filters.
 *
 * Safe example usage:
 * ```
 * const agent = new SupabaseReadAgent()
 * const stats = await agent.queryPublicAnalytics({
 *   eventType: 'capture',
 *   startDate: new Date('2025-01-01'),
 *   endDate: new Date('2025-02-01'),
 *   limit: 100
 * })
 * ```
 */
async function queryPublicAnalytics(filters: {
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<AnalyticsEvent[]> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from("user_analytics")
    .select("id, event_type, event_count, date, created_at");

  // Build filter conditions
  if (filters.eventType) {
    query = query.eq("event_type", filters.eventType);
  }

  if (filters.startDate) {
    query = query.gte("date", filters.startDate.toISOString().split("T")[0]);
  }

  if (filters.endDate) {
    query = query.lte("date", filters.endDate.toISOString().split("T")[0]);
  }

  // Limit results (default 100, max 1000)
  const limit = Math.min(filters.limit || 100, 1000);
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error("Supabase query error:", error.message);
    throw new Error(`Failed to fetch analytics: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all active features.
 *
 * Safe example:
 * ```
 * const features = await agent.getActiveFeatures()
 * features.forEach(f => console.log(`${f.name}: ${f.description}`))
 * ```
 */
async function getActiveFeatures(): Promise<Feature[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("features")
    .select("id, name, enabled, description, created_at, updated_at")
    .eq("enabled", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase query error:", error.message);
    throw new Error(`Failed to fetch features: ${error.message}`);
  }

  return data || [];
}

/**
 * Get all pricing tiers.
 *
 * Safe example:
 * ```
 * const tiers = await agent.getPricingTiers()
 * tiers.forEach(t => console.log(`${t.name}: $${t.monthly_price / 100}`))
 * ```
 */
async function getPricingTiers(): Promise<PricingTier[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("pricing_tiers")
    .select(
      "id, name, monthly_price, features, storage_gb, api_calls_month, created_at"
    )
    .order("monthly_price", { ascending: true });

  if (error) {
    console.error("Supabase query error:", error.message);
    throw new Error(`Failed to fetch pricing: ${error.message}`);
  }

  return data || [];
}

/**
 * Check if a specific feature is enabled.
 *
 * Safe example:
 * ```
 * const isOcrBetaEnabled = await agent.getFeatureStatus('ocr_beta')
 * if (isOcrBetaEnabled) { console.log('OCR beta is available') }
 * ```
 */
async function getFeatureStatus(featureName: string): Promise<boolean> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("features")
    .select("enabled")
    .eq("name", featureName)
    .single();

  if (error) {
    console.warn(`Feature "${featureName}" not found`);
    return false;
  }

  return data?.enabled ?? false;
}

/**
 * ❌ BLOCKED: Example of what NOT to do
 *
 * These operations will FAIL due to Row-Level Security policies:
 */

// ❌ Attempting to query user sessions (private data)
// async function getUserSessions(userId: string) {
//   const supabase = getSupabaseClient()
//   const { data, error } = await supabase
//     .from('sessions')
//     .select('*')
//     .eq('user_id', userId)
//   // Result: 403 Forbidden - RLS policy blocks access
// }

// ❌ Attempting to access API keys
// async function getApiKeys() {
//   const supabase = getSupabaseClient()
//   const { data, error } = await supabase.from('api_keys').select('*')
//   // Result: 403 Forbidden - RLS policy blocks access
// }

// ❌ Attempting to fetch user logs
// async function getUserLogs(userId: string) {
//   const supabase = getSupabaseClient()
//   const { data, error } = await supabase
//     .from('logs')
//     .select('*')
//     .eq('user_id', userId)
//   // Result: 403 Forbidden - RLS policy blocks access
// }

export const SupabaseReadAgent = {
  queryPublicAnalytics,
  getActiveFeatures,
  getPricingTiers,
  getFeatureStatus,
};

// Example usage (comment out in production)
if (require.main === module) {
  (async () => {
    console.log("Supabase Read-Only Agent\n");

    try {
      const features = await getActiveFeatures();
      console.log("Active features:", features.length);
      features.slice(0, 3).forEach((f) => console.log(`  - ${f.name}`));

      const tiers = await getPricingTiers();
      console.log("\nPricing tiers:", tiers.length);
      tiers.forEach((t) => console.log(`  - ${t.name}: $${t.monthly_price / 100}`));

      const analytics = await queryPublicAnalytics({ limit: 5 });
      console.log("\nRecent analytics:", analytics.length, "records");
    } catch (error) {
      console.error("Error:", (error as Error).message);
    }
  })();
}
