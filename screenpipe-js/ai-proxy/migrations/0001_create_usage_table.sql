-- Migration: Create usage tracking table for free tier AI limits
-- Run with: wrangler d1 execute screenpipe-usage --file=./migrations/0001_create_usage_table.sql

CREATE TABLE IF NOT EXISTS usage (
  device_id TEXT PRIMARY KEY,
  user_id TEXT,
  daily_count INTEGER DEFAULT 0,
  last_reset TEXT NOT NULL,
  tier TEXT DEFAULT 'anonymous',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for efficient daily reset queries
CREATE INDEX IF NOT EXISTS idx_usage_last_reset ON usage(last_reset);

-- Index for user lookups (when user logs in, we can link devices)
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);

-- Index for tier-based analytics
CREATE INDEX IF NOT EXISTS idx_usage_tier ON usage(tier);
