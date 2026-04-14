-- Phase 1 of prd-sys-d1-data-platform.md
-- First-party data platform: visitor tracking, session management,
-- event collection, contact identity resolution, external webhooks.
--
-- These tables coexist with date_clicks (0001) in the same D1 database.
-- All 5 tables created now so Phase 2/3 don't need schema migrations.

-- 1. visitors: anonymous visitor tracking via first-party cookie
CREATE TABLE IF NOT EXISTS visitors (
  visitor_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_landing_page TEXT,
  first_referrer TEXT,
  first_utm_source TEXT,
  first_utm_medium TEXT,
  first_utm_campaign TEXT,
  first_utm_term TEXT,
  first_utm_content TEXT,
  first_gclid TEXT,
  first_fbclid TEXT,
  first_hsa_cam TEXT,
  first_hsa_kw TEXT,
  first_hsa_mt TEXT,
  device_type TEXT,
  total_sessions INTEGER DEFAULT 1,
  total_page_views INTEGER DEFAULT 0,
  contact_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_visitors_contact ON visitors(contact_id);
CREATE INDEX IF NOT EXISTS idx_visitors_gclid ON visitors(first_gclid);

-- 2. sessions: one row per visit (30-min timeout or new UTM params)
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  landing_page TEXT NOT NULL,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  device_type TEXT,
  page_count INTEGER DEFAULT 0,
  duration_seconds INTEGER DEFAULT 0,
  FOREIGN KEY (visitor_id) REFERENCES visitors(visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

-- 3. events: every meaningful interaction
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  page_url TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (visitor_id) REFERENCES visitors(visitor_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- 4. contacts: created on form submission (identity resolution) - Phase 2
CREATE TABLE IF NOT EXISTS contacts (
  contact_id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  lead_type TEXT,
  source_channel TEXT,
  source_keyword TEXT,
  source_campaign TEXT,
  source_match_type TEXT,
  hubspot_contact_id TEXT,
  klaviyo_profile_id TEXT,
  form_data TEXT,
  questionnaire_data TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (visitor_id) REFERENCES visitors(visitor_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_hubspot ON contacts(hubspot_contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source_channel);

-- 5. external_events: data from Klaviyo and HubSpot webhooks - Phase 3
CREATE TABLE IF NOT EXISTS external_events (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data TEXT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_events_contact ON external_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_ext_events_type ON external_events(event_type);
