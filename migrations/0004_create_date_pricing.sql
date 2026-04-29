-- Phase 1 of prd-sys-dates-tab.md
-- Append-only manual price overrides per event date.
-- Latest-row-wins at read time. cleared=1 means the override has been
-- explicitly cleared (read returns no override, use rate-card value).
--
-- Coexists with date_clicks (0001) and the tracking tables (0002) in
-- the same D1 database (`hackney-date-tracking`).
--
-- Decided 29 Apr 2026 in dashboard IA review: data principle is
-- "never limit collection, append-only over destructive". Every change
-- written as a new row with editor + timestamp.

CREATE TABLE IF NOT EXISTS date_pricing_overrides (
    override_id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_date TEXT NOT NULL,             -- ISO YYYY-MM-DD
    override_fee INTEGER,                  -- hire fee in GBP, nullable
    override_min_spend INTEGER,            -- min spend in GBP, nullable
    note TEXT,                             -- optional reason from editor
    cleared INTEGER NOT NULL DEFAULT 0,    -- 1 = explicit clear, latest cleared row wins as no-override
    edited_by TEXT NOT NULL,               -- email of admin user from CF Access header
    edited_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Most queries are "latest row for this date"; index makes that fast
CREATE INDEX IF NOT EXISTS idx_date_pricing_overrides_date ON date_pricing_overrides(event_date);
CREATE INDEX IF NOT EXISTS idx_date_pricing_overrides_at ON date_pricing_overrides(edited_at);
