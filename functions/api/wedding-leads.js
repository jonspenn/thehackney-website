/**
 * GET /api/wedding-leads
 *
 * Returns wedding leads with parsed form data for the admin dashboard.
 * Joins contacts + submissions for wedding-quiz and brochure-download
 * form types. Parses JSON form_data into structured fields for sorting.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function safeJson(str) {
  if (!str) return {};
  try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return {}; }
}

/* Map urgency values to human-readable + sort priority */
const URGENCY_RANK = { asap: 1, ready: 2, comparing: 3, browsing: 4 };
const URGENCY_LABEL = {
  asap: "Need to move fast",
  ready: "Ready to book",
  comparing: "Comparing venues",
  browsing: "Just looking",
};

/* Map budget values to human-readable + sort priority */
const BUDGET_RANK = { "20k-plus": 1, "10k-20k": 2, "5k-10k": 3, "under-5k": 4 };
const BUDGET_LABEL = {
  "under-5k": "Under £5K",
  "5k-10k": "£5K - £10K",
  "10k-20k": "£10K - £20K",
  "20k-plus": "£20K+",
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
    // Get all wedding-type contacts with their latest submission data
    // Uses proper columns first, falls back to form_data JSON for older records
    const result = await env.DB.prepare(`
      SELECT
        c.contact_id, c.email, c.first_name, c.last_name, c.phone,
        c.lead_type, c.source_channel, c.source_keyword, c.source_campaign,
        c.created_at,
        c.form_data as contact_form_data,
        c.questionnaire_data,
        s.form_type, s.form_data as submission_form_data, s.created_at as submitted_at,
        s.event_date, s.booking_urgency, s.guest_count, s.budget, s.wedding_year
      FROM contacts c
      LEFT JOIN submissions s ON s.contact_id = c.contact_id
        AND s.form_type IN ('wedding-quiz', 'brochure-download')
      WHERE c.lead_type = 'wedding'
      ORDER BY c.created_at DESC
      LIMIT 200
    `).all();

    // Group by contact (a contact might have multiple submissions)
    const contactMap = new Map();

    for (const row of (result?.results || [])) {
      if (!contactMap.has(row.contact_id)) {
        contactMap.set(row.contact_id, {
          contact_id: row.contact_id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          phone: row.phone,
          source_channel: row.source_channel,
          source_keyword: row.source_keyword,
          source_campaign: row.source_campaign,
          created_at: row.created_at,
          // Parsed fields - will be filled from form data
          wedding_month: null,
          wedding_year: null,
          urgency: null,
          urgency_label: null,
          urgency_rank: 99,
          guest_count: null,
          budget: null,
          budget_label: null,
          budget_rank: 99,
          form_types: [],
          submissions_count: 0,
        });
      }

      const contact = contactMap.get(row.contact_id);

      if (row.form_type) {
        contact.submissions_count++;
        if (!contact.form_types.includes(row.form_type)) {
          contact.form_types.push(row.form_type);
        }

        // Prefer proper columns, fall back to JSON parsing for older records
        const fd = safeJson(row.submission_form_data);

        // Parse wedding date - use proper columns first
        const eventDate = row.event_date || fd.wedding_date;
        if (eventDate && !contact.wedding_month) {
          const parts = eventDate.split(" ");
          if (parts.length === 2) {
            contact.wedding_month = parts[0];
            contact.wedding_year = parts[1];
          }
        }
        // Brochure form uses wedding_year directly
        const wYear = row.wedding_year || fd.wedding_year;
        if (wYear && !contact.wedding_year) {
          contact.wedding_year = wYear;
        }

        // Urgency - proper column first
        const urgency = row.booking_urgency || fd.booking_urgency;
        if (urgency && !contact.urgency) {
          contact.urgency = urgency;
          contact.urgency_label = URGENCY_LABEL[urgency] || urgency;
          contact.urgency_rank = URGENCY_RANK[urgency] || 99;
        }

        // Guest count - proper column first
        const guests = row.guest_count || fd.guest_count;
        if (guests && !contact.guest_count) {
          contact.guest_count = guests;
        }

        // Budget - proper column first
        const budget = row.budget || fd.budget;
        if (budget && !contact.budget) {
          contact.budget = budget;
          contact.budget_label = BUDGET_LABEL[budget] || budget;
          contact.budget_rank = BUDGET_RANK[budget] || 99;
        }
      }

      // Also check questionnaire_data on the contact record
      if (row.questionnaire_data) {
        const qd = safeJson(row.questionnaire_data);
        if (qd.budget && !contact.budget) {
          contact.budget = qd.budget;
          contact.budget_label = BUDGET_LABEL[qd.budget] || qd.budget;
          contact.budget_rank = BUDGET_RANK[qd.budget] || 99;
        }
      }
    }

    const leads = Array.from(contactMap.values());

    // Summary stats
    const byUrgency = {};
    const byBudget = {};
    const byYear = {};
    for (const l of leads) {
      const u = l.urgency_label || "Unknown";
      byUrgency[u] = (byUrgency[u] || 0) + 1;
      const b = l.budget_label || "Not provided";
      byBudget[b] = (byBudget[b] || 0) + 1;
      const y = l.wedding_year || "Unknown";
      byYear[y] = (byYear[y] || 0) + 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        total: leads.length,
        leads,
        summary: {
          by_urgency: Object.entries(byUrgency).map(([k, v]) => ({ label: k, count: v })),
          by_budget: Object.entries(byBudget).map(([k, v]) => ({ label: k, count: v })),
          by_year: Object.entries(byYear).map(([k, v]) => ({ label: k, count: v })),
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[wedding-leads] D1 error:", err.message);
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
