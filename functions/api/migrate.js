/**
 * POST /api/migrate
 *
 * One-shot migration endpoint. Creates the contacts and submissions tables
 * in D1 if they don't already exist. Safe to call multiple times (IF NOT EXISTS).
 *
 * Call once after deploy, then optionally remove this file.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MIGRATIONS = [
  {
    name: "contacts",
    sql: `CREATE TABLE IF NOT EXISTS contacts (
      contact_id TEXT PRIMARY KEY,
      visitor_id TEXT,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      company TEXT,
      lead_type TEXT,
      source_channel TEXT,
      source_keyword TEXT,
      source_campaign TEXT,
      source_match_type TEXT,
      hubspot_contact_id TEXT,
      klaviyo_profile_id TEXT,
      form_data TEXT,
      questionnaire_data TEXT,
      created_at TEXT NOT NULL
    )`,
  },
  {
    name: "submissions",
    sql: `CREATE TABLE IF NOT EXISTS submissions (
      submission_id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL,
      form_type TEXT NOT NULL,
      form_data TEXT,
      page_url TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )`,
  },
  // ALTER TABLE additions for contacts created in earlier sessions with fewer columns.
  // Each runs independently - errors (column already exists) are caught and ignored.
  { name: "add_company", sql: `ALTER TABLE contacts ADD COLUMN company TEXT` },
  { name: "add_last_name", sql: `ALTER TABLE contacts ADD COLUMN last_name TEXT` },
  { name: "add_lead_type", sql: `ALTER TABLE contacts ADD COLUMN lead_type TEXT` },
  { name: "add_source_channel", sql: `ALTER TABLE contacts ADD COLUMN source_channel TEXT` },
  { name: "add_source_keyword", sql: `ALTER TABLE contacts ADD COLUMN source_keyword TEXT` },
  { name: "add_source_campaign", sql: `ALTER TABLE contacts ADD COLUMN source_campaign TEXT` },
  { name: "add_source_match_type", sql: `ALTER TABLE contacts ADD COLUMN source_match_type TEXT` },
  { name: "add_hubspot_contact_id", sql: `ALTER TABLE contacts ADD COLUMN hubspot_contact_id TEXT` },
  { name: "add_klaviyo_profile_id", sql: `ALTER TABLE contacts ADD COLUMN klaviyo_profile_id TEXT` },
  { name: "add_form_data", sql: `ALTER TABLE contacts ADD COLUMN form_data TEXT` },
  { name: "add_questionnaire_data", sql: `ALTER TABLE contacts ADD COLUMN questionnaire_data TEXT` },
  // ── Visitors: ad platform click IDs + Meta cookies ──
  { name: "vis_add_wbraid", sql: `ALTER TABLE visitors ADD COLUMN first_wbraid TEXT` },
  { name: "vis_add_gbraid", sql: `ALTER TABLE visitors ADD COLUMN first_gbraid TEXT` },
  { name: "vis_add_fbc", sql: `ALTER TABLE visitors ADD COLUMN first_fbc TEXT` },
  { name: "vis_add_fbp", sql: `ALTER TABLE visitors ADD COLUMN first_fbp TEXT` },
  { name: "vis_add_ttclid", sql: `ALTER TABLE visitors ADD COLUMN first_ttclid TEXT` },
  { name: "vis_add_msclkid", sql: `ALTER TABLE visitors ADD COLUMN first_msclkid TEXT` },
  { name: "vis_add_li_fat_id", sql: `ALTER TABLE visitors ADD COLUMN first_li_fat_id TEXT` },

  // ── Sessions: ad platform click IDs + Meta cookies ──
  { name: "ses_add_wbraid", sql: `ALTER TABLE sessions ADD COLUMN wbraid TEXT` },
  { name: "ses_add_gbraid", sql: `ALTER TABLE sessions ADD COLUMN gbraid TEXT` },
  { name: "ses_add_fbc", sql: `ALTER TABLE sessions ADD COLUMN fbc TEXT` },
  { name: "ses_add_fbp", sql: `ALTER TABLE sessions ADD COLUMN fbp TEXT` },
  { name: "ses_add_ttclid", sql: `ALTER TABLE sessions ADD COLUMN ttclid TEXT` },
  { name: "ses_add_msclkid", sql: `ALTER TABLE sessions ADD COLUMN msclkid TEXT` },
  { name: "ses_add_li_fat_id", sql: `ALTER TABLE sessions ADD COLUMN li_fat_id TEXT` },

  // ── Contacts: full attribution + conversion context ──
  { name: "ct_add_gclid", sql: `ALTER TABLE contacts ADD COLUMN gclid TEXT` },
  { name: "ct_add_fbclid", sql: `ALTER TABLE contacts ADD COLUMN fbclid TEXT` },
  { name: "ct_add_fbc", sql: `ALTER TABLE contacts ADD COLUMN fbc TEXT` },
  { name: "ct_add_fbp", sql: `ALTER TABLE contacts ADD COLUMN fbp TEXT` },
  { name: "ct_add_wbraid", sql: `ALTER TABLE contacts ADD COLUMN wbraid TEXT` },
  { name: "ct_add_gbraid", sql: `ALTER TABLE contacts ADD COLUMN gbraid TEXT` },
  { name: "ct_add_ttclid", sql: `ALTER TABLE contacts ADD COLUMN ttclid TEXT` },
  { name: "ct_add_msclkid", sql: `ALTER TABLE contacts ADD COLUMN msclkid TEXT` },
  { name: "ct_add_li_fat_id", sql: `ALTER TABLE contacts ADD COLUMN li_fat_id TEXT` },
  { name: "ct_add_utm_content", sql: `ALTER TABLE contacts ADD COLUMN utm_content TEXT` },
  { name: "ct_add_landing_page", sql: `ALTER TABLE contacts ADD COLUMN first_landing_page TEXT` },
  { name: "ct_add_conversion_page", sql: `ALTER TABLE contacts ADD COLUMN conversion_page TEXT` },
  { name: "ct_add_sessions_before", sql: `ALTER TABLE contacts ADD COLUMN sessions_before_conversion INTEGER` },
  { name: "ct_add_device_type", sql: `ALTER TABLE contacts ADD COLUMN device_type TEXT` },
  { name: "ct_add_first_referrer", sql: `ALTER TABLE contacts ADD COLUMN first_referrer TEXT` },

  // ── Submissions: promote form_data fields to proper columns ──
  { name: "sub_add_event_type", sql: `ALTER TABLE submissions ADD COLUMN event_type TEXT` },
  { name: "sub_add_guest_count", sql: `ALTER TABLE submissions ADD COLUMN guest_count TEXT` },
  { name: "sub_add_event_date", sql: `ALTER TABLE submissions ADD COLUMN event_date TEXT` },
  { name: "sub_add_booking_urgency", sql: `ALTER TABLE submissions ADD COLUMN booking_urgency TEXT` },
  { name: "sub_add_budget", sql: `ALTER TABLE submissions ADD COLUMN budget TEXT` },
  { name: "sub_add_brochure_type", sql: `ALTER TABLE submissions ADD COLUMN brochure_type TEXT` },
  { name: "sub_add_wedding_year", sql: `ALTER TABLE submissions ADD COLUMN wedding_year TEXT` },
  { name: "sub_add_company", sql: `ALTER TABLE submissions ADD COLUMN company TEXT` },
  { name: "sub_add_first_name", sql: `ALTER TABLE submissions ADD COLUMN first_name TEXT` },
  { name: "sub_add_email", sql: `ALTER TABLE submissions ADD COLUMN email TEXT` },
  { name: "sub_add_phone", sql: `ALTER TABLE submissions ADD COLUMN phone TEXT` },
  {
    name: "idx_submissions_event_type",
    sql: `CREATE INDEX IF NOT EXISTS idx_submissions_event_type ON submissions(event_type)`,
  },
  {
    name: "idx_submissions_urgency",
    sql: `CREATE INDEX IF NOT EXISTS idx_submissions_urgency ON submissions(booking_urgency)`,
  },
  // ── Visitors: IP geolocation ──
  { name: "vis_add_ip_country", sql: `ALTER TABLE visitors ADD COLUMN first_ip_country TEXT` },
  { name: "vis_add_ip_city", sql: `ALTER TABLE visitors ADD COLUMN first_ip_city TEXT` },

  // ── Visitors: last-touch attribution (updated on every new session) ──
  { name: "vis_add_latest_utm_source", sql: `ALTER TABLE visitors ADD COLUMN latest_utm_source TEXT` },
  { name: "vis_add_latest_utm_medium", sql: `ALTER TABLE visitors ADD COLUMN latest_utm_medium TEXT` },
  { name: "vis_add_latest_utm_campaign", sql: `ALTER TABLE visitors ADD COLUMN latest_utm_campaign TEXT` },
  { name: "vis_add_latest_utm_term", sql: `ALTER TABLE visitors ADD COLUMN latest_utm_term TEXT` },
  { name: "vis_add_latest_utm_content", sql: `ALTER TABLE visitors ADD COLUMN latest_utm_content TEXT` },
  { name: "vis_add_latest_referrer", sql: `ALTER TABLE visitors ADD COLUMN latest_referrer TEXT` },
  { name: "vis_add_latest_landing_page", sql: `ALTER TABLE visitors ADD COLUMN latest_landing_page TEXT` },

  // ── Contacts: IP geolocation ──
  { name: "ct_add_ip_country", sql: `ALTER TABLE contacts ADD COLUMN ip_country TEXT` },
  { name: "ct_add_ip_city", sql: `ALTER TABLE contacts ADD COLUMN ip_city TEXT` },

  // ── Contacts: last-touch attribution ──
  { name: "ct_add_latest_source", sql: `ALTER TABLE contacts ADD COLUMN latest_source TEXT` },
  { name: "ct_add_latest_referrer", sql: `ALTER TABLE contacts ADD COLUMN latest_referrer TEXT` },
  { name: "ct_add_latest_landing_page", sql: `ALTER TABLE contacts ADD COLUMN latest_landing_page TEXT` },

  // ── Contacts: engagement metrics ──
  { name: "ct_add_total_page_views", sql: `ALTER TABLE contacts ADD COLUMN total_page_views INTEGER` },
  { name: "ct_add_avg_page_views", sql: `ALTER TABLE contacts ADD COLUMN avg_page_views_per_session REAL` },
  { name: "ct_add_first_seen_at", sql: `ALTER TABLE contacts ADD COLUMN first_seen_at TEXT` },
  { name: "ct_add_last_seen_at", sql: `ALTER TABLE contacts ADD COLUMN last_seen_at TEXT` },

  // ── Contacts: booking intent (old single-field - superseded but kept for migration history) ──
  { name: "ct_add_booking_intent", sql: `ALTER TABLE contacts ADD COLUMN booking_intent TEXT` },
  { name: "ct_add_booking_intent_at", sql: `ALTER TABLE contacts ADD COLUMN booking_intent_at TEXT` },
  { name: "ct_add_booking_intent_source", sql: `ALTER TABLE contacts ADD COLUMN booking_intent_source TEXT` },

  // ── Contacts: independent call + tour intent tracking (replaces single booking_intent) ──
  { name: "ct_add_clicked_discovery_call_at", sql: `ALTER TABLE contacts ADD COLUMN clicked_discovery_call_at TEXT` },
  { name: "ct_add_clicked_discovery_call_source", sql: `ALTER TABLE contacts ADD COLUMN clicked_discovery_call_source TEXT` },
  { name: "ct_add_clicked_venue_tour_at", sql: `ALTER TABLE contacts ADD COLUMN clicked_venue_tour_at TEXT` },
  { name: "ct_add_clicked_venue_tour_source", sql: `ALTER TABLE contacts ADD COLUMN clicked_venue_tour_source TEXT` },

  // ── Contacts: funnel lifecycle tracking (Phase 2B) ──
  { name: "ct_add_funnel_stage", sql: `ALTER TABLE contacts ADD COLUMN funnel_stage TEXT` },
  { name: "ct_add_stage_entered_at", sql: `ALTER TABLE contacts ADD COLUMN stage_entered_at TEXT` },
  { name: "ct_add_meeting_at", sql: `ALTER TABLE contacts ADD COLUMN meeting_at TEXT` },
  { name: "ct_add_proposal_at", sql: `ALTER TABLE contacts ADD COLUMN proposal_at TEXT` },
  { name: "ct_add_won_at", sql: `ALTER TABLE contacts ADD COLUMN won_at TEXT` },
  { name: "ct_add_lost_at", sql: `ALTER TABLE contacts ADD COLUMN lost_at TEXT` },
  { name: "ct_add_lost_reason", sql: `ALTER TABLE contacts ADD COLUMN lost_reason TEXT` },
  { name: "ct_add_lost_reason_note", sql: `ALTER TABLE contacts ADD COLUMN lost_reason_note TEXT` },
  { name: "ct_add_cancelled_at", sql: `ALTER TABLE contacts ADD COLUMN cancelled_at TEXT` },
  { name: "ct_add_noshow_at", sql: `ALTER TABLE contacts ADD COLUMN noshow_at TEXT` },

  // ── Contacts: deal value (rate card lookup + Hugo sign-off) ──
  { name: "ct_add_hire_fee", sql: `ALTER TABLE contacts ADD COLUMN hire_fee INTEGER` },
  { name: "ct_add_min_spend", sql: `ALTER TABLE contacts ADD COLUMN min_spend INTEGER` },
  { name: "ct_add_deal_value", sql: `ALTER TABLE contacts ADD COLUMN deal_value INTEGER` },
  { name: "ct_add_rate_card_tier", sql: `ALTER TABLE contacts ADD COLUMN rate_card_tier TEXT` },

  // Soft delete
  { name: "ct_add_deleted_at", sql: `ALTER TABLE contacts ADD COLUMN deleted_at TEXT` },

  {
    name: "idx_contacts_email",
    sql: `CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)`,
  },
  {
    name: "idx_contacts_visitor",
    sql: `CREATE INDEX IF NOT EXISTS idx_contacts_visitor ON contacts(visitor_id)`,
  },
  {
    name: "idx_submissions_contact",
    sql: `CREATE INDEX IF NOT EXISTS idx_submissions_contact ON submissions(contact_id)`,
  },
  {
    name: "idx_submissions_type",
    sql: `CREATE INDEX IF NOT EXISTS idx_submissions_type ON submissions(form_type)`,
  },
];

export async function onRequestPost(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const results = [];

  for (const m of MIGRATIONS) {
    try {
      await env.DB.prepare(m.sql).run();
      results.push({ name: m.name, status: "ok" });
    } catch (err) {
      results.push({ name: m.name, status: "error", message: err.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, migrations: results }), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
