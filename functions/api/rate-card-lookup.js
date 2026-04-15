/**
 * GET /api/rate-card-lookup?date=2027-06&dayType=sat
 *
 * Looks up wedding hire fee and minimum spend from the rate card.
 * Used by the dashboard to pre-fill deal value when Hugo marks a lead as Won.
 *
 * Parameters:
 *   date: event date in any parseable format (2027-06, June 2027, 2027-06-14, etc.)
 *   dayType: sat | fri | sun-thu | dec-wed-fri | dec-mon-tue (optional, defaults to sat)
 *
 * Returns all day types for the month so the dashboard can show a selector,
 * with the requested dayType marked as selected.
 *
 * No D1 binding needed - reads from bundled wedding-pricing.json.
 */

import rateCardData from "../../src/data/wedding-pricing.json";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

const MONTH_NAMES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DAY_TYPE_LABELS = {
  sat: "Saturday",
  fri: "Friday",
  "sun-thu": "Sun - Thu",
  "dec-wed-fri": "Dec Wed - Fri",
  "dec-mon-tue": "Dec Mon - Tue",
};

/**
 * Parse a date string into { year, month }.
 * Handles: "2027-06", "2027-06-14", "June 2027", "jun 2027", "06/2027"
 */
function parseEventDate(dateStr) {
  if (!dateStr) return null;
  const s = dateStr.trim();

  // ISO-ish: 2027-06 or 2027-06-14
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) return { year: parseInt(isoMatch[1]), month: parseInt(isoMatch[2]) };

  // Month Year: "June 2027", "Jun 2027"
  const monthYearMatch = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const m = MONTH_NAMES[monthYearMatch[1].toLowerCase()];
    if (m) return { year: parseInt(monthYearMatch[2]), month: m };
  }

  // Year Month: "2027 June"
  const yearMonthMatch = s.match(/^(\d{4})\s+([A-Za-z]+)$/);
  if (yearMonthMatch) {
    const m = MONTH_NAMES[yearMonthMatch[2].toLowerCase()];
    if (m) return { year: parseInt(yearMonthMatch[1]), month: m };
  }

  // MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) return { year: parseInt(slashMatch[2]), month: parseInt(slashMatch[1]) };

  return null;
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const dateParam = url.searchParams.get("date");
  const dayTypeParam = url.searchParams.get("dayType") || "sat";

  if (!dateParam) return json({ ok: false, error: "missing_date" }, 400);

  const parsed = parseEventDate(dateParam);
  if (!parsed) return json({ ok: false, error: "unparseable_date", input: dateParam }, 400);

  const { year, month } = parsed;
  const yearStr = String(year);

  // Check if we have a rate card for this year
  const card = rateCardData.rateCards[yearStr];
  if (!card) {
    // Find the latest available year
    const availableYears = Object.keys(rateCardData.rateCards).sort();
    return json({
      ok: false,
      error: "no_rate_card",
      year,
      availableYears,
      message: `No rate card for ${year}. Available: ${availableYears.join(", ")}`,
    }, 404);
  }

  // Get all rows for this month
  const monthRows = card.rows.filter(r => r.month === month);
  if (monthRows.length === 0) {
    return json({ ok: false, error: "no_rows_for_month", year, month }, 404);
  }

  // Build response with all day types for this month
  const options = monthRows.map(r => ({
    dayType: r.dayType,
    dayTypeLabel: DAY_TYPE_LABELS[r.dayType] || r.dayType,
    hire: r.hire,
    min: r.min,
    total: r.hire + r.min,
    selected: r.dayType === dayTypeParam,
  }));

  // Find the selected/default option
  const selected = options.find(o => o.selected) || options.find(o => o.dayType === "sat") || options[0];

  // Season info
  const season = rateCardData.seasons.find(s => s.months.includes(month));

  return json({
    ok: true,
    year,
    month,
    season: season ? { id: season.id, label: season.label, period: season.period } : null,
    extrapolated: card.extrapolated || false,
    pendingReview: card.pendingReview || null,
    selected: {
      dayType: selected.dayType,
      dayTypeLabel: selected.dayTypeLabel,
      hire: selected.hire,
      min: selected.min,
      total: selected.total,
      tier: `${yearStr}/${String(month).padStart(2, "0")}/${selected.dayType}`,
    },
    options,
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequest(context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "OPTIONS") return onRequestOptions();
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}
