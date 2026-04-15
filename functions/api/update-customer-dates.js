/**
 * GET /api/update-customer-dates
 *
 * TEMPORARY endpoint - updates created_at on contacts and first_seen_at on
 * visitors for imported customers using HubSpot CONTACT create date (not deal
 * create date). Contact create date = when the lead first came in.
 *
 * v2: Uses all-contacts export instead of deals export. For 2026 deals
 * especially, deal create date = close date (Hugo creates deal at close),
 * but contact create date is the actual enquiry date.
 *
 * Safe to run multiple times. DELETE THIS FILE after verification.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

import { CUSTOMER_DATES } from "./update-customer-dates-data.js";

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

  let updated = 0;
  let skipped = 0;
  let errors = [];

  for (const [email, createDate] of CUSTOMER_DATES) {
    const isoDate = createDate + "T00:00:00Z";

    try {
      const r1 = await env.DB.prepare(
        `UPDATE contacts SET created_at = ?, first_seen_at = ? WHERE email = ? AND contact_type = 'customer'`
      ).bind(isoDate, isoDate, email).run();

      if (r1.meta?.changes > 0) {
        const visitorId = "v_hs_" + email.replace(/[^a-z0-9]/g, "").slice(0, 20);
        await env.DB.prepare(
          `UPDATE visitors SET first_seen_at = ? WHERE visitor_id = ?`
        ).bind(isoDate, visitorId).run();
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push({ email, error: err.message });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    total: CUSTOMER_DATES.length,
    updated,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  }, null, 2), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
