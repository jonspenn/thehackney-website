/**
 * GET /api/customers?type=wedding|corporate|supperclub|private-events|cafe-bar
 *
 * Returns contacts with contact_type = 'customer' (won deals).
 * Includes both D1-originated leads that were marked Won and historical
 * imports from HubSpot (314 customers imported 15 Apr 2026).
 *
 * Sub-tabs per revenue stream, same as Leads tab.
 * Columns: name, email, phone, event type/date, deal value, source, won date.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const VALID_TYPES = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];

const LEAD_TYPE_LABEL = {
  wedding: "Wedding",
  corporate: "Corporate",
  supperclub: "Supper Club",
  "private-events": "Private Events",
  "cafe-bar": "Cafe-Bar",
};

function safeJson(str) {
  if (!str) return {};
  try { return typeof str === "string" ? JSON.parse(str) : str; } catch { return {}; }
}

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
    const result = await env.DB.prepare(`
      SELECT
        c.contact_id, c.email, c.first_name, c.last_name, c.phone, c.company,
        c.lead_type, c.source_channel, c.source_keyword, c.source_campaign,
        c.hubspot_contact_id,
        c.created_at, c.won_at, c.deal_value, c.hire_fee, c.min_spend, c.rate_card_tier,
        c.funnel_stage, c.meeting_at, c.proposal_at,
        c.ip_country, c.ip_city,
        c.first_seen_at, c.last_seen_at,
        c.total_page_views, c.sessions_before_conversion,
        c.gclid, c.fbclid, c.fbc, c.fbp, c.wbraid, c.gbraid,
        c.ttclid, c.msclkid, c.li_fat_id,
        s.event_type, s.event_date, s.guest_count, s.wedding_year,
        s.form_data as submission_form_data
      FROM contacts c
      LEFT JOIN submissions s ON s.contact_id = c.contact_id
      WHERE c.lead_type = ?
        AND (c.deleted_at IS NULL)
        AND (c.contact_type = 'customer' OR c.funnel_stage = 'won' OR c.won_at IS NOT NULL)
      ORDER BY c.won_at DESC
      LIMIT 1000
    `).bind(leadType).all();

    // Group by contact (may have multiple submissions)
    const contactMap = new Map();

    for (const row of (result?.results || [])) {
      if (!contactMap.has(row.contact_id)) {
        // Determine ad platform
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
          won_at: row.won_at,
          deal_value: row.deal_value,
          hire_fee: row.hire_fee,
          min_spend: row.min_spend,
          rate_card_tier: row.rate_card_tier,
          meeting_at: row.meeting_at,
          proposal_at: row.proposal_at,
          ip_country: row.ip_country,
          ip_city: row.ip_city,
          first_seen_at: row.first_seen_at,
          last_seen_at: row.last_seen_at,
          total_page_views: row.total_page_views,
          sessions_before_conversion: row.sessions_before_conversion,
          hubspot_contact_id: row.hubspot_contact_id || null,
          ad_platform: adPlatform,
          // Parsed from submissions
          event_type: null,
          event_date: null,
          guest_count: null,
          wedding_year: null,
        });
      }

      const contact = contactMap.get(row.contact_id);

      // Parse event details from submissions
      if (row.event_type && !contact.event_type) contact.event_type = row.event_type;
      if (row.event_date && !contact.event_date) contact.event_date = row.event_date;
      if (row.guest_count && !contact.guest_count) contact.guest_count = row.guest_count;
      if (row.wedding_year && !contact.wedding_year) contact.wedding_year = row.wedding_year;

      // Fall back to JSON form_data for older records
      if (!contact.event_date || !contact.event_type) {
        const fd = safeJson(row.submission_form_data);
        if (fd.event_date && !contact.event_date) contact.event_date = fd.event_date;
        if (fd.wedding_date && !contact.event_date) contact.event_date = fd.wedding_date;
        if (fd.event_type && !contact.event_type) contact.event_type = fd.event_type;
      }
    }

    const customers = Array.from(contactMap.values());

    // Summary stats
    const totalDealValue = customers.reduce((sum, c) => sum + (c.deal_value || 0), 0);
    const avgDealValue = customers.length > 0 ? Math.round(totalDealValue / customers.length) : 0;
    const withSource = customers.filter(c => c.source_channel || c.ad_platform).length;

    // Source breakdown
    const bySource = {};
    for (const c of customers) {
      const src = c.ad_platform || c.source_channel || "Unknown";
      if (!bySource[src]) bySource[src] = { count: 0, value: 0 };
      bySource[src].count++;
      bySource[src].value += (c.deal_value || 0);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        lead_type: leadType,
        lead_type_label: LEAD_TYPE_LABEL[leadType] || leadType,
        total: customers.length,
        customers,
        summary: {
          total_deal_value: totalDealValue,
          avg_deal_value: avgDealValue,
          with_source: withSource,
          by_source: Object.entries(bySource)
            .map(([label, data]) => ({ label, count: data.count, value: data.value }))
            .sort((a, b) => b.value - a.value),
        },
      }),
      { status: 200, headers: { ...CORS_HEADERS, "content-type": "application/json" } }
    );
  } catch (err) {
    console.error("[customers] D1 error:", err.message);
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
