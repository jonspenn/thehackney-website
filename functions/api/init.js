/**
 * POST /api/init
 *
 * Phase 1 of prd-sys-d1-data-platform.md - first-visit initialisation.
 *
 * Called on every page load by tracking.js. Handles three scenarios:
 *   1. New visitor (no cookie): creates visitor + session in D1, returns IDs
 *   2. Returning visitor, same session (<30 min gap, same UTMs): returns existing IDs
 *   3. Returning visitor, new session (>30 min or new UTMs): creates new session
 *
 * Sets a first-party cookie (thk_vid) with the visitor_id.
 * Cookie is HttpOnly, SameSite=Lax, Secure, 2yr expiry.
 * If consent=declined, cookie is session-only (no Max-Age).
 *
 * Respects DNT header: if set, returns empty 204 with no cookie or DB write.
 *
 * Body: { page, referrer, params: { utm_source, utm_medium, ... }, consent }
 * Returns: { visitor_id, session_id, is_new }
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const COOKIE_NAME = "thk_vid";
const COOKIE_MAX_AGE = 2 * 365 * 24 * 60 * 60; // 2 years in seconds

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function uuid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

function detectDevice(ua) {
  if (!ua) return "unknown";
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((c) => {
    const [key, ...val] = c.trim().split("=");
    if (key) cookies[key.trim()] = val.join("=").trim();
  });
  return cookies;
}

function utmsChanged(session, params) {
  if (!params) return false;
  const fields = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  for (const f of fields) {
    const newVal = params[f] || null;
    const oldVal = session[f.replace("utm_", "")] || null;
    // Map param names to session column names
    const colName = f.replace("utm_", "");
    const oldColVal = session[colName] || null;
    if (newVal && newVal !== oldColVal) return true;
  }
  if (params.gclid && params.gclid !== session.gclid) return true;
  if (params.fbclid && params.fbclid !== session.fbclid) return true;
  if (params.wbraid && params.wbraid !== session.wbraid) return true;
  if (params.gbraid && params.gbraid !== session.gbraid) return true;
  return false;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Respect DNT
  if (request.headers.get("dnt") === "1") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: "DB not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const page = (body.page || "/").slice(0, 500);
  const referrer = (body.referrer || "").slice(0, 1000);
  const params = body.params || {};
  const consent = body.consent; // "accepted", "declined", or null/undefined
  const ua = (request.headers.get("user-agent") || "").slice(0, 500);
  const deviceType = detectDevice(ua);

  // IP geolocation from Cloudflare (free on every request)
  const cf = request.cf || {};
  const ipCountry = cf.country || null; // 2-letter code e.g. "GB"
  const ipCity = cf.city || null;       // e.g. "London"

  const cookies = parseCookies(request.headers.get("cookie"));
  const existingVid = cookies[COOKIE_NAME];

  let visitorId;
  let sessionId;
  let isNew = false;

  try {
    if (existingVid) {
      // Returning visitor - check if they exist in D1
      const visitor = await env.DB.prepare(
        "SELECT visitor_id FROM visitors WHERE visitor_id = ?"
      ).bind(existingVid).first();

      if (visitor) {
        visitorId = existingVid;

        // Find the most recent session
        const latestSession = await env.DB.prepare(
          `SELECT session_id, started_at, ended_at,
                  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
                  gclid, fbclid, wbraid, gbraid
           FROM sessions WHERE visitor_id = ?
           ORDER BY started_at DESC LIMIT 1`
        ).bind(visitorId).first();

        const sessionExpired = !latestSession ||
          (Date.now() - new Date(latestSession.ended_at || latestSession.started_at).getTime()) > SESSION_TIMEOUT_MS;

        if (!sessionExpired && !utmsChanged(latestSession, params)) {
          // Continue existing session
          sessionId = latestSession.session_id;
          await env.DB.prepare(
            "UPDATE sessions SET ended_at = ?, page_count = page_count + 1 WHERE session_id = ?"
          ).bind(now(), sessionId).run();
        } else {
          // New session for existing visitor
          sessionId = uuid();
          await env.DB.prepare(
            `INSERT INTO sessions (session_id, visitor_id, started_at, landing_page, referrer,
              utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid,
              device_type, page_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
          ).bind(
            sessionId, visitorId, now(), page, referrer || null,
            params.utm_source || null, params.utm_medium || null,
            params.utm_campaign || null, params.utm_term || null,
            params.utm_content || null, params.gclid || null,
            params.fbclid || null, deviceType
          ).run();

          // Update last-touch attribution on every new session
          await env.DB.prepare(
            `UPDATE visitors SET last_seen_at = ?, total_sessions = total_sessions + 1,
              latest_utm_source = ?, latest_utm_medium = ?, latest_utm_campaign = ?,
              latest_utm_term = ?, latest_utm_content = ?,
              latest_referrer = ?, latest_landing_page = ?
             WHERE visitor_id = ?`
          ).bind(
            now(),
            params.utm_source || null, params.utm_medium || null,
            params.utm_campaign || null, params.utm_term || null,
            params.utm_content || null,
            referrer || null, page,
            visitorId
          ).run();
        }

        // Update last_seen
        await env.DB.prepare(
          "UPDATE visitors SET last_seen_at = ?, total_page_views = total_page_views + 1 WHERE visitor_id = ?"
        ).bind(now(), visitorId).run();

      } else {
        // Cookie exists but visitor not in D1 (DB was wiped or cookie from old system)
        // Treat as new visitor but keep the same ID for continuity
        visitorId = existingVid;
        isNew = true;
      }
    } else {
      // Brand new visitor
      visitorId = uuid();
      isNew = true;
    }

    if (isNew) {
      sessionId = uuid();
      const ts = now();

      await env.DB.prepare(
        `INSERT INTO visitors (visitor_id, first_seen_at, last_seen_at, first_landing_page,
          first_referrer, first_utm_source, first_utm_medium, first_utm_campaign,
          first_utm_term, first_utm_content, first_gclid, first_fbclid,
          first_hsa_cam, first_hsa_kw, first_hsa_mt, device_type, total_sessions, total_page_views,
          first_wbraid, first_gbraid, first_fbc, first_fbp,
          first_ttclid, first_msclkid, first_li_fat_id,
          first_ip_country, first_ip_city,
          latest_utm_source, latest_utm_medium, latest_utm_campaign,
          latest_utm_term, latest_utm_content, latest_referrer, latest_landing_page)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        visitorId, ts, ts, page, referrer || null,
        params.utm_source || null, params.utm_medium || null,
        params.utm_campaign || null, params.utm_term || null,
        params.utm_content || null, params.gclid || null,
        params.fbclid || null, params.hsa_cam || null,
        params.hsa_kw || null, params.hsa_mt || null, deviceType,
        params.wbraid || null, params.gbraid || null,
        params._fbc || null, params._fbp || null,
        params.ttclid || null, params.msclkid || null,
        params.li_fat_id || null,
        ipCountry, ipCity,
        params.utm_source || null, params.utm_medium || null,
        params.utm_campaign || null, params.utm_term || null,
        params.utm_content || null, referrer || null, page
      ).run();

      await env.DB.prepare(
        `INSERT INTO sessions (session_id, visitor_id, started_at, landing_page, referrer,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid,
          wbraid, gbraid, fbc, fbp, ttclid, msclkid, li_fat_id,
          device_type, page_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(
        sessionId, visitorId, ts, page, referrer || null,
        params.utm_source || null, params.utm_medium || null,
        params.utm_campaign || null, params.utm_term || null,
        params.utm_content || null, params.gclid || null,
        params.fbclid || null,
        params.wbraid || null, params.gbraid || null,
        params._fbc || null, params._fbp || null,
        params.ttclid || null, params.msclkid || null,
        params.li_fat_id || null, deviceType
      ).run();
    }
  } catch (err) {
    console.error("[init] D1 error:", err);
    // Fire-and-forget philosophy: return IDs anyway so tracking.js works
    // even if the DB write failed
    if (!visitorId) visitorId = uuid();
    if (!sessionId) sessionId = uuid();
  }

  // Build cookie header
  const cookieParts = [
    `${COOKIE_NAME}=${visitorId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
  ];
  // Only set Max-Age if consent is accepted (or not yet decided - session cookie until they decide)
  if (consent === "accepted") {
    cookieParts.push(`Max-Age=${COOKIE_MAX_AGE}`);
  }
  // If consent === "declined", no Max-Age = session cookie (cleared on browser close)

  return new Response(JSON.stringify({ visitor_id: visitorId, session_id: sessionId, is_new: isNew }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieParts.join("; "),
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "OPTIONS") return onRequestOptions(context);
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
