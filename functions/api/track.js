/**
 * POST /api/track
 *
 * Phase 1 of prd-sys-d1-data-platform.md - event collection.
 *
 * Receives events from tracking.js and writes them to the D1 events table.
 * Fire-and-forget: always returns 204 so client-side UX is never affected.
 *
 * Body: { visitor_id, session_id, event_type, event_data, page_url }
 *
 * Also updates session ended_at and visitor total_page_views for page_view events.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_EVENT_TYPES = new Set([
  "page_view",
  "cta_click",
  "date_check",
  "questionnaire_start",
  "questionnaire_step",
  "questionnaire_complete",
  "questionnaire_abandon",
  "form_submit",
  "brochure_download",
  "scroll_depth",
]);

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ok = new Response(null, { status: 204, headers: CORS_HEADERS });

  // Respect DNT
  if (request.headers.get("dnt") === "1") return ok;
  if (!env.DB) return ok;

  let body;
  try {
    body = await request.json();
  } catch {
    return ok;
  }

  const visitorId = body.visitor_id;
  const sessionId = body.session_id;
  const eventType = body.event_type;

  // Validate required fields and event type
  if (!visitorId || !sessionId || !eventType) return ok;
  if (!VALID_EVENT_TYPES.has(eventType)) return ok;

  const eventData = body.event_data
    ? JSON.stringify(body.event_data).slice(0, 5000)
    : null;
  const pageUrl = (body.page_url || "").slice(0, 500) || null;

  try {
    const ts = now();

    // Write event
    await env.DB.prepare(
      `INSERT INTO events (event_id, visitor_id, session_id, event_type, event_data, page_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(uuid(), visitorId, sessionId, eventType, eventData, pageUrl, ts).run();

    // Update session touch time and page count for page_view events
    if (eventType === "page_view") {
      await env.DB.prepare(
        "UPDATE sessions SET ended_at = ?, page_count = page_count + 1 WHERE session_id = ?"
      ).bind(ts, sessionId).run();

      await env.DB.prepare(
        "UPDATE visitors SET last_seen_at = ?, total_page_views = total_page_views + 1 WHERE visitor_id = ?"
      ).bind(ts, visitorId).run();
    } else {
      // Still touch the session
      await env.DB.prepare(
        "UPDATE sessions SET ended_at = ? WHERE session_id = ?"
      ).bind(ts, sessionId).run();
    }
  } catch (err) {
    // Swallow - never break the UX over analytics
    console.error("[track] D1 write failed:", err);
  }

  return ok;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
