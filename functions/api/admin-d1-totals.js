/**
 * GET /api/_admin-d1-totals
 *
 * One-shot smoke-test endpoint for Phase A of prd-sys-reporting-unification.md.
 * Returns aggregate counts + the most-recent revenue snapshots so we can
 * verify the HubSpot sync populated D1 correctly without touching the
 * Cloudflare D1 console.
 *
 * Underscore prefix marks this as internal. Add Cloudflare Access on
 * /admin/* and /api/_admin* before 1 June 2026. Until then, treat any
 * leak as just numeric aggregates (no PII surfaced).
 *
 * SAFE TO REMOVE once Phase A verification window is done.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ ok: false, error: "no_db" }, 500);
  const safe = async (label, sql) => {
    try {
      const r = await env.DB.prepare(sql).all();
      return [label, r.results || []];
    } catch (err) {
      return [label, { error: err.message }];
    }
  };
  const safeFirst = async (label, sql) => {
    try {
      const r = await env.DB.prepare(sql).first();
      return [label, r || {}];
    } catch (err) {
      return [label, { error: err.message }];
    }
  };
  const entries = await Promise.all([
    safeFirst("deals_total", `SELECT COUNT(*) AS n FROM deals`),
    safeFirst("deals_won", `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM deals WHERE is_closed_won=1`),
    safeFirst("deals_lost", `SELECT COUNT(*) AS n FROM deals WHERE is_closed_lost=1`),
    safeFirst("deals_cancelled", `SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM deals WHERE is_cancelled=1`),
    safe("deals_won_by_event_type", `SELECT COALESCE(event_type, 'unknown') AS event_type, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM deals WHERE is_closed_won=1 GROUP BY COALESCE(event_type, 'unknown') ORDER BY total DESC`),
    safe("deals_by_stage", `SELECT deal_stage, COUNT(*) AS n FROM deals GROUP BY deal_stage ORDER BY n DESC LIMIT 20`),
    safe("revenue_snapshots_latest", `SELECT period, gross_revenue, cancelled_amount, net_revenue, deal_count, cancelled_count, delta_vs_prev_snapshot, variance_flag, captured_at FROM revenue_snapshots WHERE captured_at = (SELECT MAX(captured_at) FROM revenue_snapshots) ORDER BY period DESC`),
    safeFirst("revenue_snapshot_count", `SELECT COUNT(*) AS n FROM revenue_snapshots`),
    safeFirst("deal_history_count", `SELECT COUNT(*) AS n FROM deal_history`),
    safe("deal_history_recent", `SELECT change_type, COUNT(*) AS n FROM deal_history GROUP BY change_type ORDER BY n DESC`),
    safeFirst("contacts_total", `SELECT COUNT(*) AS n FROM contacts`),
    safeFirst("contacts_with_hs_id", `SELECT COUNT(*) AS n FROM contacts WHERE hubspot_contact_id IS NOT NULL`),
    safeFirst("contacts_with_lifecycle", `SELECT COUNT(*) AS n FROM contacts WHERE lifecycle_stage IS NOT NULL`),
    safe("contacts_by_lifecycle_stage", `SELECT lifecycle_stage, COUNT(*) AS n FROM contacts WHERE lifecycle_stage IS NOT NULL GROUP BY lifecycle_stage ORDER BY n DESC`),
    safeFirst("variance_flagged_count", `SELECT COUNT(*) AS n FROM revenue_snapshots WHERE variance_flag = 1`),
  ]);
  const out = {};
  for (const [k, v] of entries) out[k] = v;
  out.ok = true;
  out.captured_at = new Date().toISOString();
  return json(out, 200);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
