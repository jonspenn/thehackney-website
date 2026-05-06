/**
 * POST /api/virtual-tour/feedback
 *
 * Phase 1 of prd-sys-virtual-tour.md.
 *
 * Saves the post-watch free-text feedback against the token row.
 * Only fires for visitors who reached >=90% completion (gated client-side).
 *
 * Body: { token: string, feedback_text: string }
 *
 * Stores against virtual_tour_tokens (feedback_text + feedback_submitted_at).
 * Returns 204 on success or silent failure - never error to the client because
 * a feedback save shouldn't break the watch experience.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const MAX_FEEDBACK_CHARS = 2000;

function nowIso() {
  return new Date().toISOString();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const ok = new Response(null, { status: 204, headers: CORS_HEADERS });

  if (!env.DB) return ok;

  let body;
  try {
    body = await request.json();
  } catch {
    return ok;
  }

  const token = (body.token || "").toString().slice(0, 200);
  const text = (body.feedback_text || "").toString().slice(0, MAX_FEEDBACK_CHARS).trim();

  if (!token || !text) return ok;

  try {
    await env.DB.prepare(
      `UPDATE virtual_tour_tokens
       SET feedback_text = ?, feedback_submitted_at = ?
       WHERE token = ?`
    ).bind(text, nowIso(), token).run();
  } catch (err) {
    console.error("[virtual-tour-feedback] D1 write failed:", err.message);
  }

  return ok;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
