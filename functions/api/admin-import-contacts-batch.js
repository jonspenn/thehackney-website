/**
 * POST /api/admin-import-contacts-batch
 *
 * Bulk import HubSpot contacts from a CSV-derived JSON batch. Used to
 * backfill the contacts D1 mirror past HubSpot's 10,000-result search
 * pagination cap (Phase A, 19 May 2026).
 *
 * Request body:
 *   { contacts: [{
 *       hubspot_contact_id, email, firstname, lastname, phone,
 *       lifecyclestage,
 *       entered_subscriber_at, entered_lead_at, entered_mql_at,
 *       entered_sql_at, entered_opportunity_at, entered_customer_at,
 *       hs_lastmodifieddate
 *     }, ...] }
 *
 * INSERT OR IGNORE for new rows, UPDATE for known hubspot_contact_id /
 * email matches. Mirrors the logic in /api/hubspot-sync's
 * batchedUpsertContacts but works from a pre-fetched JSON array rather
 * than HubSpot's search API.
 *
 * SAFE TO REMOVE once the contact universe is in steady-state sync.
 * Behind /api/admin* so Cloudflare Access can gate it later.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });

const nowIso = () => new Date().toISOString();

const BATCH_SIZE = 25;

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ ok: false, error: "no_db" }, 500);

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return json({ ok: false, error: "bad_json", message: err.message }, 400);
  }
  const contacts = Array.isArray(body?.contacts) ? body.contacts : null;
  if (!contacts) return json({ ok: false, error: "missing_contacts_array" }, 400);

  // Pre-fetch identity map
  const rs = await env.DB.prepare(
    `SELECT contact_id, hubspot_contact_id, LOWER(email) AS email_lc FROM contacts`
  ).all().catch(() => ({ results: [] }));
  const byHsId = new Map();
  const byEmail = new Map();
  for (const r of (rs.results || [])) {
    if (r.hubspot_contact_id) byHsId.set(String(r.hubspot_contact_id), r.contact_id);
    if (r.email_lc) byEmail.set(r.email_lc, r.contact_id);
  }

  const out = {
    received: contacts.length,
    inserted: 0,
    updated: 0,
    skipped_no_email: 0,
    skipped_no_hs_id: 0,
    errors: [],
  };

  let pending = [];
  const flush = async () => {
    if (pending.length === 0) return;
    try {
      await env.DB.batch(pending);
    } catch (err) {
      out.errors.push({ where: "batch_flush", message: err.message, batch_size: pending.length });
    }
    pending = [];
  };

  for (const c of contacts) {
    try {
      const hubspot_contact_id = c.hubspot_contact_id ? String(c.hubspot_contact_id) : null;
      const email = (c.email || "").trim();
      if (!hubspot_contact_id) { out.skipped_no_hs_id++; continue; }
      if (!email) { out.skipped_no_email++; continue; }
      const emailLc = email.toLowerCase();
      const now = nowIso();

      const existingId = byHsId.get(hubspot_contact_id) || byEmail.get(emailLc);

      if (existingId) {
        pending.push(
          env.DB.prepare(`
            UPDATE contacts
               SET hubspot_contact_id = COALESCE(hubspot_contact_id, ?),
                   lifecycle_stage = COALESCE(?, lifecycle_stage),
                   entered_subscriber_at = COALESCE(?, entered_subscriber_at),
                   entered_lead_at = COALESCE(?, entered_lead_at),
                   entered_mql_at = COALESCE(?, entered_mql_at),
                   entered_sql_at = COALESCE(?, entered_sql_at),
                   entered_opportunity_at = COALESCE(?, entered_opportunity_at),
                   entered_customer_at = COALESCE(?, entered_customer_at),
                   first_name = COALESCE(first_name, ?),
                   last_name = COALESCE(last_name, ?),
                   phone = COALESCE(phone, ?),
                   last_seen_at = COALESCE(last_seen_at, ?),
                   hs_lastmodifieddate = COALESCE(?, hs_lastmodifieddate),
                   hubspot_last_synced_at = ?
             WHERE contact_id = ?
          `).bind(
            hubspot_contact_id, c.lifecyclestage || null,
            c.entered_subscriber_at || null, c.entered_lead_at || null, c.entered_mql_at || null,
            c.entered_sql_at || null, c.entered_opportunity_at || null, c.entered_customer_at || null,
            c.firstname || null, c.lastname || null, c.phone || null,
            now, c.hs_lastmodifieddate || null, now,
            existingId,
          )
        );
        out.updated++;
      } else {
        const newContactId = "hs_" + hubspot_contact_id;
        pending.push(
          env.DB.prepare(`
            INSERT OR IGNORE INTO contacts (
              contact_id, visitor_id, email, first_name, last_name, phone,
              hubspot_contact_id, lifecycle_stage,
              entered_subscriber_at, entered_lead_at, entered_mql_at,
              entered_sql_at, entered_opportunity_at, entered_customer_at,
              created_at, first_seen_at, last_seen_at, contact_type,
              hs_lastmodifieddate, hubspot_last_synced_at
            ) VALUES (?, 'hubspot_sync_sentinel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'lead', ?, ?)
          `).bind(
            newContactId, email,
            c.firstname || null, c.lastname || null, c.phone || null,
            hubspot_contact_id, c.lifecyclestage || null,
            c.entered_subscriber_at || null, c.entered_lead_at || null, c.entered_mql_at || null,
            c.entered_sql_at || null, c.entered_opportunity_at || null, c.entered_customer_at || null,
            now, now, now,
            c.hs_lastmodifieddate || null, now,
          )
        );
        // Update in-memory map so duplicates within same batch don't re-insert
        byHsId.set(hubspot_contact_id, newContactId);
        byEmail.set(emailLc, newContactId);
        out.inserted++;
      }

      if (pending.length >= BATCH_SIZE) await flush();
    } catch (err) {
      out.errors.push({ where: `row ${c.hubspot_contact_id || "?"}`, message: err.message });
    }
  }
  await flush();

  out.ok = true;
  out.finished_at = nowIso();
  return json(out);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
