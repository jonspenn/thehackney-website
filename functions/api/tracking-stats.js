/**
 * GET /api/tracking-stats
 *
 * Read-only aggregations over the visitors, sessions, events, and
 * submissions tables for the internal Website tab on the admin dashboard.
 *
 * Returns one JSON payload with everything the dashboard widgets need:
 *
 *   - totals:           visitor, session, event counts and freshness;
 *                       returning %, bounce %, 30-day conversion rate
 *   - topPages:         most-viewed pages with counts
 *   - topCTAs:          most-clicked CTAs with counts
 *   - devices:          device type breakdown
 *   - sources:          top traffic sources (UTM + direct)
 *   - countries:        top countries by visitor count (Cloudflare geo)
 *   - adPlatforms:      paid-traffic breakdown (Google Ads / Meta / Microsoft /
 *                       TikTok / LinkedIn / Other paid / Organic / Direct)
 *   - formSubmissions:  submissions broken out by form_type
 *   - eventTypes:       event counts by type
 *   - recentEvents:     the last 50 events with timestamps
 *   - recentVisitors:   the last 30 visitors with metadata
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
      returningRes,
      bounceRes,
      conv30dRes,
      countriesRes,
      adPlatformsRes,
      formSubsRes,
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
      // Returning visitor count (visitors with > 1 session) - feeds KPI A4
      env.DB.prepare(
        `SELECT COUNT(*) AS returning_visitors
           FROM visitors
           WHERE total_sessions > 1`
      ),
      // Bounce count (sessions where page_count = 1) - feeds KPI A5
      env.DB.prepare(
        `SELECT
            COUNT(*) AS single_page_sessions,
            (SELECT COUNT(*) FROM sessions) AS total_sessions
           FROM sessions
           WHERE page_count = 1`
      ),
      // 30-day conversion rate inputs - visitors first-seen in last 30d, submissions in last 30d.
      // Conversion is computed client-side as submissions30d / visitors30d.
      // Feeds KPI A8 + the 30-day conversion strip cell.
      env.DB.prepare(
        `SELECT
            (SELECT COUNT(*) FROM visitors WHERE first_seen_at >= datetime('now', '-30 days')) AS visitors_30d,
            (SELECT COUNT(*) FROM submissions WHERE created_at >= datetime('now', '-30 days')) AS submissions_30d`
      ),
      // Top countries by first_ip_country (Cloudflare cf.country) - feeds A1 panel
      env.DB.prepare(
        `SELECT
            COALESCE(first_ip_country, 'Unknown') AS country,
            COUNT(*) AS visitor_count
           FROM visitors
           GROUP BY country
           ORDER BY visitor_count DESC
           LIMIT ?`
      ).bind(TOP_LIMIT),
      // Ad platforms - bucket by which click ID (or none) is present on first hit. Feeds A3 panel.
      // 8 buckets: Google Ads / Meta Ads / Microsoft Ads / TikTok Ads / LinkedIn Ads / Other paid / Organic / Direct.
      env.DB.prepare(
        `SELECT
            CASE
              WHEN first_gclid IS NOT NULL OR first_wbraid IS NOT NULL OR first_gbraid IS NOT NULL
                THEN 'Google Ads'
              WHEN first_fbclid IS NOT NULL OR first_fbc IS NOT NULL OR first_fbp IS NOT NULL
                THEN 'Meta Ads'
              WHEN first_msclkid IS NOT NULL
                THEN 'Microsoft Ads'
              WHEN first_ttclid IS NOT NULL
                THEN 'TikTok Ads'
              WHEN first_li_fat_id IS NOT NULL
                THEN 'LinkedIn Ads'
              WHEN first_utm_medium IN ('cpc', 'paid', 'ppc', 'paid_social', 'paidsocial', 'paid-social')
                THEN 'Other paid'
              WHEN first_utm_source IS NULL OR first_utm_source = ''
                THEN 'Direct'
              ELSE 'Organic'
            END AS platform,
            COUNT(*) AS visitor_count
           FROM visitors
           GROUP BY platform
           ORDER BY visitor_count DESC`
      ),
      // Form submissions broken out by form_type - feeds A7 panel
      env.DB.prepare(
        `SELECT
            COALESCE(form_type, 'unknown') AS form_type,
            COUNT(*) AS submission_count,
            MAX(created_at) AS last_submission_at
           FROM submissions
           GROUP BY form_type
           ORDER BY submission_count DESC`
      ),
    ]);

    const vTotals = totalsRes.results[0] || {};
    const sTotals = sessionTotalsRes.results[0] || {};
    const eTotals = eventTotalsRes.results[0] || {};
    const today = todayRes.results[0] || {};
    const returningVisitors = returningRes.results[0]?.returning_visitors || 0;
    const bounceRow = bounceRes.results[0] || {};
    const conv30d = conv30dRes.results[0] || {};

    /* Derived percentages, server-side. Returned as numbers (0-100) so the
       client can format with the Industrial Romance % suffix consistently. */
    const totalVisitors = vTotals.total_visitors || 0;
    const totalSessions = sTotals.total_sessions || 0;
    const returningPct = totalVisitors > 0
      ? Math.round((returningVisitors / totalVisitors) * 100)
      : null;
    const bouncePct = totalSessions > 0
      ? Math.round(((bounceRow.single_page_sessions || 0) / totalSessions) * 100)
      : null;
    const visitors30d = conv30d.visitors_30d || 0;
    const submissions30d = conv30d.submissions_30d || 0;
    const conv30dPct = visitors30d > 0
      ? Math.round((submissions30d / visitors30d) * 1000) / 10  /* one decimal */
      : null;

    return jsonResponse({
      generatedAt: new Date().toISOString(),
      totals: {
        totalVisitors,
        totalSessions,
        totalEvents: eTotals.total_events || 0,
        avgPagesPerSession: sTotals.avg_pages_per_session || 0,
        trackingSince: vTotals.tracking_since || null,
        lastVisitorAt: vTotals.last_visitor_at || null,
        visitorsToday: today.visitors_today || 0,
        sessionsToday: today.sessions_today || 0,
        eventsToday: today.events_today || 0,
        /* New derived KPIs - audit Tier 1 */
        returningVisitors,
        returningPct,
        singlePageSessions: bounceRow.single_page_sessions || 0,
        bouncePct,
        visitors30d,
        submissions30d,
        conv30dPct,
      },
      topPages: topPagesRes.results || [],
      topCTAs: topCTAsRes.results || [],
      devices: devicesRes.results || [],
      sources: sourcesRes.results || [],
      countries: countriesRes.results || [],
      adPlatforms: adPlatformsRes.results || [],
      formSubmissions: formSubsRes.results || [],
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
