/**
 * GET /api/update-customer-dates
 *
 * TEMPORARY endpoint - updates created_at on contacts and first_seen_at on
 * visitors for imported customers. Uses the HubSpot deal "Create Date" as
 * the true lead creation date (when the enquiry first came in).
 *
 * The original import set created_at = won_at which made the "days in system"
 * badge show incorrect values (e.g. "1 DAY" instead of "180 DAYS").
 *
 * Safe to run multiple times: only updates, doesn't create or delete.
 * DELETE THIS FILE after verification.
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
      // Update contact created_at and first_seen_at
      const r1 = await env.DB.prepare(
        `UPDATE contacts SET created_at = ?, first_seen_at = ? WHERE email = ? AND contact_type = 'customer'`
      ).bind(isoDate, isoDate, email).run();

      if (r1.meta?.changes > 0) {
        // Also update the visitor record's first_seen_at
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
