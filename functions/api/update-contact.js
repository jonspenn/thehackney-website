/**
 * POST /api/update-contact
 *
 * Updates a contact's questionnaire_data field with additional data
 * collected after the initial capture (e.g. budget from quiz step 5).
 *
 * Body: { email: "required", questionnaire_data: { budget: "10k-20k", ... } }
 * Returns: { ok: true }
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

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

  const email = (body.email || "").trim().toLowerCase();
  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "missing_email" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  const qData = body.questionnaire_data;
  if (!qData || typeof qData !== "object") {
    return new Response(JSON.stringify({ ok: false, error: "missing_data" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  try {
    // Merge with existing questionnaire_data if any
    const existing = await env.DB.prepare(
      "SELECT questionnaire_data FROM contacts WHERE email = ?"
    ).bind(email).first();

    if (!existing) {
      // Contact doesn't exist yet (race condition or direct API call)
      return new Response(JSON.stringify({ ok: false, error: "contact_not_found" }), {
        status: 404,
        headers: { ...CORS_HEADERS, "content-type": "application/json" },
      });
    }

    let merged = {};
    try {
      if (existing.questionnaire_data) {
        merged = JSON.parse(existing.questionnaire_data);
      }
    } catch { /* ignore bad json */ }

    // Merge new data (new values overwrite old)
    Object.assign(merged, qData);

    await env.DB.prepare(
      "UPDATE contacts SET questionnaire_data = ? WHERE email = ?"
    ).bind(JSON.stringify(merged), email).run();

    console.log("[update-contact]", JSON.stringify({ email, keys: Object.keys(qData) }));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[update-contact] D1 error:", err.message);
    return new Response(JSON.stringify({ ok: false, error: "server_error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
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
