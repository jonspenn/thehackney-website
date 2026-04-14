import { useEffect, useMemo, useState } from "react";

/**
 * Combined internal dashboard for /admin/.
 * Fetches both /api/tracking-stats and /api/click-stats in parallel,
 * renders all data in a single tabbed view.
 *
 * Protected by Cloudflare Access (zero trust).
 */

/* ───────── constants ───────── */

const FORM_TYPE_LABELS = {
  "wedding-quiz": "Wedding Questionnaire",
  "corporate-quiz": "Corporate Questionnaire",
  "brochure-download": "Brochure Download",
  "brochure-wedding": "Wedding Brochure",
  "brochure-corporate": "Corporate Brochure",
  "brochure-private-events": "Private Events Brochure",
  "brochure-supper-club": "Supper Club Brochure",
  "supperclub-signup": "Supper Club Signup",
};

const BROCHURE_TYPE_LABELS = {
  wedding: "Wedding",
  corporate: "Corporate",
  "private-events": "Private Events",
  "supper-club": "Supper Club",
};

const LEAD_TYPE_LABELS = {
  wedding: "Wedding",
  corporate: "Corporate",
  supperclub: "Supper Club",
  "private-events": "Private Events",
};

const URGENCY_LABELS = {
  asap: "Need to move fast",
  ready: "Ready to book",
  comparing: "Comparing venues",
  browsing: "Just looking",
};

const BUDGET_LABELS = {
  "under-5k": "Under \u00A35K",
  "5k-10k": "\u00A35K - \u00A310K",
  "10k-20k": "\u00A310K - \u00A320K",
  "20k-plus": "\u00A320K+",
};

const EVENT_TYPE_DISPLAY = {
  "photo-film": "Photo/Film Shoot",
  "team-building": "Team Building",
  conference: "Conference",
  meeting: "Meeting",
  "product-launch": "Product Launch",
  "christmas-party": "Christmas Party",
  "summer-party": "Summer Party",
  other: "Other",
};

/* Build a human-readable detail summary from submission row's proper columns */
function submissionDetails(row) {
  const parts = [];
  // Use proper columns returned by contact-stats.js
  if (row.event_type) {
    parts.push(EVENT_TYPE_DISPLAY[row.event_type] || row.event_type);
  }
  if (row.guest_count) {
    parts.push(`${row.guest_count} guests`);
  }
  if (row.event_date) {
    parts.push(row.event_date);
  }
  if (row.booking_urgency) {
    parts.push(URGENCY_LABELS[row.booking_urgency] || row.booking_urgency);
  }
  if (row.budget) {
    parts.push(BUDGET_LABELS[row.budget] || row.budget);
  }
  if (row.brochure_type) {
    parts.push(`${BROCHURE_TYPE_LABELS[row.brochure_type] || row.brochure_type} brochure`);
  }
  if (row.wedding_year) {
    parts.push(row.wedding_year);
  }
  if (row.company) {
    parts.push(row.company);
  }
  // Fall back to parsing form_data JSON for older records without proper columns
  if (parts.length === 0) {
    const fd = parseEventData(row.form_data);
    if (fd) {
      if (fd.event_type) parts.push(EVENT_TYPE_DISPLAY[fd.event_type] || fd.event_type);
      if (fd.guest_count) parts.push(`${fd.guest_count} guests`);
      if (fd.event_date || fd.wedding_date) parts.push(fd.event_date || fd.wedding_date);
      if (fd.booking_urgency) parts.push(URGENCY_LABELS[fd.booking_urgency] || fd.booking_urgency);
      if (fd.budget) parts.push(BUDGET_LABELS[fd.budget] || fd.budget);
      if (fd.brochure_type) parts.push(`${BROCHURE_TYPE_LABELS[fd.brochure_type] || fd.brochure_type} brochure`);
      if (fd.wedding_year) parts.push(fd.wedding_year);
      if (fd.signup_location) parts.push(fd.signup_location);
    }
  }
  return parts.length > 0 ? parts.join(" \u00B7 ") : "\u2014";
}

/* For brochure downloads, append the brochure type if available */
function formLabel(formType, formData) {
  const base = FORM_TYPE_LABELS[formType] || formType;
  if (formType === "brochure-download" && formData) {
    const fd = parseEventData(formData);
    if (fd?.brochure_type) {
      const bt = BROCHURE_TYPE_LABELS[fd.brochure_type] || fd.brochure_type;
      return `${bt} Brochure`;
    }
  }
  return base;
}

const EVENT_TYPE_LABELS = {
  page_view: "Page views",
  cta_click: "CTA clicks",
  date_check: "Date checks",
  scroll_depth: "Scroll depth",
  questionnaire_start: "Quiz starts",
  questionnaire_step: "Quiz steps",
  questionnaire_complete: "Quiz completions",
  questionnaire_abandon: "Quiz abandons",
  form_submit: "Form submissions",
  brochure_download: "Brochure downloads",
};

const DAY_LABELS_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_LABELS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ───────── helpers ───────── */

function formatRelativeTime(iso) {
  if (!iso) return "";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const then = new Date(safe);
  if (Number.isNaN(then.getTime())) return iso;
  const diffSec = Math.floor((Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatAbsoluteTime(iso) {
  if (!iso) return "\u2014";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatLongDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${DAY_LABELS_FULL[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function shortenUrl(url) {
  if (!url) return "\u2014";
  try {
    const u = new URL(url, "https://thehackney-website.pages.dev");
    return u.pathname;
  } catch {
    return url;
  }
}

function parseEventData(raw) {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

function eventSummary(eventType, eventData) {
  const d = parseEventData(eventData);
  if (!d) return "";
  if (eventType === "cta_click" && d.track_id) return d.track_id;
  if (eventType === "scroll_depth" && d.depth) return `${d.depth}%`;
  if (eventType === "page_view" && d.page_type) return d.page_type;
  return "";
}

/* ───────── heatmap helpers (from click-stats) ───────── */

function buildHeatmapMonths(heatmap) {
  const counts = new Map();
  for (const row of heatmap) counts.set(row.clicked_date, row.click_count);
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const year = monthStart.getUTCFullYear();
    const month = monthStart.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDow = monthStart.getUTCDay();
    const cells = [];
    for (let b = 0; b < firstDow; b++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ iso, day: d, count: counts.get(iso) || 0, dow: new Date(Date.UTC(year, month, d)).getUTCDay() });
    }
    months.push({ label: `${MONTH_LABELS[month]} ${year}`, cells });
  }
  return months;
}

function heatColour(count, max) {
  if (!count || count === 0) return "transparent";
  const ratio = max <= 0 ? 0 : count / max;
  if (ratio > 0.8) return "rgba(46,64,9,0.95)";
  if (ratio > 0.6) return "rgba(46,64,9,0.75)";
  if (ratio > 0.4) return "rgba(46,64,9,0.55)";
  if (ratio > 0.2) return "rgba(46,64,9,0.35)";
  return "rgba(46,64,9,0.18)";
}

function heatTextColour(count, max) {
  if (!count) return "var(--color-brewery-dark)";
  const ratio = max <= 0 ? 0 : count / max;
  return ratio > 0.55 ? "var(--color-warm-canvas)" : "var(--color-brewery-dark)";
}

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
  const [leadSort, setLeadSort] = useState({ field: "created_at", dir: "desc" });

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

  /* ── sorted leads for active lead type (must be above early returns - hooks can't be conditional) ── */
  const currentLeads = leads[activeLeadType];
  const sortedLeads = useMemo(() => {
    if (!currentLeads?.leads) return [];
    const arr = [...currentLeads.leads];
    const { field, dir } = leadSort;
    arr.sort((a, b) => {
      let va = a[field], vb = b[field];
      if (field === "urgency") { va = a.urgency_rank; vb = b.urgency_rank; }
      if (field === "budget") { va = a.budget_rank; vb = b.budget_rank; }
      if (field === "wedding_year") {
        va = a.wedding_year ? parseInt(a.wedding_year, 10) : 9999;
        vb = b.wedding_year ? parseInt(b.wedding_year, 10) : 9999;
      }
      if (va == null) va = dir === "asc" ? "\uffff" : "";
      if (vb == null) vb = dir === "asc" ? "\uffff" : "";
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [currentLeads, leadSort]);

  function toggleSort(field) {
    setLeadSort(prev =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "created_at" ? "desc" : "asc" }
    );
  }

  function sortIndicator(field) {
    if (leadSort.field !== field) return "";
    return leadSort.dir === "asc" ? " \u25B2" : " \u25BC";
  }

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

  const LEAD_TABS = [
    { type: "wedding", label: "Wedding" },
    { type: "corporate", label: "Corporate" },
    { type: "supperclub", label: "Supper Club" },
    { type: "private-events", label: "Private Events" },
    { type: "cafe-bar", label: "Cafe-Bar" },
  ];

  // Total leads across all types for the tab badge
  const totalLeadsCount = LEAD_TABS.reduce((sum, lt) => sum + (leads[lt.type]?.total || 0), 0);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "visitors", label: "Visitors" },
    { id: "contacts", label: "Contacts" },
    { id: "leads", label: `Leads (${totalLeadsCount})` },
    { id: "dates", label: "Date Clicks" },
    { id: "events", label: "Events" },
  ];

  return (
    <div className="rep">
      {/* Tab nav */}
      <div className="adm-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`adm-tab${activeTab === tab.id ? " adm-tab--active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
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
                  {tracking.topPages.slice(0, 10).map((row, i) => (
                    <li key={row.page_url} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{shortenUrl(row.page_url)}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.view_count / topPageMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.view_count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="rep-section" style={{ marginTop: "24px" }}>
              <h2 className="rep-h2">Traffic sources</h2>
              <p className="rep-sub">First-touch UTM source.</p>
              {(tracking?.sources || []).length === 0 ? <p className="rep-empty-small">No source data yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.sources.slice(0, 10).map((row, i) => (
                    <li key={row.source} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{row.source}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.visitor_count / sourceMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.visitor_count}</span>
                    </li>
                  ))}
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
                      <div key={d.device_type} className="rep-device-card">
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
                  {tracking.topCTAs.slice(0, 10).map((row, i) => (
                    <li key={`${row.cta_id}-${row.page_url}`} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">
                        <strong>{row.cta_id || "unknown"}</strong><br />
                        <span style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>{shortenUrl(row.page_url)}</span>
                      </span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topCTAMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.click_count}</span>
                    </li>
                  ))}
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
                {clicks.topDates.slice(0, 5).map((row, i) => (
                  <li key={row.clicked_date} className="rep-toprow">
                    <span className="rep-toprank">{i + 1}</span>
                    <span className="rep-topdate">{formatLongDate(row.clicked_date)}</span>
                    <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topDateMax) * 100}%` }} /></span>
                    <span className="rep-topcount">{row.click_count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}

      {/* ═══════ VISITORS TAB ═══════ */}
      {activeTab === "visitors" && (
        <>
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
            <p className="rep-sub">Most viewed pages by total page_view events.</p>
            {(tracking?.topPages || []).length === 0 ? <p className="rep-empty-small">No page views yet.</p> : (
              <ol className="rep-toplist">
                {tracking.topPages.map((row, i) => (
                  <li key={row.page_url} className="rep-toprow">
                    <span className="rep-toprank">{i + 1}</span>
                    <span className="rep-topdate">{shortenUrl(row.page_url)}</span>
                    <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.view_count / topPageMax) * 100}%` }} /></span>
                    <span className="rep-topcount">{row.view_count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Traffic sources - full list */}
          <div className="rep-two-col">
            <section className="rep-section">
              <h2 className="rep-h2">Traffic sources</h2>
              <p className="rep-sub">First-touch UTM source per visitor.</p>
              {(tracking?.sources || []).length === 0 ? <p className="rep-empty-small">No source data yet.</p> : (
                <ol className="rep-toplist">
                  {tracking.sources.map((row, i) => (
                    <li key={row.source} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{row.source}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.visitor_count / sourceMax) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.visitor_count}</span>
                    </li>
                  ))}
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
                      <div key={d.device_type} className="rep-device-card">
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
            {(tracking?.recentVisitors || []).length === 0 ? <p className="rep-empty-small">No visitors yet.</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr><th>First seen</th><th>Device</th><th>Landing page</th><th>Source</th><th>Sessions</th><th>Pages</th></tr>
                  </thead>
                  <tbody>
                    {tracking.recentVisitors.map((row) => (
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

      {/* ═══════ CONTACTS TAB ═══════ */}
      {activeTab === "contacts" && (
        <>
          {/* KPIs */}
          <div className="rep-totals" style={{ marginBottom: "12px" }}>
            <div className="rep-stat">
              <div className="rep-stat__num">{contacts?.total_contacts || 0}</div>
              <div className="rep-stat__label">Total contacts</div>
            </div>
            <div className="rep-stat">
              <div className="rep-stat__num">{contacts?.total_submissions || 0}</div>
              <div className="rep-stat__label">Total submissions</div>
            </div>
          </div>

          {/* Form type breakdown */}
          <div className="rep-two-col">
            <section className="rep-section" style={{ marginTop: "24px" }}>
              <h2 className="rep-h2">Submissions by form</h2>
              <p className="rep-sub">Which forms are generating leads.</p>
              {(contacts?.form_breakdown || []).length === 0 ? <p className="rep-empty-small">No submissions yet.</p> : (
                <ol className="rep-toplist">
                  {contacts.form_breakdown.map((row, i) => (
                    <li key={row.form_type} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{FORM_TYPE_LABELS[row.form_type] || row.form_type}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (contacts.form_breakdown[0]?.count || 1)) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <section className="rep-section" style={{ marginTop: "24px" }}>
              <h2 className="rep-h2">Contacts by lead type</h2>
              <p className="rep-sub">Wedding, corporate, supper club breakdown.</p>
              {(contacts?.lead_breakdown || []).length === 0 ? <p className="rep-empty-small">No contacts yet.</p> : (
                <ol className="rep-toplist">
                  {contacts.lead_breakdown.map((row, i) => (
                    <li key={row.lead_type} className="rep-toprow rep-toprow--compact">
                      <span className="rep-toprank">{i + 1}</span>
                      <span className="rep-topdate">{LEAD_TYPE_LABELS[row.lead_type] || row.lead_type}</span>
                      <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (contacts.lead_breakdown[0]?.count || 1)) * 100}%` }} /></span>
                      <span className="rep-topcount">{row.count}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          {/* Recent contacts table */}
          <section className="rep-section">
            <h2 className="rep-h2">Recent contacts</h2>
            <p className="rep-sub">Last 50 contacts captured via forms.</p>
            {(contacts?.contacts || []).length === 0 ? <p className="rep-empty-small">No contacts yet. Forms will appear here once submitted.</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr><th>When</th><th>Name</th><th>Email</th><th>Phone</th><th>Type</th><th>Source</th></tr>
                  </thead>
                  <tbody>
                    {contacts.contacts.map((row) => (
                      <tr key={row.contact_id}>
                        <td>{formatRelativeTime(row.created_at)}</td>
                        <td>{[row.first_name, row.last_name].filter(Boolean).join(" ") || "\u2014"}</td>
                        <td>{row.email}</td>
                        <td>{row.phone || "\u2014"}</td>
                        <td>
                          <span className={`rep-event-badge rep-event-badge--${row.lead_type || "unknown"}`}>
                            {LEAD_TYPE_LABELS[row.lead_type] || row.lead_type || "\u2014"}
                          </span>
                        </td>
                        <td className="rep-table__ref">{row.source_channel || "Direct"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Recent submissions table */}
          <section className="rep-section">
            <h2 className="rep-h2">Recent submissions</h2>
            <p className="rep-sub">Last 50 form submissions (includes repeat contacts).</p>
            {(contacts?.submissions || []).length === 0 ? <p className="rep-empty-small">No submissions yet.</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead>
                    <tr><th>When</th><th>Form</th><th>Name</th><th>Email</th><th>Data</th></tr>
                  </thead>
                  <tbody>
                    {contacts.submissions.map((row) => (
                        <tr key={row.submission_id}>
                          <td>{formatRelativeTime(row.created_at)}</td>
                          <td>
                            <span className={`rep-event-badge rep-event-badge--${row.form_type?.split("-")[0] || "form"}`}>
                              {formLabel(row.form_type, row.form_data)}
                            </span>
                          </td>
                          <td>{row.first_name || "\u2014"}</td>
                          <td>{row.email || "\u2014"}</td>
                          <td>{submissionDetails(row)}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══════ LEADS TAB (all revenue streams) ═══════ */}
      {activeTab === "leads" && (
        <>
          {/* Lead type sub-tabs */}
          <div className="adm-subtabs">
            {LEAD_TABS.map((lt) => (
              <button
                key={lt.type}
                className={`adm-subtab${activeLeadType === lt.type ? " adm-subtab--active" : ""}`}
                onClick={() => { setActiveLeadType(lt.type); setLeadSort({ field: "created_at", dir: "desc" }); }}
                type="button"
              >
                {lt.label}
                {(leads[lt.type]?.total || 0) > 0 && (
                  <span className="adm-subtab__count">{leads[lt.type].total}</span>
                )}
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div className="rep-totals" style={{ marginBottom: "12px" }}>
            <div className="rep-stat">
              <div className="rep-stat__num">{currentLeads?.total || 0}</div>
              <div className="rep-stat__label">Total {currentLeads?.lead_type_label || activeLeadType} leads</div>
            </div>
            {currentLeads?.summary?.cross_sell_count > 0 && (
              <div className="rep-stat rep-stat--today">
                <div className="rep-stat__num">{currentLeads.summary.cross_sell_count}</div>
                <div className="rep-stat__label">Also interested in other services</div>
              </div>
            )}
            {activeLeadType === "wedding" && (currentLeads?.summary?.by_urgency || []).filter(u => u.label === "Ready to book" || u.label === "Need to move fast").map(u => (
              <div key={u.label} className="rep-stat rep-stat--today">
                <div className="rep-stat__num">{u.count}</div>
                <div className="rep-stat__label">{u.label}</div>
              </div>
            ))}
          </div>

          {/* ── Pipeline funnel ── */}
          {currentLeads?.summary?.pipeline && (
            <div className="rep-pipeline" style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px", flexWrap: "wrap" }}>
              <div className="rep-pipeline__stage">
                <div className="rep-stat__num">{currentLeads.summary.pipeline.total_leads}</div>
                <div className="rep-stat__label">Leads</div>
              </div>
              <span style={{ fontSize: "18px", color: "#8C472E" }}>&rarr;</span>
              <div className="rep-pipeline__stage">
                <div className="rep-stat__num">{currentLeads.summary.pipeline.clicked_venue_tour}</div>
                <div className="rep-stat__label">Clicked tour</div>
              </div>
              <span style={{ fontSize: "18px", color: "#8C472E" }}>&rarr;</span>
              <div className="rep-pipeline__stage">
                <div className="rep-stat__num">{currentLeads.summary.pipeline.clicked_discovery_call}</div>
                <div className="rep-stat__label">Clicked call</div>
              </div>
              <span style={{ fontSize: "14px", color: "#999", marginLeft: "12px" }}>
                {currentLeads.summary.pipeline.no_action} no action yet
              </span>
            </div>
          )}

          {/* ── Wedding summaries ── */}
          {activeLeadType === "wedding" && (
            <>
              <div className="rep-two-col">
                <section className="rep-section" style={{ marginTop: "24px" }}>
                  <h2 className="rep-h2">By urgency</h2>
                  {(currentLeads?.summary?.by_urgency || []).length === 0 ? <p className="rep-empty-small">No data yet.</p> : (
                    <ol className="rep-toplist">
                      {currentLeads.summary.by_urgency.map((row, i) => (
                        <li key={row.label} className="rep-toprow rep-toprow--compact">
                          <span className="rep-toprank">{i + 1}</span>
                          <span className="rep-topdate">{row.label}</span>
                          <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (currentLeads.summary.by_urgency[0]?.count || 1)) * 100}%` }} /></span>
                          <span className="rep-topcount">{row.count}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="rep-section" style={{ marginTop: "24px" }}>
                  <h2 className="rep-h2">By budget</h2>
                  {(currentLeads?.summary?.by_budget || []).length === 0 ? <p className="rep-empty-small">No data yet.</p> : (
                    <ol className="rep-toplist">
                      {currentLeads.summary.by_budget.map((row, i) => (
                        <li key={row.label} className="rep-toprow rep-toprow--compact">
                          <span className="rep-toprank">{i + 1}</span>
                          <span className="rep-topdate">{row.label}</span>
                          <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (currentLeads.summary.by_budget[0]?.count || 1)) * 100}%` }} /></span>
                          <span className="rep-topcount">{row.count}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
              <div className="rep-two-col">
                <section className="rep-section">
                  <h2 className="rep-h2">By wedding year</h2>
                  {(currentLeads?.summary?.by_year || []).length === 0 ? <p className="rep-empty-small">No data yet.</p> : (
                    <ol className="rep-toplist">
                      {currentLeads.summary.by_year.map((row, i) => (
                        <li key={row.label} className="rep-toprow rep-toprow--compact">
                          <span className="rep-toprank">{i + 1}</span>
                          <span className="rep-topdate">{row.label}</span>
                          <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (currentLeads.summary.by_year[0]?.count || 1)) * 100}%` }} /></span>
                          <span className="rep-topcount">{row.count}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="rep-section" />
              </div>
            </>
          )}

          {/* ── Corporate summaries ── */}
          {activeLeadType === "corporate" && (
            <div className="rep-two-col">
              <section className="rep-section" style={{ marginTop: "24px" }}>
                <h2 className="rep-h2">By event type</h2>
                {(currentLeads?.summary?.by_event_type || []).length === 0 ? <p className="rep-empty-small">No data yet.</p> : (
                  <ol className="rep-toplist">
                    {currentLeads.summary.by_event_type.map((row, i) => (
                      <li key={row.label} className="rep-toprow rep-toprow--compact">
                        <span className="rep-toprank">{i + 1}</span>
                        <span className="rep-topdate">{row.label}</span>
                        <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (currentLeads.summary.by_event_type[0]?.count || 1)) * 100}%` }} /></span>
                        <span className="rep-topcount">{row.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
              <section className="rep-section" style={{ marginTop: "24px" }}>
                <h2 className="rep-h2">By guest count</h2>
                {(currentLeads?.summary?.by_guest_count || []).length === 0 ? <p className="rep-empty-small">No data yet.</p> : (
                  <ol className="rep-toplist">
                    {currentLeads.summary.by_guest_count.map((row, i) => (
                      <li key={row.label} className="rep-toprow rep-toprow--compact">
                        <span className="rep-toprank">{i + 1}</span>
                        <span className="rep-topdate">{row.label}</span>
                        <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.count / (currentLeads.summary.by_guest_count[0]?.count || 1)) * 100}%` }} /></span>
                        <span className="rep-topcount">{row.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          )}

          {/* ── Leads table (adapts columns per type) ── */}
          <section className="rep-section">
            <h2 className="rep-h2">All {currentLeads?.lead_type_label || activeLeadType} leads</h2>
            <p className="rep-sub">Click column headers to sort. Cross-sell badges show interest in other services.</p>
            {sortedLeads.length === 0 ? (
              <p className="rep-empty-small">No {currentLeads?.lead_type_label?.toLowerCase() || activeLeadType} leads yet. Form submissions will appear here.</p>
            ) : (
              <div className="rep-table-wrap">
                <table className="rep-table rep-table--sortable">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort("created_at")} style={{ cursor: "pointer" }}>When{sortIndicator("created_at")}</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      {activeLeadType === "corporate" && <th>Company</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("wedding_year")} style={{ cursor: "pointer" }}>Year{sortIndicator("wedding_year")}</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("wedding_month")} style={{ cursor: "pointer" }}>Month{sortIndicator("wedding_month")}</th>}
                      {(activeLeadType === "corporate") && <th onClick={() => toggleSort("event_type")} style={{ cursor: "pointer" }}>Event type{sortIndicator("event_type")}</th>}
                      {(activeLeadType === "corporate" || activeLeadType === "wedding") && <th onClick={() => toggleSort("guest_count")} style={{ cursor: "pointer" }}>Guests{sortIndicator("guest_count")}</th>}
                      {activeLeadType === "corporate" && <th onClick={() => toggleSort("event_date")} style={{ cursor: "pointer" }}>Date{sortIndicator("event_date")}</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("urgency")} style={{ cursor: "pointer" }}>Urgency{sortIndicator("urgency")}</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("budget")} style={{ cursor: "pointer" }}>Budget{sortIndicator("budget")}</th>}
                      <th>Source</th>
                      <th>Last source</th>
                      <th>Ad platform</th>
                      <th>Location</th>
                      <th>Device</th>
                      <th onClick={() => toggleSort("sessions_before_conversion")} style={{ cursor: "pointer" }}>Sessions{sortIndicator("sessions_before_conversion")}</th>
                      <th onClick={() => toggleSort("total_page_views")} style={{ cursor: "pointer" }}>Pages{sortIndicator("total_page_views")}</th>
                      <th>First seen</th>
                      <th>Landing page</th>
                      <th>Intent</th>
                      <th>Also interested in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeads.map((lead) => (
                      <tr key={lead.contact_id} className={lead.urgency_rank <= 2 ? "rep-row--hot" : ""}>
                        <td>{formatRelativeTime(lead.created_at)}</td>
                        <td>{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "\u2014"}</td>
                        <td>{lead.email}</td>
                        <td>{lead.phone || "\u2014"}</td>
                        {activeLeadType === "corporate" && <td>{lead.company || "\u2014"}</td>}
                        {activeLeadType === "wedding" && <td>{lead.wedding_year || "\u2014"}</td>}
                        {activeLeadType === "wedding" && <td>{lead.wedding_month || "\u2014"}</td>}
                        {activeLeadType === "corporate" && (
                          <td>{lead.event_type_label || "\u2014"}</td>
                        )}
                        {(activeLeadType === "corporate" || activeLeadType === "wedding") && <td>{lead.guest_count || "\u2014"}</td>}
                        {activeLeadType === "corporate" && <td>{lead.event_date || "\u2014"}</td>}
                        {activeLeadType === "wedding" && (
                          <td>
                            {lead.urgency_label ? (
                              <span className={`rep-urgency rep-urgency--${lead.urgency || "unknown"}`}>
                                {lead.urgency_label}
                              </span>
                            ) : "\u2014"}
                          </td>
                        )}
                        {activeLeadType === "wedding" && (
                          <td>
                            {lead.budget_label ? (
                              <span className={`rep-budget rep-budget--${lead.budget || "unknown"}`}>
                                {lead.budget_label}
                              </span>
                            ) : "\u2014"}
                          </td>
                        )}
                        <td className="rep-table__ref">{lead.source_channel || "Direct"}</td>
                        <td className="rep-table__ref">{lead.latest_source || "\u2014"}</td>
                        <td>{lead.ad_platform || "\u2014"}</td>
                        <td>{[lead.ip_city, lead.ip_country].filter(Boolean).join(", ") || "\u2014"}</td>
                        <td>{lead.device_type || "\u2014"}</td>
                        <td>{lead.sessions_before_conversion != null ? lead.sessions_before_conversion : "\u2014"}</td>
                        <td>{lead.total_page_views != null ? `${lead.total_page_views} (${lead.avg_page_views_per_session || "\u2014"}/s)` : "\u2014"}</td>
                        <td>{lead.first_seen_at ? formatRelativeTime(lead.first_seen_at) : "\u2014"}</td>
                        <td className="rep-table__ref">{lead.first_landing_page || "\u2014"}</td>
                        <td>
                          {lead.booking_intent === "venue-tour" ? (
                            <span className="rep-cross-sell__badge" style={{ background: "#2E4009", color: "#fff" }}>Tour</span>
                          ) : lead.booking_intent === "discovery-call" ? (
                            <span className="rep-cross-sell__badge" style={{ background: "#49590E", color: "#fff" }}>Call</span>
                          ) : "\u2014"}
                        </td>
                        <td>
                          {lead.cross_sell_labels?.length > 0 ? (
                            <span className="rep-cross-sell">
                              {lead.cross_sell_labels.map(label => (
                                <span key={label} className="rep-cross-sell__badge">{label}</span>
                              ))}
                            </span>
                          ) : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ═══════ DATE CLICKS TAB ═══════ */}
      {activeTab === "dates" && (
        <>
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
                {clicks.topDates.map((row, i) => (
                  <li key={row.clicked_date} className="rep-toprow">
                    <span className="rep-toprank">{i + 1}</span>
                    <span className="rep-topdate">{formatLongDate(row.clicked_date)}</span>
                    <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topDateMax) * 100}%` }} /></span>
                    <span className="rep-topcount">{row.click_count}</span>
                  </li>
                ))}
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
            {(clicks?.recent || []).length === 0 ? <p className="rep-empty-small">No clicks logged yet.</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead><tr><th>When</th><th>Date clicked</th><th>Came from</th></tr></thead>
                  <tbody>
                    {clicks.recent.map((row, i) => (
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
        </>
      )}

      {/* ═══════ EVENTS TAB ═══════ */}
      {activeTab === "events" && (
        <>
          {/* Event type breakdown */}
          <section className="rep-section" style={{ marginTop: "12px" }}>
            <h2 className="rep-h2">Events by type</h2>
            <p className="rep-sub">Total count for each event type tracked.</p>
            {(tracking?.eventTypes || []).length === 0 ? <p className="rep-empty-small">No events yet.</p> : (
              <ol className="rep-toplist">
                {tracking.eventTypes.map((row, i) => (
                  <li key={row.event_type} className="rep-toprow rep-toprow--compact">
                    <span className="rep-toprank">{i + 1}</span>
                    <span className="rep-topdate">{EVENT_TYPE_LABELS[row.event_type] || row.event_type}</span>
                    <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.event_count / eventTypeMax) * 100}%` }} /></span>
                    <span className="rep-topcount">{row.event_count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Top CTAs full list */}
          <section className="rep-section">
            <h2 className="rep-h2">CTA clicks</h2>
            <p className="rep-sub">Which buttons are getting clicked, and on which pages.</p>
            {(tracking?.topCTAs || []).length === 0 ? <p className="rep-empty-small">No CTA clicks yet.</p> : (
              <ol className="rep-toplist">
                {tracking.topCTAs.map((row, i) => (
                  <li key={`${row.cta_id}-${row.page_url}`} className="rep-toprow">
                    <span className="rep-toprank">{i + 1}</span>
                    <span className="rep-topdate">
                      <strong>{row.cta_id || "unknown"}</strong><br />
                      <span style={{ fontSize: "12px", color: "rgba(44,24,16,0.5)" }}>{shortenUrl(row.page_url)}</span>
                    </span>
                    <span className="rep-topbar"><span className="rep-topbar__fill" style={{ width: `${(row.click_count / topCTAMax) * 100}%` }} /></span>
                    <span className="rep-topcount">{row.click_count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Recent events table */}
          <section className="rep-section">
            <h2 className="rep-h2">Recent events</h2>
            <p className="rep-sub">Last 50 events across the site.</p>
            {(tracking?.recentEvents || []).length === 0 ? <p className="rep-empty-small">No events logged yet.</p> : (
              <div className="rep-table-wrap">
                <table className="rep-table">
                  <thead><tr><th>When</th><th>Type</th><th>Page</th><th>Detail</th></tr></thead>
                  <tbody>
                    {tracking.recentEvents.map((row, i) => (
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
    </div>
  );
}
