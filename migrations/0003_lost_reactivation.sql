-- Lost lead reactivation (Phase 1)
--
-- Adds the fields we need to tell manual Re-opens apart from auto-revives,
-- and to carry Klaviyo unsubscribe / hard-bounce state as an orthogonal flag
-- independent of funnel_stage.
--
-- 2D state model:
--   funnel_stage = 'lost'   → pipeline status (manual only, revivable)
--   do_not_contact = 1      → email permission (Klaviyo webhook, Phase 2)
-- A lead can be in either, both, or neither — they do not override each other.
--
-- Matches the ALTER TABLE entries in functions/api/migrate.js. Safe to re-run
-- because every statement is idempotent (or wrapped in the migrate.js
-- duplicate-column error handler).

ALTER TABLE contacts ADD COLUMN re_engaged_at TEXT;
ALTER TABLE contacts ADD COLUMN re_engagement_source TEXT;
ALTER TABLE contacts ADD COLUMN do_not_contact INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN do_not_contact_at TEXT;
ALTER TABLE contacts ADD COLUMN do_not_contact_reason TEXT;
