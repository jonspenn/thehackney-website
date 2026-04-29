/**
 * /api/date-pricing
 *
 * Manual per-date price overrides for the Dates tab.
 *
 * Append-only storage: every change is a new row in date_pricing_overrides
 * with editor + timestamp. Latest-row-wins at read time. To clear an
 * override, write a new row with cleared=1 (the rate-card price then
 * applies until a non-cleared override is written again).
 *
 * Decided 29 Apr 2026 in dashboard IA review (prd-sys-dates-tab.md Data
 * Principles): never destructive, always retain history. Storage is cheap;
 * lost signal is not recoverable; James-vs-Hugo edit disputes are
 * resolvable from history.
 *
 * Endpoints:
 *   GET  /api/date-pricing?date=2026-09-14
 *     Returns latest row (or null if none / latest is cleared) and full
 *     history for the date.
 *
 *   POST /api/date-pricing
 *     Body: { date, fee?, min?, note?, cleared? }
 *     Writes a new row. `fee` and `min` are nullable. `cleared: true`
 *     creates a clear-row regardless of fee/min. Editor identity comes
 *     from the Cloudflare Access JWT email header.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Cf-Access-Jwt-Assertion",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* Resolve the editor email from the CF Access identity headers.
   Falls back to "unknown@admin" if no header is present (e.g. local dev).
   The dashboard is behind CF Access in production so the header is reliable. */
function resolveEditor(request) {
  return (
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    request.headers.get("Cf-Access-Jwt-Assertion-Email") ||
    "unknown@admin"
  );
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ ok: false, error: "db_not_bound" }, 500);

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, error: "invalid_date" }, 400);
  }

  try {
    const latest = await env.DB
      .prepare(
        `SELECT override_fee, override_min_spend, note, cleared, edited_by, edited_at
           FROM date_pricing_overrides
          WHERE event_date = ?
          ORDER BY edited_at DESC, override_id DESC
          LIMIT 1`
      )
      .bind(date)
      .first();

    const history = await env.DB
      .prepare(
        `SELECT override_fee, override_min_spend, note, cleared, edited_by, edited_at
           FROM date_pricing_overrides
          WHERE event_date = ?
          ORDER BY edited_at DESC, override_id DESC
          LIMIT 25`
      )
      .bind(date)
      .all();

    return json({
      ok: true,
      date,
      override: latest && latest.cleared === 0 ? {
        fee: latest.override_fee,
        min: latest.override_min_spend,
        note: latest.note,
        editedBy: latest.edited_by,
        editedAt: latest.edited_at,
      } : null,
      cleared: latest ? latest.cleared === 1 : null,
      history: history.results || [],
    });
  } catch (err) {
    console.error("[/api/date-pricing GET]", err);
    return json({ ok: false, error: "query_failed", detail: String(err) }, 500);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ ok: false, error: "db_not_bound" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const date = body?.date;
  const fee = body?.fee;
  const min = body?.min;
  const note = body?.note ? String(body.note).slice(0, 500) : null;
  const cleared = body?.cleared === true ? 1 : 0;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, error: "invalid_date" }, 400);
  }
  if (cleared === 0 && fee == null && min == null) {
    return json({ ok: false, error: "no_change", message: "Must set fee or min, or cleared=true" }, 400);
  }
  if (fee != null && (typeof fee !== "number" || fee < 0 || fee > 100000)) {
    return json({ ok: false, error: "invalid_fee" }, 400);
  }
  if (min != null && (typeof min !== "number" || min < 0 || min > 100000)) {
    return json({ ok: false, error: "invalid_min" }, 400);
  }

  const editor = resolveEditor(request);

  try {
    const result = await env.DB
      .prepare(
        `INSERT INTO date_pricing_overrides
            (event_date, override_fee, override_min_spend, note, cleared, edited_by)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        date,
        cleared ? null : (fee ?? null),
        cleared ? null : (min ?? null),
        note,
        cleared,
        editor
      )
      .run();

    return json({
      ok: true,
      date,
      cleared: cleared === 1,
      override: cleared ? null : { fee: fee ?? null, min: min ?? null, note, editedBy: editor, editedAt: new Date().toISOString() },
      overrideId: result.meta?.last_row_id || null,
    });
  } catch (err) {
    console.error("[/api/date-pricing POST]", err);
    return json({ ok: false, error: "insert_failed", detail: String(err) }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS });
}
