/**
 * POST /api/hubspot-sync
 *
 * Phase A of prd-sys-reporting-unification.md (Atlas, 1 June 2026 go-live).
 *
 * Polls HubSpot for changed deals + contacts since the last successful
 * sync, upserts them into D1, logs every change to deal_history, and
 * captures monthly + YTD revenue snapshots with a variance audit. The
 * variance audit is the central defence against the Katharine & Ray
 * pattern (silent deletion of cancelled-after-won deals) that motivated
 * this whole subsystem.
 *
 * Cancellation detection uses Option A modelling (Jon's 19 May 2026
 * decision): is_closed_won stays true forever; cancelled deals get
 * is_cancelled=1 + cancelled_at + cancel_reason. Detection works in
 * two passes:
 *   (1) HubSpot rows whose deal_stage transitioned to a Cancelled
 *       stage AND whose D1 mirror was previously is_closed_won=1.
 *   (2) Won deals that disappear from HubSpot entirely (Hugo's
 *       current pattern is to delete the record rather than change
 *       stage). Detected by diffing HubSpot's current "is_closed_won"
 *       set against D1's. Any D1-only won deal is marked cancelled.
 *
 * Auth: env.HUBSPOT_API_TOKEN (Cloudflare Pages Secret).
 *       Plus env.SYNC_TOKEN (Pages Secret) gates POST callers so a
 *       random visitor cannot trigger sync runs. NULL/missing in v1
 *       falls back to "allow" - first run sets the token via dashboard.
 *
 * v1 scope: HTTP-only. Hourly cron trigger will be added later in this
 * phase via a wrangler.toml [triggers] block once the manual runs are
 * verified clean across a 5-7 day window.
 *
 * Returns a summary: deals synced/updated/cancelled, contacts synced,
 * snapshots captured, variance flags fired, elapsed ms.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const HUBSPOT_DEAL_PROPS = [
  "dealname", "amount", "pipeline", "dealstage",
  "createdate", "closedate", "hs_lastmodifieddate",
  "hs_is_closed_won", "hs_is_closed_lost",
  "closed_won_date", "closed_lost_date",
  "hubspot_owner_id",
  // Custom Hackney fields - if these don't exist on the deal in HubSpot,
  // the search endpoint silently returns null for them. Safe to request.
  "event_type", "event_date", "introducer", "source", "source_channel",
  "lead_source", "wedding_date", "event_date_actual",
];

const HUBSPOT_CONTACT_PROPS = [
  "email", "firstname", "lastname", "phone",
  "createdate", "lastmodifieddate", "lifecyclestage",
  // The "Date entered '<stage>' (Lifecycle Stage Pipeline)" columns the
  // 19 May 2026 monthly report needs:
  "hs_lifecyclestage_subscriber_date",
  "hs_lifecyclestage_lead_date",
  "hs_lifecyclestage_marketingqualifiedlead_date",
  "hs_lifecyclestage_salesqualifiedlead_date",
  "hs_lifecyclestage_opportunity_date",
  "hs_lifecyclestage_customer_date",
  // Attribution
  "hs_analytics_source", "hs_latest_source", "hs_analytics_first_url",
];

const CANCELLED_STAGE_NAMES = new Set([
  // HubSpot deal stages that mean "cancelled after won".
  // Hugo's pattern is currently to delete the record, not move to these,
  // but cover the case anyway in case workflow changes.
  "cancelled", "Cancelled", "cancelled_after_won",
]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });

const nowIso = () => new Date().toISOString();

const toIntPounds = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Math.round(n);
};

const toBool01 = (v) => (v === true || v === "true" ? 1 : 0);

const periodFromDate = (iso) => {
  if (!iso) return null;
  return iso.slice(0, 7); // 'YYYY-MM'
};


// ─────────────────────────────────────────────────────────────────────
// HubSpot fetch helpers
// ─────────────────────────────────────────────────────────────────────

async function hubspotSearch(token, objectType, body) {
  const r = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HubSpot ${objectType} search ${r.status}: ${text.slice(0, 500)}`);
  }
  return r.json();
}

async function fetchModifiedDeals(token, sinceIso, opts = {}) {
  const maxPages = opts.maxPages ?? 10;
  const limit = 100;
  const results = [];
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const body = {
      filterGroups: sinceIso ? [{
        filters: [{ propertyName: "hs_lastmodifieddate", operator: "GTE", value: sinceIso }],
      }] : [],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "ASCENDING" }],
      properties: HUBSPOT_DEAL_PROPS,
      associations: ["contacts"],
      limit,
      after,
    };
    const page_r = await hubspotSearch(token, "deals", body);
    results.push(...(page_r.results || []));
    after = page_r.paging?.next?.after;
    if (!after) break;
  }
  return results;
}

async function fetchAllWonDealIds(token, opts = {}) {
  // Used for the cancellation-detection diff. Pull all currently-won
  // deal IDs from HubSpot, regardless of mtime, so we can spot any won
  // deal that's silently disappeared from HubSpot since last sync.
  const maxPages = opts.maxPages ?? 50;
  const limit = 100;
  const ids = new Set();
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const body = {
      filterGroups: [{
        filters: [{ propertyName: "hs_is_closed_won", operator: "EQ", value: "true" }],
      }],
      sorts: [{ propertyName: "hs_object_id", direction: "ASCENDING" }],
      properties: ["dealname"],
      limit,
      after,
    };
    const page_r = await hubspotSearch(token, "deals", body);
    for (const r of page_r.results || []) ids.add(String(r.id));
    after = page_r.paging?.next?.after;
    if (!after) break;
  }
  return ids;
}

async function fetchModifiedContacts(token, sinceIso, opts = {}) {
  const maxPages = opts.maxPages ?? 30;
  const limit = 100;
  const results = [];
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const body = {
      filterGroups: sinceIso ? [{
        filters: [{ propertyName: "lastmodifieddate", operator: "GTE", value: sinceIso }],
      }] : [],
      sorts: [{ propertyName: "lastmodifieddate", direction: "ASCENDING" }],
      properties: HUBSPOT_CONTACT_PROPS,
      limit,
      after,
    };
    const page_r = await hubspotSearch(token, "contacts", body);
    results.push(...(page_r.results || []));
    after = page_r.paging?.next?.after;
    if (!after) break;
  }
  return results;
}


// ─────────────────────────────────────────────────────────────────────
// D1 read helpers
// ─────────────────────────────────────────────────────────────────────

async function getLastDealWatermark(db) {
  // Use the max hs_lastmodifieddate already in D1 as the watermark for the
  // next sync. Falls back to null (full backfill) on first run.
  const r = await db.prepare(
    `SELECT MAX(hs_lastmodifieddate) AS max_ts FROM deals`
  ).first().catch(() => null);
  return r?.max_ts || null;
}

async function getLastContactWatermark(db) {
  const r = await db.prepare(
    `SELECT MAX(hs_lastmodifieddate) AS max_ts FROM contacts WHERE hubspot_contact_id IS NOT NULL`
  ).first().catch(() => null);
  return r?.max_ts || null;
}

async function getExistingDeal(db, dealId) {
  return db.prepare(`SELECT * FROM deals WHERE deal_id = ?`).bind(dealId).first().catch(() => null);
}

async function getExistingWonDealIds(db) {
  // D1's set of currently-won, not-yet-cancelled deals. For diffing
  // against HubSpot's current won set to find silent cancellations.
  const rs = await db.prepare(
    `SELECT deal_id FROM deals WHERE is_closed_won = 1 AND COALESCE(is_cancelled, 0) = 0`
  ).all().catch(() => ({ results: [] }));
  return new Set((rs.results || []).map((r) => String(r.deal_id)));
}


// ─────────────────────────────────────────────────────────────────────
// Upsert + history
// ─────────────────────────────────────────────────────────────────────

function dealRowFromHubSpot(hs) {
  const p = hs.properties || {};
  const primaryContact = hs.associations?.contacts?.results?.[0]?.id || null;
  return {
    deal_id: String(hs.id),
    hubspot_primary_contact_id: primaryContact,
    deal_name: p.dealname || null,
    amount: toIntPounds(p.amount),
    pipeline: p.pipeline || null,
    deal_stage: p.dealstage || null,
    event_type: p.event_type || null,
    event_date: p.event_date || p.wedding_date || p.event_date_actual || null,
    introducer: p.introducer || null,
    source_channel: p.source_channel || p.lead_source || p.source || p.hs_analytics_source || null,
    create_date: p.createdate || null,
    close_date: p.closedate || null,
    closed_won_at: p.closed_won_date || null,
    closed_lost_at: p.closed_lost_date || null,
    is_closed_won: toBool01(p.hs_is_closed_won),
    is_closed_lost: toBool01(p.hs_is_closed_lost),
    hs_lastmodifieddate: p.hs_lastmodifieddate || null,
  };
}

function diffDealRow(existing, incoming) {
  const fields = [
    "deal_name", "amount", "pipeline", "deal_stage", "event_type", "event_date",
    "introducer", "source_channel", "close_date", "closed_won_at", "closed_lost_at",
    "is_closed_won", "is_closed_lost",
  ];
  const changed = [];
  const old = {};
  const next = {};
  for (const f of fields) {
    const a = existing?.[f] ?? null;
    const b = incoming?.[f] ?? null;
    if (a !== b) {
      changed.push(f);
      old[f] = a;
      next[f] = b;
    }
  }
  return { changed, old, next };
}

async function upsertDeal(db, hsDeal, source, results) {
  const row = dealRowFromHubSpot(hsDeal);
  const existing = await getExistingDeal(db, row.deal_id);
  const diff = diffDealRow(existing, row);

  // If existing was cancelled and HubSpot has it back, log an undelete.
  const newlyDetectedCancellation =
    existing && existing.is_closed_won === 1 && row.is_closed_won === 1 &&
    CANCELLED_STAGE_NAMES.has(row.deal_stage) && existing.is_cancelled !== 1;

  const undeleted = existing?.is_cancelled === 1 && !CANCELLED_STAGE_NAMES.has(row.deal_stage);

  const cancelFields = newlyDetectedCancellation
    ? { is_cancelled: 1, cancelled_at: nowIso(), cancel_reason: "HubSpot stage transitioned to Cancelled" }
    : (undeleted ? { is_cancelled: 0, cancelled_at: null, cancel_reason: null } : {});

  const raw_json = JSON.stringify(hsDeal);
  const now = nowIso();

  // Upsert via ON CONFLICT.
  await db.prepare(`
    INSERT INTO deals (
      deal_id, hubspot_primary_contact_id, deal_name, amount, pipeline, deal_stage,
      event_type, event_date, introducer, source_channel,
      create_date, close_date, closed_won_at, closed_lost_at,
      is_closed_won, is_closed_lost, is_cancelled, cancelled_at, cancel_reason,
      hs_lastmodifieddate, last_synced_at, raw_json, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(deal_id) DO UPDATE SET
      hubspot_primary_contact_id = excluded.hubspot_primary_contact_id,
      deal_name = excluded.deal_name,
      amount = excluded.amount,
      pipeline = excluded.pipeline,
      deal_stage = excluded.deal_stage,
      event_type = COALESCE(excluded.event_type, deals.event_type),
      event_date = COALESCE(excluded.event_date, deals.event_date),
      introducer = COALESCE(excluded.introducer, deals.introducer),
      source_channel = COALESCE(excluded.source_channel, deals.source_channel),
      create_date = excluded.create_date,
      close_date = excluded.close_date,
      closed_won_at = COALESCE(excluded.closed_won_at, deals.closed_won_at),
      closed_lost_at = COALESCE(excluded.closed_lost_at, deals.closed_lost_at),
      is_closed_won = excluded.is_closed_won,
      is_closed_lost = excluded.is_closed_lost,
      is_cancelled = COALESCE(?, deals.is_cancelled),
      cancelled_at = COALESCE(?, deals.cancelled_at),
      cancel_reason = COALESCE(?, deals.cancel_reason),
      hs_lastmodifieddate = excluded.hs_lastmodifieddate,
      last_synced_at = excluded.last_synced_at,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `).bind(
    row.deal_id, row.hubspot_primary_contact_id, row.deal_name, row.amount, row.pipeline, row.deal_stage,
    row.event_type, row.event_date, row.introducer, row.source_channel,
    row.create_date, row.close_date, row.closed_won_at, row.closed_lost_at,
    row.is_closed_won, row.is_closed_lost,
    cancelFields.is_cancelled ?? 0,
    cancelFields.cancelled_at ?? null,
    cancelFields.cancel_reason ?? null,
    row.hs_lastmodifieddate, now, raw_json, now, now,
    // ON CONFLICT bindings for is_cancelled, cancelled_at, cancel_reason:
    cancelFields.is_cancelled ?? null,
    cancelFields.cancelled_at ?? null,
    cancelFields.cancel_reason ?? null,
  ).run();

  // History entry
  const changeType = existing ? (newlyDetectedCancellation ? "cancelled" : (undeleted ? "undeleted" : "updated"))
                              : "created";
  if (!existing || diff.changed.length > 0 || newlyDetectedCancellation || undeleted) {
    await db.prepare(`
      INSERT INTO deal_history (deal_id, change_type, changed_fields, old_values, new_values, source, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      row.deal_id,
      changeType,
      JSON.stringify(diff.changed),
      JSON.stringify(diff.old),
      JSON.stringify(diff.next),
      source,
      now,
    ).run();
  }

  if (!existing) results.deals_created++;
  else if (diff.changed.length > 0) results.deals_updated++;
  if (newlyDetectedCancellation) results.cancellations_detected++;
}


async function upsertContactLifecycle(db, hsContact, results) {
  const p = hsContact.properties || {};
  const hubspot_contact_id = String(hsContact.id);
  const email = p.email;
  if (!email) return; // contacts without email cannot match our D1 row uniqueness
  const now = nowIso();
  // Match by hubspot_contact_id first, fall back to email. D1 contacts may
  // pre-exist from website form submissions; we update lifecycle fields
  // without disturbing other columns.
  await db.prepare(`
    UPDATE contacts
       SET hubspot_contact_id = COALESCE(hubspot_contact_id, ?),
           lifecycle_stage = ?,
           entered_subscriber_at = COALESCE(?, entered_subscriber_at),
           entered_lead_at = COALESCE(?, entered_lead_at),
           entered_mql_at = COALESCE(?, entered_mql_at),
           entered_sql_at = COALESCE(?, entered_sql_at),
           entered_opportunity_at = COALESCE(?, entered_opportunity_at),
           entered_customer_at = COALESCE(?, entered_customer_at),
           last_seen_at = COALESCE(last_seen_at, ?)
     WHERE hubspot_contact_id = ? OR email = ?
  `).bind(
    hubspot_contact_id,
    p.lifecyclestage || null,
    p.hs_lifecyclestage_subscriber_date || null,
    p.hs_lifecyclestage_lead_date || null,
    p.hs_lifecyclestage_marketingqualifiedlead_date || null,
    p.hs_lifecyclestage_salesqualifiedlead_date || null,
    p.hs_lifecyclestage_opportunity_date || null,
    p.hs_lifecyclestage_customer_date || null,
    now,
    hubspot_contact_id, email,
  ).run();
  results.contacts_synced++;
}


// ─────────────────────────────────────────────────────────────────────
// Cancellation detection by diff (Katharine & Ray defence)
// ─────────────────────────────────────────────────────────────────────

async function detectSilentCancellations(db, hubspotWonIds, results) {
  const d1WonIds = await getExistingWonDealIds(db);
  const missing = [];
  for (const id of d1WonIds) {
    if (!hubspotWonIds.has(id)) missing.push(id);
  }
  if (missing.length === 0) return;
  const now = nowIso();
  for (const dealId of missing) {
    await db.prepare(`
      UPDATE deals
         SET is_cancelled = 1,
             cancelled_at = COALESCE(cancelled_at, ?),
             cancel_reason = COALESCE(cancel_reason, ?),
             updated_at = ?
       WHERE deal_id = ? AND COALESCE(is_cancelled, 0) = 0
    `).bind(now, "Disappeared from HubSpot won-deals search; record likely deleted", now, dealId).run();
    await db.prepare(`
      INSERT INTO deal_history (deal_id, change_type, changed_fields, old_values, new_values, source, notes, changed_at)
      VALUES (?, 'cancelled', '["is_cancelled","cancelled_at","cancel_reason"]', '{"is_cancelled":0}',
              '{"is_cancelled":1}', 'cancel_detect',
              'Deal vanished from HubSpot is_closed_won set; D1 marked cancelled.', ?)
    `).bind(dealId, now).run();
    results.silent_cancellations++;
  }
}


// ─────────────────────────────────────────────────────────────────────
// Revenue snapshots + variance audit
// ─────────────────────────────────────────────────────────────────────

async function captureRevenueSnapshot(db, period, periodType, results) {
  const periodStart = period + "-01";
  // Compute period end exclusive
  const [yStr, mStr] = period.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  let nextYear = y;
  let nextMonth = m + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear = y + 1; }
  const periodEnd = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  const grossRow = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS gross, COUNT(*) AS deal_count
      FROM deals
     WHERE is_closed_won = 1
       AND close_date >= ? AND close_date < ?
  `).bind(periodStart, periodEnd).first();

  const cancelledRow = await db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS cancelled_amt, COUNT(*) AS cancelled_count
      FROM deals
     WHERE is_cancelled = 1
       AND close_date >= ? AND close_date < ?
  `).bind(periodStart, periodEnd).first();

  const byChannelRs = await db.prepare(`
    SELECT COALESCE(event_type, 'unknown') AS channel,
           COALESCE(SUM(amount), 0) AS gross,
           COUNT(*) AS count
      FROM deals
     WHERE is_closed_won = 1
       AND close_date >= ? AND close_date < ?
     GROUP BY COALESCE(event_type, 'unknown')
  `).bind(periodStart, periodEnd).all();
  const by_channel = {};
  for (const r of (byChannelRs.results || [])) {
    by_channel[r.channel] = { gross: r.gross, count: r.count };
  }

  const gross = grossRow?.gross || 0;
  const cancelled = cancelledRow?.cancelled_amt || 0;
  const deal_count = grossRow?.deal_count || 0;
  const cancelled_count = cancelledRow?.cancelled_count || 0;
  const net = gross - cancelled;

  // Look up previous snapshot for same period to compute delta + variance flag.
  const prev = await db.prepare(`
    SELECT snapshot_id, gross_revenue
      FROM revenue_snapshots
     WHERE period = ?
     ORDER BY captured_at DESC
     LIMIT 1
  `).bind(period).first();

  const delta = prev ? (gross - (prev.gross_revenue || 0)) : null;

  // Period is "closed" when the period_end is in the past (the month is over).
  const periodClosed = new Date(periodEnd) <= new Date();
  const VARIANCE_THRESHOLD_POUNDS = 1000;
  const variance_flag = (periodClosed && delta != null && Math.abs(delta) >= VARIANCE_THRESHOLD_POUNDS) ? 1 : 0;

  await db.prepare(`
    INSERT INTO revenue_snapshots (
      period, period_type, gross_revenue, cancelled_amount, net_revenue,
      deal_count, cancelled_count, by_channel,
      prev_snapshot_id, delta_vs_prev_snapshot, variance_flag, captured_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    period, periodType, gross, cancelled, net,
    deal_count, cancelled_count, JSON.stringify(by_channel),
    prev?.snapshot_id || null, delta, variance_flag, nowIso(),
  ).run();

  if (variance_flag) results.variance_flags++;
  results.snapshots_captured++;
}

async function captureAllSnapshots(db, results) {
  const now = new Date();
  const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
  const periods = new Set();
  // Current + previous + last 12 months
  for (let i = 0; i < 13; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    periods.add(ym(d.getFullYear(), d.getMonth() + 1));
  }
  for (const p of periods) {
    try {
      await captureRevenueSnapshot(db, p, "month", results);
    } catch (err) {
      results.errors.push({ where: `snapshot ${p}`, message: err.message });
    }
  }
}


// ─────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────
// Bulk pre-fetch + batched write (subrequest-limit defence)
// ─────────────────────────────────────────────────────────────────────

async function loadExistingDealsMap(db) {
  // Fetch every existing deal's id + cancellation/won state in one D1 call.
  // ~hundreds to low thousands of rows; well within D1 response size limits.
  const rs = await db.prepare(
    `SELECT deal_id, is_closed_won, is_closed_lost, is_cancelled, deal_stage,
            deal_name, amount, pipeline, event_type, event_date, introducer,
            source_channel, close_date, closed_won_at, closed_lost_at,
            cancelled_at, cancel_reason
       FROM deals`
  ).all().catch(() => ({ results: [] }));
  const map = new Map();
  for (const r of (rs.results || [])) map.set(String(r.deal_id), r);
  return map;
}

const DEAL_BATCH_SIZE = 25;        // 2 statements per deal → ~50 stmts/batch
const CONTACT_BATCH_SIZE = 25;     // 1 statement per contact → ~25 stmts/batch

async function batchedUpsertDeals(db, deals, existingMap, results) {
  let pending = [];
  const flush = async () => {
    if (pending.length === 0) return;
    try {
      await db.batch(pending);
    } catch (err) {
      results.errors.push({ where: "deal_batch_flush", message: err.message, batch_size: pending.length });
    }
    pending = [];
  };
  for (const hs of deals) {
    try {
      const row = dealRowFromHubSpot(hs);
      const existing = existingMap.get(row.deal_id) || null;
      const diff = diffDealRow(existing, row);

      const newlyDetectedCancellation =
        existing && existing.is_closed_won === 1 && row.is_closed_won === 1 &&
        CANCELLED_STAGE_NAMES.has(row.deal_stage) && existing.is_cancelled !== 1;
      const undeleted =
        existing?.is_cancelled === 1 && !CANCELLED_STAGE_NAMES.has(row.deal_stage);

      const cancelFields = newlyDetectedCancellation
        ? { is_cancelled: 1, cancelled_at: nowIso(), cancel_reason: "HubSpot stage transitioned to Cancelled" }
        : (undeleted ? { is_cancelled: 0, cancelled_at: null, cancel_reason: null } : {});

      const raw_json = JSON.stringify(hs);
      const now = nowIso();

      pending.push(
        db.prepare(`
          INSERT INTO deals (
            deal_id, hubspot_primary_contact_id, deal_name, amount, pipeline, deal_stage,
            event_type, event_date, introducer, source_channel,
            create_date, close_date, closed_won_at, closed_lost_at,
            is_closed_won, is_closed_lost, is_cancelled, cancelled_at, cancel_reason,
            hs_lastmodifieddate, last_synced_at, raw_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(deal_id) DO UPDATE SET
            hubspot_primary_contact_id = excluded.hubspot_primary_contact_id,
            deal_name = excluded.deal_name,
            amount = excluded.amount,
            pipeline = excluded.pipeline,
            deal_stage = excluded.deal_stage,
            event_type = COALESCE(excluded.event_type, deals.event_type),
            event_date = COALESCE(excluded.event_date, deals.event_date),
            introducer = COALESCE(excluded.introducer, deals.introducer),
            source_channel = COALESCE(excluded.source_channel, deals.source_channel),
            create_date = excluded.create_date,
            close_date = excluded.close_date,
            closed_won_at = COALESCE(excluded.closed_won_at, deals.closed_won_at),
            closed_lost_at = COALESCE(excluded.closed_lost_at, deals.closed_lost_at),
            is_closed_won = excluded.is_closed_won,
            is_closed_lost = excluded.is_closed_lost,
            is_cancelled = COALESCE(?, deals.is_cancelled),
            cancelled_at = COALESCE(?, deals.cancelled_at),
            cancel_reason = COALESCE(?, deals.cancel_reason),
            hs_lastmodifieddate = excluded.hs_lastmodifieddate,
            last_synced_at = excluded.last_synced_at,
            raw_json = excluded.raw_json,
            updated_at = excluded.updated_at
        `).bind(
          row.deal_id, row.hubspot_primary_contact_id, row.deal_name, row.amount, row.pipeline, row.deal_stage,
          row.event_type, row.event_date, row.introducer, row.source_channel,
          row.create_date, row.close_date, row.closed_won_at, row.closed_lost_at,
          row.is_closed_won, row.is_closed_lost,
          cancelFields.is_cancelled ?? 0,
          cancelFields.cancelled_at ?? null,
          cancelFields.cancel_reason ?? null,
          row.hs_lastmodifieddate, now, raw_json, now, now,
          cancelFields.is_cancelled ?? null,
          cancelFields.cancelled_at ?? null,
          cancelFields.cancel_reason ?? null,
        )
      );

      const changeType = existing
        ? (newlyDetectedCancellation ? "cancelled" : (undeleted ? "undeleted" : "updated"))
        : "created";
      if (!existing || diff.changed.length > 0 || newlyDetectedCancellation || undeleted) {
        pending.push(
          db.prepare(`
            INSERT INTO deal_history (deal_id, change_type, changed_fields, old_values, new_values, source, changed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            row.deal_id, changeType, JSON.stringify(diff.changed),
            JSON.stringify(diff.old), JSON.stringify(diff.next), "hubspot_sync", now,
          )
        );
      }

      if (!existing) results.deals_created++;
      else if (diff.changed.length > 0) results.deals_updated++;
      if (newlyDetectedCancellation) results.cancellations_detected++;

      if (pending.length >= DEAL_BATCH_SIZE * 2) await flush();
    } catch (err) {
      results.errors.push({ where: `deal ${hs.id}`, message: err.message });
    }
  }
  await flush();
}

async function loadExistingContactsMap(db) {
  // Single read of every D1 contact's identity keys so the per-contact
  // upsert loop can decide INSERT-vs-UPDATE in memory rather than running
  // a SELECT per HubSpot row (would blow the subrequest budget on a
  // multi-thousand-contact backfill).
  const rs = await db.prepare(
    `SELECT contact_id, hubspot_contact_id, LOWER(email) AS email_lc FROM contacts`
  ).all().catch(() => ({ results: [] }));
  const byHsId = new Map();
  const byEmail = new Map();
  for (const r of (rs.results || [])) {
    if (r.hubspot_contact_id) byHsId.set(String(r.hubspot_contact_id), r.contact_id);
    if (r.email_lc) byEmail.set(r.email_lc, r.contact_id);
  }
  return { byHsId, byEmail };
}

async function batchedUpsertContacts(db, contacts, existingMap, results) {
  let pending = [];
  const flush = async () => {
    if (pending.length === 0) return;
    try {
      await db.batch(pending);
    } catch (err) {
      results.errors.push({ where: "contact_batch_flush", message: err.message, batch_size: pending.length });
    }
    pending = [];
  };
  for (const hs of contacts) {
    try {
      const p = hs.properties || {};
      const hubspot_contact_id = String(hs.id);
      const email = (p.email || "").trim();
      if (!email) {
        // HubSpot contact with no email - cannot store in our schema
        // (email is UNIQUE NOT NULL). Skip and count.
        results.contacts_skipped_no_email = (results.contacts_skipped_no_email || 0) + 1;
        continue;
      }
      const emailLc = email.toLowerCase();
      const now = nowIso();

      // Decide INSERT or UPDATE based on pre-loaded mapping
      const existingByHs = existingMap.byHsId.get(hubspot_contact_id);
      const existingByEmail = existingMap.byEmail.get(emailLc);
      const existingContactId = existingByHs || existingByEmail;

      const lifecycle_stage = p.lifecyclestage || null;
      const entered_subscriber_at = p.hs_lifecyclestage_subscriber_date || null;
      const entered_lead_at = p.hs_lifecyclestage_lead_date || null;
      const entered_mql_at = p.hs_lifecyclestage_marketingqualifiedlead_date || null;
      const entered_sql_at = p.hs_lifecyclestage_salesqualifiedlead_date || null;
      const entered_opportunity_at = p.hs_lifecyclestage_opportunity_date || null;
      const entered_customer_at = p.hs_lifecyclestage_customer_date || null;

      if (existingContactId) {
        // UPDATE existing D1 contact in place. Use contact_id to target the
        // exact row so we never accidentally collide on the email UNIQUE
        // index (UPDATE doesn't trigger it but explicit targeting is safer).
        pending.push(
          db.prepare(`
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
                 hs_lastmodifieddate = ?,
                 hubspot_last_synced_at = ?
             WHERE contact_id = ?
          `).bind(
            hubspot_contact_id, lifecycle_stage,
            entered_subscriber_at, entered_lead_at, entered_mql_at,
            entered_sql_at, entered_opportunity_at, entered_customer_at,
            p.firstname || null, p.lastname || null, p.phone || null,
            now,
            p.lastmodifieddate || p.hs_lastmodifieddate || null,
            now,
            existingContactId,
          )
        );
        results.contacts_updated = (results.contacts_updated || 0) + 1;
      } else {
        // INSERT new HubSpot-only contact. visitor_id points at the
        // sentinel visitor row (added by migrate.js); contact_id is the
        // HubSpot id with an 'hs_' prefix so it never collides with the
        // existing 'c_<uuid>' contact_ids generated by /api/submit.
        const newContactId = "hs_" + hubspot_contact_id;
        pending.push(
          db.prepare(`
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
            p.firstname || null, p.lastname || null, p.phone || null,
            hubspot_contact_id, lifecycle_stage,
            entered_subscriber_at, entered_lead_at, entered_mql_at,
            entered_sql_at, entered_opportunity_at, entered_customer_at,
            now, now, now,
            p.lastmodifieddate || p.hs_lastmodifieddate || null,
            now,
          )
        );
        // Update the in-memory map so subsequent contacts in the same
        // batch with the same hubspot_id or email are treated as updates.
        existingMap.byHsId.set(hubspot_contact_id, newContactId);
        existingMap.byEmail.set(emailLc, newContactId);
        results.contacts_inserted = (results.contacts_inserted || 0) + 1;
      }

      results.contacts_synced++;
      if (pending.length >= CONTACT_BATCH_SIZE) await flush();
    } catch (err) {
      results.errors.push({ where: `contact ${hs.id}`, message: err.message });
    }
  }
  await flush();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const token = env.HUBSPOT_API_TOKEN;
  if (!token) return json({ ok: false, error: "no_token" }, 500);
  if (!env.DB) return json({ ok: false, error: "no_db" }, 500);

  // Auth gate (optional) - if SYNC_TOKEN is set, require it.
  if (env.SYNC_TOKEN) {
    const supplied = request.headers.get("x-sync-token") || new URL(request.url).searchParams.get("token");
    if (supplied !== env.SYNC_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);
  }

  const url = new URL(request.url);
  // Full-backfill flag - ignore watermark, fetch every deal HubSpot has.
  // Use sparingly; main use case is first run after the migration lands.
  const full = url.searchParams.get("full") === "1";

  const started = Date.now();
  const results = {
    started_at: nowIso(),
    deals_created: 0,
    deals_updated: 0,
    cancellations_detected: 0,
    silent_cancellations: 0,
    contacts_synced: 0,
    snapshots_captured: 0,
    variance_flags: 0,
    errors: [],
  };

  try {
    // 1. Determine watermarks
    const dealWatermark = full ? null : await getLastDealWatermark(env.DB);
    const contactWatermark = full ? null : await getLastContactWatermark(env.DB);
    results.deal_watermark_used = dealWatermark;
    results.contact_watermark_used = contactWatermark;

    // 2. Pre-fetch all existing deal state in ONE D1 read so the per-deal
    // upsert loop doesn't burn a subrequest per row (we hit the 1000
    // subrequest cap at deal 333 on the first attempt with full=1).
    const existingDealsMap = await loadExistingDealsMap(env.DB);

    // 3. Fetch + batched-upsert modified deals
    const deals = await fetchModifiedDeals(token, dealWatermark);
    results.deals_fetched = deals.length;
    await batchedUpsertDeals(env.DB, deals, existingDealsMap, results);

    // 4. Cancellation diff (Katharine & Ray defence). Skip on first full
    // backfill: D1 has no prior won set to diff against.
    if (!full && existingDealsMap.size > 0) {
      try {
        const hsWonIds = await fetchAllWonDealIds(token);
        results.hubspot_won_count = hsWonIds.size;
        await detectSilentCancellations(env.DB, hsWonIds, results);
      } catch (err) {
        results.errors.push({ where: "cancel_detect", message: err.message });
      }
    } else {
      // Still record the won-set size for visibility.
      try {
        const hsWonIds = await fetchAllWonDealIds(token);
        results.hubspot_won_count = hsWonIds.size;
        results.cancel_detect_skipped = "first_full_backfill";
      } catch (err) {
        results.errors.push({ where: "cancel_detect_visibility", message: err.message });
      }
    }

    // 5. Fetch + batched-upsert modified contacts (lifecycle stages).
    // HubSpot is the source of truth for the contact universe - we
    // mirror EVERY HubSpot contact (insert if new, update if known),
    // not just the subset that came through the website form.
    const existingContactsMap = await loadExistingContactsMap(env.DB);
    const contacts = await fetchModifiedContacts(token, contactWatermark);
    results.contacts_fetched = contacts.length;
    await batchedUpsertContacts(env.DB, contacts, existingContactsMap, results);

    // 6. Revenue snapshots + variance audit
    await captureAllSnapshots(env.DB, results);

    results.finished_at = nowIso();
    results.elapsed_ms = Date.now() - started;
    results.ok = true;
    return json(results, 200);
  } catch (err) {
    results.ok = false;
    results.fatal_error = err.message;
    results.elapsed_ms = Date.now() - started;
    return json(results, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
