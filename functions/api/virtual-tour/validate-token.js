/**
 * GET /api/virtual-tour/validate-token?t={token}
 *
 * Phase 1 of prd-sys-virtual-tour.md.
 *
 * The /virtual-tour/ page calls this on mount to find out:
 *   - Is this token valid and unexpired?
 *   - Which variant should the page render (cold_reengage | tour_recap | manual)?
 *   - Which Cloudflare Stream video should the player embed?
 *
 * Side effect on first valid call: stamps opened_at on the token row so the
 * "first link open" timestamp lives in D1 against the contact, even before
 * the visitor presses play.
 *
 * Response shape (200 always - the page handles `valid: false` itself):
 * {
 *   valid: boolean,
 *   reason?: 'no_token' | 'not_found' | 'expired',
 *   token?: string,
 *   contact_id?: string,
 *   send_type?: 'cold_reengage' | 'tour_recap' | 'manual',
 *   first_open?: boolean,
 *   stream_video_uid?: string | 'placeholder',
 *   completion_pct_max?: number
 * }
 *
 * Bindings:
 *   env.DB                 (D1 - hackney-date-tracking)
 *   env.STREAM_VIDEO_UID   (string - CF Stream video ID, or 'placeholder')
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function nowIso() {
  return new Date().toISOString();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const streamVideoUid = env.STREAM_VIDEO_UID || "placeholder";
  const streamCustomerSubdomain = env.STREAM_CUSTOMER_SUBDOMAIN || "placeholder";

  if (!token) return jsonResponse({ valid: false, reason: "no_token" });
  if (!env.DB) return jsonResponse({ valid: false, reason: "not_found" });

  try {
    const row = await env.DB.prepare(
      `SELECT token, contact_id, send_type, expires_at, opened_at, completion_pct_max
       FROM virtual_tour_tokens WHERE token = ? LIMIT 1`
    ).bind(token).first();

    if (!row) return jsonResponse({ valid: false, reason: "not_found" });

    const now = nowIso();
    if (row.expires_at && row.expires_at < now) {
      return jsonResponse({ valid: false, reason: "expired" });
    }

    const firstOpen = !row.opened_at;
    if (firstOpen) {
      try {
        await env.DB.prepare(
          `UPDATE virtual_tour_tokens SET opened_at = ? WHERE token = ? AND opened_at IS NULL`
        ).bind(now, token).run();
      } catch (writeErr) {
        console.error("[validate-token] opened_at write failed:", writeErr.message);
      }
    }

    return jsonResponse({
      valid: true,
      token,
      contact_id: row.contact_id,
      send_type: row.send_type,
      first_open: firstOpen,
      stream_video_uid: streamVideoUid,
      stream_customer_subdomain: streamCustomerSubdomain,
      completion_pct_max: row.completion_pct_max || 0,
    });
  } catch (err) {
    console.error("[validate-token] D1 read failed:", err.message);
    return jsonResponse({ valid: false, reason: "not_found" });
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
