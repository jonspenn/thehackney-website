/**
 * AttributionView - per-platform funnel performance.
 *
 * Answers the question: "For each ad platform we run on, are we getting
 * visitors → sessions → submissions → tour bookings → won deals? At what
 * rate?"
 *
 * Source: /api/attribution-stats. Time window via ?window=all (default) |
 * 30d | 90d. Reuses the 8-bucket platform CASE that powers the Ad
 * platforms panel in WebsiteView (commit d62e9e5, session 55).
 *
 * Build sequence (Option C, scope confirmed 2026-04-29):
 *   Phase 0  - tab nav + skeleton (commit 07c0ea7)
 *   Phase 1  - /api/attribution-stats endpoint (commit f0190d2)
 *   Phase 2  - 4-cell MetadataStrip header        ┐
 *   Phase 3  - per-platform funnel table          │ this commit
 *   Phase 4  - time-window toggle (All / 30d / 90d) │
 *   Phase 5  - per-campaign drill-in              │
 *   Phase 6  - top campaigns + landing pages panels ┘
 *   Phase 7  - mobile + CSS sweep
 *   Phase 8  - ad_spend D1 table + /api/ad-spend-import + spend/CPA wired in
 *
 * Spend + CPA columns now light up from /api/ad-spend-import. Weekly CSV
 * cadence rather than full API integration - see PROJECT.md session 56
 * trade-off discussion. ROAS column stays em-dash until deal-value capture
 * lands at won_at (separate work).
 */

import { useEffect, useMemo, useState } from "react";

import { MetadataStrip, MetadataCell, SoftPill } from "./primitives/index.js";
import { shortenUrl, formatCount, formatPounds } from "./utils.js";

const WINDOW_MODES = [
  { id: "all", label: "All time" },
  { id: "90d", label: "Last 90 days" },
  { id: "30d", label: "Last 30 days" },
];

export default function AttributionView() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [windowMode, setWindowMode] = useState(() => {
    if (typeof window === "undefined") return "all";
    const w = new URLSearchParams(window.location.search).get("window");
    return WINDOW_MODES.some(m => m.id === w) ? w : "all";
  });
  const [drillIn, setDrillIn] = useState(null); // { platform } when a row is opened

  /* Fetch on mount + on time-window change. The endpoint is edge-cached
     for 60s so re-clicks within a minute serve from cache. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/attribution-stats?window=${encodeURIComponent(windowMode)}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(json => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch(err => { if (!cancelled) setError(err.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [windowMode]);

  /* Persist time-window selection to the URL (?window=30d) so a refresh
     or shared link lands on the same view. Keep ?tab=attribution intact. */
  function selectWindow(next) {
    setWindowMode(next);
    setDrillIn(null);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "all") params.delete("window");
    else params.set("window", next);
    const search = params.toString();
    const url = (search ? `${window.location.pathname}?${search}` : window.location.pathname) + window.location.hash;
    window.history.replaceState({}, "", url);
  }

  /* Number formatter mirrored from WebsiteView so the strip reads
     consistently across the dashboard. */
  /* SoftPill variant for the platform column. Mirrors the WebsiteView
     sourceVariant logic so Google = olive, Meta = coral etc. across the
     dashboard. Direct + Organic + Other paid = muted (low-signal buckets). */
  function platformVariant(p) {
    if (!p) return "muted";
    const v = String(p).toLowerCase();
    if (v.includes("google")) return "olive";
    if (v.includes("meta") || v.includes("facebook") || v.includes("instagram") || v.includes("fb")) return "coral";
    if (v.includes("microsoft") || v.includes("bing")) return "brick";
    if (v.includes("linkedin")) return "olive";
    if (v.includes("tiktok")) return "muted";
    if (v.includes("organic")) return "olive";
    return "muted";
  }

  const totals = data?.totals || {};
  const funnel = data?.funnel || [];
  const campaigns = data?.campaigns || [];
  const landingPages = data?.landingPages || [];

  /* Drill-in campaign list - filter the campaigns array to the platform
     that was clicked. Memoised to avoid re-filtering on every render. */
  const drillCampaigns = useMemo(() => {
    if (!drillIn) return [];
    return campaigns.filter(c => c.platform === drillIn.platform);
  }, [drillIn, campaigns]);

  /* Best-platform tier colour for the 4th metric strip cell. Mirrors the
     traffic-light convention used on Website tab's 30d conv cell:
     >= 1% conv → Forest Olive, 0.5–1% → Fired Brick, < 0.5% → Mahogany. */
  function tierColour(rate) {
    if (rate == null) return undefined;
    if (rate >= 1) return "#2E4009";
    if (rate >= 0.5) return "#8C472E";
    return "#40160C";
  }

  if (loading && !data) {
    return <div className="rep-state">Loading attribution data…</div>;
  }
  if (error) {
    return (
      <div className="rep-state rep-state--error">
        Could not load attribution data: {error}
      </div>
    );
  }
  if (!data) return null;

  return (
    <>
      {/* ── Metric strip header (4 cells) ── */}
      <div className="pipe-meta-wrap">
        <MetadataStrip>
          <MetadataCell eyebrow="Paid visitors">
            <span className="pipe-metric">
              {formatCount(totals.paid_visitors)}
              {totals.paid_visitors_pct != null && (
                <span className="pipe-metric__unit">{totals.paid_visitors_pct}% of all</span>
              )}
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Paid submissions">
            <span className="pipe-metric">
              {formatCount(totals.paid_submissions)}
              {totals.paid_conv_rate != null && (
                <span className="pipe-metric__unit">{totals.paid_conv_rate}% conv</span>
              )}
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Tour bookings (paid)">
            <span className="pipe-metric">
              {formatCount(totals.paid_tours_booked)}
              <span className="pipe-metric__unit">from submissions</span>
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Best converting platform">
            <span
              className="pipe-metric"
              style={{ color: tierColour(totals.best_platform?.conv_rate), fontSize: "22px" }}
              title={totals.best_platform ? `${totals.best_platform.conv_rate}% conv${totals.best_platform.cpa_pounds != null ? ` · ${formatPounds(totals.best_platform.cpa_pounds)} CPA` : ""} (paid platforms with ≥10 visitors)` : "Not enough paid traffic to call a winner"}
            >
              {totals.best_platform?.platform || "—"}
              {totals.best_platform?.conv_rate != null && (
                <span className="pipe-metric__unit">
                  {totals.best_platform.conv_rate}% conv
                  {totals.best_platform.cpa_pounds != null && ` · ${formatPounds(totals.best_platform.cpa_pounds)} CPA`}
                </span>
              )}
            </span>
          </MetadataCell>
        </MetadataStrip>
      </div>

      {/* Time-window toggle (sub-mode style, mirrors WebsiteView) */}
      <div className="adm-leads-mode adm-website-sub">
        {WINDOW_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`adm-leads-mode__btn${windowMode === m.id ? " adm-leads-mode__btn--active" : ""}`}
            onClick={() => selectWindow(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Per-platform funnel table ── */}
      <section className="rep-section pipe-panel">
        <h2 className="rep-h2">Platform funnel</h2>
        <p className="rep-empty" style={{ marginTop: 0, marginBottom: 12, fontSize: 12, color: "#8C472E" }}>
          Click a row to see per-campaign breakdown. Spend + CPA come from
          weekly CSV imports per platform. ROAS waits on deal-value capture.
        </p>
        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th style={{ textAlign: "right" }}>Visitors</th>
                <th style={{ textAlign: "right" }}>Sessions</th>
                <th style={{ textAlign: "right" }}>Submissions</th>
                <th style={{ textAlign: "right" }}>Tour clicks</th>
                <th style={{ textAlign: "right" }}>Tours</th>
                <th style={{ textAlign: "right" }}>Won</th>
                <th style={{ textAlign: "right" }}>Conv rate</th>
                <th style={{ textAlign: "right" }}>Avg days</th>
                <th style={{ textAlign: "right" }}>Spend</th>
                <th style={{ textAlign: "right" }}>CPA</th>
                <th style={{ textAlign: "right" }}>ROAS</th>
              </tr>
            </thead>
            <tbody>
              {funnel.length === 0 && (
                <tr><td colSpan={12} className="rep-empty" style={{ textAlign: "center", padding: "20px" }}>
                  No attribution data for this window.
                </td></tr>
              )}
              {funnel.map(row => (
                <tr
                  key={row.platform}
                  onClick={() => setDrillIn(drillIn?.platform === row.platform ? null : { platform: row.platform })}
                  style={{ cursor: "pointer" }}
                  className={drillIn?.platform === row.platform ? "rep-table__row--active" : ""}
                >
                  <td><SoftPill variant={platformVariant(row.platform)} dot>{row.platform}</SoftPill></td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(row.visitors)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(row.sessions)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(row.submissions)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(row.tour_clicks)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(row.tours_booked)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(row.won_deals)}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: tierColour(row.conv_rate) }}>
                    {row.conv_rate == null ? "—" : `${row.conv_rate}%`}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {row.avg_days_to_convert == null ? "—" : `${row.avg_days_to_convert}d`}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {formatPounds(row.spend_pounds)}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                    {formatPounds(row.cpa_pounds)}
                  </td>
                  <td style={{ textAlign: "right", color: "#8C472E" }} title="ROAS lights up once deal value is captured at won_at">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Drill-in: per-campaign breakdown for clicked platform ── */}
      {drillIn && (
        <section className="lp-card" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8C472E" }}>
                DRILL-IN · {drillIn.platform.toUpperCase()}
              </div>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, margin: "4px 0 0" }}>
                Top campaigns ({drillCampaigns.length})
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setDrillIn(null)}
              style={{ background: "transparent", border: 0, color: "#8C472E", fontSize: 12, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase" }}
            >
              Close
            </button>
          </div>
          {drillCampaigns.length === 0 ? (
            <p className="rep-empty">No campaign data captured for this platform yet.</p>
          ) : (
            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th style={{ textAlign: "right" }}>Visitors</th>
                    <th style={{ textAlign: "right" }}>Submissions</th>
                    <th style={{ textAlign: "right" }}>Conv rate</th>
                  </tr>
                </thead>
                <tbody>
                  {drillCampaigns.map(c => {
                    const rate = c.visitors > 0 ? Math.round((c.submissions / c.visitors) * 10000) / 100 : null;
                    return (
                      <tr key={c.campaign}>
                        <td>{c.campaign}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(c.visitors)}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(c.submissions)}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", color: tierColour(rate) }}>
                          {rate == null ? "—" : `${rate}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Top campaigns (cross-platform) + Top landing pages (paid only) ── */}
      <div className="rep-two-col" style={{ marginTop: 16 }}>
        <section className="rep-section pipe-panel">
          <h2 className="rep-h2">Top campaigns</h2>
          {campaigns.length === 0 ? (
            <p className="rep-empty">No campaigns captured.</p>
          ) : (
            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Platform</th>
                    <th style={{ textAlign: "right" }}>Visitors</th>
                    <th style={{ textAlign: "right" }}>Subs</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.slice(0, 10).map(c => (
                    <tr key={`${c.platform}::${c.campaign}`}>
                      <td>{c.campaign}</td>
                      <td><SoftPill variant={platformVariant(c.platform)} dot>{c.platform}</SoftPill></td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(c.visitors)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(c.submissions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="rep-section pipe-panel">
          <h2 className="rep-h2">Top landing pages (paid traffic)</h2>
          {landingPages.length === 0 ? (
            <p className="rep-empty">No paid traffic landing data.</p>
          ) : (
            <div className="rep-table-wrap">
              <table className="rep-table">
                <thead>
                  <tr>
                    <th>Landing page</th>
                    <th>Platform</th>
                    <th style={{ textAlign: "right" }}>Visitors</th>
                    <th style={{ textAlign: "right" }}>Subs</th>
                  </tr>
                </thead>
                <tbody>
                  {landingPages.slice(0, 10).map(lp => (
                    <tr key={`${lp.platform}::${lp.landing_page}`}>
                      <td className="rep-table__ref">{shortenUrl(lp.landing_page)}</td>
                      <td><SoftPill variant={platformVariant(lp.platform)} dot>{lp.platform}</SoftPill></td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(lp.visitors)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{formatCount(lp.submissions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p style={{ marginTop: 16, fontSize: 11, color: "#8C472E", letterSpacing: "0.04em" }}>
        Data window: {data.window === "all" ? "all time" : `last ${data.window === "30d" ? "30" : "90"} days`}.
        {totals.last_spend_import
          ? ` Ad spend last imported ${new Date(totals.last_spend_import).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.`
          : " No ad spend imported yet - drop a CSV in /reporting/exports/{platform}/ and ask Cowork to import it."}
        {" "}ROAS column populates once deal value is captured at won_at.
      </p>
    </>
  );
}
