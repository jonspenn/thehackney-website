/**
 * POST /api/track-click
 *
 * Phase 1 of prd-dynamic-pricing.md - silent date-click logging.
 *
 * Body: { "date": "YYYY-MM-DD", "referrer": "..." }
 *
 * Validates the date is a real ISO date, in the future, and within
 * 24 months. Writes one row to the `date_clicks` D1 table and returns
 * 204 No Content. Fire-and-forget: any failure still returns 204 so
 * the user-facing calendar never breaks because of analytics.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const MAX_MONTHS_AHEAD = 24;

function isValidFutureDate(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return false;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (d < today) return false;

  const max = new Date(today);
  max.setUTCMonth(max.getUTCMonth() + MAX_MONTHS_AHEAD);
  if (d > max) return false;

  return true;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Always 204, even on validation failure - this is fire-and-forget.
  const ok = new Response(null, { status: 204 });

  let body;
  try {
    body = await request.json();
  } catch {
    return ok;
  }

  const date = body && body.date;
  if (!isValidFutureDate(date)) return ok;

  const referrer =
    typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null;
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 500);

  if (!env.DB) return ok;

  try {
    await env.DB.prepare(
      "INSERT INTO date_clicks (clicked_date, user_agent, referrer) VALUES (?, ?, ?)"
    )
      .bind(date, userAgent, referrer)
      .run();
  } catch (err) {
    // Swallow - never break the UX over analytics.
    console.error("[track-click] D1 write failed:", err);
  }

  return ok;
}

// Method-not-allowed for everything else
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method Not Allowed", { status: 405 });
}
