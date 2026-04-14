/**
 * GET /api/tracking-stats
 *
 * Read-only aggregations over the visitors, sessions, and events tables
 * for the internal tracking dashboard (/reports/tr-a83f19d2b6e7/).
 *
 * Returns one JSON payload with everything the dashboard widgets need:
 *
 *   - totals:         visitor, session, event counts and freshness
 *   - topPages:       most-viewed pages with counts
 *   - topCTAs:        most-clicked CTAs with counts
 *   - devices:        device type breakdown
 *   - sources:        top traffic sources (UTM + direct)
 *   - eventTypes:     event counts by type
 *   - recentEvents:   the last 50 events with timestamps
 *   - recentVisitors: the last 30 visitors with metadata
 *
 * Read-only - this endpoint NEVER writes to D1.
 *
 * Cached at the edge for 60s so the report stays snappy without
 * hammering D1 on repeated refreshes.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CACHE_SECONDS = 60;
const RECENT_EVENTS_LIMIT = 50;
const RECENT_VISITORS_LIMIT = 30;
const TOP_LIMIT = 25;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.DB) {
    return jsonResponse({ error: "Database not bound" }, 500);
  }

  try {
    const [
      totalsRes,
      sessionTotalsRes,
      eventTotalsRes,
      topPagesRes,
      topCTAsRes,
      devicesRes,
      sourcesRes,
      eventTypesRes,
      recentEventsRes,
      recentVisitorsRes,
      todayRes,
    ] = await env.DB.batch([
      // Visitor totals
      env.DB.prepare(
        `SELECT
            COUNT(*) AS total_visitors,
            MIN(first_seen_at) AS tracking_since,
            MAX(last_seen_at) AS last_visitor_at
         FROM visitors`
      ),
      // Session totals
      env.DB.prepare(
        `SELECT
            COUNT(*) AS total_sessions,
            ROUND(AVG(page_count), 1) AS avg_pages_per_session
         FROM sessions`
      ),
      // Event totals
      env.DB.prepare(
        `SELECT COUNT(*) AS total_events FROM events`
      ),
      // Top pages by page_view count
      env.DB.prepare(
        `SELECT
            page_url,
            COUNT(*) AS view_count
         FROM events
         WHERE event_type = 'page_view'
         GROUP BY page_url
         ORDER BY view_count DESC
         LIMIT ?`
      ).bind(TOP_LIMIT),
      // Top CTAs by click count
      env.DB.prepare(
        `SELECT
            json_extract(event_data, '$.track_id') AS cta_id,
            page_url,
            COUNT(*) AS click_count
         FROM events
         WHERE event_type = 'cta_click'
         GROUP BY cta_id, page_url
         ORDER BY click_count DESC
         LIMIT ?`
      ).bind(TOP_LIMIT),
      // Device breakdown
      env.DB.prepare(
        `SELECT
            device_type,
            COUNT(*) AS visitor_count
         FROM visitors
         GROUP BY device_type
         ORDER BY visitor_count DESC`
      ),
      // Traffic sources (first-touch UTM source, or "Direct" if null)
      env.DB.prepare(
        `SELECT
            COALESCE(first_utm_source, 'Direct') AS source,
            COUNT(*) AS visitor_count
         FROM visitors
         GROUP BY source
         ORDER BY visitor_count DESC
         LIMIT ?`
      ).bind(TOP_LIMIT),
      // Event type breakdown
      env.DB.prepare(
        `SELECT
            event_type,
            COUNT(*) AS event_count
         FROM events
         GROUP BY event_type
         ORDER BY event_count DESC`
      ),
      // Recent events
      env.DB.prepare(
        `SELECT
            event_type,
            page_url,
            event_data,
            created_at
         FROM events
         ORDER BY created_at DESC
         LIMIT ?`
      ).bind(RECENT_EVENTS_LIMIT),
      // Recent visitors
      env.DB.prepare(
        `SELECT
            visitor_id,
            first_seen_at,
            last_seen_at,
            device_type,
            first_landing_page,
            first_utm_source,
            first_utm_medium,
            first_utm_campaign,
            total_sessions,
            total_page_views
         FROM visitors
         ORDER BY first_seen_at DESC
         LIMIT ?`
      ).bind(RECENT_VISITORS_LIMIT),
      // Today's stats
      env.DB.prepare(
        `SELECT
            (SELECT COUNT(DISTINCT visitor_id) FROM sessions WHERE started_at >= date('now')) AS visitors_today,
            (SELECT COUNT(*) FROM sessions WHERE started_at >= date('now')) AS sessions_today,
            (SELECT COUNT(*) FROM events WHERE created_at >= date('now')) AS events_today`
      ),
    ]);

    const vTotals = totalsRes.results[0] || {};
    const sTotals = sessionTotalsRes.results[0] || {};
    const eTotals = eventTotalsRes.results[0] || {};
    const today = todayRes.results[0] || {};

    return jsonResponse({
      generatedAt: new Date().toISOString(),
      totals: {
        totalVisitors: vTotals.total_visitors || 0,
        totalSessions: sTotals.total_sessions || 0,
        totalEvents: eTotals.total_events || 0,
        avgPagesPerSession: sTotals.avg_pages_per_session || 0,
        trackingSince: vTotals.tracking_since || null,
        lastVisitorAt: vTotals.last_visitor_at || null,
        visitorsToday: today.visitors_today || 0,
        sessionsToday: today.sessions_today || 0,
        eventsToday: today.events_today || 0,
      },
      topPages: topPagesRes.results || [],
      topCTAs: topCTAsRes.results || [],
      devices: devicesRes.results || [],
      sources: sourcesRes.results || [],
      eventTypes: eventTypesRes.results || [],
      recentEvents: recentEventsRes.results || [],
      recentVisitors: recentVisitorsRes.results || [],
    });
  } catch (err) {
    console.error("[tracking-stats] D1 query failed:", err);
    return jsonResponse(
      { error: "Failed to query tracking stats", detail: String(err) },
      500
    );
  }
}
