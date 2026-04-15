/**
 * GET /api/update-hubspot-ids?offset=0
 *
 * TEMPORARY endpoint - populates hubspot_contact_id on contacts table
 * by matching email addresses to HubSpot Record IDs from the contacts export.
 *
 * Processes 500 entries per call starting at ?offset (default 0).
 * Call repeatedly incrementing offset by 500 until done.
 * Total entries: ~14,984.  Call sequence: offset=0, 500, 1000, ... 14500.
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
  const { env, request } = context;
  const url = new URL(request.url);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const batchSize = 500;

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const slice = CONTACT_IDS.slice(offset, offset + batchSize);

  if (slice.length === 0) {
    return new Response(JSON.stringify({
      ok: true, done: true, total: CONTACT_IDS.length,
      message: "No more entries to process at this offset.",
    }, null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  let updated = 0;
  let skipped = 0;
  let errors = [];

  // Process in sub-batches of 50 using D1 batch API
  const subBatchSize = 50;
  for (let i = 0; i < slice.length; i += subBatchSize) {
    const sub = slice.slice(i, i + subBatchSize);
    const stmts = sub.map(([email, hsId]) =>
      env.DB.prepare(
        `UPDATE contacts SET hubspot_contact_id = ? WHERE email = ? AND (hubspot_contact_id IS NULL OR hubspot_contact_id = '')`
      ).bind(hsId, email)
    );

    try {
      const results = await env.DB.batch(stmts);
      for (let k = 0; k < results.length; k++) {
        if (results[k].meta?.changes > 0) updated++;
        else skipped++;
      }
    } catch (err) {
      errors.push({ batch: offset + i, error: err.message });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    total: CONTACT_IDS.length,
    offset,
    processed: slice.length,
    updated,
    skipped,
    errors: errors.length,
    errorDetails: errors.slice(0, 10),
    next_offset: offset + batchSize < CONTACT_IDS.length ? offset + batchSize : null,
  }, null, 2), {
    status: 200,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}
