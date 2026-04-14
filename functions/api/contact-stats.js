/**
 * GET /api/contact-stats
 *
 * Returns recent contacts, submissions, and form-type breakdown for the
 * admin dashboard Contacts tab.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  try {
    // Recent contacts (last 50)
    const contacts = await env.DB.prepare(
      `SELECT contact_id, email, first_name, last_name, phone, company,
              lead_type, source_channel, source_keyword, created_at
       FROM contacts ORDER BY created_at DESC LIMIT 50`
    ).all();

    // Recent submissions (last 50)
    const submissions = await env.DB.prepare(
      `SELECT s.submission_id, s.form_type, s.form_data, s.created_at,
              c.email, c.first_name
       FROM submissions s
       LEFT JOIN contacts c ON s.contact_id = c.contact_id
       ORDER BY s.created_at DESC LIMIT 50`
    ).all();

    // Form type breakdown
    const breakdown = await env.DB.prepare(
      `SELECT form_type, COUNT(*) as count
       FROM submissions GROUP BY form_type ORDER BY count DESC`
    ).all();

    // Lead type breakdown
    const leadTypes = await env.DB.prepare(
      `SELECT lead_type, COUNT(*) as count
       FROM contacts WHERE lead_type IS NOT NULL
       GROUP BY lead_type ORDER BY count DESC`
    ).all();

    // Total counts
    const totalContacts = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM contacts"
    ).first();

    const totalSubmissions = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM submissions"
    ).first();

    return new Response(
      JSON.stringify({
        ok: true,
        total_contacts: totalContacts?.count || 0,
        total_submissions: totalSubmissions?.count || 0,
        contacts: contacts?.results || [],
        submissions: submissions?.results || [],
        form_breakdown: breakdown?.results || [],
        lead_breakdown: leadTypes?.results || [],
      }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[contact-stats] D1 error:", err.message);
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
