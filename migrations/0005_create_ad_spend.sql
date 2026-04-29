-- Migration 0005: ad_spend table
--
-- Stores daily per-platform per-campaign ad spend imported from platform
-- dashboards (Google Ads CSV today, Meta when it goes live, etc.). The
-- attribution dashboard tab joins this against the per-platform funnel
-- aggregates from /api/attribution-stats to surface CPA + ROAS.
--
-- spend_pence is INTEGER to avoid float drift across re-imports of the
-- same row; we divide by 100 server-side when surfacing to the UI.
--
-- Imports are idempotent via the UNIQUE(date, platform, campaign, source)
-- constraint - re-running the same CSV upserts in place rather than
-- duplicating. NULL campaign is allowed for platform-level aggregates
-- (some platforms don't expose campaign-level data, e.g. directory
-- listing platforms charged as a flat subscription).
--
-- The matching idempotent CREATE statement also lives in functions/api/
-- migrate.js so the safety-net migration endpoint keeps the table in sync.

CREATE TABLE IF NOT EXISTS ad_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  platform TEXT NOT NULL,
  campaign TEXT,
  spend_pence INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions REAL DEFAULT 0,
  currency TEXT DEFAULT 'GBP',
  source TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(date, platform, campaign, source)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_date ON ad_spend(date);
CREATE INDEX IF NOT EXISTS idx_ad_spend_platform ON ad_spend(platform);
CREATE INDEX IF NOT EXISTS idx_ad_spend_imported ON ad_spend(imported_at);
