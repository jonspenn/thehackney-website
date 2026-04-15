/**
 * GET /api/update-hubspot-ids
 *
 * TEMPORARY endpoint - populates hubspot_contact_id on contacts table
 * by matching email addresses to HubSpot Record IDs from the contacts export.
 * Only updates contacts that exist in D1 (customers + leads).
 *
 * Portal ID: 25870094
 * Link format: https://app.hubspot.com/contacts/25870094/contact/{hubspot_contact_id}
 *
 * Safe to run multiple times. DELETE BOTH FILES after verification.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

import { CONTACT_IDS } from "./update-hubspot-ids-data.js";

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

  for (const [email, hsId] of CONTACT_IDS) {
    try {
      const r = await env.DB.prepare(
        `UPDATE contacts SET hubspot_contact_id = ? WHERE email = ? AND (hubspot_contact_id IS NULL OR hubspot_contact_id = '')`
      ).bind(hsId, email).run();

      if (r.meta?.changes > 0) {
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
    total: CONTACT_IDS.length,
    updated,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
  }, null, 2), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
