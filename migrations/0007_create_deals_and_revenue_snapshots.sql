-- Phase A of prd-sys-reporting-unification.md (Atlas, 1 June 2026 go-live)
--
-- Purpose: mirror HubSpot deals + contacts lifecycle into D1 so the live
-- admin dashboard can read directly from D1 instead of waiting on CSV
-- exports. Provides the data layer the reporting unification PRD requires
-- to retire hackney-reports.pages.dev during Phase D.
--
-- Three new tables:
--
--   deals             - HubSpot deal mirror, one row per deal.
--   deal_history      - append-only audit trail of every change.
--   revenue_snapshots - per-period revenue capture taken at every sync
--                       run, used by the variance audit to flag silent
--                       deletions (the Katharine & Ray pattern, 19 May
--                       2026: a £5k won wedding deal disappeared between
--                       HubSpot exports with no trace).
--
-- Plus six lifecycle-stage entry timestamps on contacts. Mirrors the
-- HubSpot "Date entered '<stage>' (Lifecycle Stage Pipeline)" properties.
-- These were missing from the 19 May 2026 contacts export's default
-- column view and broke the funnel-health section of the monthly report.
--
-- Cancellation modelling: Option A per Jon's 19 May 2026 decision -
-- preserve is_closed_won=true forever, mark cancellations with a
-- separate is_cancelled flag + cancelled_at + cancel_reason. Strongest
-- audit trail; revenue snapshots reflect "won at the time" honestly
-- and reporting subtracts cancellations explicitly. The sync function
-- detects cancellations by diffing D1's set of won deals against
-- HubSpot's current set (Hugo's pattern is to delete the record, not
-- change stage, so simple stage-change detection is not enough).

CREATE TABLE IF NOT EXISTS deals (
  deal_id TEXT PRIMARY KEY,                  -- HubSpot deal id (hs_object_id)
  contact_id TEXT,                           -- D1 contacts.contact_id (FK app-enforced)
  hubspot_primary_contact_id TEXT,           -- raw HubSpot primary contact id

  deal_name TEXT,
  amount INTEGER,                            -- contracted amount (pounds, no pence)
  pipeline TEXT,                             -- HubSpot pipeline name
  deal_stage TEXT,                           -- HubSpot stage name
  event_type TEXT,                           -- wedding/corporate/private/supper-club/cafe-bar
  event_date TEXT,                           -- actual event date (YYYY-MM-DD)
  introducer TEXT,                           -- HubSpot manual "Introducer" field
  source_channel TEXT,                       -- attribution channel

  create_date TEXT,                          -- HubSpot createdate
  close_date TEXT,                           -- HubSpot closedate
  closed_won_at TEXT,                        -- when deal first hit is_closed_won
  closed_lost_at TEXT,                       -- when deal first hit is_closed_lost

  is_closed_won INTEGER DEFAULT 0,           -- HubSpot's hs_is_closed_won
  is_closed_lost INTEGER DEFAULT 0,          -- HubSpot's hs_is_closed_lost
  is_cancelled INTEGER DEFAULT 0,            -- D1-only: cancel-after-won flag (Option A)
  cancelled_at TEXT,                         -- when we detected/recorded the cancel
  cancel_reason TEXT,                        -- free-text reason

  -- Sync bookkeeping
  hs_lastmodifieddate TEXT,                  -- HubSpot mtime, watermark for incremental sync
  last_synced_at TEXT,                       -- when D1 last applied a HubSpot change
  raw_json TEXT,                             -- full HubSpot record snapshot, for forensics

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_hs_contact_id ON deals(hubspot_primary_contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_close_date ON deals(close_date);
CREATE INDEX IF NOT EXISTS idx_deals_event_date ON deals(event_date);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(deal_stage);
CREATE INDEX IF NOT EXISTS idx_deals_won ON deals(is_closed_won);
CREATE INDEX IF NOT EXISTS idx_deals_cancelled ON deals(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_deals_hs_mtime ON deals(hs_lastmodifieddate);


CREATE TABLE IF NOT EXISTS deal_history (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id TEXT NOT NULL,                     -- FK to deals.deal_id (app-enforced)
  changed_at TEXT NOT NULL DEFAULT (datetime('now')),
  change_type TEXT NOT NULL,                 -- created / updated / cancelled / undeleted / stage_change / won / lost
  changed_fields TEXT,                       -- JSON array of field names that changed
  old_values TEXT,                           -- JSON object of previous values for changed fields
  new_values TEXT,                           -- JSON object of new values for changed fields
  source TEXT,                               -- 'hubspot_sync' | 'manual' | 'reconcile' | 'cancel_detect'
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_deal_history_deal ON deal_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_history_when ON deal_history(changed_at);
CREATE INDEX IF NOT EXISTS idx_deal_history_type ON deal_history(change_type);


CREATE TABLE IF NOT EXISTS revenue_snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL DEFAULT (datetime('now')),
  period TEXT NOT NULL,                      -- '2026-05' for month, '2026-Q2' for quarter, '2026' for year
  period_type TEXT NOT NULL,                 -- 'month' | 'quarter' | 'year'

  gross_revenue INTEGER DEFAULT 0,           -- sum of amount where is_closed_won=1 AND close_date in period
  cancelled_amount INTEGER DEFAULT 0,        -- sum of amount where is_cancelled=1 AND close_date in period
  net_revenue INTEGER DEFAULT 0,             -- gross - cancelled
  deal_count INTEGER DEFAULT 0,              -- count of won deals in period
  cancelled_count INTEGER DEFAULT 0,         -- count of cancelled deals in period

  by_channel TEXT,                           -- JSON: { wedding: {gross, count}, corporate: {...}, ... }

  -- Variance audit: previous snapshot for same period vs this snapshot.
  -- delta_vs_prev_snapshot = gross_revenue - previous snapshot's gross_revenue.
  -- If non-zero on a closed/past period, something rewrote history.
  prev_snapshot_id INTEGER,                  -- the previous snapshot for the same period (if any)
  delta_vs_prev_snapshot INTEGER,            -- gross_revenue_now - gross_revenue_prev (signed)
  variance_flag INTEGER DEFAULT 0,           -- 1 if delta breaches threshold and period is closed

  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_rev_snap_period ON revenue_snapshots(period);
CREATE INDEX IF NOT EXISTS idx_rev_snap_captured ON revenue_snapshots(captured_at);
CREATE INDEX IF NOT EXISTS idx_rev_snap_variance ON revenue_snapshots(variance_flag);


-- Contacts: HubSpot lifecycle-stage entry timestamps.
-- Mirrors the "Date entered '<stage>' (Lifecycle Stage Pipeline)" properties
-- the 19 May 2026 build script (build_monthly_html_v6.py) needs for the
-- funnel-health section. Today's first contacts export was a trimmed
-- 29-column view that omitted these; this set guarantees D1 always
-- carries them. Latest current stage lives in contacts.lifecycle_stage.
ALTER TABLE contacts ADD COLUMN lifecycle_stage TEXT;
ALTER TABLE contacts ADD COLUMN entered_subscriber_at TEXT;
ALTER TABLE contacts ADD COLUMN entered_lead_at TEXT;
ALTER TABLE contacts ADD COLUMN entered_mql_at TEXT;
ALTER TABLE contacts ADD COLUMN entered_sql_at TEXT;
ALTER TABLE contacts ADD COLUMN entered_opportunity_at TEXT;
ALTER TABLE contacts ADD COLUMN entered_customer_at TEXT;

-- Reverse-lookup index for HubSpot contact id (already declared in migrate.js
-- via add_hubspot_contact_id but no index there).
CREATE INDEX IF NOT EXISTS idx_contacts_hubspot ON contacts(hubspot_contact_id);
