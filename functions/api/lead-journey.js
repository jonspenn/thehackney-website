/**
 * GET /api/lead-journey?contact_id=X
 *
 * Returns the full journey for a lead: every session and every event,
 * grouped by session with attribution per session. Used by the profile
 * slide-out panel to show the complete path from first ad click to
 * conversion and beyond.
 *
 * Looks up visitor_id from contacts, then pulls sessions + events.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* Derive ad platform from click IDs */
function adPlatform(row) {
  if (row.gclid || row.wbraid || row.gbraid) return "Google Ads";
  if (row.fbclid || row.fbc) return "Meta";
  if (row.ttclid) return "TikTok";
  if (row.msclkid) return "Microsoft Ads";
  if (row.li_fat_id) return "LinkedIn";
  return null;
}

/* Build a source label from UTMs */
function sourceLabel(row) {
  const parts = [];
  if (row.utm_source) parts.push(row.utm_source);
  if (row.utm_medium) parts.push(row.utm_medium);
  if (!parts.length) return row.referrer || "Direct";
  return parts.join(" / ");
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const contactId = url.searchParams.get("contact_id");

  if (!contactId) {
    return new Response(
      JSON.stringify({ ok: false, error: "missing_contact_id" }),
      { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  if (!env.DB) {
    return new Response(
      JSON.stringify({ ok: false, error: "no_db" }),
      { status: 500, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  try {
    // Get visitor_id from contact
    const contact = await env.DB.prepare(
      "SELECT visitor_id FROM contacts WHERE contact_id = ?"
    ).bind(contactId).first();

    if (!contact?.visitor_id) {
      return new Response(
        JSON.stringify({ ok: true, sessions: [], events: [], message: "no_visitor_linked" }),
        { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
      );
    }

    const visitorId = contact.visitor_id;

    // Get all sessions for this visitor
    const sessionsResult = await env.DB.prepare(
      `SELECT session_id, started_at, landing_page, referrer,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content,
              gclid, fbclid, wbraid, gbraid, fbc, fbp, ttclid, msclkid, li_fat_id,
              device_type, page_count
       FROM sessions
       WHERE visitor_id = ?
       ORDER BY started_at ASC`
    ).bind(visitorId).all();

    // Get all events for this visitor
    const eventsResult = await env.DB.prepare(
      `SELECT event_id, session_id, event_type, event_data, page_url, created_at
       FROM events
       WHERE visitor_id = ?
       ORDER BY created_at ASC`
    ).bind(visitorId).all();

    const sessions = (sessionsResult?.results || []).map(s => ({
      session_id: s.session_id,
      started_at: s.started_at,
      landing_page: s.landing_page,
      referrer: s.referrer,
      source: sourceLabel(s),
      campaign: s.utm_campaign,
      keyword: s.utm_term,
      ad_platform: adPlatform(s),
      device_type: s.device_type,
      page_count: s.page_count,
      // Raw click IDs (only include non-null)
      click_ids: Object.fromEntries(
        [["gclid", s.gclid], ["fbclid", s.fbclid], ["wbraid", s.wbraid],
         ["gbraid", s.gbraid], ["fbc", s.fbc], ["fbp", s.fbp],
         ["ttclid", s.ttclid], ["msclkid", s.msclkid], ["li_fat_id", s.li_fat_id]]
        .filter(([, v]) => v)
      ),
    }));

    const events = (eventsResult?.results || []).map(e => ({
      event_id: e.event_id,
      session_id: e.session_id,
      event_type: e.event_type,
      event_data: e.event_data,
      page_url: e.page_url,
      created_at: e.created_at,
    }));

    // Group events by session for convenience
    const eventsBySession = {};
    for (const e of events) {
      if (!eventsBySession[e.session_id]) eventsBySession[e.session_id] = [];
      eventsBySession[e.session_id].push(e);
    }

    // Calculate session durations and enrich
    const enrichedSessions = sessions.map(s => {
      const sessionEvents = eventsBySession[s.session_id] || [];
      let duration = null;
      if (sessionEvents.length >= 2) {
        const first = new Date(sessionEvents[0].created_at.replace(" ", "T") + "Z").getTime();
        const last = new Date(sessionEvents[sessionEvents.length - 1].created_at.replace(" ", "T") + "Z").getTime();
        duration = Math.round((last - first) / 1000); // seconds
      }
      return { ...s, duration, events: sessionEvents };
    });

    return new Response(
      JSON.stringify({
        ok: true,
        visitor_id: visitorId,
        total_sessions: sessions.length,
        total_events: events.length,
        sessions: enrichedSessions,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[lead-journey] D1 error:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error", message: err.message }),
      { status: 500, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
