import { useEffect, useMemo, useState } from "react";

/**
 * Combined internal dashboard for /admin/.
 * Orchestrates tabs, data fetching, and renders sub-components.
 * Protected by Cloudflare Access (zero trust).
 *
 * Constants and utilities extracted to dashboard/constants.js and dashboard/utils.js.
 * Sub-components: dashboard/LeadProfile.jsx (full-page profile + journey), dashboard/LeadTable.jsx.
 */

import {
  EVENT_TYPE_LABELS,
  DAY_LABELS_SHORT,
  LEAD_TABS,
} from "./dashboard/constants.js";

import {
  formatRelativeTime, formatAbsoluteTime, formatLongDate,
  shortenUrl, parseEventData, eventSummary,
  buildHeatmapMonths, heatColour, heatTextColour,
} from "./dashboard/utils.js";

import LeadProfile from "./dashboard/LeadProfile.jsx";
import LeadTable from "./dashboard/LeadTable.jsx";
import PipelineView from "./dashboard/PipelineView.jsx";

/* ───────── main component ───────── */

export default function AdminDashboard() {
  const [tracking, setTracking] = useState(null);
  const [clicks, setClicks] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [leads, setLeads] = useState({}); // keyed by lead type: { wedding: {...}, corporate: {...}, ... }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [activeLeadType, setActiveLeadType] = useState("wedding");
  const [analyticsFilter, setAnalyticsFilter] = useState(null); // { type, value, label } or null
  const [selectedLead, setSelectedLead] = useState(null); // lead object for profile panel
  const [journey, setJourney] = useState(null); // journey data for selected lead
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [showFullJourney, setShowFullJourney] = useState(false); // full session log hidden by default
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [deletedLeads, setDeletedLeads] = useState({}); // keyed by lead type

  function selectLead(lead, leadType) {
    setSelectedLead(lead);
    if (leadType) setActiveLeadType(leadType);
    setJourney(null);
    setShowFullJourney(false);
    if (lead?.contact_id) {
      setJourneyLoading(true);
      fetch(`/api/lead-journey?contact_id=${encodeURIComponent(lead.contact_id)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => { if (data.ok) setJourney(data); })
        .catch(() => {})
        .finally(() => setJourneyLoading(false));
    }
  }

  async function fetchDeletedLeads() {
    const leadTypes = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];
    const results = await Promise.all(
      leadTypes.map(t => fetch(`/api/leads?type=${t}&deleted=1`, { cache: "no-store" }).catch(() => null))
    );
    const data = {};
    for (let i = 0; i < leadTypes.length; i++) {
      if (results[i] && results[i].ok) {
        const lj = await results[i].json();
        if (lj.ok) data[leadTypes[i]] = lj;
      }
    }
    setDeletedLeads(data);
  }

  async function handleDeleteOrRestore() {
    // Refresh both active leads and deleted leads
    const leadTypes = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];
    const [activeResults, deletedResults] = await Promise.all([
      Promise.all(leadTypes.map(t => fetch(`/api/leads?type=${t}`, { cache: "no-store" }).catch(() => null))),
      Promise.all(leadTypes.map(t => fetch(`/api/leads?type=${t}&deleted=1`, { cache: "no-store" }).catch(() => null))),
    ]);
    const activeData = {};
    const delData = {};
    for (let i = 0; i < leadTypes.length; i++) {
      if (activeResults[i]?.ok) { const lj = await activeResults[i].json(); if (lj.ok) activeData[leadTypes[i]] = lj; }
      if (deletedResults[i]?.ok) { const lj = await deletedResults[i].json(); if (lj.ok) delData[leadTypes[i]] = lj; }
    }
    setLeads(activeData);
    setDeletedLeads(delData);
  }

  async function handleStatusChange(result) {
    // Re-fetch leads for the current type so the table + profile reflect the update
    try {
      const res = await fetch(`/api/leads?type=${activeLeadType}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setLeads(prev => ({ ...prev, [activeLeadType]: data }));
          // Update the selected lead with fresh data
          if (selectedLead) {
            const updated = data.leads.find(l => l.contact_id === selectedLead.contact_id);
            if (updated) setSelectedLead(updated);
          }
        }
      }
    } catch (err) {
      console.error("[status-refresh]", err);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tRes, cRes, ctRes] = await Promise.all([
        fetch("/api/tracking-stats", { cache: "no-store" }),
        fetch("/api/click-stats", { cache: "no-store" }),
        fetch("/api/contact-stats", { cache: "no-store" }).catch(() => null),
      ]);
      if (!tRes.ok) throw new Error(`Tracking API: HTTP ${tRes.status}`);
      if (!cRes.ok) throw new Error(`Click API: HTTP ${cRes.status}`);
      const [tJson, cJson] = await Promise.all([tRes.json(), cRes.json()]);
      if (tJson.error) throw new Error(tJson.error);
      if (cJson.error) throw new Error(cJson.error);
      setTracking(tJson);
      setClicks(cJson);
      if (ctRes && ctRes.ok) {
        const ctJson = await ctRes.json();
        if (ctJson.ok) setContacts(ctJson);
      }
      // Fetch leads for all revenue streams in parallel
      const leadTypes = ["wedding", "corporate", "supperclub", "private-events", "cafe-bar"];
      const leadResults = await Promise.all(
        leadTypes.map(t => fetch(`/api/leads?type=${t}`, { cache: "no-store" }).catch(() => null))
      );
      const leadsData = {};
      for (let i = 0; i < leadTypes.length; i++) {
        if (leadResults[i] && leadResults[i].ok) {
          const lj = await leadResults[i].json();
          if (lj.ok) leadsData[leadTypes[i]] = lj;
        }
      }
      setLeads(leadsData);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  /* ── derived data ── */
  const topPageMax = useMemo(() => tracking?.topPages?.[0]?.view_count || 1, [tracking]);
  const topCTAMax = useMemo(() => tracking?.topCTAs?.[0]?.click_count || 1, [tracking]);
  const sourceMax = useMemo(() => tracking?.sources?.[0]?.visitor_count || 1, [tracking]);
  const deviceTotal = useMemo(() => (tracking?.devices || []).reduce((s, d) => s + d.visitor_count, 0), [tracking]);
  const eventTypeMax = useMemo(() => tracking?.eventTypes?.[0]?.event_count || 1, [tracking]);

  const topDateMax = useMemo(() => clicks?.topDates?.[0]?.click_count || 1, [clicks]);
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
    return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({ dow, label: DAY_LABELS_SHORT[dow], count: map.get(dow) || 0 }));
  }, [clicks]);
  const dowMax = useMemo(() => Math.max(1, ...dowSorted.map((d) => d.count)), [dowSorted]);

  function applyAnalyticsFilter(type, value, label) {
    const current = analyticsFilter;
    if (current && current.type === type && current.value === value) {
      setAnalyticsFilter(null);
    } else {
      setAnalyticsFilter({ type, value, label });
      if (activeTab !== "analytics") setActiveTab("analytics");
    }
  }

  /* Filtered recent tables for analytics */
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

  /* ── loading / error states ── */
  if (loading) return <div className="rep-state">Loading dashboard data\u2026</div>;
  if (error) return (
    <div className="rep-state rep-state--error">
      Could not load data: {error}<br />
      <button className="rep-retry" onClick={load} type="button">Retry</button>
    </div>
  );
  if (!tracking && !clicks) return null;

  const t = tracking?.totals || {};
  const c = clicks?.totals || {};

  // Total leads across all types for the tab badge
  const totalLeadsCount = LEAD_TABS.reduce((sum, lt) => sum + (leads[lt.type]?.total || 0), 0);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "leads", label: `Leads (${totalLeadsCount})` },
    { id: "pipeline", label: "Pipeline" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <div className="rep">
      {/* Tab nav */}
      <div className="adm-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`adm-tab${activeTab === tab.id ? " adm-tab--active" : ""}`}
            onClick={() => { setActiveTab(tab.id); setSelectedLead(null); }}
            type="button"
          >
            {tab.label}
          </button>
        ))}
        <button className="rep-refresh adm-refresh" onClick={load} type="button" aria-label="Refresh data">Refresh</button>
      </div>

      {/* ═══════ OVERVIEW TAB ═══════ */}
      {activeTab === "overview" && (
        <>
          {/* Top-level KPIs */}
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

          {/* Today strip */}
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
              <div className="rep-stat__num">{t.lastVisitorAt ? formatRelativeTime(t.lastVisitorAt) : "\u2014"}</div>
              <div className="rep-stat__label">Last activity</div>
            </div>
          </div>

          {/* Two-col: top pages + traffic sources */}
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
                          onClick={() => applyAnalyticsFilter("page", short, `Page: ${short}`)}>
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
                          onClick={() => applyAnalyticsFilter("source", row.source, `Source: ${row.source}`)}>
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

          {/* Two-col: devices + top CTAs */}
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
                           onClick={() => applyAnalyticsFilter("device", d.device_type || "Unknown", `Device: ${d.device_type || "Unknown"}`)}>
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
                          onClick={() => applyAnalyticsFilter("cta", row.cta_id, `CTA: ${row.cta_id}`)}>
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

          {/* Top 5 most-clicked dates */}
          <section className="rep-section">
            <h2 className="rep-h2">Most wanted dates</h2>
            <p className="rep-sub">Top 5 most-clicked future dates on /check-your-date.</p>
            {(clicks?.topDates || []).length === 0 ? <p className="rep-empty-small">No date clicks yet.</p> : (
              <ol className="rep-toplist">
                {clicks.topDates.slice(0, 5).map((row, i) => {
                  const active = analyticsFilter?.type === "date" && analyticsFilter?.value === row.clicked_date;
                  return (
                    <li key={row.clicked_date} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => applyAnalyticsFilter("date", row.clicked_date, `Date: ${formatLongDate(row.clicked_date)}`)}>
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

      {/* ═══════ ANALYTICS TAB (Visitors + Date Clicks + Events) ═══════ */}
      {activeTab === "analytics" && (
        <>
          <h2 className="rep-h2" style={{ marginBottom: "16px" }}>Visitors</h2>
          <div className="rep-totals">
            <div className="rep-stat">
              <div className="rep-stat__num">{t.totalVisitors || 0}</div>
              <div className="rep-stat__label">Total visitors</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{t.totalSessions || 0}</div>
              <div className="rep-stat__label">Total sessions</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{t.avgPagesPerSession || 0}</div>
              <div className="rep-stat__label">Avg pages / session</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{t.trackingSince ? formatAbsoluteTime(t.trackingSince) : "\u2014"}</div>
              <div className="rep-stat__label">Tracking since</div>
            </div>
          </div>

          {/* Top pages - full list */}
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
                        onClick={() => applyAnalyticsFilter("page", short, `Page: ${short}`)}>
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

          {/* Traffic sources - full list */}
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
                          onClick={() => applyAnalyticsFilter("source", row.source, `Source: ${row.source}`)}>
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
                           onClick={() => applyAnalyticsFilter("device", d.device_type || "Unknown", `Device: ${d.device_type || "Unknown"}`)}>
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

          {/* Recent visitors table */}
          <section className="rep-section">
            <h2 className="rep-h2">Recent visitors</h2>
            <p className="rep-sub">Last 30 visitors with first-touch attribution.</p>
            {analyticsFilter && (analyticsFilter.type === "source" || analyticsFilter.type === "device" || analyticsFilter.type === "page") && (
              <div className="breakdown-filter-bar">
                <span className="breakdown-filter-bar__label">Filtered by: <strong>{analyticsFilter.label}</strong> ({filteredRecentVisitors.length} of {(tracking?.recentVisitors || []).length})</span>
                <button className="breakdown-filter-bar__clear" onClick={() => setAnalyticsFilter(null)}>{"\u2715"} Clear filter</button>
              </div>
            )}
            {filteredRecentVisitors.length === 0 ? <p className="rep-empty-small">{analyticsFilter ? "No matching visitors in recent data." : "No visitors yet."}</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr><th>First seen</th><th>Device</th><th>Landing page</th><th>Source</th><th>Sessions</th><th>Pages</th></tr>
                  </thead>
                  <tbody>
                    {filteredRecentVisitors.map((row) => (
                      <tr key={row.visitor_id}>
                        <td>{formatRelativeTime(row.first_seen_at)}</td>
                        <td>{row.device_type || "\u2014"}</td>
                        <td className="rep-table__ref">{shortenUrl(row.first_landing_page)}</td>
                        <td>{row.first_utm_source || "Direct"}{row.first_utm_medium ? ` / ${row.first_utm_medium}` : ""}</td>
                        <td>{row.total_sessions}</td>
                        <td>{row.total_page_views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══════ LEADS TAB ═══════ */}
      {activeTab === "leads" && !selectedLead && (
        <LeadTable
          leads={leads}
          deletedLeads={deletedLeads}
          selectedLeadId={selectedLead?.contact_id}
          onSelectLead={selectLead}
          onLeadTypeChange={setActiveLeadType}
          onDelete={handleDeleteOrRestore}
          onRestore={handleDeleteOrRestore}
          showRecycleBin={showRecycleBin}
          onToggleRecycleBin={() => {
            const next = !showRecycleBin;
            setShowRecycleBin(next);
            if (next) fetchDeletedLeads();
          }}
        />
      )}

      {/* ═══════ PIPELINE TAB ═══════ */}
      {activeTab === "pipeline" && !selectedLead && (
        <PipelineView
          leads={leads}
          onSelectLead={selectLead}
        />
      )}

      {activeTab === "analytics" && (
        <>
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
              <div className="rep-stat__num">{c.lastClickAt ? formatRelativeTime(c.lastClickAt) : "\u2014"}</div>
              <div className="rep-stat__label">Most recent click</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{c.firstClickAt ? formatAbsoluteTime(c.firstClickAt) : "\u2014"}</div>
              <div className="rep-stat__label">Tracking since</div>
            </div>
          </div>

          {/* Top dates */}
          <section className="rep-section">
            <h2 className="rep-h2">Top dates by click count</h2>
            <p className="rep-sub">Future dates only, ranked by interest. This is the demand signal.</p>
            {(clicks?.topDates || []).length === 0 ? <p className="rep-empty-small">No future-date clicks yet.</p> : (
              <ol className="rep-toplist">
                {clicks.topDates.map((row, i) => {
                  const active = analyticsFilter?.type === "date" && analyticsFilter?.value === row.clicked_date;
                  return (
                    <li key={row.clicked_date} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => applyAnalyticsFilter("date", row.clicked_date, `Date: ${formatLongDate(row.clicked_date)}`)}>
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

          {/* Day of week */}
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

          {/* Heatmap */}
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
                      const firstReal = cells.find((c) => c !== null);
                      const startDow = firstReal ? firstReal.dow : 1;
                      const monStartBlanks = (startDow + 6) % 7;
                      const stripped = cells.filter((c) => c !== null);
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

          {/* Recent clicks */}
          <section className="rep-section">
            <h2 className="rep-h2">Recent activity</h2>
            <p className="rep-sub">Last 50 date clicks.</p>
            {analyticsFilter?.type === "date" && (
              <div className="breakdown-filter-bar">
                <span className="breakdown-filter-bar__label">Filtered by: <strong>{analyticsFilter.label}</strong> ({filteredRecentClicks.length} of {(clicks?.recent || []).length})</span>
                <button className="breakdown-filter-bar__clear" onClick={() => setAnalyticsFilter(null)}>{"\u2715"} Clear filter</button>
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
                        <td>{formatLongDate(row.clicked_date)}</td>
                        <td className="rep-table__ref">{row.referrer || "\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <hr style={{ border: "none", borderTop: "1px solid rgba(44,24,16,0.1)", margin: "32px 0" }} />
          <h2 className="rep-h2" style={{ marginBottom: "16px" }}>Events</h2>
          {/* Event type breakdown */}
          <section className="rep-section" style={{ marginTop: "12px" }}>
            <h2 className="rep-h2">Events by type</h2>
            <p className="rep-sub">Total count for each event type tracked.</p>
            {(tracking?.eventTypes || []).length === 0 ? <p className="rep-empty-small">No events yet.</p> : (
              <ol className="rep-toplist">
                {tracking.eventTypes.map((row, i) => {
                  const active = analyticsFilter?.type === "event_type" && analyticsFilter?.value === row.event_type;
                  return (
                    <li key={row.event_type} className={`rep-toprow rep-toprow--compact rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => applyAnalyticsFilter("event_type", row.event_type, `Event: ${EVENT_TYPE_LABELS[row.event_type] || row.event_type}`)}>
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

          {/* Top CTAs full list */}
          <section className="rep-section">
            <h2 className="rep-h2">CTA clicks</h2>
            <p className="rep-sub">Which buttons are getting clicked, and on which pages. Click a count to filter recent events.</p>
            {(tracking?.topCTAs || []).length === 0 ? <p className="rep-empty-small">No CTA clicks yet.</p> : (
              <ol className="rep-toplist">
                {tracking.topCTAs.map((row, i) => {
                  const active = analyticsFilter?.type === "cta" && analyticsFilter?.value === row.cta_id;
                  return (
                    <li key={`${row.cta_id}-${row.page_url}`} className={`rep-toprow rep-toprow--clickable${active ? " rep-toprow--active" : ""}`}
                        onClick={() => applyAnalyticsFilter("cta", row.cta_id, `CTA: ${row.cta_id}`)}>
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

          {/* Recent events table */}
          <section className="rep-section">
            <h2 className="rep-h2">Recent events</h2>
            <p className="rep-sub">Last 50 events across the site.</p>
            {analyticsFilter && (analyticsFilter.type === "event_type" || analyticsFilter.type === "page" || analyticsFilter.type === "cta") && (
              <div className="breakdown-filter-bar">
                <span className="breakdown-filter-bar__label">Filtered by: <strong>{analyticsFilter.label}</strong> ({filteredRecentEvents.length} of {(tracking?.recentEvents || []).length})</span>
                <button className="breakdown-filter-bar__clear" onClick={() => setAnalyticsFilter(null)}>{"\u2715"} Clear filter</button>
              </div>
            )}
            {filteredRecentEvents.length === 0 ? <p className="rep-empty-small">{analyticsFilter ? "No matching events in recent data." : "No events logged yet."}</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead><tr><th>When</th><th>Type</th><th>Page</th><th>Detail</th></tr></thead>
                  <tbody>
                    {filteredRecentEvents.map((row, i) => (
                      <tr key={i}>
                        <td>{formatRelativeTime(row.created_at)}</td>
                        <td>
                          <span className={`rep-event-badge rep-event-badge--${row.event_type.split("_")[0]}`}>
                            {EVENT_TYPE_LABELS[row.event_type] || row.event_type}
                          </span>
                        </td>
                        <td className="rep-table__ref">{shortenUrl(row.page_url)}</td>
                        <td className="rep-table__ref">{eventSummary(row.event_type, row.event_data)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══════ FULL-PAGE LEAD PROFILE ═══════ */}
      {selectedLead && (
        <LeadProfile
          lead={selectedLead}
          activeLeadType={activeLeadType}
          journey={journey}
          journeyLoading={journeyLoading}
          showFullJourney={showFullJourney}
          setShowFullJourney={setShowFullJourney}
          onBack={() => setSelectedLead(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}
