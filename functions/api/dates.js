/**
 * GET /api/dates
 *
 * Aggregated date-level data for the Dates tab in /admin/dashboard/.
 *
 * Modes (selected via ?mode=):
 *
 *   ?mode=heat&year=2026&stream=all
 *     Returns click counts for every date in the requested year, plus the
 *     stream's calibrated thresholds (low/mid/high) computed from the same
 *     dataset. Used by DatesCalendar.jsx to colour cells.
 *
 *   ?mode=top&year=2026&stream=all&direction=hot&limit=25
 *     Returns the most-clicked future dates (direction=hot) or the
 *     coldest available dates within 90 days (direction=cold).
 *     Used by DatesTopList.jsx.
 *
 *   ?mode=detail&date=2026-06-14
 *     Returns per-date detail: total clicks, per-stream breakdown,
 *     90d sparkline buckets, recent leads who clicked, latest override.
 *     Used by DateDetailDrawer.jsx.
 *
 * Stream attribution (29 Apr 2026):
 *   stream=all → date_clicks (anonymous + identified, full signal)
 *   stream=<X> → events joined via visitors → contacts → submissions, where
 *     the contact has AT LEAST ONE submission of a form_type belonging to
 *     stream X. A multi-stream contact (e.g. supper club + corporate +
 *     wedding) counts in every stream they have submitted to, not just
 *     their original lead_type. This is the correct attribution model
 *     because a single contact can be a buyer for several streams.
 *
 *   Cafe-bar excluded per prd-sys-dates-tab.md (decided 29 Apr 2026).
 *
 * Append-only override read pattern: latest row per event_date wins; if
 * cleared=1 on the latest row, treat as no override.
 *
 * No PII leaks - the recent-leads list returns first_name only, never email
 * or phone. Names are linked to LeadProfile via contact_id.
 *
 * Cached at the edge for 60s.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CACHE_SECONDS = 60;
const VALID_STREAMS = ["all", "wedding", "corporate", "private-events", "supperclub"];

/* Stream → form_type membership (form_types submissions.form_type can take).
   `brochure-download` legacy form_type stores the actual stream in
   submissions.brochure_type, so it gets a separate matched OR clause. */
const STREAM_FORM_TYPES = {
  wedding:          { forms: ["wedding-quiz", "brochure-wedding"],          brochureType: "wedding" },
  corporate:        { forms: ["corporate-quiz", "brochure-corporate"],      brochureType: "corporate" },
  "private-events": { forms: ["brochure-private-events"],                   brochureType: "private-events" },
  supperclub:       { forms: ["supperclub-signup", "brochure-supper-club"], brochureType: "supper-club" },
};

/**
 * Build the "EXISTS submissions for this stream" SQL fragment + bind values.
 * Used inside the events query: filters down to events whose contact has at
 * least one submission belonging to the stream (multi-stream contacts count
 * in every stream they submitted to).
 */
function streamExistsClause(stream) {
  const cfg = STREAM_FORM_TYPES[stream];
  if (!cfg) return null;
  const placeholders = cfg.forms.map(() => "?").join(", ");
  const sql = `EXISTS (
    SELECT 1 FROM submissions s
     WHERE s.contact_id = v.contact_id
       AND (
         s.form_type IN (${placeholders})
         OR (s.form_type = 'brochure-download' AND s.brochure_type = ?)
       )
  )`;
  const binds = [...cfg.forms, cfg.brochureType];
  return { sql, binds };
}

function json(data, status = 200, cache = true) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(cache ? { "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}` } : {}),
    },
  });
}

/* ───────── Heat map ───────── */

async function heatMode(env, year, stream) {
  const yearPrefix = `${year}-`;

  let heatRows;
  if (stream === "all") {
    const r = await env.DB
      .prepare(
        `SELECT clicked_date, COUNT(*) AS clicks
           FROM date_clicks
          WHERE clicked_date LIKE ?
          GROUP BY clicked_date
          ORDER BY clicked_date`
      )
      .bind(`${yearPrefix}%`)
      .all();
    heatRows = r.results || [];
  } else {
    const filter = streamExistsClause(stream);
    if (!filter) return json({ ok: false, error: "invalid_stream" }, 400);
    const r = await env.DB
      .prepare(
        `SELECT json_extract(e.event_data, '$.date') AS clicked_date,
                COUNT(*) AS clicks
           FROM events e
           JOIN visitors v ON e.visitor_id = v.visitor_id
          WHERE e.event_type = 'date_check'
            AND v.contact_id IS NOT NULL
            AND ${filter.sql}
            AND json_extract(e.event_data, '$.date') LIKE ?
          GROUP BY clicked_date
          ORDER BY clicked_date`
      )
      .bind(...filter.binds, `${yearPrefix}%`)
      .all();
    heatRows = r.results || [];
  }

  // Per-stream calibrated thresholds (33rd / 66th / 90th percentile)
  const counts = heatRows.map((r) => r.clicks).filter((c) => c > 0).sort((a, b) => a - b);
  let thresholds = { low: 1, mid: 6, high: 16 };
  if (counts.length >= 5) {
    const pick = (p) => counts[Math.min(counts.length - 1, Math.floor(counts.length * p))];
    const low = pick(0.33);
    const mid = pick(0.66);
    const high = pick(0.9);
    thresholds = { low: Math.max(1, low), mid: Math.max(low + 1, mid), high: Math.max(mid + 1, high) };
  }

  // Current overrides snapshot (latest non-cleared row per date)
  const overridesRes = await env.DB
    .prepare(
      `SELECT event_date, override_fee, override_min_spend
         FROM date_pricing_overrides
        WHERE event_date LIKE ?
          AND override_id IN (
              SELECT MAX(override_id) FROM date_pricing_overrides
                WHERE event_date LIKE ?
                GROUP BY event_date
          )
          AND cleared = 0`
    )
    .bind(`${yearPrefix}%`, `${yearPrefix}%`)
    .all();
  const overrides = {};
  for (const o of overridesRes.results || []) {
    overrides[o.event_date] = { fee: o.override_fee, min: o.override_min_spend };
  }

  return json({
    ok: true,
    mode: "heat",
    year: parseInt(year, 10),
    stream,
    generatedAt: new Date().toISOString(),
    heat: heatRows,
    thresholds,
    overrides,
    totalClicks: counts.reduce((a, b) => a + b, 0),
    activeDates: counts.length,
  });
}

/* ───────── Top dates list ───────── */

async function topMode(env, year, stream, direction, limit) {
  const yearPrefix = `${year}-`;
  const today = new Date().toISOString().slice(0, 10);
  const ninety = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  let rows;
  if (stream === "all") {
    if (direction === "hot") {
      const r = await env.DB
        .prepare(
          `SELECT clicked_date, COUNT(*) AS clicks, MAX(clicked_at) AS last_click_at
             FROM date_clicks
            WHERE clicked_date LIKE ?
              AND clicked_date >= ?
            GROUP BY clicked_date
            ORDER BY clicks DESC, clicked_date ASC
            LIMIT ?`
        )
        .bind(`${yearPrefix}%`, today, limit)
        .all();
      rows = r.results || [];
    } else {
      const r = await env.DB
        .prepare(
          `SELECT clicked_date, COUNT(*) AS clicks, MAX(clicked_at) AS last_click_at
             FROM date_clicks
            WHERE clicked_date LIKE ?
              AND clicked_date >= ?
              AND clicked_date <= ?
            GROUP BY clicked_date
           HAVING clicks < 5
            ORDER BY clicks ASC, clicked_date ASC
            LIMIT ?`
        )
        .bind(`${yearPrefix}%`, today, ninety, limit)
        .all();
      rows = r.results || [];
    }
  } else {
    const filter = streamExistsClause(stream);
    if (!filter) return json({ ok: false, error: "invalid_stream" }, 400);
    if (direction === "hot") {
      const r = await env.DB
        .prepare(
          `SELECT json_extract(e.event_data, '$.date') AS clicked_date,
                  COUNT(*) AS clicks,
                  MAX(e.created_at) AS last_click_at
             FROM events e
             JOIN visitors v ON e.visitor_id = v.visitor_id
            WHERE e.event_type = 'date_check'
              AND v.contact_id IS NOT NULL
              AND ${filter.sql}
              AND json_extract(e.event_data, '$.date') LIKE ?
              AND json_extract(e.event_data, '$.date') >= ?
            GROUP BY clicked_date
            ORDER BY clicks DESC, clicked_date ASC
            LIMIT ?`
        )
        .bind(...filter.binds, `${yearPrefix}%`, today, limit)
        .all();
      rows = r.results || [];
    } else {
      const r = await env.DB
        .prepare(
          `SELECT json_extract(e.event_data, '$.date') AS clicked_date,
                  COUNT(*) AS clicks,
                  MAX(e.created_at) AS last_click_at
             FROM events e
             JOIN visitors v ON e.visitor_id = v.visitor_id
            WHERE e.event_type = 'date_check'
              AND v.contact_id IS NOT NULL
              AND ${filter.sql}
              AND json_extract(e.event_data, '$.date') LIKE ?
              AND json_extract(e.event_data, '$.date') >= ?
              AND json_extract(e.event_data, '$.date') <= ?
            GROUP BY clicked_date
           HAVING clicks < 5
            ORDER BY clicks ASC, clicked_date ASC
            LIMIT ?`
        )
        .bind(...filter.binds, `${yearPrefix}%`, today, ninety, limit)
        .all();
      rows = r.results || [];
    }
  }

  return json({
    ok: true,
    mode: "top",
    year: parseInt(year, 10),
    stream,
    direction,
    generatedAt: new Date().toISOString(),
    dates: rows,
  });
}

/* ───────── Per-date detail ───────── */

async function detailMode(env, date) {
  const ninetyAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  // Total anonymous clicks (full signal regardless of stream)
  const totalRes = await env.DB
    .prepare(`SELECT COUNT(*) AS clicks FROM date_clicks WHERE clicked_date = ?`)
    .bind(date)
    .first();

  // Per-stream click breakdown via submissions (contacts can count in
  // multiple streams). One conditional-SUM query rather than 4 round trips.
  const streamCols = Object.entries(STREAM_FORM_TYPES).map(([streamKey, cfg]) => {
    const placeholders = cfg.forms.map(() => "?").join(", ");
    return {
      key: streamKey,
      sql: `SUM(CASE WHEN EXISTS (
        SELECT 1 FROM submissions s
         WHERE s.contact_id = v.contact_id
           AND (
             s.form_type IN (${placeholders})
             OR (s.form_type = 'brochure-download' AND s.brochure_type = ?)
           )
      ) THEN 1 ELSE 0 END) AS ${streamKey.replace("-", "_")}_clicks`,
      binds: [...cfg.forms, cfg.brochureType],
    };
  });
  const allBinds = streamCols.flatMap((c) => c.binds);
  const streamBreakdownRes = await env.DB
    .prepare(
      `SELECT
        ${streamCols.map((c) => c.sql).join(",\n        ")}
       FROM events e
       JOIN visitors v ON e.visitor_id = v.visitor_id
      WHERE e.event_type = 'date_check'
        AND json_extract(e.event_data, '$.date') = ?
        AND v.contact_id IS NOT NULL`
    )
    .bind(...allBinds, date)
    .first();

  const breakdown = [];
  for (const c of streamCols) {
    const col = `${c.key.replace("-", "_")}_clicks`;
    const clicks = streamBreakdownRes?.[col] || 0;
    if (clicks > 0) breakdown.push({ stream: c.key, clicks });
  }

  // Sparkline: clicks per ISO week over last ~12 weeks
  const sparkRes = await env.DB
    .prepare(
      `SELECT strftime('%Y-W%W', clicked_at) AS week, COUNT(*) AS clicks
         FROM date_clicks
        WHERE clicked_date = ?
          AND clicked_at >= ?
        GROUP BY week
        ORDER BY week`
    )
    .bind(date, ninetyAgo)
    .all();

  // Recent leads (known contacts only) - first_name + contact_id only.
  // Joined via visitors → contacts so any of the contact's sessions count.
  const leadsRes = await env.DB
    .prepare(
      `SELECT c.contact_id, c.first_name, c.lead_type,
              MAX(e.created_at) AS last_click_at
         FROM events e
         JOIN visitors v ON e.visitor_id = v.visitor_id
         JOIN contacts c ON v.contact_id = c.contact_id
        WHERE e.event_type = 'date_check'
          AND json_extract(e.event_data, '$.date') = ?
        GROUP BY c.contact_id
        ORDER BY last_click_at DESC
        LIMIT 5`
    )
    .bind(date)
    .all();

  // Latest override row (append-only read pattern)
  const overrideRes = await env.DB
    .prepare(
      `SELECT override_fee, override_min_spend, note, cleared, edited_by, edited_at
         FROM date_pricing_overrides
        WHERE event_date = ?
        ORDER BY edited_at DESC, override_id DESC
        LIMIT 1`
    )
    .bind(date)
    .first();

  // Audit history (last 10)
  const historyRes = await env.DB
    .prepare(
      `SELECT override_fee, override_min_spend, note, cleared, edited_by, edited_at
         FROM date_pricing_overrides
        WHERE event_date = ?
        ORDER BY edited_at DESC, override_id DESC
        LIMIT 10`
    )
    .bind(date)
    .all();

  return json({
    ok: true,
    mode: "detail",
    date,
    generatedAt: new Date().toISOString(),
    totalClicks: totalRes?.clicks || 0,
    breakdown,
    sparkline: sparkRes.results || [],
    recentLeads: leadsRes.results || [],
    override: overrideRes && overrideRes.cleared === 0 ? {
      fee: overrideRes.override_fee,
      min: overrideRes.override_min_spend,
      note: overrideRes.note,
      editedBy: overrideRes.edited_by,
      editedAt: overrideRes.edited_at,
    } : null,
    history: historyRes.results || [],
  });
}

/* ───────── Router ───────── */

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ ok: false, error: "db_not_bound" }, 500);

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") || "heat";

  try {
    if (mode === "heat") {
      const year = url.searchParams.get("year") || String(new Date().getFullYear());
      const stream = url.searchParams.get("stream") || "all";
      if (!VALID_STREAMS.includes(stream)) return json({ ok: false, error: "invalid_stream" }, 400);
      if (!/^\d{4}$/.test(year)) return json({ ok: false, error: "invalid_year" }, 400);
      return await heatMode(env, year, stream);
    }

    if (mode === "top") {
      const year = url.searchParams.get("year") || String(new Date().getFullYear());
      const stream = url.searchParams.get("stream") || "all";
      const direction = url.searchParams.get("direction") || "hot";
      const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));
      if (!VALID_STREAMS.includes(stream)) return json({ ok: false, error: "invalid_stream" }, 400);
      if (!["hot", "cold"].includes(direction)) return json({ ok: false, error: "invalid_direction" }, 400);
      if (!/^\d{4}$/.test(year)) return json({ ok: false, error: "invalid_year" }, 400);
      return await topMode(env, year, stream, direction, limit);
    }

    if (mode === "detail") {
      const date = url.searchParams.get("date");
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return json({ ok: false, error: "invalid_date" }, 400);
      }
      return await detailMode(env, date);
    }

    return json({ ok: false, error: "invalid_mode", validModes: ["heat", "top", "detail"] }, 400);
  } catch (err) {
    console.error("[/api/dates]", err);
    return json({ ok: false, error: "query_failed", detail: String(err) }, 500, false);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405 });
}
