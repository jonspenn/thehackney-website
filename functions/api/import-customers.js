/**
 * GET /api/import-customers
 *
 * TEMPORARY endpoint - imports 314 historical won deals from HubSpot as
 * customer contacts in D1. Creates visitor records to satisfy FK constraint.
 * Sets contact_type = 'customer', funnel_stage = 'won'.
 *
 * Safe to run multiple times: uses INSERT OR IGNORE (email UNIQUE).
 * DELETE THIS FILE after import is verified.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

import { CUSTOMERS } from "./import-customers-data.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequest(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  // First run migrate to ensure contact_type column exists
  try {
    await env.DB.prepare(`ALTER TABLE contacts ADD COLUMN contact_type TEXT DEFAULT 'lead'`).run();
  } catch (e) {
    // Column already exists - that's fine
  }
  try {
    await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(contact_type)`).run();
  } catch (e) {}

  let imported = 0;
  let skipped = 0;
  let errors = [];

  for (const c of CUSTOMERS) {
    const visitorId = "v_hs_" + c.e.replace(/[^a-z0-9]/g, "").slice(0, 20);
    const contactId = "c_hs_" + c.e.replace(/[^a-z0-9]/g, "").slice(0, 20);

    try {
      // Create visitor record (required by FK constraint)
      await env.DB.prepare(
        `INSERT OR IGNORE INTO visitors (visitor_id, first_seen_at, last_seen_at, session_count)
         VALUES (?, ?, ?, 1)`
      ).bind(visitorId, c.wa + "T00:00:00Z", c.wa + "T00:00:00Z").run();

      // Create contact as customer
      const result = await env.DB.prepare(
        `INSERT OR IGNORE INTO contacts (
          contact_id, visitor_id, email, first_name, last_name,
          lead_type, contact_type, funnel_stage, stage_entered_at,
          won_at, deal_value, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'customer', 'won', ?, ?, ?, ?)`
      ).bind(
        contactId,
        visitorId,
        c.e,
        c.fn,
        c.ln,
        c.lt,
        c.wa + "T00:00:00Z",  // stage_entered_at
        c.wa + "T00:00:00Z",  // won_at
        c.dv,                  // deal_value
        c.wa + "T00:00:00Z"   // created_at
      ).run();

      if (result.meta?.changes > 0) {
        imported++;
      } else {
        skipped++; // email already exists
      }
    } catch (err) {
      errors.push({ email: c.e, error: err.message });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    total: CUSTOMERS.length,
    imported,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  }, null, 2), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
