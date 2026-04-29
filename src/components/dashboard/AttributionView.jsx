/**
 * AttributionView - per-platform funnel performance.
 *
 * Answers the question: "For each ad platform we run on, are we getting
 * visitors → sessions → submissions → tour bookings → won deals? At what
 * rate? At what cost?"
 *
 * Sits as a top-level dashboard tab (added to AdminDashboard.jsx in Phase 0
 * of the kickoff brief at website/pages/dashboard/next-session-attribution-
 * kickoff.md). 8 platform buckets - Google Ads / Meta / Microsoft / TikTok /
 * LinkedIn / Other paid / Direct / Organic - same shape as the Ad platforms
 * panel that shipped in WebsiteView (commit d62e9e5, session 55).
 *
 * Build sequence (Option C, scope confirmed 2026-04-29):
 *   Phase 0  - tab nav + route + skeleton (this commit)
 *   Phase 1  - /api/attribution-stats endpoint
 *   Phase 2  - 4-cell MetadataStrip header
 *   Phase 3  - per-platform funnel table
 *   Phase 4  - time-window toggle (All / 30d / 90d)
 *   Phase 5  - click-through per-campaign drill-in
 *   Phase 6  - top campaigns + top landing pages panels
 *   Phase 7  - mobile + CSS sweep
 *   Sessions 57-58 - Google Ads + Meta API connectors layer in spend / CPA / ROAS
 */

export default function AttributionView() {
  return (
    <div className="rep-section">
      <h2 className="rep-h2">Attribution</h2>
      <p className="rep-empty">
        Per-platform funnel data lands here in Phase 1.
      </p>
    </div>
  );
}
