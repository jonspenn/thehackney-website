-- Phase 1 of prd-dynamic-pricing.md
-- Anonymous date-click tracking table.
-- No PII. We log the clicked date, the click time, and minimal request
-- metadata so we can filter bots and segment by entry point later.

CREATE TABLE IF NOT EXISTS date_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clicked_date TEXT NOT NULL,
    clicked_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_agent TEXT,
    referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_date_clicks_date ON date_clicks(clicked_date);
CREATE INDEX IF NOT EXISTS idx_date_clicks_at ON date_clicks(clicked_at);
