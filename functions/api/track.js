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
 * Lost lead reactivation (Phase 1): if the visitor is stitched to a contact
 * with funnel_stage='lost' and the event type is a Tier 1 signal (date_check
 * or cta_click), auto-revive the lead immediately. For page_view, only revive
 * if 7+ days have passed since lost_at - a single pageview the same day we
 * marked them lost is not a signal. Form submissions (quiz / brochure /
 * supper club signup) are handled in /api/submit, not here.
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

    // ── Auto-revive from Lost (Phase 1 reactivation) ──
    // Tier 1 signals: date_check + cta_click → revive immediately.
    // Weaker signals: page_view → revive only if 7+ days since lost_at.
    // scroll_depth / questionnaire_step / questionnaire_abandon are passive and
    // don't revive. questionnaire_start / questionnaire_complete fire via form_submit
    // through /api/submit which handles revival there.
    // We skip deleted contacts (recycle bin) so manual archives aren't undone silently.
    const isTier1 = eventType === "date_check" || eventType === "cta_click";
    const isReturnView = eventType === "page_view";
    if (isTier1 || isReturnView) {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const gapClause = isReturnView ? "AND lost_at < ?" : "";
        const result = await env.DB.prepare(
          `UPDATE contacts
           SET lost_at = NULL,
               lost_reason = NULL,
               lost_reason_note = NULL,
               funnel_stage = NULL,
               stage_entered_at = NULL,
               re_engaged_at = ?,
               re_engagement_source = ?
           WHERE contact_id = (SELECT contact_id FROM visitors WHERE visitor_id = ? AND contact_id IS NOT NULL)
             AND funnel_stage = 'lost'
             AND deleted_at IS NULL
             ${gapClause}`
        ).bind(
          ...(isReturnView
            ? [ts, `${eventType}:return_view`, visitorId, sevenDaysAgo]
            : [ts, eventType, visitorId])
        ).run();

        // Log only when we actually revived someone - D1 meta.changes tells us
        if (result?.meta?.changes > 0) {
          console.log("[track] revived_from_lost", JSON.stringify({
            visitor_id: visitorId, via: eventType, session_id: sessionId,
          }));
        }
      } catch (reviveErr) {
        console.error("[track] revive check failed:", reviveErr.message);
      }
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
