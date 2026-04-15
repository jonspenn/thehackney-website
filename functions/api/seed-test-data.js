/**
 * TEMPORARY seed endpoint — inserts ~50 dummy leads for dashboard testing.
 * DELETE THIS FILE after testing.
 *
 * GET /api/seed-test-data?confirm=yes
 */

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

function id() {
  return "c_test_" + Math.random().toString(36).slice(2, 10);
}
function sid() {
  return "s_test_" + Math.random().toString(36).slice(2, 10);
}

function iso(daysAgo, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

/* ── Test data definitions ── */

const WEDDING_LEADS = [
  // Hot leads — deep in funnel
  { first: "Emma", last: "Richardson", email: "emma.richardson.test@example.com", phone: "07700100001", urgency: "ready", budget: "10k-20k", guests: "80", eventDate: "September 2026", weddingYear: "2026", daysAgo: 45, sessions: 8, pages: 42, source: "google / cpc", keyword: "wedding venue hackney", gclid: "test_gclid_001", stage: "tour", tourDaysAgo: 5 },
  { first: "Sophie", last: "Chen", email: "sophie.chen.test@example.com", phone: "07700100002", urgency: "asap", budget: "20k-plus", guests: "60", eventDate: "July 2026", weddingYear: "2026", daysAgo: 30, sessions: 12, pages: 65, source: "meta / paid", fbclid: "test_fbclid_001", stage: "proposal", proposalDaysAgo: 3 },
  { first: "James", last: "Okonkwo", email: "james.okonkwo.test@example.com", phone: "07700100003", urgency: "ready", budget: "10k-20k", guests: "100", eventDate: "October 2026", weddingYear: "2026", daysAgo: 60, sessions: 6, pages: 28, source: "google / organic", stage: "won", wonDaysAgo: 10, hireFee: 3500, minSpend: 8500 },
  { first: "Priya", last: "Sharma", email: "priya.sharma.test@example.com", phone: "07700100004", urgency: "comparing", budget: "10k-20k", guests: "70", eventDate: "May 2027", weddingYear: "2027", daysAgo: 20, sessions: 5, pages: 22, source: "google / cpc", keyword: "east london wedding", gclid: "test_gclid_002", stage: "call", callDaysAgo: 2 },
  { first: "Lucy", last: "Taylor", email: "lucy.taylor.test@example.com", phone: "07700100005", urgency: "ready", budget: "5k-10k", guests: "40", eventDate: "March 2027", weddingYear: "2027", daysAgo: 14, sessions: 4, pages: 18, source: "bridebook / referral", stage: "engaged" },

  // Warm leads — qualified but not yet meeting
  { first: "Hannah", last: "Müller", email: "hannah.muller.test@example.com", phone: "07700100006", urgency: "comparing", budget: "10k-20k", guests: "90", eventDate: "August 2026", weddingYear: "2026", daysAgo: 10, sessions: 3, pages: 15, source: "instagram / social", stage: "qualified" },
  { first: "Zara", last: "Ahmed", email: "zara.ahmed.test@example.com", phone: "07700100007", urgency: "browsing", budget: "5k-10k", guests: "50", eventDate: "June 2027", weddingYear: "2027", daysAgo: 7, sessions: 2, pages: 8, source: "google / organic", stage: "qualified" },
  { first: "Olivia", last: "Williams", email: "olivia.williams.test@example.com", phone: "07700100008", urgency: "comparing", budget: "20k-plus", guests: "80", eventDate: "December 2026", weddingYear: "2026", daysAgo: 5, sessions: 4, pages: 20, source: "hitched / referral", stage: "engaged" },

  // Cool / cold leads
  { first: "Megan", last: "Jones", email: "megan.jones.test@example.com", phone: null, urgency: "browsing", budget: "under-5k", guests: "30", eventDate: "2027", weddingYear: "2027", daysAgo: 35, sessions: 1, pages: 3, source: "google / organic", stage: "lead" },
  { first: "Charlotte", last: "Brown", email: "charlotte.brown.test@example.com", phone: "07700100010", urgency: "comparing", budget: "10k-20k", guests: "60", eventDate: "April 2027", weddingYear: "2027", daysAgo: 25, sessions: 2, pages: 6, source: "pinterest / social", stage: "lead" },

  // Lost leads
  { first: "Amy", last: "Wilson", email: "amy.wilson.test@example.com", phone: "07700100011", urgency: "ready", budget: "10k-20k", guests: "70", eventDate: "November 2026", weddingYear: "2026", daysAgo: 50, sessions: 7, pages: 35, source: "google / cpc", gclid: "test_gclid_003", stage: "lost", lostReason: "booked_elsewhere", lostDaysAgo: 8 },
  { first: "Rachel", last: "Davis", email: "rachel.davis.test@example.com", phone: "07700100012", urgency: "comparing", budget: "5k-10k", guests: "40", eventDate: "January 2027", weddingYear: "2027", daysAgo: 40, sessions: 3, pages: 12, source: "bridebook / referral", stage: "lost", lostReason: "budget", lostDaysAgo: 15 },

  // Cancelled / no-show
  { first: "Laura", last: "Martinez", email: "laura.martinez.test@example.com", phone: "07700100013", urgency: "ready", budget: "10k-20k", guests: "80", eventDate: "August 2026", weddingYear: "2026", daysAgo: 18, sessions: 4, pages: 16, source: "meta / paid", fbclid: "test_fbclid_002", stage: "cancelled", cancelledDaysAgo: 6 },
  { first: "Katie", last: "Nguyen", email: "katie.nguyen.test@example.com", phone: "07700100014", urgency: "comparing", budget: "10k-20k", guests: "60", eventDate: "February 2027", weddingYear: "2027", daysAgo: 22, sessions: 3, pages: 10, source: "google / organic", stage: "noshow", noshowDaysAgo: 12 },

  // Earlier months (for Jan-Mar trend data)
  { first: "Sarah", last: "Clark", email: "sarah.clark.test@example.com", phone: "07700100015", urgency: "ready", budget: "20k-plus", guests: "100", eventDate: "September 2026", weddingYear: "2026", daysAgo: 90, sessions: 10, pages: 50, source: "google / cpc", gclid: "test_gclid_004", stage: "won", wonDaysAgo: 30, hireFee: 4500, minSpend: 12000 },
  { first: "Emily", last: "Robinson", email: "emily.robinson.test@example.com", phone: "07700100016", urgency: "comparing", budget: "10k-20k", guests: "70", eventDate: "November 2026", weddingYear: "2026", daysAgo: 75, sessions: 5, pages: 22, source: "meta / paid", stage: "lost", lostReason: "date_unavailable", lostDaysAgo: 45 },
  { first: "Jessica", last: "Lewis", email: "jessica.lewis.test@example.com", phone: "07700100017", urgency: "ready", budget: "10k-20k", guests: "60", eventDate: "October 2026", weddingYear: "2026", daysAgo: 70, sessions: 6, pages: 30, source: "hitched / referral", stage: "tour", tourDaysAgo: 35 },
  { first: "Anna", last: "Walker", email: "anna.walker.test@example.com", phone: "07700100018", urgency: "asap", budget: "10k-20k", guests: "50", eventDate: "June 2026", weddingYear: "2026", daysAgo: 100, sessions: 9, pages: 45, source: "google / cpc", gclid: "test_gclid_005", stage: "won", wonDaysAgo: 60, hireFee: 3500, minSpend: 8500 },
];

const CORPORATE_LEADS = [
  { first: "David", last: "Thompson", email: "david.thompson.test@example.com", phone: "07700200001", company: "Fintech Ltd", eventType: "team-building", guests: "40-60", eventDate: "May 2026", daysAgo: 12, sessions: 3, pages: 10, source: "google / cpc", keyword: "corporate event venue london", gclid: "test_gclid_c01", stage: "tour", tourDaysAgo: 3 },
  { first: "Sarah", last: "Mitchell", email: "sarah.mitchell.test@example.com", phone: "07700200002", company: "Creative Agency Co", eventType: "product-launch", guests: "60-80", eventDate: "June 2026", daysAgo: 8, sessions: 2, pages: 7, source: "google / organic", stage: "qualified" },
  { first: "Michael", last: "Patel", email: "michael.patel.test@example.com", phone: "07700200003", company: "TechStart UK", eventType: "christmas-party", guests: "80-100", eventDate: "December 2026", daysAgo: 5, sessions: 4, pages: 14, source: "meta / paid", fbclid: "test_fbclid_c01", stage: "engaged" },
  { first: "Lisa", last: "Green", email: "lisa.green.test@example.com", phone: "07700200004", company: "Borough Films", eventType: "photo-film", guests: "20-40", eventDate: "April 2026", daysAgo: 20, sessions: 2, pages: 5, source: "google / organic", stage: "won", wonDaysAgo: 7, hireFee: 1500, minSpend: 0 },
  { first: "Tom", last: "Wright", email: "tom.wright.test@example.com", phone: "07700200005", company: "Wellness Corp", eventType: "conference", guests: "40-60", eventDate: "July 2026", daysAgo: 15, sessions: 3, pages: 9, source: "google / cpc", gclid: "test_gclid_c02", stage: "call", callDaysAgo: 4 },
  { first: "Rebecca", last: "Hughes", email: "rebecca.hughes.test@example.com", phone: "07700200006", company: "Design Studio", eventType: "summer-party", guests: "60-80", eventDate: "August 2026", daysAgo: 3, sessions: 1, pages: 4, source: "instagram / social", stage: "lead" },
  { first: "Mark", last: "Edwards", email: "mark.edwards.test@example.com", phone: "07700200007", company: "Law Partners LLP", eventType: "christmas-party", guests: "80-100", eventDate: "December 2026", daysAgo: 30, sessions: 5, pages: 18, source: "google / cpc", gclid: "test_gclid_c03", stage: "lost", lostReason: "budget", lostDaysAgo: 10 },
  // Earlier months
  { first: "Paul", last: "Cooper", email: "paul.cooper.test@example.com", phone: "07700200008", company: "Media Group", eventType: "product-launch", guests: "60-80", eventDate: "March 2026", daysAgo: 65, sessions: 4, pages: 12, source: "google / organic", stage: "won", wonDaysAgo: 40, hireFee: 2000, minSpend: 3000 },
  { first: "Karen", last: "Bell", email: "karen.bell.test@example.com", phone: "07700200009", company: "Health Inc", eventType: "meeting", guests: "20-40", eventDate: "February 2026", daysAgo: 80, sessions: 2, pages: 6, source: "meta / paid", stage: "won", wonDaysAgo: 55, hireFee: 800, minSpend: 1500 },
];

const PRIVATE_LEADS = [
  { first: "Daniel", last: "Blake", email: "daniel.blake.test@example.com", phone: "07700300001", eventType: "other", guests: "60-80", eventDate: "May 2026", daysAgo: 10, sessions: 3, pages: 8, source: "google / organic", stage: "tour", tourDaysAgo: 2 },
  { first: "Natalie", last: "Scott", email: "natalie.scott.test@example.com", phone: "07700300002", eventType: "other", guests: "40-60", eventDate: "June 2026", daysAgo: 7, sessions: 2, pages: 5, source: "meta / paid", fbclid: "test_fbclid_p01", stage: "qualified" },
  { first: "Chris", last: "King", email: "chris.king.test@example.com", phone: "07700300003", eventType: "other", guests: "80-100", eventDate: "July 2026", daysAgo: 25, sessions: 4, pages: 15, source: "google / cpc", gclid: "test_gclid_p01", stage: "won", wonDaysAgo: 5, hireFee: 2500, minSpend: 5000 },
  { first: "Gemma", last: "Hill", email: "gemma.hill.test@example.com", phone: "07700300004", eventType: "other", guests: "30-40", eventDate: "August 2026", daysAgo: 15, sessions: 2, pages: 6, source: "instagram / social", stage: "engaged" },
];

const SUPPERCLUB_LEADS = [
  { first: "Alex", last: "Murray", email: "alex.murray.test@example.com", phone: "07700400001", daysAgo: 5, sessions: 1, pages: 3, source: "instagram / social" },
  { first: "Sam", last: "Foster", email: "sam.foster.test@example.com", phone: null, daysAgo: 12, sessions: 2, pages: 5, source: "meta / paid" },
  { first: "Jo", last: "Reed", email: "jo.reed.test@example.com", phone: "07700400003", daysAgo: 20, sessions: 1, pages: 2, source: "google / organic" },
  { first: "Pat", last: "Morgan", email: "pat.morgan.test@example.com", phone: null, daysAgo: 30, sessions: 1, pages: 2, source: "(direct)" },
];

const CAFEBAR_LEADS = [
  { first: "Robin", last: "Hayes", email: "robin.hayes.test@example.com", phone: null, daysAgo: 3, sessions: 1, pages: 1, source: "(direct)" },
  { first: "Casey", last: "Price", email: "casey.price.test@example.com", phone: null, daysAgo: 8, sessions: 1, pages: 2, source: "google / organic" },
  { first: "Morgan", last: "Wells", email: "morgan.wells.test@example.com", phone: null, daysAgo: 15, sessions: 2, pages: 4, source: "instagram / social" },
];

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);

  if (url.searchParams.get("confirm") !== "yes") {
    return json({ error: "Add ?confirm=yes to run. This inserts ~50 test contacts." }, 400);
  }

  const results = { inserted: 0, errors: [] };

  async function insertLead(lead, leadType, formType) {
    const contactId = id();
    const submissionId = sid();
    const createdAt = iso(lead.daysAgo);
    const lastSeen = iso(Math.min(lead.daysAgo, 2));

    try {
      // Insert contact
      await env.DB.prepare(`
        INSERT OR IGNORE INTO contacts (
          contact_id, email, first_name, last_name, phone, company,
          lead_type, source_channel, source_keyword, source_campaign,
          gclid, fbclid,
          first_landing_page, conversion_page, sessions_before_conversion,
          device_type, total_page_views, avg_page_views_per_session,
          first_seen_at, last_seen_at, ip_country, ip_city,
          clicked_discovery_call_at, clicked_discovery_call_source,
          clicked_venue_tour_at, clicked_venue_tour_source,
          funnel_stage, stage_entered_at,
          meeting_at, proposal_at, won_at, lost_at, lost_reason, lost_reason_note,
          cancelled_at, noshow_at,
          hire_fee, min_spend, deal_value, rate_card_tier,
          created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?
        )
      `).bind(
        contactId, lead.email, lead.first, lead.last, lead.phone || null, lead.company || null,
        leadType, lead.source || null, lead.keyword || null, lead.source?.split(" / ")[1] || null,
        lead.gclid || null, lead.fbclid || null,
        leadType === "wedding" ? "/weddings/" : leadType === "corporate" ? "/corporate/" : `/${leadType}/`,
        leadType === "wedding" ? "/weddings/" : leadType === "corporate" ? "/corporate/" : `/${leadType}/`,
        lead.sessions || 1,
        Math.random() > 0.4 ? "desktop" : "mobile",
        lead.pages || 3,
        lead.sessions > 0 ? Math.round((lead.pages / lead.sessions) * 10) / 10 : 3,
        iso(lead.daysAgo), lastSeen,
        "GB", "London",
        // Call/tour intent
        lead.stage === "call" || lead.stage === "tour" || lead.stage === "proposal" || lead.stage === "won" || lead.stage === "lost" ? iso(lead.daysAgo - 2) : (lead.stage === "engaged" ? iso(lead.daysAgo - 1) : null),
        lead.stage === "call" || lead.stage === "tour" || lead.stage === "proposal" || lead.stage === "won" || lead.stage === "lost" ? "quiz-success" : (lead.stage === "engaged" ? "quiz-success" : null),
        lead.stage === "tour" || lead.stage === "proposal" || lead.stage === "won" ? iso(lead.tourDaysAgo || lead.daysAgo - 3) : (lead.stage === "engaged" && Math.random() > 0.5 ? iso(lead.daysAgo - 1) : null),
        lead.stage === "tour" || lead.stage === "proposal" || lead.stage === "won" ? "quiz-success" : null,
        // Manual funnel stage
        ["call", "tour", "proposal", "won", "lost", "cancelled", "noshow"].includes(lead.stage) ? (lead.stage === "call" ? "meeting" : lead.stage === "tour" ? "meeting" : lead.stage) : null,
        ["call", "tour", "proposal", "won", "lost", "cancelled", "noshow"].includes(lead.stage) ? iso(lead.callDaysAgo || lead.tourDaysAgo || lead.proposalDaysAgo || lead.wonDaysAgo || lead.lostDaysAgo || lead.cancelledDaysAgo || lead.noshowDaysAgo || 5) : null,
        // meeting_at (set for call, tour, proposal, won, lost-after-tour)
        ["call", "tour", "proposal", "won"].includes(lead.stage) || (lead.stage === "lost" && lead.lostDaysAgo < 30) ? iso(lead.tourDaysAgo || lead.callDaysAgo || lead.daysAgo - 5) : null,
        lead.stage === "proposal" ? iso(lead.proposalDaysAgo || 3) : null,
        lead.stage === "won" ? iso(lead.wonDaysAgo || 5) : null,
        lead.stage === "lost" ? iso(lead.lostDaysAgo || 8) : null,
        lead.lostReason || null,
        lead.lostReason === "other" ? "Changed their mind" : null,
        lead.stage === "cancelled" ? iso(lead.cancelledDaysAgo || 6) : null,
        lead.stage === "noshow" ? iso(lead.noshowDaysAgo || 12) : null,
        lead.hireFee || null,
        lead.minSpend || null,
        lead.hireFee ? (lead.hireFee + (lead.minSpend || 0)) : null,
        lead.hireFee ? "sat" : null,
        createdAt
      ).run();

      // Insert submission
      const formData = {};
      if (lead.urgency) formData.booking_urgency = lead.urgency;
      if (lead.budget) formData.budget = lead.budget;
      if (lead.guests) formData.guest_count = lead.guests;
      if (lead.eventDate) formData.event_date = lead.eventDate;
      if (lead.weddingYear) formData.wedding_year = lead.weddingYear;
      if (lead.eventType) formData.event_type = lead.eventType;
      if (lead.company) formData.company = lead.company;

      await env.DB.prepare(`
        INSERT INTO submissions (
          submission_id, contact_id, form_type, form_data,
          page_url, created_at,
          event_type, guest_count, event_date, booking_urgency,
          budget, brochure_type, wedding_year,
          company, first_name, email, phone
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        submissionId, contactId, formType, JSON.stringify(formData),
        `https://thehackney-website.pages.dev/${leadType === "wedding" ? "weddings" : leadType}/`,
        createdAt,
        lead.eventType || null, lead.guests || null, lead.eventDate || null, lead.urgency || null,
        lead.budget || null, leadType === "wedding" ? "wedding" : null, lead.weddingYear || null,
        lead.company || null, lead.first, lead.email, lead.phone || null
      ).run();

      results.inserted++;
    } catch (err) {
      results.errors.push(`${lead.email}: ${err.message}`);
    }
  }

  // Insert all leads
  for (const lead of WEDDING_LEADS) {
    await insertLead(lead, "wedding", "wedding-quiz");
  }
  for (const lead of CORPORATE_LEADS) {
    await insertLead(lead, "corporate", "corporate-quiz");
  }
  for (const lead of PRIVATE_LEADS) {
    await insertLead(lead, "private-events", "brochure-download");
  }
  for (const lead of SUPPERCLUB_LEADS) {
    await insertLead(lead, "supperclub", "supperclub-signup");
  }
  for (const lead of CAFEBAR_LEADS) {
    await insertLead(lead, "cafe-bar", "brochure-download");
  }

  return json({
    ok: true,
    message: `Inserted ${results.inserted} test leads`,
    errors: results.errors.length > 0 ? results.errors : undefined,
    note: "DELETE functions/api/seed-test-data.js after testing!",
  });
}
