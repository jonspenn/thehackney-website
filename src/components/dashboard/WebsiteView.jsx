/**
 * WebsiteView - merged Performance + Events sub-tabs (formerly the
 * standalone Overview and Analytics tabs, consolidated in session 53).
 *
 * Two sub-modes (websiteSub):
 *   "performance"  - high-level KPIs, top pages, sources, devices, CTAs,
 *                    most-wanted dates. Was Overview.
 *   "events"       - full visitors / date-clicks / events drilldowns,
 *                    heatmaps, day-of-week, recent activity tables.
 *                    Was Analytics.
 *
 * Cross-tab nav from charts: clicks on top-list rows call onApplyFilter
 * which (in the parent AdminDashboard) jumps the user into Events sub-mode
 * and pins a filter across the recent-* tables.
 *
 * Visual chrome at this point is bespoke (.rep-stat / .rep-toprow /
 * .rep-device-card / .breakdown-filter-bar) - the design-language pass
 * to .pipe-panel / .rep-table / SoftPill happens in subsequent commits
 * (Phase 2-6 of the kickoff brief).
 */

import { useMemo } from "react";

import {
  EVENT_TYPE_LABELS,
} from "./constants.js";

import {
  formatRelativeTime, formatAbsoluteTime, formatLongDate,
  shortenUrl, parseEventData, eventSummary,
  buildHeatmapMonths, heatColour, heatTextColour,
} from "./utils.js";

import { MetadataStrip, MetadataCell, SoftPill } from "./primitives/index.js";

const DAY_LABELS_SHORT_LOCAL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function WebsiteView({
  tracking,
  clicks,
  websiteSub,
  setWebsiteSub,
  analyticsFilter,
  setAnalyticsFilter,
  onApplyFilter,
}) {
  const t = tracking?.totals || {};
  const c = clicks?.totals || {};

  /* Derived list maxes for the bar fills */
  const topPageMax = useMemo(() => tracking?.topPages?.[0]?.view_count || 1, [tracking]);
  const topCTAMax  = useMemo(() => tracking?.topCTAs?.[0]?.click_count  || 1, [tracking]);
  const sourceMax  = useMemo(() => tracking?.sources?.[0]?.visitor_count || 1, [tracking]);
  const deviceTotal = useMemo(() => (tracking?.devices || []).reduce((s, d) => s + d.visitor_count, 0), [tracking]);
  const eventTypeMax = useMemo(() => tracking?.eventTypes?.[0]?.event_count || 1, [tracking]);
  const topDateMax = useMemo(() => clicks?.topDates?.[0]?.click_count || 1, [clicks]);
  /* New panels (Phase 2c) */
  const countryMax = useMemo(() => tracking?.countries?.[0]?.visitor_count || 1, [tracking]);
  const adPlatformMax = useMemo(() => tracking?.adPlatforms?.[0]?.visitor_count || 1, [tracking]);
  const formSubMax = useMemo(() => tracking?.formSubmissions?.[0]?.submission_count || 1, [tracking]);

  /* Heatmap + day-of-week derivations */
  const heatmapMonths = useMemo(() => clicks ? buildHeatmapMonths(clicks.heatmap || []) : [], [clicks]);
  const heatmapMax = useMemo(() => {
    let m = 0;
    for (const row of (clicks?.heatmap || [])) { if (row.click_count > m) m = row.click_count; }
    return m;
  }, [clicks]);

  const dowSorted = useMemo(() => {
    if (!clicks) return [];
    const map = new Map();
    for (const row of (clicks.dayOfWeek || [])) map.set(row.dow, row.click_count);
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: DAY_LABELS_SHORT_LOCAL[dow], count: map.get(dow) || 0 }));
  }, [clicks]);
  const dowMax = useMemo(() => Math.max(1, ...dowSorted.map((d) => d.count)), [dowSorted]);

  /* Filtered recent tables - depend on the active analyticsFilter */
  const filteredRecentVisitors = useMemo(() => {
    const list = tracking?.recentVisitors || [];
    if (!analyticsFilter) return list;
    const f = analyticsFilter;
    if (f.type === "source") return list.filter(v => (v.first_utm_source || "Direct") === f.value);
    if (f.type === "device") return list.filter(v => (v.device_type || "Unknown") === f.value);
    if (f.type === "page") return list.filter(v => shortenUrl(v.first_landing_page) === f.value);
    return list;
  }, [tracking, analyticsFilter]);

  const filteredRecentEvents = useMemo(() => {
    const list = tracking?.recentEvents || [];
    if (!analyticsFilter) return list;
    const f = analyticsFilter;
    if (f.type === "event_type") return list.filter(e => e.event_type === f.value);
    if (f.type === "page") return list.filter(e => shortenUrl(e.page_url) === f.value);
    if (f.type === "cta") return list.filter(e => {
      if (e.event_type !== "cta_click") return false;
      const d = parseEventData(e.event_data);
      return d && d.track_id === f.value;
    });
    return list;
  }, [tracking, analyticsFilter]);

  const filteredRecentClicks = useMemo(() => {
    const list = clicks?.recent || [];
    if (!analyticsFilter) return list;
    const f = analyticsFilter;
    if (f.type === "date") return list.filter(c => c.clicked_date === f.value);
    return list;
  }, [clicks, analyticsFilter]);

  function persistSub(next) {
    setWebsiteSub(next);
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "website");
    params.set("sub", next);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  }

  /* Map a UTM source string to a SoftPill variant for the recent-visitors
     table. Mirrors SOURCE_MAP in constants.js (used on the Leads table)
     but operates on the simpler first_utm_source values surfaced here. */
  function sourceVariant(src) {
    if (!src || src === "Direct") return "muted";
    const v = String(src).toLowerCase();
    if (v.includes("google")) return "olive";
    if (v.includes("facebook") || v.includes("instagram") || v.includes("meta") || v.includes("fb")) return "coral";
    if (v.includes("hitched") || v.includes("bridebook")) return "brick";
    if (v.includes("pinterest")) return "coral";
    if (v.includes("tiktok")) return "muted";
    if (v.includes("bing") || v.includes("microsoft")) return "olive";
    return "muted";
  }

  /* Device variants - keep them quiet since this is a secondary signal. */
  function deviceVariant(d) {
    const v = String(d || "").toLowerCase();
    if (v === "desktop") return "olive";
    if (v === "mobile")  return "coral";
    if (v === "tablet")  return "brick";
    return "muted";
  }

  /* Number formatters for the metric strip */
  const formatVisitorCount = (n) => {
    if (n >= 10000) return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k");
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k");
    return String(n || 0);
  };

  return (
    <>
      {/* ── Metric strip header (4 cells, all-time + 30d cross) ── */}
      <div className="pipe-meta-wrap">
        <MetadataStrip>
          <MetadataCell eyebrow="Total visitors">
            <span className="pipe-metric">
              {formatVisitorCount(t.totalVisitors)}
              {t.returningPct != null && (
                <span className="pipe-metric__unit">{t.returningPct}% returning</span>
              )}
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Sessions">
            <span className="pipe-metric">
              {formatVisitorCount(t.totalSessions)}
              {t.bouncePct != null && (
                <span className="pipe-metric__unit">{t.bouncePct}% bounced</span>
              )}
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="CTA clicks">
            <span className="pipe-metric">
              {formatVisitorCount((tracking?.topCTAs || []).reduce((sum, r) => sum + (r.click_count || 0), 0))}
              <span className="pipe-metric__unit">all-time</span>
            </span>
          </MetadataCell>
          <MetadataCell eyebrow="Conv rate (30d)">
            <span
              className="pipe-metric"
              style={{ color: t.conv30dPct == null ? undefined : (t.conv30dPct >= 1 ? "#2E4009" : (t.conv30dPct >= 0.5 ? "#8C472E" : "#40160C")) }}
              title={t.conv30dPct == null ? "" : `${t.submissions30d || 0} submissions / ${t.visitors30d || 0} visitors over the last 30 days`}
            >
              {t.conv30dPct == null ? "—" : `${t.conv30dPct}%`}
              {t.conv30dPct != null && (
                <span className="pipe-metric__unit">{t.submissions30d || 0} of {formatVisitorCount(t.visitors30d || 0)}</span>
              )}
            </span>
          </MetadataCell>
        </MetadataStrip>
      </div>

      {/* Sub-mode toggle */}
      <div className="adm-leads-mode adm-website-sub">
        <button
          type="button"
          className={`adm-leads-mode__btn${websiteSub === "performance" ? " adm-leads-mode__btn--active" : ""}`}
          onClick={() => persistSub("performance")}
        >
          Performance
        </button>
        <button
          type="button"
          className={`adm-leads-mode__btn${websiteSub === "events" ? " adm-leads-mode__btn--active" : ""}`}
          onClick={() => persistSub("events")}
        >
          Events
        </button>
      </div>

      {/* Performance sub-tab */}
      {websiteSub === "performance" && (
        <>
          <div className="rep-totals" style={{ marginBottom: "12px" }}>
            <div className="rep-stat">
              <div className="rep-stat__num">{t.totalVisitors || 0}</div>
              <div className="rep-stat__label">Total visitors</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{t.totalSessions || 0}</div>
              <div className="rep-stat__label">Total sessions</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{t.totalEvents || 0}</div>
              <div className="rep-stat__label">Total events</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{c.totalClicks || 0}</div>
              <div className="rep-stat__label">Date clicks</div>
            </div>
          </div>

          <div className="rep-totals rep-totals--today">
            <div className="rep-stat rep-stat--today">
              <div className="rep-stat__num">{t.visitorsToday || 0}</div>
              <div className="rep-stat__label">Visitors today</div>
            </div>
            <div className="rep-stat rep-stat--today">
              <div className="rep-stat__num">{t.sessionsToday || 0}</div>
              <div className="rep-stat__label">Sessions today</div>
            </div>
            <div className="rep-stat rep-stat--today">
              <div className="rep-stat__num">{t.eventsToday || 0}</div>
              <div className="rep-stat__label">Events today</div>
            </div>
            <div className="rep-stat rep-stat--today">
              <div className="rep-stat__num">{t.lastVisitorAt ? formatRelativeTime(t.lastVisitorAt) : "—"}</div>
              <div className="rep-stat__label">Last activity</div>
            </div>
          </div>

          <div className="rep-two-col">
            <section className="rep-section" style={{ marginTop: "24px" }}>
              <h2 className="rep-h2">Top pages</h2>
              <p className="rep-sub">Most viewed pages.</p>
              {(tracking?.topPages || []).length === 0 ? <p className="rep-empty-small">No page views yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.topPages.slice(0, 10).map((row, i) => {
                    const short = shortenUrl(row.page_url);
                    const active = analyticsFilter?.type === "page" && analyticsFilter?.value === short;
                    return (
                      <li key={row.page_url} className={`rep-toprow rep-toprow--compact rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                          onClick={() => onApplyFilter("page", short, `Page: ${short}`)}>
                        <span className="rep-toprank">{i + 1}</span>
                        <span className="rep-topdate">{short}</span>
                        <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.view_count / topPageMax) * 100}%` }} /></span>
                        <span className="rep-topcount rep-topcount--link">{row.view_count}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            <section className="rep-section" style={{ marginTop: "24px" }}>
              <h2 className="rep-h2">Traffic sources</h2>
              <p className="rep-sub">First-touch UTM source.</p>
              {(tracking?.sources || []).length === 0 ? <p className="rep-empty-small">No source data yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.sources.slice(0, 10).map((row, i) => {
                    const active = analyticsFilter?.type === "source" && analyticsFilter?.value === row.source;
                    return (
                      <li key={row.source} className={`rep-toprow rep-toprow--compact rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                          onClick={() => onApplyFilter("source", row.source, `Source: ${row.source}`)}>
                        <span className="rep-toprank">{i + 1}</span>
                        <span className="rep-topdate">{row.source}</span>
                        <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.visitor_count / sourceMax) * 100}%` }} /></span>
                        <span className="rep-topcount rep-topcount--link">{row.visitor_count}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <div className="rep-two-col">
            <section className="rep-section">
              <h2 className="rep-h2">Devices</h2>
              <p className="rep-sub">Visitor breakdown by device type.</p>
              {(tracking?.devices || []).length === 0 ? <p className="rep-empty-small">No device data yet.</p> : (
                <div className="rep-device-grid">
                  {tracking.devices.map((d) => {
                    const pct = deviceTotal > 0 ? Math.round((d.visitor_count / deviceTotal) * 100) : 0;
                    return (
                      <div key={d.device_type} className={`rep-device-card rep-device-card--clickable${analyticsFilter?.type === "device" && analyticsFilter?.value === (d.device_type || "Unknown") ? " rep-device-card--active" : ""}`}
                           onClick={() => onApplyFilter("device", d.device_type || "Unknown", `Device: ${d.device_type || "Unknown"}`)}>
                        <div className="rep-device-card__pct">{pct}%</div>
                        <div className="rep-device-card__label">{d.device_type || "Unknown"}</div>
                        <div className="rep-device-card__count">{d.visitor_count} visitors</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section className="rep-section">
              <h2 className="rep-h2">Top CTA clicks</h2>
              <p className="rep-sub">Which buttons are getting clicked.</p>
              {(tracking?.topCTAs || []).length === 0 ? <p className="rep-empty-small">No CTA clicks yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.topCTAs.slice(0, 10).map((row, i) => {
                    const active = analyticsFilter?.type === "cta" && analyticsFilter?.value === row.cta_id;
                    return (
                      <li key={`${row.cta_id}-${row.page_url}`} className={`rep-toprow rep-toprow--compact rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                          onClick={() => onApplyFilter("cta", row.cta_id, `CTA: ${row.cta_id}`)}>
                        <span className="rep-toprank">{i + 1}</span>
                        <span className="rep-topdate">
                          <strong>{row.cta_id || "unknown"}</strong><br />
                          <span style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>{shortenUrl(row.page_url)}</span>
                        </span>
                        <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topCTAMax) * 100}%` }} /></span>
                        <span className="rep-topcount rep-topcount--link">{row.click_count}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          {/* Top countries (Phase 2c - audit A1) */}
          <div className="rep-two-col">
            <section className="rep-section">
              <h2 className="rep-h2">Top countries</h2>
              <p className="rep-sub">Visitor count by Cloudflare-detected country (first hit).</p>
              {(tracking?.countries || []).length === 0 ? <p className="rep-empty-small">No country data yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.countries.slice(0, 10).map((row, i) => (
                    <li key={row.country} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{row.country || "Unknown"}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.visitor_count / countryMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.visitor_count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {/* Ad platforms (Phase 2c - audit A3) */}
            <section className="rep-section">
              <h2 className="rep-h2">Ad platforms</h2>
              <p className="rep-sub">First-touch paid attribution. Click ID present = paid; UTM-only = organic.</p>
              {(tracking?.adPlatforms || []).length === 0 ? <p className="rep-empty-small">No platform data yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.adPlatforms.map((row, i) => (
                    <li key={row.platform} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{row.platform}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.visitor_count / adPlatformMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.visitor_count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* Form submissions by type (Phase 2c - audit A7) */}
          <section className="rep-section">
            <h2 className="rep-h2">Submissions by form</h2>
            <p className="rep-sub">All form completions, broken out by which form fired the lead.</p>
            {(tracking?.formSubmissions || []).length === 0 ? <p className="rep-empty-small">No submissions yet.</p> : (
              <ol className="rep-toplist">
                {tracking.formSubmissions.map((row, i) => {
                  const label = (
                    row.form_type === "wedding-quiz"      ? "Wedding quiz" :
                    row.form_type === "corporate-quiz"    ? "Corporate quiz" :
                    row.form_type === "brochure-download" ? "Brochure download" :
                    row.form_type === "supperclub-signup" ? "Supper club signup" :
                    row.form_type
                  );
                  return (
                    <li key={row.form_type} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">
                        <strong>{label}</strong>
                        {row.last_submission_at && (
                          <><br /><span style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>last {formatRelativeTime(row.last_submission_at)}</span></>
                        )}
                      </span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.submission_count / formSubMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.submission_count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rep-section">
            <h2 className="rep-h2">Most wanted dates</h2>
            <p className="rep-sub">Top 5 most-clicked future dates on /check-your-date.</p>
            {(clicks?.topDates || []).length === 0 ? <p className="rep-empty-small">No date clicks yet.</p> : (
              <ol className="rep-toplist">
                {clicks.topDates.slice(0, 5).map((row, i) => {
                  const active = analyticsFilter?.type === "date" && analyticsFilter?.value === row.clicked_date;
                  return (
                    <li key={row.clicked_date} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => onApplyFilter("date", row.clicked_date, `Date: ${formatLongDate(row.clicked_date)}`)}>
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{formatLongDate(row.clicked_date)}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topDateMax) * 100}%` }} /></span>
                      <span className="rep-topcount rep-topcount--link">{row.click_count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}

      {/* Events sub-tab */}
      {websiteSub === "events" && (
        <>
          <section className="rep-section">
            <h2 className="rep-h2">Top pages</h2>
            <p className="rep-sub">Most viewed pages by total page_view events. Click a count to filter recent events.</p>
            {(tracking?.topPages || []).length === 0 ? <p className="rep-empty-small">No page views yet.</p> : (
              <ol className="rep-toplist">
                {tracking.topPages.map((row, i) => {
                  const short = shortenUrl(row.page_url);
                  const active = analyticsFilter?.type === "page" && analyticsFilter?.value === short;
                  return (
                    <li key={row.page_url} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => onApplyFilter("page", short, `Page: ${short}`)}>
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{short}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.view_count / topPageMax) * 100}%` }} /></span>
                      <span className="rep-topcount rep-topcount--link">{row.view_count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <div className="rep-two-col">
            <section className="rep-section">
              <h2 className="rep-h2">Traffic sources</h2>
              <p className="rep-sub">First-touch UTM source per visitor. Click a count to filter recent visitors.</p>
              {(tracking?.sources || []).length === 0 ? <p className="rep-empty-small">No source data yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.sources.map((row, i) => {
                    const active = analyticsFilter?.type === "source" && analyticsFilter?.value === row.source;
                    return (
                      <li key={row.source} className={`rep-toprow rep-toprow--compact rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                          onClick={() => onApplyFilter("source", row.source, `Source: ${row.source}`)}>
                        <span className="rep-toprank">{i + 1}</span>
                        <span className="rep-topdate">{row.source}</span>
                        <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.visitor_count / sourceMax) * 100}%` }} /></span>
                        <span className="rep-topcount rep-topcount--link">{row.visitor_count}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            <section className="rep-section">
              <h2 className="rep-h2">Devices</h2>
              <p className="rep-sub">Visitor count by device type.</p>
              {(tracking?.devices || []).length === 0 ? <p className="rep-empty-small">No device data yet.</p> : (
                <div className="rep-device-grid">
                  {tracking.devices.map((d) => {
                    const pct = deviceTotal > 0 ? Math.round((d.visitor_count / deviceTotal) * 100) : 0;
                    return (
                      <div key={d.device_type} className={`rep-device-card rep-device-card--clickable${analyticsFilter?.type === "device" && analyticsFilter?.value === (d.device_type || "Unknown") ? " rep-device-card--active" : ""}`}
                           onClick={() => onApplyFilter("device", d.device_type || "Unknown", `Device: ${d.device_type || "Unknown"}`)}>
                        <div className="rep-device-card__pct">{pct}%</div>
                        <div className="rep-device-card__label">{d.device_type || "Unknown"}</div>
                        <div className="rep-device-card__count">{d.visitor_count} visitors</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <section className="rep-section">
            <h2 className="rep-h2">Recent visitors</h2>
            <p className="rep-sub">Last 30 visitors with first-touch attribution.</p>
            {analyticsFilter && (analyticsFilter.type === "source" || analyticsFilter.type === "device" || analyticsFilter.type === "page") && (
              <div className="breakdown-filter-bar">
                <span className="breakdown-filter-bar__label">Filtered by: <strong>{analyticsFilter.label}</strong> ({filteredRecentVisitors.length} of {(tracking?.recentVisitors || []).length})</span>
                <button className="breakdown-filter-bar__clear" onClick={() => setAnalyticsFilter(null)}>{"✕"} Clear filter</button>
              </div>
            )}
            {filteredRecentVisitors.length === 0 ? <p className="rep-empty-small">{analyticsFilter ? "No matching visitors in recent data." : "No visitors yet."}</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr><th>First seen</th><th>Device</th><th>Landing page</th><th>Source</th><th>Sessions</th><th>Pages</th></tr>
                  </thead>
                  <tbody>
                    {filteredRecentVisitors.map((row) => {
                      const src = row.first_utm_source || "Direct";
                      return (
                        <tr key={row.visitor_id}>
                          <td>{formatRelativeTime(row.first_seen_at)}</td>
                          <td>{row.device_type ? <SoftPill variant={deviceVariant(row.device_type)} dot>{row.device_type}</SoftPill> : "—"}</td>
                          <td className="rep-table__ref">{shortenUrl(row.first_landing_page)}</td>
                          <td><SoftPill variant={sourceVariant(src)} dot>{src}{row.first_utm_medium ? ` / ${row.first_utm_medium}` : ""}</SoftPill></td>
                          <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{row.total_sessions}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{row.total_page_views}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <hr style={{ border: "none", borderTop: "1px solid rgba(44,24,16,0.1)", margin: "32px 0" }} />
          <h2 className="rep-h2" style={{ marginBottom: "16px" }}>Date clicks</h2>
          <div className="rep-totals">
            <div className="rep-stat">
              <div className="rep-stat__num">{c.totalClicks || 0}</div>
              <div className="rep-stat__label">Total clicks</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{c.uniqueDates || 0}</div>
              <div className="rep-stat__label">Unique dates clicked</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{c.lastClickAt ? formatRelativeTime(c.lastClickAt) : "—"}</div>
              <div className="rep-stat__label">Most recent click</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{c.firstClickAt ? formatAbsoluteTime(c.firstClickAt) : "—"}</div>
              <div className="rep-stat__label">Tracking since</div>
            </div>
          </div>

          <section className="rep-section">
            <h2 className="rep-h2">Top dates by click count</h2>
            <p className="rep-sub">Future dates only, ranked by interest. This is the demand signal.</p>
            {(clicks?.topDates || []).length === 0 ? <p className="rep-empty-small">No future-date clicks yet.</p> : (
              <ol className="rep-toplist">
                {clicks.topDates.map((row, i) => {
                  const active = analyticsFilter?.type === "date" && analyticsFilter?.value === row.clicked_date;
                  return (
                    <li key={row.clicked_date} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => onApplyFilter("date", row.clicked_date, `Date: ${formatLongDate(row.clicked_date)}`)}>
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{formatLongDate(row.clicked_date)}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topDateMax) * 100}%` }} /></span>
                      <span className="rep-topcount rep-topcount--link">{row.click_count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rep-section">
            <h2 className="rep-h2">Clicks by day of week</h2>
            <p className="rep-sub">Confirms or challenges the assumption that Saturday is king.</p>
            <div className="rep-dow">
              {dowSorted.map((d) => (
                <div key={d.dow} className="rep-dow__col">
                  <div className="rep-dow__bar">
                    <div className="rep-dow__fill" style={{ height: `${Math.max((d.count / dowMax) * 100, 2)}%` }} title={`${d.count} clicks`} />
                  </div>
                  <div className="rep-dow__count">{d.count}</div>
                  <div className="rep-dow__label">{d.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rep-section">
            <h2 className="rep-h2">12-month heatmap</h2>
            <p className="rep-sub">Darker = more clicks. Spot seasonal patterns at a glance.</p>
            <div className="rep-heatmap">
              {heatmapMonths.map((m) => (
                <div key={m.label} className="rep-month">
                  <div className="rep-month__label">{m.label}</div>
                  <div className="rep-month__dow">
                    {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <span key={i}>{l}</span>)}
                  </div>
                  <div className="rep-month__grid">
                    {(() => {
                      const cells = m.cells.slice();
                      const firstReal = cells.find((cell) => cell !== null);
                      const startDow = firstReal ? firstReal.dow : 1;
                      const monStartBlanks = (startDow + 6) % 7;
                      const stripped = cells.filter((cell) => cell !== null);
                      const out = [];
                      for (let i = 0; i < monStartBlanks; i++) out.push(null);
                      out.push(...stripped);
                      return out.map((cell, i) => {
                        if (!cell) return <span key={i} className="rep-month__cell rep-month__cell--blank" />;
                        return (
                          <span
                            key={i}
                            className="rep-month__cell"
                            title={`${formatLongDate(cell.iso)} - ${cell.count} click${cell.count === 1 ? "" : "s"}`}
                            style={{ background: heatColour(cell.count, heatmapMax), color: heatTextColour(cell.count, heatmapMax) }}
                          >
                            {cell.day}
                          </span>
                        );
                      });
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rep-section">
            <h2 className="rep-h2">Recent activity</h2>
            <p className="rep-sub">Last 50 date clicks.</p>
            {analyticsFilter?.type === "date" && (
              <div className="breakdown-filter-bar">
                <span className="breakdown-filter-bar__label">Filtered by: <strong>{analyticsFilter.label}</strong> ({filteredRecentClicks.length} of {(clicks?.recent || []).length})</span>
                <button className="breakdown-filter-bar__clear" onClick={() => setAnalyticsFilter(null)}>{"✕"} Clear filter</button>
              </div>
            )}
            {filteredRecentClicks.length === 0 ? <p className="rep-empty-small">{analyticsFilter?.type === "date" ? "No matching clicks in recent data." : "No clicks logged yet."}</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead><tr><th>When</th><th>Date clicked</th><th>Came from</th></tr></thead>
                  <tbody>
                    {filteredRecentClicks.map((row, i) => (
                      <tr key={i}>
                        <td>{formatRelativeTime(row.clicked_at)}</td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatLongDate(row.clicked_date)}</td>
                        <td className="rep-table__ref" style={{ color: row.referrer ? undefined : "rgba(44,24,16,0.4)", fontStyle: row.referrer ? undefined : "italic" }}>{row.referrer || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <hr style={{ border: "none", borderTop: "1px solid rgba(44,24,16,0.1)", margin: "32px 0" }} />
          <h2 className="rep-h2" style={{ marginBottom: "16px" }}>Events</h2>

          <section className="rep-section" style={{ marginTop: "12px" }}>
            <h2 className="rep-h2">Events by type</h2>
            <p className="rep-sub">Total count for each event type tracked.</p>
            {(tracking?.eventTypes || []).length === 0 ? <p className="rep-empty-small">No events yet.</p> : (
              <ol className="rep-toplist">
                {tracking.eventTypes.map((row, i) => {
                  const active = analyticsFilter?.type === "event_type" && analyticsFilter?.value === row.event_type;
                  return (
                    <li key={row.event_type} className={`rep-toprow rep-toprow--compact rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => onApplyFilter("event_type", row.event_type, `Event: ${EVENT_TYPE_LABELS[row.event_type] || row.event_type}`)}>
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{EVENT_TYPE_LABELS[row.event_type] || row.event_type}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.event_count / eventTypeMax) * 100}%` }} /></span>
                      <span className="rep-topcount rep-topcount--link">{row.event_count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rep-section">
            <h2 className="rep-h2">CTA clicks</h2>
            <p className="rep-sub">Which buttons are getting clicked, and on which pages. Click a count to filter recent events.</p>
            {(tracking?.topCTAs || []).length === 0 ? <p className="rep-empty-small">No CTA clicks yet.</p> : (
              <ol className="rep-toplist">
                {tracking.topCTAs.map((row, i) => {
                  const active = analyticsFilter?.type === "cta" && analyticsFilter?.value === row.cta_id;
                  return (
                    <li key={`${row.cta_id}-${row.page_url}`} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => onApplyFilter("cta", row.cta_id, `CTA: ${row.cta_id}`)}>
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">
                        <strong>{row.cta_id || "unknown"}</strong><br />
                        <span style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>{shortenUrl(row.page_url)}</span>
                      </span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topCTAMax) * 100}%` }} /></span>
                      <span className="rep-topcount rep-topcount--link">{row.click_count}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rep-section">
            <h2 className="rep-h2">Recent events</h2>
            <p className="rep-sub">Last 50 events across the site.</p>
            {analyticsFilter && (analyticsFilter.type === "event_type" || analyticsFilter.type === "page" || analyticsFilter.type === "cta") && (
              <div className="breakdown-filter-bar">
                <span className="breakdown-filter-bar__label">Filtered by: <strong>{analyticsFilter.label}</strong> ({filteredRecentEvents.length} of {(tracking?.recentEvents || []).length})</span>
                <button className="breakdown-filter-bar__clear" onClick={() => setAnalyticsFilter(null)}>{"✕"} Clear filter</button>
              </div>
            )}
            {filteredRecentEvents.length === 0 ? <p className="rep-empty-small">{analyticsFilter ? "No matching events in recent data." : "No events logged yet."}</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead><tr><th>When</th><th>Type</th><th>Page</th><th>Detail</th></tr></thead>
                  <tbody>
                    {filteredRecentEvents.map((row, i) => {
                      const prefix = row.event_type.split("_")[0];
                      const eventVariant =
                        prefix === "page"          ? "muted" :
                        prefix === "cta"           ? "olive" :
                        prefix === "date"          ? "coral" :
                        prefix === "form"          ? "brick" :
                        prefix === "questionnaire" ? "brick" :
                        "muted";
                      return (
                        <tr key={i}>
                          <td>{formatRelativeTime(row.created_at)}</td>
                          <td>
                            <SoftPill variant={eventVariant} dot>
                              {EVENT_TYPE_LABELS[row.event_type] || row.event_type}
                            </SoftPill>
                          </td>
                          <td className="rep-table__ref">{shortenUrl(row.page_url)}</td>
                          <td className="rep-table__ref">{eventSummary(row.event_type, row.event_data)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
