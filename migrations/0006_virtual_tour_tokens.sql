-- Phase 1 of prd-sys-virtual-tour.md
--
-- Per-contact tokenised access to Hugo's 5:38 walkthrough video.
-- Two send-types share one /virtual-tour/?t={token} page surface:
--   cold_reengage = automated trigger when a wedding lead has gone silent
--                   post the standard email chaser sequence
--   tour_recap    = manual or automated send for warm leads who already toured;
--                   the recap is a closing aid the recipient can share with
--                   their partner / family
--   manual        = Hugo-discretionary send (rare, future)
--
-- All activity tagged to contact_id, surfaces on lead profile + dashboard.
-- Drop-off analytics + 1-question free-text feedback both write here.
--
-- FK to contacts(contact_id) is intentionally omitted; integrity is
-- application-enforced because some flows write tokens before the matching
-- contact row exists in D1 (HubSpot-only contacts mirrored in later).

CREATE TABLE IF NOT EXISTS virtual_tour_tokens (
  token TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  send_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  sent_at TEXT,
  opened_at TEXT,
  played_at TEXT,
  completion_pct_max INTEGER DEFAULT 0,
  cta_clicked TEXT,
  cta_clicked_at TEXT,
  feedback_text TEXT,
  feedback_submitted_at TEXT,
  retrigger_sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vt_tokens_contact ON virtual_tour_tokens(contact_id);
CREATE INDEX IF NOT EXISTS idx_vt_tokens_send_type ON virtual_tour_tokens(send_type);
CREATE INDEX IF NOT EXISTS idx_vt_tokens_expires ON virtual_tour_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_vt_tokens_created ON virtual_tour_tokens(created_at);

-- Dev-only seed rows so the page can be exercised before any token-issuing
-- workflow exists. Both expire 2027-12-31 and are safe to delete once a real
-- send workflow is wired. Use:
--   /virtual-tour/?t=test_cold_reengage   -> renders cold-reengage variant
--   /virtual-tour/?t=test_tour_recap      -> renders tour-recap variant
INSERT OR IGNORE INTO virtual_tour_tokens
  (token, contact_id, send_type, created_at, expires_at, sent_at)
VALUES
  ('test_cold_reengage', 'test_contact_dev', 'cold_reengage',
   '2026-05-06T00:00:00.000Z', '2027-12-31T23:59:59.000Z', '2026-05-06T00:00:00.000Z'),
  ('test_tour_recap', 'test_contact_dev', 'tour_recap',
   '2026-05-06T00:00:00.000Z', '2027-12-31T23:59:59.000Z', '2026-05-06T00:00:00.000Z');
