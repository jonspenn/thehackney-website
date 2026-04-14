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
