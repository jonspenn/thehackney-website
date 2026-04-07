/**
 * GET /api/click-stats
 *
 * Read-only aggregations over the date_clicks table for the internal
 * report page (/reports/dc-7k3m9p2x/). Returns one JSON payload with
 * everything the four widgets need:
 *
 *   - totals:        overall counts and freshness
 *   - topDates:      most-clicked future dates with counts
 *   - heatmap:       all dates with click counts (for the calendar grid)
 *   - dayOfWeek:     click totals bucketed by Mon-Sun
 *   - recent:        the last 50 clicks with timestamps
 *
 * Read-only - this endpoint NEVER writes to D1.
 *
 * Cached at the edge for 60s so the report stays snappy without
 * hammering D1 if Hugo or James refresh repeatedly.
 *
 * Binding: env.DB (D1 database `hackney-date-tracking`)
 */

const CACHE_SECONDS = 60;
const TOP_DATES_LIMIT = 25;
const RECENT_LIMIT = 50;

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
    // Run all five queries in parallel - one round-trip to D1's batch API
    const [totalsRes, topDatesRes, heatmapRes, dowRes, recentRes] =
      await env.DB.batch([
        env.DB.prepare(
          `SELECT
              COUNT(*) AS total_clicks,
              COUNT(DISTINCT clicked_date) AS unique_dates,
              MIN(clicked_at) AS first_click_at,
              MAX(clicked_at) AS last_click_at
           FROM date_clicks`
        ),
        env.DB.prepare(
          `SELECT clicked_date, COUNT(*) AS click_count
             FROM date_clicks
             WHERE clicked_date >= date('now')
             GROUP BY clicked_date
             ORDER BY click_count DESC, clicked_date ASC
             LIMIT ?`
        ).bind(TOP_DATES_LIMIT),
        env.DB.prepare(
          `SELECT clicked_date, COUNT(*) AS click_count
             FROM date_clicks
             GROUP BY clicked_date`
        ),
        env.DB.prepare(
          `SELECT
              CAST(strftime('%w', clicked_date) AS INTEGER) AS dow,
              COUNT(*) AS click_count
            FROM date_clicks
            GROUP BY dow
            ORDER BY dow`
        ),
        env.DB.prepare(
          `SELECT clicked_date, clicked_at, referrer
             FROM date_clicks
             ORDER BY id DESC
             LIMIT ?`
        ).bind(RECENT_LIMIT),
      ]);

    const totalsRow = totalsRes.results[0] || {};

    return jsonResponse({
      generatedAt: new Date().toISOString(),
      totals: {
        totalClicks: totalsRow.total_clicks || 0,
        uniqueDates: totalsRow.unique_dates || 0,
        firstClickAt: totalsRow.first_click_at || null,
        lastClickAt: totalsRow.last_click_at || null,
      },
      topDates: topDatesRes.results || [],
      heatmap: heatmapRes.results || [],
      dayOfWeek: dowRes.results || [],
      recent: recentRes.results || [],
    });
  } catch (err) {
    console.error("[click-stats] D1 query failed:", err);
    return jsonResponse(
      { error: "Failed to query click stats", detail: String(err) },
      500
    );
  }
}
