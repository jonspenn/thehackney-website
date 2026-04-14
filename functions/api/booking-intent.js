/**
 * POST /api/booking-intent
 *
 * Records when a lead clicks "Book a Discovery Call" or "Book a Venue Tour"
 * from the quiz success screen. Updates the contact record with:
 *   - booking_intent: "discovery-call" | "venue-tour"
 *   - booking_intent_at: ISO timestamp
 *   - booking_intent_source: "wedding-quiz" | "corporate-quiz"
 *
 * Identity: matches by visitor_id (thk_vid cookie) to find the contact
 * that was just created by the quiz submission.
 *
 * Body: { intent: "discovery-call"|"venue-tour", source: "wedding-quiz"|"corporate-quiz" }
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_INTENTS = ["discovery-call", "venue-tour"];
const VALID_SOURCES = ["wedding-quiz", "corporate-quiz", "private-events-quiz"];

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "bad_json" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const intent = body.intent;
  const source = body.source;

  if (!VALID_INTENTS.includes(intent)) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_intent", valid: VALID_INTENTS }),
      { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  const visitorId = getCookie(request, "thk_vid");
  if (!visitorId) {
    return new Response(
      JSON.stringify({ ok: false, error: "no_visitor" }),
      { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  try {
    // Find the most recent contact for this visitor
    const contact = await env.DB.prepare(
      "SELECT contact_id FROM contacts WHERE visitor_id = ? ORDER BY created_at DESC LIMIT 1"
    ).bind(visitorId).first();

    if (!contact) {
      console.log("[booking-intent] No contact found for visitor:", visitorId);
      return new Response(
        JSON.stringify({ ok: false, error: "no_contact" }),
        { status: 404, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
      );
    }

    const now = new Date().toISOString();
    await env.DB.prepare(
      `UPDATE contacts SET booking_intent = ?, booking_intent_at = ?, booking_intent_source = ?
       WHERE contact_id = ?`
    ).bind(intent, now, source || null, contact.contact_id).run();

    console.log("[booking-intent]", JSON.stringify({
      contact_id: contact.contact_id, intent, source, ts: now,
    }));

    return new Response(
      JSON.stringify({ ok: true, contact_id: contact.contact_id }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[booking-intent] D1 error:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error" }),
      { status: 500, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
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
