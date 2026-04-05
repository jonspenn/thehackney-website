/**
 * Cloudflare Pages Function: /api/availability
 *
 * Proxies Google Calendar API to return booked and held dates.
 * Strips all PII (event titles, descriptions, attendees) and returns
 * only date strings so the public calendar never exposes client info.
 *
 * Query params:
 *   start  - YYYY-MM-DD (defaults to 1st of current month)
 *   end    - YYYY-MM-DD (defaults to last day of month +2)
 *   months - number of months to fetch (default 3, max 6)
 *
 * Environment variables (set in Cloudflare Pages dashboard):
 *   GOOGLE_CALENDAR_API_KEY - restricted API key for Calendar read-only
 *
 * Calendar IDs (hardcoded - these are shared/public within the org):
 *   Bookings:              c_v2a5l8vh2qenad1lm0ejd8hq7s@group.calendar.google.com
 *   Enquiries & Held Dates: c_88tt7mkoclpc8fjo2dfgickmvc@group.calendar.google.com
 */

const CALENDAR_BOOKINGS = "c_v2a5l8vh2qenad1lm0ejd8hq7s@group.calendar.google.com";
const CALENDAR_HELD = "c_88tt7mkoclpc8fjo2dfgickmvc@group.calendar.google.com";
const GCAL_BASE = "https://www.googleapis.com/calendar/v3/calendars";

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

/** Extract YYYY-MM-DD from an all-day event's date or dateTime field */
function extractDates(event) {
  const start = event.start?.date || event.start?.dateTime?.split("T")[0];
  const end = event.end?.date || event.end?.dateTime?.split("T")[0];
  if (!start) return [];

  // All-day events: start is inclusive, end is exclusive
  // Single-day event: start=2026-04-12, end=2026-04-13 -> just 2026-04-12
  // Multi-day event: start=2026-04-12, end=2026-04-14 -> 2026-04-12, 2026-04-13
  const dates = [];
  const current = new Date(start + "T00:00:00Z");
  const endDate = end ? new Date(end + "T00:00:00Z") : new Date(current.getTime() + 86400000);

  while (current < endDate) {
    dates.push(current.toISOString().split("T")[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function fetchCalendarEvents(calendarId, apiKey, timeMin, timeMax) {
  const url = new URL(`${GCAL_BASE}/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("maxResults", "200");
  url.searchParams.set("fields", "items(start,end,status)"); // Only fetch dates + status - no PII
  url.searchParams.set("orderBy", "startTime");

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google Calendar API error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const dates = new Set();

  for (const event of data.items || []) {
    if (event.status === "cancelled") continue;
    for (const d of extractDates(event)) {
      dates.add(d);
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
    const [booked, held] = await Promise.all([
      fetchCalendarEvents(CALENDAR_BOOKINGS, apiKey, timeMin, timeMax),
      fetchCalendarEvents(CALENDAR_HELD, apiKey, timeMin, timeMax),
    ]);

    return jsonResponse({
      booked,
      held,
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
