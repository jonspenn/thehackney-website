/**
 * POST /api/submit
 *
 * Universal form submission endpoint. Handles all four form types:
 *   - wedding-quiz (WeddingQuiz.jsx)
 *   - corporate-quiz (CorporateQuiz.jsx)
 *   - brochure-download (weddings.astro inline form)
 *   - supperclub-signup (supper-club.astro email capture)
 *
 * Identity resolution: stitches anonymous visitor_id (from thk_vid cookie)
 * to a named contact on first form submission. If the email already exists,
 * updates the existing contact record with any new data.
 *
 * Writes to D1 tables: contacts, submissions
 * Phase 2 will add Klaviyo push. Phase 3 adds HubSpot.
 *
 * Body: {
 *   form_type: "wedding-quiz" | "corporate-quiz" | "brochure-download" | "supperclub-signup",
 *   email: "required",
 *   first_name?: string,
 *   last_name?: string,
 *   phone?: string,
 *   company?: string,
 *   form_data: { ... any form-specific fields }
 * }
 *
 * Returns: { ok: true, contact_id: "..." }
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_FORM_TYPES = [
  "wedding-quiz",
  "corporate-quiz",
  "brochure-download",
  "supperclub-signup",
];

const LEAD_TYPE_MAP = {
  "wedding-quiz": "wedding",
  "corporate-quiz": "corporate",
  "brochure-download": "wedding",
  "supperclub-signup": "supperclub",
};

function isValidEmail(str) {
  if (typeof str !== "string" || str.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

function generateId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  const arr = new Uint8Array(20);
  crypto.getRandomValues(arr);
  for (const b of arr) id += chars[b % chars.length];
  return id;
}

function getCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function safeStr(val, maxLen = 500) {
  if (typeof val !== "string") return null;
  return val.trim().slice(0, maxLen) || null;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    console.error("[submit] No D1 binding");
    return new Response(JSON.stringify({ ok: false, error: "server_error" }), {
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

  // Validate required fields
  const formType = body.form_type;
  if (!VALID_FORM_TYPES.includes(formType)) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_form_type" }),
      { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  const email = safeStr(body.email, 320)?.toLowerCase();
  if (!isValidEmail(email)) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_email" }),
      { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  const firstName = safeStr(body.first_name, 100);
  const lastName = safeStr(body.last_name, 100);
  const phone = safeStr(body.phone, 30);
  const company = safeStr(body.company, 200);
  const leadType = LEAD_TYPE_MAP[formType] || "unknown";
  const formData = body.form_data ? JSON.stringify(body.form_data) : null;
  const visitorId = getCookie(request, "thk_vid") || null;
  const referrer = safeStr(request.headers.get("referer"), 500);
  const userAgent = safeStr(request.headers.get("user-agent"), 500);
  const now = new Date().toISOString();

  // Always log for safety - recoverable from Cloudflare logs
  console.log("[submit]", JSON.stringify({
    form_type: formType, email, first_name: firstName, phone,
    visitor_id: visitorId, ts: now,
  }));

  try {
    // ─── Identity resolution: find or create contact ───
    let contactId;
    const existing = await env.DB.prepare(
      "SELECT contact_id, first_name, last_name, phone, company FROM contacts WHERE email = ?"
    ).bind(email).first();

    if (existing) {
      contactId = existing.contact_id;

      // Update contact with any new data (don't overwrite existing values with null)
      const updates = [];
      const binds = [];

      if (firstName && !existing.first_name) {
        updates.push("first_name = ?");
        binds.push(firstName);
      }
      if (lastName && !existing.last_name) {
        updates.push("last_name = ?");
        binds.push(lastName);
      }
      if (phone && !existing.phone) {
        updates.push("phone = ?");
        binds.push(phone);
      }
      if (company && !existing.company) {
        updates.push("company = ?");
        binds.push(company);
      }
      // Always update visitor_id if we have one (stitch latest visitor)
      if (visitorId) {
        updates.push("visitor_id = ?");
        binds.push(visitorId);
      }

      if (updates.length > 0) {
        binds.push(contactId);
        await env.DB.prepare(
          `UPDATE contacts SET ${updates.join(", ")} WHERE contact_id = ?`
        ).bind(...binds).run();
      }
    } else {
      // New contact
      contactId = "c_" + generateId();

      // Pull attribution from the visitor record if available
      let sourceChannel = null;
      let sourceKeyword = null;
      let sourceCampaign = null;
      let sourceMatchType = null;

      if (visitorId) {
        const visitor = await env.DB.prepare(
          "SELECT first_utm_source, first_utm_medium, first_utm_campaign, first_utm_term, first_hsa_kw, first_hsa_mt FROM visitors WHERE visitor_id = ?"
        ).bind(visitorId).first();

        if (visitor) {
          sourceChannel = [visitor.first_utm_source, visitor.first_utm_medium]
            .filter(Boolean)
            .join(" / ") || null;
          sourceKeyword = visitor.first_hsa_kw || visitor.first_utm_term || null;
          sourceCampaign = visitor.first_utm_campaign || null;
          sourceMatchType = visitor.first_hsa_mt || null;
        }
      }

      await env.DB.prepare(
        `INSERT INTO contacts (
          contact_id, visitor_id, email, first_name, last_name, phone, company,
          lead_type, source_channel, source_keyword, source_campaign, source_match_type,
          form_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        contactId, visitorId, email, firstName, lastName, phone, company,
        leadType, sourceChannel, sourceKeyword, sourceCampaign, sourceMatchType,
        formData, now
      ).run();

      // Stitch visitor record to this contact
      if (visitorId) {
        await env.DB.prepare(
          "UPDATE visitors SET contact_id = ? WHERE visitor_id = ? AND contact_id IS NULL"
        ).bind(contactId, visitorId).run();
      }
    }

    // ─── Record the submission (every form submit, even repeat contacts) ───
    // Extract key fields from form_data into proper columns for querying
    const fd = body.form_data || {};
    const subEventType = safeStr(fd.event_type, 100);
    const subGuestCount = safeStr(fd.guest_count, 50);
    const subEventDate = safeStr(fd.event_date || fd.wedding_date, 50);
    const subUrgency = safeStr(fd.booking_urgency, 50);
    const subBudget = safeStr(fd.budget, 50);
    const subBrochureType = safeStr(fd.brochure_type, 50);
    const subWeddingYear = safeStr(fd.wedding_year, 10);

    const submissionId = "s_" + generateId();
    await env.DB.prepare(
      `INSERT INTO submissions (
        submission_id, contact_id, form_type, form_data,
        page_url, user_agent, created_at,
        event_type, guest_count, event_date, booking_urgency,
        budget, brochure_type, wedding_year,
        company, first_name, email, phone
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      submissionId, contactId, formType, formData,
      referrer, userAgent, now,
      subEventType, subGuestCount, subEventDate, subUrgency,
      subBudget, subBrochureType, subWeddingYear,
      company, firstName, email, phone
    ).run();

    return new Response(
      JSON.stringify({ ok: true, contact_id: contactId }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[submit] D1 error:", err.message, err.stack);
    return new Response(
      JSON.stringify({ ok: false, error: "server_error" }),
      { status: 500, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return onRequestOptions();
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
