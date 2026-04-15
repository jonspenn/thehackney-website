/**
 * GET /api/leads?type=wedding|corporate|supperclub|private-events|cafe-bar
 *
 * Generic leads endpoint for all revenue streams. Returns contacts filtered
 * by lead_type, with parsed submission details and cross-sell flags.
 *
 * Cross-sell: for each contact, checks if they have submissions for OTHER
 * lead types too (e.g. downloaded both wedding AND corporate brochures).
 *
 * Replaces the wedding-only /api/wedding-leads endpoint.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_TYPES = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];

function safeJson(str) {
  if (!str) return {};
  try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return {}; }
}

/* Map urgency values to human-readable + sort priority (stage 4 = most urgent) */
const URGENCY_RANK = { asap: 1, ready: 2, comparing: 3, browsing: 4 };
const URGENCY_LABEL = {
  browsing: "1 \u00B7 Browsing",
  comparing: "2 \u00B7 Shortlisting",
  ready: "3 \u00B7 Ready to book",
  asap: "4 \u00B7 Urgent",
};

/* Map budget values to human-readable + sort priority */
const BUDGET_RANK = { "20k-plus": 1, "10k-20k": 2, "5k-10k": 3, "under-5k": 4 };
const BUDGET_LABEL = {
  "under-5k": "Under \u00A35K",
  "5k-10k": "\u00A35K - \u00A310K",
  "10k-20k": "\u00A310K - \u00A320K",
  "20k-plus": "\u00A320K+",
};

/* Human-readable lead type labels */
const LEAD_TYPE_LABEL = {
  wedding: "Wedding",
  corporate: "Corporate",
  supperclub: "Supper Club",
  "private-events": "Private Events",
  "cafe-bar": "Cafe-Bar",
};

/* Event type labels */
const EVENT_TYPE_LABEL = {
  "photo-film": "Photo/Film Shoot",
  "team-building": "Team Building",
  conference: "Conference",
  meeting: "Meeting",
  "product-launch": "Product Launch",
  "christmas-party": "Christmas Party",
  "summer-party": "Summer Party",
  other: "Other",
};

/* Which form types map to which lead types */
const FORM_TO_LEAD = {
  "wedding-quiz": "wedding",
  "corporate-quiz": "corporate",
  "supperclub-signup": "supperclub",
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const leadType = url.searchParams.get("type") || "wedding";

  if (!VALID_TYPES.includes(leadType)) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_type", valid: VALID_TYPES }),
      { status: 400, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "no_db" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }

  try {
    // Get all contacts of this lead type with their submissions
    const result = await env.DB.prepare(`
      SELECT
        c.contact_id, c.email, c.first_name, c.last_name, c.phone, c.company,
        c.lead_type, c.source_channel, c.source_keyword, c.source_campaign,
        c.created_at,
        c.form_data as contact_form_data,
        c.questionnaire_data,
        c.gclid, c.fbclid, c.fbc, c.fbp, c.wbraid, c.gbraid,
        c.ttclid, c.msclkid, c.li_fat_id, c.utm_content,
        c.first_landing_page, c.conversion_page,
        c.sessions_before_conversion, c.device_type, c.first_referrer,
        c.ip_country, c.ip_city,
        c.latest_source, c.latest_referrer, c.latest_landing_page,
        c.total_page_views, c.avg_page_views_per_session,
        c.first_seen_at, c.last_seen_at,
        c.clicked_discovery_call_at, c.clicked_discovery_call_source,
        c.clicked_venue_tour_at, c.clicked_venue_tour_source,
        s.form_type, s.form_data as submission_form_data, s.created_at as submitted_at,
        s.event_type, s.booking_urgency, s.guest_count, s.budget,
        s.wedding_year, s.event_date, s.brochure_type
      FROM contacts c
      LEFT JOIN submissions s ON s.contact_id = c.contact_id
      WHERE c.lead_type = ?
      ORDER BY c.created_at DESC
      LIMIT 500
    `).bind(leadType).all();

    // Get cross-sell data: for each contact, what OTHER lead types they appear in
    // We look at: (a) submissions with different form types, (b) brochure downloads for other types
    const allContactIds = [...new Set((result?.results || []).map(r => r.contact_id))];

    // Build cross-sell map from submissions
    const crossSellMap = new Map();
    if (allContactIds.length > 0) {
      // Query all submissions for these contacts to find cross-sell
      const placeholders = allContactIds.map(() => "?").join(",");
      const crossResult = await env.DB.prepare(`
        SELECT contact_id, form_type, brochure_type
        FROM submissions
        WHERE contact_id IN (${placeholders})
      `).bind(...allContactIds).all();

      for (const row of (crossResult?.results || [])) {
        if (!crossSellMap.has(row.contact_id)) {
          crossSellMap.set(row.contact_id, new Set());
        }
        const set = crossSellMap.get(row.contact_id);

        // Determine what lead type this submission represents
        let subLeadType;
        if (row.form_type === "brochure-download") {
          const bt = row.brochure_type;
          if (bt === "wedding") subLeadType = "wedding";
          else if (bt === "corporate") subLeadType = "corporate";
          else if (bt === "private-events") subLeadType = "private-events";
          else if (bt === "supper-club") subLeadType = "supperclub";
          else if (bt === "cafe-bar") subLeadType = "cafe-bar";
          else subLeadType = "wedding"; // default
        } else {
          subLeadType = FORM_TO_LEAD[row.form_type] || "unknown";
        }

        if (subLeadType !== leadType && subLeadType !== "unknown") {
          set.add(subLeadType);
        }
      }
    }

    // Group by contact (a contact might have multiple submissions)
    const contactMap = new Map();

    for (const row of (result?.results || [])) {
      if (!contactMap.has(row.contact_id)) {
        const crossSellTypes = crossSellMap.has(row.contact_id)
          ? [...crossSellMap.get(row.contact_id)]
          : [];

        // Determine ad platform source from click IDs
        let adPlatform = null;
        if (row.gclid || row.wbraid || row.gbraid) adPlatform = "Google";
        else if (row.fbclid || row.fbc) adPlatform = "Meta";
        else if (row.ttclid) adPlatform = "TikTok";
        else if (row.msclkid) adPlatform = "Microsoft";
        else if (row.li_fat_id) adPlatform = "LinkedIn";

        contactMap.set(row.contact_id, {
          contact_id: row.contact_id,
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          phone: row.phone,
          company: row.company,
          source_channel: row.source_channel,
          source_keyword: row.source_keyword,
          source_campaign: row.source_campaign,
          created_at: row.created_at,
          // Attribution
          ad_platform: adPlatform,
          has_click_id: !!(row.gclid || row.fbclid || row.wbraid || row.gbraid || row.ttclid || row.msclkid || row.li_fat_id),
          utm_content: row.utm_content,
          first_landing_page: row.first_landing_page,
          conversion_page: row.conversion_page,
          sessions_before_conversion: row.sessions_before_conversion,
          device_type: row.device_type,
          first_referrer: row.first_referrer,
          // Geo
          ip_country: row.ip_country,
          ip_city: row.ip_city,
          // Last-touch
          latest_source: row.latest_source,
          latest_referrer: row.latest_referrer,
          latest_landing_page: row.latest_landing_page,
          // Engagement
          total_page_views: row.total_page_views,
          avg_page_views_per_session: row.avg_page_views_per_session,
          first_seen_at: row.first_seen_at,
          last_seen_at: row.last_seen_at,
          // Booking intent (tracked independently)
          clicked_discovery_call_at: row.clicked_discovery_call_at,
          clicked_discovery_call_source: row.clicked_discovery_call_source,
          clicked_venue_tour_at: row.clicked_venue_tour_at,
          clicked_venue_tour_source: row.clicked_venue_tour_source,
          // Parsed fields
          event_type: null,
          event_type_label: null,
          event_date: null,
          wedding_month: null,
          wedding_year: null,
          urgency: null,
          urgency_label: null,
          urgency_rank: 99,
          guest_count: null,
          budget: null,
          budget_label: null,
          budget_rank: 99,
          brochure_type: null,
          form_types: [],
          submissions_count: 0,
          // Cross-sell
          cross_sell: crossSellTypes,
          cross_sell_labels: crossSellTypes.map(t => LEAD_TYPE_LABEL[t] || t),
        });
      }

      const contact = contactMap.get(row.contact_id);

      if (row.form_type) {
        contact.submissions_count++;
        if (!contact.form_types.includes(row.form_type)) {
          contact.form_types.push(row.form_type);
        }

        // Prefer proper columns, fall back to JSON for older records
        const fd = safeJson(row.submission_form_data);

        // Event type (corporate)
        const eventType = row.event_type || fd.event_type;
        if (eventType && !contact.event_type) {
          contact.event_type = eventType;
          contact.event_type_label = EVENT_TYPE_LABEL[eventType] || eventType;
        }

        // Event date
        const eventDate = row.event_date || fd.event_date || fd.wedding_date;
        if (eventDate && !contact.event_date) {
          contact.event_date = eventDate;
          // Also parse into month/year for wedding leads
          const parts = eventDate.split(" ");
          if (parts.length === 2 && !contact.wedding_month) {
            contact.wedding_month = parts[0];
            contact.wedding_year = parts[1];
          }
        }

        // Wedding year (brochure form)
        const wYear = row.wedding_year || fd.wedding_year;
        if (wYear && !contact.wedding_year) {
          contact.wedding_year = wYear;
        }

        // Urgency
        const urgency = row.booking_urgency || fd.booking_urgency;
        if (urgency && !contact.urgency) {
          contact.urgency = urgency;
          contact.urgency_label = URGENCY_LABEL[urgency] || urgency;
          contact.urgency_rank = URGENCY_RANK[urgency] || 99;
        }

        // Guest count
        const guests = row.guest_count || fd.guest_count;
        if (guests && !contact.guest_count) {
          contact.guest_count = guests;
        }

        // Budget
        const budget = row.budget || fd.budget;
        if (budget && !contact.budget) {
          contact.budget = budget;
          contact.budget_label = BUDGET_LABEL[budget] || budget;
          contact.budget_rank = BUDGET_RANK[budget] || 99;
        }

        // Brochure type
        const bt = row.brochure_type || fd.brochure_type;
        if (bt && !contact.brochure_type) {
          contact.brochure_type = bt;
        }
      }

      // Check questionnaire_data on contact record (wedding budget from step 5)
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

    // Build summary stats based on lead type
    const summaries = {};

    if (leadType === "wedding") {
      const byUrgency = {}, byBudget = {}, byYear = {};
      for (const l of leads) {
        byUrgency[l.urgency_label || "Unknown"] = (byUrgency[l.urgency_label || "Unknown"] || 0) + 1;
        byBudget[l.budget_label || "Not provided"] = (byBudget[l.budget_label || "Not provided"] || 0) + 1;
        byYear[l.wedding_year || "Unknown"] = (byYear[l.wedding_year || "Unknown"] || 0) + 1;
      }
      summaries.by_urgency = Object.entries(byUrgency).map(([k, v]) => ({ label: k, count: v }));
      summaries.by_budget = Object.entries(byBudget).map(([k, v]) => ({ label: k, count: v }));
      summaries.by_year = Object.entries(byYear).map(([k, v]) => ({ label: k, count: v }));
    }

    if (leadType === "corporate") {
      const byEventType = {}, byGuestCount = {};
      for (const l of leads) {
        byEventType[l.event_type_label || "Unknown"] = (byEventType[l.event_type_label || "Unknown"] || 0) + 1;
        byGuestCount[l.guest_count || "Unknown"] = (byGuestCount[l.guest_count || "Unknown"] || 0) + 1;
      }
      summaries.by_event_type = Object.entries(byEventType).map(([k, v]) => ({ label: k, count: v }));
      summaries.by_guest_count = Object.entries(byGuestCount).map(([k, v]) => ({ label: k, count: v }));
    }

    // Cross-sell summary for all types
    const withCrossSell = leads.filter(l => l.cross_sell.length > 0).length;
    summaries.cross_sell_count = withCrossSell;

    // Pipeline stage counts (call and tour tracked independently - a lead can have both)
    const withDiscovery = leads.filter(l => l.clicked_discovery_call_at).length;
    const withTour = leads.filter(l => l.clicked_venue_tour_at).length;
    const withAny = leads.filter(l => l.clicked_discovery_call_at || l.clicked_venue_tour_at).length;
    const withBoth = leads.filter(l => l.clicked_discovery_call_at && l.clicked_venue_tour_at).length;
    summaries.pipeline = {
      total_leads: leads.length,
      clicked_discovery_call: withDiscovery,
      clicked_venue_tour: withTour,
      clicked_both: withBoth,
      clicked_any: withAny,
      no_action: leads.length - withAny,
    };

    return new Response(
      JSON.stringify({
        ok: true,
        lead_type: leadType,
        lead_type_label: LEAD_TYPE_LABEL[leadType] || leadType,
        total: leads.length,
        leads,
        summary: summaries,
      }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[leads] D1 error:", err.message);
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
