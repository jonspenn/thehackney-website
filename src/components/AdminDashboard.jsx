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
  exploring: "Exploring options",
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

/* Journey event labels (friendly names for the timeline) */
const JOURNEY_EVENT_LABELS = {
  page_view: "Viewed",
  cta_click: "Clicked CTA",
  date_check: "Checked date",
  scroll_depth: "Scrolled",
  questionnaire_start: "Started questionnaire",
  questionnaire_step: "Questionnaire step",
  questionnaire_complete: "Completed questionnaire",
  questionnaire_abandon: "Left questionnaire",
  form_submit: "Submitted form",
  brochure_download: "Downloaded brochure",
};

function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function formatTime(iso) {
  if (!iso) return "";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

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

/* ───────── lead scoring ───────── */

/**
 * Lead scoring: 0-100 points across 5 dimensions.
 * Computed client-side from existing lead data - no API changes needed.
 *
 * Stage (0-40): Brochure 10 → Quiz 25 → Call 35 → Tour 40
 * Recency (0-25): days since last activity
 * Engagement (0-15): sessions + page views + multiple submissions
 * Date proximity (0-10): months until event date
 * Revenue potential (0-10): budget + guest count
 *
 * Tiers: Hot (60+), Warm (35-59), Cool (15-34), Cold (0-14)
 * "Dead" override: no activity beyond type-specific threshold + low stage
 */

const DEAD_DAYS = { wedding: 21, corporate: 14, supperclub: 10, "private-events": 10, "cafe-bar": 10 };

const TIER_CONFIG = {
  hot:  { label: "Hot",  color: "#8C472E", bg: "rgba(140,71,46,0.08)", border: "#8C472E" },
  warm: { label: "Warm", color: "#BF7256", bg: "rgba(191,114,86,0.06)", border: "#BF7256" },
  cool: { label: "Cool", color: "#2E4009", bg: "rgba(46,64,9,0.05)",   border: "#2E4009" },
  cold: { label: "Cold", color: "rgba(44,24,16,0.35)", bg: "transparent", border: "rgba(44,24,16,0.15)" },
};

const STAGE_SEQUENCE = ["Brochure", "Quiz", "Call", "Tour"];

function computeLeadScore(lead, leadType) {
  const now = Date.now();

  /* 1. Stage (0-40) */
  let stage = 10, stageLabel = "Brochure";
  if (lead.clicked_venue_tour_at)       { stage = 40; stageLabel = "Tour"; }
  else if (lead.clicked_discovery_call_at) { stage = 35; stageLabel = "Call"; }
  else if (lead.form_types?.some(ft => ft.includes("quiz"))) { stage = 25; stageLabel = "Quiz"; }

  /* 2. Recency (0-25) */
  let recency = 0, daysSinceActivity = 999;
  const lastAct = lead.last_seen_at || lead.created_at;
  if (lastAct) {
    const safe = lastAct.includes("T") ? lastAct : lastAct.replace(" ", "T") + "Z";
    const d = new Date(safe);
    if (!Number.isNaN(d.getTime())) {
      daysSinceActivity = Math.max(0, Math.floor((now - d.getTime()) / 86400000));
      if (daysSinceActivity <= 1) recency = 25;
      else if (daysSinceActivity <= 3) recency = 20;
      else if (daysSinceActivity <= 7) recency = 15;
      else if (daysSinceActivity <= 14) recency = 10;
      else if (daysSinceActivity <= 21) recency = 5;
      else if (daysSinceActivity <= 30) recency = 2;
    }
  }

  /* 3. Engagement (0-15) */
  const sessions = lead.sessions_before_conversion || 0;
  const pages = lead.total_page_views || 0;
  let engagement = Math.min(sessions, 5) + Math.min(Math.floor(pages / 3), 5);
  if (lead.submissions_count > 1) engagement += 5;
  engagement = Math.min(engagement, 15);

  /* 4. Date proximity (0-10) */
  let dateProximity = 3; // neutral when unknown
  if (lead.event_date) {
    const MONTH_MAP = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11, jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const parts = lead.event_date.split(" ");
    if (parts.length === 2) {
      const m = MONTH_MAP[parts[0].toLowerCase()];
      const y = parseInt(parts[1], 10);
      if (m != null && y) {
        const months = ((y * 12 + m) - (new Date().getFullYear() * 12 + new Date().getMonth()));
        if (months <= 3) dateProximity = 10;
        else if (months <= 6) dateProximity = 8;
        else if (months <= 12) dateProximity = 5;
        else if (months <= 18) dateProximity = 3;
        else dateProximity = 1;
      }
    }
  }

  /* 5. Revenue potential (0-10) */
  const BUDGET_SCORE = { "20k-plus": 5, "10k-20k": 4, "5k-10k": 2, "under-5k": 1 };
  let revBudget = BUDGET_SCORE[lead.budget] || 2;
  let revGuests = 2;
  if (lead.guest_count) {
    const gMatch = lead.guest_count.match(/(\d+)/);
    if (gMatch) {
      const g = parseInt(gMatch[1], 10);
      if (g >= 80) revGuests = 5; else if (g >= 60) revGuests = 4;
      else if (g >= 40) revGuests = 3; else if (g >= 20) revGuests = 2;
      else revGuests = 1;
    }
  }
  const revenue = Math.min(revBudget + revGuests, 10);

  const score = stage + recency + engagement + dateProximity + revenue;

  /* Tier assignment */
  let tier;
  if (score >= 60) tier = "hot";
  else if (score >= 35) tier = "warm";
  else if (score >= 15) tier = "cool";
  else tier = "cold";

  /* Dead override: no recent activity + early stage */
  const deadDays = DEAD_DAYS[leadType] || 21;
  const isDead = daysSinceActivity > deadDays && stage <= 25;
  if (isDead) tier = "cold";

  return {
    score, tier, stageLabel, isDead, daysSinceActivity,
    breakdown: { stage, recency, engagement, dateProximity, revenue },
  };
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
  const [leadSort, setLeadSort] = useState({ field: "score", dir: "desc" });
  const [heatFilter, setHeatFilter] = useState("all"); // "all" | "hot" | "warm" | "cool" | "cold"
  const [breakdownFilter, setBreakdownFilter] = useState(null); // { field, value, label } or null
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSearchDraft, setLeadSearchDraft] = useState("");
  const [analyticsFilter, setAnalyticsFilter] = useState(null); // { type, value, label } or null
  const [selectedLead, setSelectedLead] = useState(null); // lead object for profile panel
  const [journey, setJourney] = useState(null); // journey data for selected lead
  const [journeyLoading, setJourneyLoading] = useState(false);

  function selectLead(lead) {
    setSelectedLead(lead);
    setJourney(null);
    if (lead?.contact_id) {
      setJourneyLoading(true);
      fetch(`/api/lead-journey?contact_id=${encodeURIComponent(lead.contact_id)}`, { cache: "no-store" })
        .then(r => r.json())
        .then(data => { if (data.ok) setJourney(data); })
        .catch(() => {})
        .finally(() => setJourneyLoading(false));
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

  /* ── scored + sorted leads for active lead type ── */
  const currentLeads = leads[activeLeadType];
  const scoredLeads = useMemo(() => {
    if (!currentLeads?.leads) return [];
    return currentLeads.leads.map(lead => ({
      ...lead,
      _score: computeLeadScore(lead, activeLeadType),
    }));
  }, [currentLeads, activeLeadType]);

  const heatCounts = useMemo(() => {
    const counts = { hot: 0, warm: 0, cool: 0, cold: 0 };
    for (const l of scoredLeads) counts[l._score.tier]++;
    return counts;
  }, [scoredLeads]);

  const sortedLeads = useMemo(() => {
    let arr = [...scoredLeads];
    if (heatFilter !== "all") arr = arr.filter(l => l._score.tier === heatFilter);
    if (breakdownFilter) {
      arr = arr.filter(l => {
        if (breakdownFilter.field === "_cross_sell") return l.cross_sell_labels?.length > 0;
        const val = l[breakdownFilter.field] || (breakdownFilter.field === "budget_label" ? "Not provided" : "Unknown");
        return val === breakdownFilter.value;
      });
    }
    if (leadSearch.trim()) {
      const q = leadSearch.trim().toLowerCase();
      arr = arr.filter(l => {
        const name = [l.first_name, l.last_name].filter(Boolean).join(" ").toLowerCase();
        const email = (l.email || "").toLowerCase();
        const phone = (l.phone || "").toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q);
      });
    }
    const { field, dir } = leadSort;
    arr.sort((a, b) => {
      let va = a[field], vb = b[field];
      if (field === "score") { va = a._score.score; vb = b._score.score; }
      if (field === "urgency") { va = a.urgency_rank; vb = b.urgency_rank; }
      if (field === "budget") { va = a.budget_rank; vb = b.budget_rank; }
      if (field === "event_date") {
        const MONTH_ORDER = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, january: 0, february: 1, march: 2, april: 3, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
        const parseDate = (d) => { if (!d) return 99999; const p = d.split(" "); const y = parseInt(p[1], 10) || 9999; const m = MONTH_ORDER[(p[0] || "").toLowerCase()] ?? 99; return y * 100 + m; };
        va = parseDate(a.event_date);
        vb = parseDate(b.event_date);
      }
      if (va == null) va = dir === "asc" ? "\uffff" : "";
      if (vb == null) vb = dir === "asc" ? "\uffff" : "";
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [scoredLeads, leadSort, heatFilter, breakdownFilter, leadSearch]);

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
    { id: "leads", label: `Leads (${totalLeadsCount})` },
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

      {/* ═══════ LEADS TAB (all revenue streams) ═══════ */}
      {activeTab === "leads" && !selectedLead && (
        <>
          {/* ── Leads control panel (sub-tabs + filters as one component) ── */}
          <div className="lead-panel">
            {/* Lead type sub-tabs */}
            <div className="lead-panel__tabs">
              {LEAD_TABS.map((lt) => (
                <button
                  key={lt.type}
                  className={`adm-subtab${activeLeadType === lt.type ? " adm-subtab--active" : ""}`}
                  onClick={() => { setActiveLeadType(lt.type); setLeadSort({ field: "score", dir: "desc" }); setHeatFilter("all"); setBreakdownFilter(null); setLeadSearch(""); setLeadSearchDraft(""); }}
                  type="button"
                >
                  {lt.label}
                  {(leads[lt.type]?.total || 0) > 0 && (
                    <span className="adm-subtab__count">{leads[lt.type].total}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="lead-panel__divider" />

            {/* Filter / Sort / Search */}
            <div className="lead-panel__filters">
            <form className="lead-toolbar__search" onSubmit={(e) => { e.preventDefault(); setLeadSearch(leadSearchDraft.trim()); }}>
              <input
                type="text"
                className="lead-toolbar__input"
                placeholder="Search name, email, or phone\u2026"
                value={leadSearchDraft}
                onChange={(e) => setLeadSearchDraft(e.target.value)}
              />
              <button className="lead-toolbar__search-btn" type="submit">Search</button>
            </form>
            <div className="lead-toolbar__filters">
              {/* Heat tier */}
              <select className="lead-toolbar__select" value={heatFilter} onChange={(e) => setHeatFilter(e.target.value)}>
                <option value="all">All tiers ({scoredLeads.length})</option>
                {["hot", "warm", "cool", "cold"].map(tier => (
                  <option key={tier} value={tier}>{TIER_CONFIG[tier].label} ({heatCounts[tier]})</option>
                ))}
              </select>
              {/* Urgency - wedding only */}
              {activeLeadType === "wedding" && (currentLeads?.summary?.by_urgency || []).length > 0 && (
                <select className="lead-toolbar__select"
                  value={breakdownFilter?.field === "urgency_label" ? breakdownFilter.value : ""}
                  onChange={(e) => setBreakdownFilter(e.target.value ? { field: "urgency_label", value: e.target.value, label: `Urgency: ${e.target.value}` } : null)}>
                  <option value="">All urgencies</option>
                  {currentLeads.summary.by_urgency.map(row => (
                    <option key={row.label} value={row.label}>{row.label} ({row.count})</option>
                  ))}
                </select>
              )}
              {/* Budget - wedding only */}
              {activeLeadType === "wedding" && (currentLeads?.summary?.by_budget || []).length > 0 && (
                <select className="lead-toolbar__select"
                  value={breakdownFilter?.field === "budget_label" ? breakdownFilter.value : ""}
                  onChange={(e) => setBreakdownFilter(e.target.value ? { field: "budget_label", value: e.target.value, label: `Budget: ${e.target.value}` } : null)}>
                  <option value="">All budgets</option>
                  {currentLeads.summary.by_budget.map(row => (
                    <option key={row.label} value={row.label}>{row.label} ({row.count})</option>
                  ))}
                </select>
              )}
              {/* Wedding year */}
              {activeLeadType === "wedding" && (currentLeads?.summary?.by_year || []).length > 0 && (
                <select className="lead-toolbar__select"
                  value={breakdownFilter?.field === "wedding_year" ? breakdownFilter.value : ""}
                  onChange={(e) => setBreakdownFilter(e.target.value ? { field: "wedding_year", value: e.target.value, label: `Year: ${e.target.value}` } : null)}>
                  <option value="">All years</option>
                  {currentLeads.summary.by_year.map(row => (
                    <option key={row.label} value={row.label}>{row.label} ({row.count})</option>
                  ))}
                </select>
              )}
              {/* Event type - corporate only */}
              {activeLeadType === "corporate" && (currentLeads?.summary?.by_event_type || []).length > 0 && (
                <select className="lead-toolbar__select"
                  value={breakdownFilter?.field === "event_type_label" ? breakdownFilter.value : ""}
                  onChange={(e) => setBreakdownFilter(e.target.value ? { field: "event_type_label", value: e.target.value, label: `Event: ${e.target.value}` } : null)}>
                  <option value="">All event types</option>
                  {currentLeads.summary.by_event_type.map(row => (
                    <option key={row.label} value={row.label}>{row.label} ({row.count})</option>
                  ))}
                </select>
              )}
              {/* Guest count - corporate only */}
              {activeLeadType === "corporate" && (currentLeads?.summary?.by_guest_count || []).length > 0 && (
                <select className="lead-toolbar__select"
                  value={breakdownFilter?.field === "guest_count" ? breakdownFilter.value : ""}
                  onChange={(e) => setBreakdownFilter(e.target.value ? { field: "guest_count", value: e.target.value, label: `Guests: ${e.target.value}` } : null)}>
                  <option value="">All guest counts</option>
                  {currentLeads.summary.by_guest_count.map(row => (
                    <option key={row.label} value={row.label}>{row.label} ({row.count})</option>
                  ))}
                </select>
              )}
            </div>
            {/* Active filters summary */}
            {(leadSearch || breakdownFilter || heatFilter !== "all") && (
              <div className="lead-toolbar__active">
                {leadSearch && <span className="lead-toolbar__tag">Search: "{leadSearch}" <button onClick={() => { setLeadSearch(""); setLeadSearchDraft(""); }}>{"\u2715"}</button></span>}
                {heatFilter !== "all" && <span className="lead-toolbar__tag">{TIER_CONFIG[heatFilter].label} <button onClick={() => setHeatFilter("all")}>{"\u2715"}</button></span>}
                {breakdownFilter && <span className="lead-toolbar__tag">{breakdownFilter.label} <button onClick={() => setBreakdownFilter(null)}>{"\u2715"}</button></span>}
                <button className="lead-toolbar__clear-all" onClick={() => { setLeadSearch(""); setLeadSearchDraft(""); setHeatFilter("all"); setBreakdownFilter(null); }}>Clear all</button>
              </div>
            )}
            </div>
            <div className="lead-panel__status">
              Showing {sortedLeads.length} of {scoredLeads.length} leads. Click a row to view full profile.
            </div>
          </div>

          {/* ── Leads table ── */}
          <div style={{ marginTop: "4px" }}>
            {sortedLeads.length === 0 ? (
              <p className="rep-empty-small">No {currentLeads?.lead_type_label?.toLowerCase() || activeLeadType} leads yet. Form submissions will appear here.</p>
            ) : (
              <div className="rep-table-wrap">
                <table className="rep-table rep-table--sortable">
                  <thead>
                    <tr>
                      <th onClick={() => toggleSort("score")} style={{ cursor: "pointer", width: "52px" }}>Score{sortIndicator("score")}</th>
                      <th style={{ width: "80px" }}>Stage</th>
                      <th onClick={() => toggleSort("created_at")} style={{ cursor: "pointer" }}>When{sortIndicator("created_at")}</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      {activeLeadType === "corporate" && <th>Company</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("event_date")} style={{ cursor: "pointer" }}>Wedding date{sortIndicator("event_date")}</th>}
                      {(activeLeadType === "corporate") && <th onClick={() => toggleSort("event_type")} style={{ cursor: "pointer" }}>Event type{sortIndicator("event_type")}</th>}
                      {(activeLeadType === "corporate" || activeLeadType === "wedding") && <th onClick={() => toggleSort("guest_count")} style={{ cursor: "pointer" }}>Guests{sortIndicator("guest_count")}</th>}
                      {activeLeadType === "corporate" && <th onClick={() => toggleSort("event_date")} style={{ cursor: "pointer" }}>Date{sortIndicator("event_date")}</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("urgency")} style={{ cursor: "pointer" }}>Urgency{sortIndicator("urgency")}</th>}
                      {activeLeadType === "wedding" && <th onClick={() => toggleSort("budget")} style={{ cursor: "pointer" }}>Budget{sortIndicator("budget")}</th>}
                      <th>Source</th>
                      <th>Location</th>
                      <th onClick={() => toggleSort("sessions_before_conversion")} style={{ cursor: "pointer" }}>Engagement{sortIndicator("sessions_before_conversion")}</th>
                      <th>Also interested in</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLeads.map((lead) => {
                      const sc = lead._score;
                      const tc = TIER_CONFIG[sc.tier];
                      const stageIdx = STAGE_SEQUENCE.indexOf(sc.stageLabel);
                      return (
                        <tr
                          key={lead.contact_id}
                          className={`lead-row lead-row--${sc.tier}${sc.isDead ? " lead-row--dead" : ""}${selectedLead?.contact_id === lead.contact_id ? " lead-row--selected" : ""}`}
                          style={{ borderLeft: `4px solid ${tc.border}`, background: tc.bg, cursor: "pointer" }}
                          onClick={() => selectLead(lead)}
                        >
                          {/* Score badge */}
                          <td>
                            <span
                              className="lead-score-badge"
                              style={{ background: sc.tier === "cold" ? "rgba(44,24,16,0.08)" : tc.color, color: sc.tier === "cold" ? "rgba(44,24,16,0.35)" : "#fff" }}
                              title={`Stage ${sc.breakdown.stage} + Recency ${sc.breakdown.recency} + Engagement ${sc.breakdown.engagement} + Date ${sc.breakdown.dateProximity} + Revenue ${sc.breakdown.revenue}`}
                            >
                              {sc.score}
                            </span>
                          </td>
                          {/* Stage pills */}
                          <td>
                            <span className="lead-stage-pills">
                              {STAGE_SEQUENCE.map((s, i) => (
                                <span
                                  key={s}
                                  className={`lead-stage-pill${i <= stageIdx ? " lead-stage-pill--filled" : ""}`}
                                  style={i <= stageIdx ? { background: tc.color } : {}}
                                  title={s}
                                />
                              ))}
                              <span className="lead-stage-label">{sc.stageLabel}</span>
                            </span>
                          </td>
                          <td>
                            <span>{formatRelativeTime(lead.created_at)}</span>
                            {sc.daysSinceActivity > 7 && (
                              <span className="lead-last-seen">seen {sc.daysSinceActivity}d ago</span>
                            )}
                          </td>
                          <td>{[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "\u2014"}</td>
                          <td>{lead.email}</td>
                          <td>{lead.phone || "\u2014"}</td>
                          {activeLeadType === "corporate" && <td>{lead.company || "\u2014"}</td>}
                          {activeLeadType === "wedding" && <td>{lead.event_date || "\u2014"}</td>}
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
                          <td>{[lead.ip_city, lead.ip_country].filter(Boolean).join(", ") || "\u2014"}</td>
                          <td>{lead.sessions_before_conversion != null ? `${lead.sessions_before_conversion}s / ${lead.total_page_views || 0}p` : "\u2014"}</td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
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
      {selectedLead && (() => {
        const lead = selectedLead;
        const sc = computeLeadScore(lead, activeLeadType);
        const tc = TIER_CONFIG[sc.tier];
        const stageIdx = STAGE_SEQUENCE.indexOf(sc.stageLabel);
        const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";

        return (
          <div className="lp-fullpage">
            {/* Back button */}
            <button className="lp-back" onClick={() => setSelectedLead(null)} type="button">{"\u2190"} Back to leads</button>

            {/* Hero header */}
            <div className="lp-hero">
              <div className="lp-hero__score">
                <span className="lead-score-badge" style={{ background: sc.tier === "cold" ? "rgba(44,24,16,0.08)" : tc.color, color: sc.tier === "cold" ? "rgba(44,24,16,0.35)" : "#fff", width: 64, height: 64, fontSize: 24 }}>
                  {sc.score}
                </span>
                <span className="lp-hero__tier" style={{ color: tc.color }}>{sc.tier === "cold" && sc.isDead ? "Dead" : tc.label}</span>
              </div>
              <div className="lp-hero__info">
                <h2 className="lp-hero__name">{name}</h2>
                <div className="lp-hero__contact">
                  <a href={`mailto:${lead.email}`} className="lp-hero__link">{lead.email}</a>
                  {lead.phone && <> &middot; <a href={`tel:${lead.phone}`} className="lp-hero__link">{lead.phone}</a></>}
                  {lead.company && <> &middot; {lead.company}</>}
                </div>
                <div className="lp-stage-bar" style={{ marginTop: "12px" }}>
                  {STAGE_SEQUENCE.map((s, i) => (
                    <div key={s} className={`lp-stage-step${i <= stageIdx ? " lp-stage-step--active" : ""}`} style={i <= stageIdx ? { borderColor: tc.color, background: i === stageIdx ? (sc.tier === "cold" ? "rgba(44,24,16,0.08)" : tc.color) : "transparent", color: i === stageIdx ? (sc.tier === "cold" ? "rgba(44,24,16,0.35)" : "#fff") : tc.color } : {}}>
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Two-column: left = details, right = score */}
            <div className="lp-cols">
              <div className="lp-col">
                {/* Contact details */}
                <div className="lp-section">
                  <h3 className="lp-section__title">Contact</h3>
                  <div className="lp-detail-grid">
                    <div className="lp-detail">
                      <span className="lp-detail__label">Email</span>
                      <a href={`mailto:${lead.email}`} className="lp-detail__value lp-detail__link">{lead.email}</a>
                    </div>
                    <div className="lp-detail">
                      <span className="lp-detail__label">Phone</span>
                      {lead.phone ? <a href={`tel:${lead.phone}`} className="lp-detail__value lp-detail__link">{lead.phone}</a> : <span className="lp-detail__value lp-detail__muted">Not provided</span>}
                    </div>
                    {lead.company && (
                      <div className="lp-detail">
                        <span className="lp-detail__label">Company</span>
                        <span className="lp-detail__value">{lead.company}</span>
                      </div>
                    )}
                    <div className="lp-detail">
                      <span className="lp-detail__label">Location</span>
                      <span className="lp-detail__value">{[lead.ip_city, lead.ip_country].filter(Boolean).join(", ") || "Unknown"}</span>
                    </div>
                  </div>
                </div>

                {/* Event / form details */}
                <div className="lp-section">
                  <h3 className="lp-section__title">Event details</h3>
                  <div className="lp-detail-grid">
                    {lead.event_date && <div className="lp-detail"><span className="lp-detail__label">Event date</span><span className="lp-detail__value">{lead.event_date}</span></div>}
                    {lead.event_type_label && <div className="lp-detail"><span className="lp-detail__label">Event type</span><span className="lp-detail__value">{lead.event_type_label}</span></div>}
                    {lead.guest_count && <div className="lp-detail"><span className="lp-detail__label">Guests</span><span className="lp-detail__value">{lead.guest_count}</span></div>}
                    {lead.urgency_label && <div className="lp-detail"><span className="lp-detail__label">Urgency</span><span className="lp-detail__value">{lead.urgency_label}</span></div>}
                    {lead.budget_label && <div className="lp-detail"><span className="lp-detail__label">Budget</span><span className="lp-detail__value">{lead.budget_label}</span></div>}
                    {lead.wedding_year && !lead.event_date && <div className="lp-detail"><span className="lp-detail__label">Wedding year</span><span className="lp-detail__value">{lead.wedding_year}</span></div>}
                    {!lead.event_date && !lead.event_type_label && !lead.guest_count && !lead.urgency_label && !lead.budget_label && (
                      <p className="lp-detail__muted" style={{ gridColumn: "1 / -1" }}>Brochure download only - no questionnaire data yet.</p>
                    )}
                  </div>
                </div>

                {/* Cross-sell */}
                {lead.cross_sell_labels?.length > 0 && (
                  <div className="lp-section">
                    <h3 className="lp-section__title">Also interested in</h3>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {lead.cross_sell_labels.map(label => (
                        <span key={label} className="rep-cross-sell__badge">{label}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="lp-col">
                {/* Score breakdown */}
                <div className="lp-section">
                  <h3 className="lp-section__title">Score breakdown</h3>
                  <div className="lp-score-grid">
                    {[
                      { label: "Stage", val: sc.breakdown.stage, max: 40, desc: sc.stageLabel },
                      { label: "Recency", val: sc.breakdown.recency, max: 25, desc: sc.daysSinceActivity <= 1 ? "Active today" : `${sc.daysSinceActivity}d ago` },
                      { label: "Engagement", val: sc.breakdown.engagement, max: 15, desc: `${lead.sessions_before_conversion || 0} sessions, ${lead.total_page_views || 0} pages` },
                      { label: "Date", val: sc.breakdown.dateProximity, max: 10, desc: lead.event_date || "No date" },
                      { label: "Revenue", val: sc.breakdown.revenue, max: 10, desc: [lead.budget_label, lead.guest_count ? `${lead.guest_count} guests` : null].filter(Boolean).join(", ") || "Unknown" },
                    ].map(row => (
                      <div key={row.label} className="lp-score-row">
                        <span className="lp-score-row__label">{row.label}</span>
                        <div className="lp-score-row__bar">
                          <div className="lp-score-row__fill" style={{ width: `${(row.val / row.max) * 100}%`, background: tc.color }} />
                        </div>
                        <span className="lp-score-row__val">{row.val}/{row.max}</span>
                        <span className="lp-score-row__desc">{row.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Full journey - full width below */}
            <div className="lp-section">
              <h3 className="lp-section__title">
                Full journey
                {journey && <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}> - {journey.total_sessions} session{journey.total_sessions !== 1 ? "s" : ""}, {journey.total_events} event{journey.total_events !== 1 ? "s" : ""}</span>}
              </h3>
              {journeyLoading && <p className="lp-detail__muted">Loading journey...</p>}
              {!journeyLoading && !journey && <p className="lp-detail__muted">No journey data available.</p>}
              {!journeyLoading && journey && journey.sessions.length === 0 && <p className="lp-detail__muted">No sessions recorded for this visitor.</p>}
              {!journeyLoading && journey && journey.sessions.map((sess, si) => {
                const pageViews = sess.events.filter(e => e.event_type === "page_view");
                const actions = sess.events.filter(e => e.event_type !== "page_view" && e.event_type !== "scroll_depth");
                return (
                  <div key={sess.session_id} className="lp-journey-session">
                    <div className="lp-journey-session__header">
                      <span className="lp-journey-session__num">Session {si + 1}</span>
                      <span className="lp-journey-session__date">{formatAbsoluteTime(sess.started_at)}</span>
                      {sess.duration != null && <span className="lp-journey-session__dur">{formatDuration(sess.duration)}</span>}
                    </div>
                    <div className="lp-journey-session__source">
                      {sess.ad_platform && <span className="lp-journey-tag lp-journey-tag--platform">{sess.ad_platform}</span>}
                      <span className="lp-journey-tag">{sess.source}</span>
                      {sess.campaign && <span className="lp-journey-tag">{sess.campaign}</span>}
                      {sess.keyword && <span className="lp-journey-tag lp-journey-tag--keyword">{sess.keyword}</span>}
                      {sess.device_type && <span className="lp-journey-tag">{sess.device_type}</span>}
                    </div>
                    {Object.keys(sess.click_ids).length > 0 && (
                      <div className="lp-journey-session__clickids">
                        {Object.entries(sess.click_ids).map(([k, v]) => (
                          <span key={k} className="lp-journey-clickid" title={v}>{k}</span>
                        ))}
                      </div>
                    )}
                    <div className="lp-journey-pages">
                      {pageViews.map((ev, ei) => {
                        const nextEv = pageViews[ei + 1];
                        let timeOnPage = null;
                        if (nextEv) {
                          const t1 = new Date(ev.created_at.replace(" ", "T") + (ev.created_at.includes("Z") ? "" : "Z")).getTime();
                          const t2 = new Date(nextEv.created_at.replace(" ", "T") + (nextEv.created_at.includes("Z") ? "" : "Z")).getTime();
                          const diff = Math.round((t2 - t1) / 1000);
                          if (Number.isFinite(diff) && diff >= 0) timeOnPage = diff;
                        }
                        const path = (() => { try { return new URL(ev.page_url, "https://x").pathname; } catch { return ev.page_url; } })();
                        return (
                          <div key={ev.event_id} className="lp-journey-page">
                            <span className="lp-journey-page__time">{formatTime(ev.created_at)}</span>
                            <span className="lp-journey-page__path">{path}</span>
                            {timeOnPage != null && <span className="lp-journey-page__dur">{formatDuration(timeOnPage)}</span>}
                          </div>
                        );
                      })}
                    </div>
                    {actions.length > 0 && (
                      <div className="lp-journey-actions">
                        {actions.map(ev => {
                          let label = JOURNEY_EVENT_LABELS[ev.event_type] || ev.event_type;
                          const data = parseEventData(ev.event_data);
                          let detail = "";
                          if (ev.event_type === "cta_click") {
                            const ctaName = data?.cta_text || data?.track_id || data?.cta_id || "";
                            const page = ev.page_url ? shortenUrl(ev.page_url) : "";
                            label = ctaName ? `Clicked "${ctaName}"` : "Clicked CTA";
                            if (page) detail = `on ${page}`;
                          }
                          if (ev.event_type === "date_check" && data?.date) detail = data.date;
                          if (ev.event_type === "questionnaire_complete") detail = "All steps finished";
                          if (ev.event_type === "form_submit" && data?.form_type) detail = FORM_TYPE_LABELS[data.form_type] || data.form_type;
                          return (
                            <div key={ev.event_id} className="lp-journey-action">
                              <span className="lp-journey-action__dot" />
                              <span className="lp-journey-action__time">{formatTime(ev.created_at)}</span>
                              <span className="lp-journey-action__label">{label}</span>
                              {detail && <span className="lp-journey-action__detail">{detail}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
