/**
 * GET /api/attribution-stats
 *
 * Per-platform funnel performance for the Attribution tab on the admin
 * dashboard. Powers the question: "For each ad platform we run on, are we
 * getting visitors → sessions → submissions → tour bookings → won deals?
 * At what rate?"
 *
 * Platform bucketing matches the `adPlatforms` panel in /api/tracking-stats
 * (commit d62e9e5, session 55) - 8 buckets, first matching click ID wins:
 *   Google Ads / Meta Ads / Microsoft Ads / TikTok Ads / LinkedIn Ads /
 *   Other paid / Direct / Organic
 *
 * Time window via ?window=all (default) | 30d | 90d. Filters on
 * visitors.first_seen_at - i.e. cohort the visitor was acquired in. A
 * visitor first seen 6 months ago who submits today still counts in the
 * "all" window; under 30d they're filtered out.
 *
 * Returns:
 *   - funnel[]:   one row per platform with visitors, sessions, submissions,
 *                 tour_clicks, call_clicks, tours_booked, won_deals,
 *                 avg_days_to_convert. Sorted by visitor count descending.
 *   - campaigns[]: top 25 utm_campaign values across all platforms with
 *                  per-campaign visitor + submission counts. Phase 6 panel.
 *   - landingPages[]: top 25 first_landing_page values for paid traffic only
 *                     with visitor + submission counts. Phase 6 panel.
 *   - totals:    derived headline counters for the 4-cell metric strip.
 *
 * Read-only - this endpoint NEVER writes to D1.
 *
 * Cached at the edge for 60s, same as the other dashboard read APIs.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 *
 * Spend / CPA / ROAS are NOT in this payload yet. Sessions 57-58 will land
 * the Google Ads + Meta Marketing API connectors and the ad_spend D1 table;
 * those aggregates merge in here once the connectors are populating.
 */

const CACHE_SECONDS = 60;
const TOP_LIMIT = 25;

const PLATFORM_CASE = `CASE
  WHEN v.first_gclid IS NOT NULL OR v.first_wbraid IS NOT NULL OR v.first_gbraid IS NOT NULL
    THEN 'Google Ads'
  WHEN v.first_fbclid IS NOT NULL OR v.first_fbc IS NOT NULL OR v.first_fbp IS NOT NULL
    THEN 'Meta Ads'
  WHEN v.first_msclkid IS NOT NULL
    THEN 'Microsoft Ads'
  WHEN v.first_ttclid IS NOT NULL
    THEN 'TikTok Ads'
  WHEN v.first_li_fat_id IS NOT NULL
    THEN 'LinkedIn Ads'
  WHEN v.first_utm_medium IN ('cpc', 'paid', 'ppc', 'paid_social', 'paidsocial', 'paid-social')
    THEN 'Other paid'
  WHEN v.first_utm_source IS NULL OR v.first_utm_source = ''
    THEN 'Direct'
  ELSE 'Organic'
END`;

const PAID_PLATFORMS = ["Google Ads", "Meta Ads", "Microsoft Ads", "TikTok Ads", "LinkedIn Ads", "Other paid"];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  });
}

function resolveWindow(windowParam) {
  if (windowParam === "30d") return { sql: "v.first_seen_at >= datetime('now', '-30 days')", label: "30d" };
  if (windowParam === "90d") return { sql: "v.first_seen_at >= datetime('now', '-90 days')", label: "90d" };
  return { sql: "1=1", label: "all" };
}

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.DB) {
    return jsonResponse({ error: "Database not bound" }, 500);
  }

  const url = new URL(request.url);
  const windowParam = url.searchParams.get("window") || "all";
  const win = resolveWindow(windowParam);

  try {
    const [
      visitorsRes,
      sessionsRes,
      submissionsRes,
      contactsRes,
      avgDaysRes,
      campaignsRes,
      landingPagesRes,
    ] = await env.DB.batch([
      // 1. Visitors per platform - core attribution count.
      env.DB.prepare(
        `SELECT
            ${PLATFORM_CASE} AS platform,
            COUNT(*) AS visitors
           FROM visitors v
          WHERE ${win.sql}
          GROUP BY platform`
      ),
      // 2. Sessions per platform - sessions from visitors in the cohort window.
      env.DB.prepare(
        `SELECT
            ${PLATFORM_CASE} AS platform,
            COUNT(*) AS sessions
           FROM sessions s
           JOIN visitors v ON v.visitor_id = s.visitor_id
          WHERE ${win.sql}
          GROUP BY platform`
      ),
      // 3. Submissions per platform - join submissions->contacts->visitors.
      //    submissions has contact_id only (no direct visitor_id); we resolve
      //    the originating visitor via the visitors.contact_id reverse link.
      env.DB.prepare(
        `SELECT
            ${PLATFORM_CASE} AS platform,
            COUNT(*) AS submissions
           FROM submissions sub
           JOIN visitors v ON v.contact_id = sub.contact_id
          WHERE ${win.sql}
          GROUP BY platform`
      ),
      // 4. Contact-stage outcomes per platform - tour clicks, call clicks,
      //    tours booked, won deals. One row per platform aggregating each
      //    contact-stage timestamp via COUNT(DISTINCT) on contact_id so a
      //    contact who clicked twice does not get double-counted.
      env.DB.prepare(
        `SELECT
            ${PLATFORM_CASE} AS platform,
            COUNT(DISTINCT CASE WHEN c.clicked_venue_tour_at IS NOT NULL THEN c.contact_id END) AS tour_clicks,
            COUNT(DISTINCT CASE WHEN c.clicked_discovery_call_at IS NOT NULL THEN c.contact_id END) AS call_clicks,
            COUNT(DISTINCT CASE WHEN c.meeting_at IS NOT NULL THEN c.contact_id END) AS tours_booked,
            COUNT(DISTINCT CASE WHEN c.proposal_at IS NOT NULL THEN c.contact_id END) AS proposals,
            COUNT(DISTINCT CASE WHEN c.won_at IS NOT NULL THEN c.contact_id END) AS won_deals
           FROM contacts c
           JOIN visitors v ON v.contact_id = c.contact_id
          WHERE ${win.sql}
          GROUP BY platform`
      ),
      // 5. Average days from first-seen to first submission per platform.
      //    Uses earliest submission per contact (MIN(created_at)) as the
      //    conversion event. NULL for platforms with no submissions.
      env.DB.prepare(
        `SELECT
            platform,
            ROUND(AVG(days_to_convert), 1) AS avg_days_to_convert
           FROM (
             SELECT
               ${PLATFORM_CASE} AS platform,
               julianday(MIN(sub.created_at)) - julianday(v.first_seen_at) AS days_to_convert
             FROM submissions sub
             JOIN visitors v ON v.contact_id = sub.contact_id
             WHERE ${win.sql}
             GROUP BY sub.contact_id, v.first_seen_at, v.first_gclid, v.first_wbraid, v.first_gbraid,
                      v.first_fbclid, v.first_fbc, v.first_fbp, v.first_msclkid, v.first_ttclid,
                      v.first_li_fat_id, v.first_utm_medium, v.first_utm_source
           )
          GROUP BY platform`
      ),
      // 6. Top campaigns - utm_campaign values with per-campaign visitor and
      //    submission counts. Phase 6 "Top campaigns" panel. Includes platform
      //    so the panel can colour-code by source.
      env.DB.prepare(
        `SELECT
            ${PLATFORM_CASE} AS platform,
            COALESCE(NULLIF(v.first_utm_campaign, ''), '(no campaign)') AS campaign,
            COUNT(DISTINCT v.visitor_id) AS visitors,
            COUNT(DISTINCT sub.submission_id) AS submissions
           FROM visitors v
           LEFT JOIN submissions sub ON sub.contact_id = v.contact_id
          WHERE ${win.sql}
          GROUP BY platform, campaign
          HAVING visitors > 0
          ORDER BY submissions DESC, visitors DESC
          LIMIT ?`
      ).bind(TOP_LIMIT),
      // 7. Top landing pages for PAID traffic only - one of the questions a
      //    Hackney session needs answered is "which page is paid traffic
      //    landing on best?" Filtering to paid platforms scopes the panel to
      //    the actionable subset.
      env.DB.prepare(
        `SELECT
            ${PLATFORM_CASE} AS platform,
            COALESCE(NULLIF(v.first_landing_page, ''), '(unknown)') AS landing_page,
            COUNT(DISTINCT v.visitor_id) AS visitors,
            COUNT(DISTINCT sub.submission_id) AS submissions
           FROM visitors v
           LEFT JOIN submissions sub ON sub.contact_id = v.contact_id
          WHERE ${win.sql}
            AND (
              v.first_gclid IS NOT NULL OR v.first_wbraid IS NOT NULL OR v.first_gbraid IS NOT NULL
              OR v.first_fbclid IS NOT NULL OR v.first_fbc IS NOT NULL OR v.first_fbp IS NOT NULL
              OR v.first_msclkid IS NOT NULL
              OR v.first_ttclid IS NOT NULL
              OR v.first_li_fat_id IS NOT NULL
              OR v.first_utm_medium IN ('cpc', 'paid', 'ppc', 'paid_social', 'paidsocial', 'paid-social')
            )
          GROUP BY platform, landing_page
          HAVING visitors > 0
          ORDER BY submissions DESC, visitors DESC
          LIMIT ?`
      ).bind(TOP_LIMIT),
    ]);

    /* Merge the per-platform query results into a single funnel array
       keyed by platform. Each row carries every funnel stage; missing
       values default to 0 / null. */
    const platformIndex = new Map();
    function ensureRow(platform) {
      if (!platformIndex.has(platform)) {
        platformIndex.set(platform, {
          platform,
          visitors: 0,
          sessions: 0,
          submissions: 0,
          tour_clicks: 0,
          call_clicks: 0,
          tours_booked: 0,
          proposals: 0,
          won_deals: 0,
          avg_days_to_convert: null,
          conv_rate: null,
        });
      }
      return platformIndex.get(platform);
    }

    for (const row of (visitorsRes.results || [])) ensureRow(row.platform).visitors = row.visitors || 0;
    for (const row of (sessionsRes.results || [])) ensureRow(row.platform).sessions = row.sessions || 0;
    for (const row of (submissionsRes.results || [])) ensureRow(row.platform).submissions = row.submissions || 0;
    for (const row of (contactsRes.results || [])) {
      const r = ensureRow(row.platform);
      r.tour_clicks = row.tour_clicks || 0;
      r.call_clicks = row.call_clicks || 0;
      r.tours_booked = row.tours_booked || 0;
      r.proposals = row.proposals || 0;
      r.won_deals = row.won_deals || 0;
    }
    for (const row of (avgDaysRes.results || [])) ensureRow(row.platform).avg_days_to_convert = row.avg_days_to_convert;

    /* Conversion rate = submissions / visitors. Null when visitors == 0
       so the UI renders "—" rather than 0% (which would be misleading). */
    const funnel = Array.from(platformIndex.values()).map(row => ({
      ...row,
      conv_rate: row.visitors > 0 ? Math.round((row.submissions / row.visitors) * 10000) / 100 : null,
    }));
    funnel.sort((a, b) => (b.visitors || 0) - (a.visitors || 0));

    /* Headline totals for the 4-cell metric strip. Paid = the 6 paid
       platform buckets; Total = paid + direct + organic. Best converting
       platform = highest conv_rate among paid platforms with at least 10
       visitors (small samples are noise). */
    const totalVisitors = funnel.reduce((s, r) => s + (r.visitors || 0), 0);
    const totalSubmissions = funnel.reduce((s, r) => s + (r.submissions || 0), 0);
    const totalToursBooked = funnel.reduce((s, r) => s + (r.tours_booked || 0), 0);
    const paidRows = funnel.filter(r => PAID_PLATFORMS.includes(r.platform));
    const paidVisitors = paidRows.reduce((s, r) => s + (r.visitors || 0), 0);
    const paidSubmissions = paidRows.reduce((s, r) => s + (r.submissions || 0), 0);
    const paidToursBooked = paidRows.reduce((s, r) => s + (r.tours_booked || 0), 0);
    const paidVisitorsPct = totalVisitors > 0 ? Math.round((paidVisitors / totalVisitors) * 100) : null;
    const paidConvRate = paidVisitors > 0 ? Math.round((paidSubmissions / paidVisitors) * 10000) / 100 : null;
    const eligibleForBest = paidRows.filter(r => (r.visitors || 0) >= 10 && r.conv_rate != null);
    const bestPlatform = eligibleForBest.length > 0
      ? eligibleForBest.reduce((best, r) => (r.conv_rate > (best?.conv_rate ?? -Infinity) ? r : best), null)
      : null;

    const totals = {
      window: win.label,
      total_visitors: totalVisitors,
      total_submissions: totalSubmissions,
      total_tours_booked: totalToursBooked,
      paid_visitors: paidVisitors,
      paid_visitors_pct: paidVisitorsPct,
      paid_submissions: paidSubmissions,
      paid_tours_booked: paidToursBooked,
      paid_conv_rate: paidConvRate,
      best_platform: bestPlatform ? { platform: bestPlatform.platform, conv_rate: bestPlatform.conv_rate } : null,
    };

    return jsonResponse({
      ok: true,
      window: win.label,
      generated_at: new Date().toISOString(),
      funnel,
      campaigns: campaignsRes.results || [],
      landingPages: landingPagesRes.results || [],
      totals,
    });
  } catch (err) {
    console.error("[attribution-stats] D1 error:", err.message, err.stack);
    return jsonResponse({ error: err.message || "Query failed" }, 500);
  }
}
