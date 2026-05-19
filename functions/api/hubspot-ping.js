/**
 * GET /api/hubspot-ping
 *
 * Health-check endpoint for the HubSpot Service Key. Fetches one deal as
 * a smoke test and returns timing + status. Used during Phase A of
 * prd-sys-reporting-unification.md to verify the rotated Service Key
 * "Atlas D1 Sync" is wired through Cloudflare Pages.
 *
 * Lives on long-term as a synthetic check per
 * monitoring/prd-sys-health-monitoring.md - the 12-day calendar-API
 * outage of 6-18 May 2026 is exactly what these pings exist to catch.
 *
 * Token: env.HUBSPOT_API_TOKEN (Cloudflare Pages Secret).
 * Hub: app-eu1 (HubSpot EU region, hub id 25870094).
 * Scopes on the key: crm.objects.deals.read, crm.objects.contacts.read,
 *                    crm.schemas.deals.read, crm.schemas.contacts.read.
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });

export async function onRequestGet(context) {
  const { env } = context;
  const token = env.HUBSPOT_API_TOKEN;
  if (!token) {
    return json({ ok: false, error: "no_token", hint: "HUBSPOT_API_TOKEN secret missing" }, 500);
  }

  const start = Date.now();
  try {
    const r = await fetch(
      "https://api.hubapi.com/crm/v3/objects/deals?limit=1&properties=dealname,amount,closedate,hs_lastmodifieddate",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
    const took_ms = Date.now() - start;
    const body = await r.json().catch(() => ({}));
    return json({
      ok: r.ok,
      status: r.status,
      took_ms,
      results_count: Array.isArray(body.results) ? body.results.length : 0,
      // First deal sanity-check shape (no PII echoed - just structure):
      sample_keys: Array.isArray(body.results) && body.results[0]
        ? Object.keys(body.results[0].properties || {})
        : [],
      error: !r.ok ? (body.message || body.error || "unknown") : undefined,
    }, r.ok ? 200 : 502);
  } catch (err) {
    return json({ ok: false, error: "fetch_failed", message: err.message, took_ms: Date.now() - start }, 500);
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
