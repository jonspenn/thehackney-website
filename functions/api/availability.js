/**
 * Cloudflare Pages Function: /api/availability
 *
 * Proxies Google Calendar API to return booked dates from the public-facing
 * Bookings calendar. Uses the freebusy endpoint which works with "free/busy
 * only" calendar sharing, ensuring no PII (event titles, descriptions,
 * attendees) is ever accessible.
 *
 * Only the Bookings calendar is exposed publicly. The internal "Enquiries
 * & Held Dates" calendar is intentionally NOT included - it tracks tentative
 * holds for the team and must not be visible to website visitors.
 *
 * Query params:
 *   start  - YYYY-MM-DD (defaults to 1st of current month)
 *   months - number of months to fetch (default 3, max 6)
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   GOOGLE_CALENDAR_API_KEY - restricted API key for Calendar read-only
 *
 * Calendar IDs:
 *   Bookings: c_v2a5l8vh2qenad1lm0ejd8hq7s@group.calendar.google.com
 */

const CALENDAR_BOOKINGS = "c_v2a5l8vh2qenad1lm0ejd8hq7s@group.calendar.google.com";
const GCAL_FREEBUSY = "https://www.googleapis.com/calendar/v3/freeBusy";

// CORS - allow same-origin and the dev preview domain
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data, status = 200, cacheSeconds = 3600) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      ...CORS_HEADERS,
    },
  });
}

/**
 * Convert freebusy time ranges into an array of YYYY-MM-DD date strings.
 * Each busy period has a start and end datetime - we extract all dates covered.
 */
function busyPeriodsToDateStrings(busyPeriods) {
  const dates = new Set();

  for (const period of busyPeriods) {
    const start = new Date(period.start);
    const end = new Date(period.end);

    // Walk through each day the busy period covers
    const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));

    // If end time is exactly midnight, the last day is the day before
    // If end time is after midnight, include that day too
    const endHour = end.getUTCHours();
    const endMin = end.getUTCMinutes();
    const endSec = end.getUTCSeconds();
    const endIsExactlyMidnight = endHour === 0 && endMin === 0 && endSec === 0;

    while (current < endDay || (!endIsExactlyMidnight && current.getTime() === endDay.getTime())) {
      dates.add(current.toISOString().split("T")[0]);
      current.setUTCDate(current.getUTCDate() + 1);
    }
  }

  return [...dates].sort();
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const apiKey = env.GOOGLE_CALENDAR_API_KEY;

  if (!apiKey) {
    return jsonResponse(
      { error: "Calendar API not configured" },
      500,
      0
    );
  }

  const url = new URL(request.url);
  const months = Math.min(parseInt(url.searchParams.get("months") || "3", 10), 6);

  // Default: 1st of current month to end of month + (months-1)
  const now = new Date();
  const startParam = url.searchParams.get("start");
  const start = startParam
    ? new Date(startParam + "T00:00:00Z")
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));

  const timeMin = start.toISOString();
  const timeMax = end.toISOString();

  try {
    // Use freebusy endpoint - works with "free/busy only" calendar sharing
    // No event details (titles, descriptions) are ever returned
    const freebusyUrl = `${GCAL_FREEBUSY}?key=${apiKey}`;
    const resp = await fetch(freebusyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin,
        timeMax,
        items: [
          { id: CALENDAR_BOOKINGS },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Google Calendar API error ${resp.status}: ${text}`);
    }

    const data = await resp.json();
    const calendars = data.calendars || {};

    const bookedBusy = calendars[CALENDAR_BOOKINGS]?.busy || [];
    const booked = busyPeriodsToDateStrings(bookedBusy);

    return jsonResponse({
      booked,
      range: {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
      },
    });
  } catch (err) {
    console.error("[availability] Error:", err.message);
    return jsonResponse(
      { error: "Unable to fetch availability. Please try again later." },
      502,
      0
    );
  }
}

// Handle CORS preflight
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
