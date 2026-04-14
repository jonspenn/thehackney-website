/**
 * POST /api/supperclub-signup
 *
 * Interim email capture endpoint for the supper club waitlist.
 * Accepts: { "email": "...", "location": "primary|reinforce" }
 *
 * Writes to D1 table `supperclub_signups` if available, else logs to
 * Cloudflare function logs so no lead is silently lost. Always returns
 * 200 so the user-facing form never fails for analytics reasons.
 *
 * TODO: swap to Klaviyo/Brevo API once the platform is chosen.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

function isValidEmail(str) {
  if (typeof str !== "string" || str.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "bad_json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const email = body && body.email && body.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ ok: false, error: "bad_email" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const location =
    typeof body.location === "string" ? body.location.slice(0, 40) : "unknown";
  const referrer = (request.headers.get("referer") || "").slice(0, 500);
  const userAgent = (request.headers.get("user-agent") || "").slice(0, 500);

  // Always log so Jon can recover leads from Cloudflare logs until the
  // Klaviyo/Brevo integration lands.
  console.log("[supperclub-signup]", JSON.stringify({
    email, location, referrer, userAgent, ts: new Date().toISOString(),
  }));

  if (env.DB) {
    try {
      await env.DB.prepare(
        "INSERT INTO supperclub_signups (email, location, referrer, user_agent) VALUES (?, ?, ?, ?)"
      )
        .bind(email, location, referrer, userAgent)
        .run();
    } catch (err) {
      // Table may not exist yet - log and carry on. Email is in the
      // console log above so nothing is lost.
      console.error("[supperclub-signup] D1 write failed:", err.message);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method Not Allowed", { status: 405 });
}
