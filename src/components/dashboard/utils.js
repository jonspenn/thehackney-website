/**
 * Dashboard utility functions - formatting, parsing, scoring, funnel computation.
 * Pure functions with no React dependency.
 */

import {
  BUDGET_LABELS, BROCHURE_TYPE_LABELS, EVENT_TYPE_DISPLAY, URGENCY_LABELS,
  MONTH_LABELS, DAY_LABELS_FULL, DAY_LABELS_SHORT,
  DEAD_DAYS, FUNNEL_STAGES, HEALTH_THRESHOLDS, SOURCE_MAP,
} from "./constants.js";

/* ───────── formatting ───────── */

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export function formatTime(iso) {
  if (!iso) return "";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelativeTime(iso) {
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

export function formatAbsoluteTime(iso) {
  if (!iso) return "\u2014";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatLongDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${DAY_LABELS_FULL[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ───────── parsing ───────── */

export function shortenUrl(url) {
  if (!url) return "\u2014";
  try {
    const u = new URL(url, "https://thehackney-website.pages.dev");
    return u.pathname;
  } catch {
    return url;
  }
}

export function parseEventData(raw) {
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

export function eventSummary(eventType, eventData) {
  const d = parseEventData(eventData);
  if (!d) return "";
  if (eventType === "cta_click" && d.track_id) return d.track_id;
  if (eventType === "scroll_depth" && d.depth) return `${d.depth}%`;
  if (eventType === "page_view" && d.page_type) return d.page_type;
  return "";
}

export function submissionDetails(row) {
  const parts = [];
  if (row.event_type) parts.push(EVENT_TYPE_DISPLAY[row.event_type] || row.event_type);
  if (row.guest_count) parts.push(`${row.guest_count} guests`);
  if (row.event_date) parts.push(row.event_date);
  if (row.booking_urgency) parts.push(URGENCY_LABELS[row.booking_urgency] || row.booking_urgency);
  if (row.budget) parts.push(BUDGET_LABELS[row.budget] || row.budget);
  if (row.brochure_type) parts.push(`${BROCHURE_TYPE_LABELS[row.brochure_type] || row.brochure_type} brochure`);
  if (row.wedding_year) parts.push(row.wedding_year);
  if (row.company) parts.push(row.company);
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

export function formLabel(formType, formData) {
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

/* ───────── heatmap helpers ───────── */

export function buildHeatmapMonths(heatmap) {
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

export function heatColour(count, max) {
  if (!count || count === 0) return "transparent";
  const ratio = max <= 0 ? 0 : count / max;
  if (ratio > 0.8) return "rgba(46,64,9,0.95)";
  if (ratio > 0.6) return "rgba(46,64,9,0.75)";
  if (ratio > 0.4) return "rgba(46,64,9,0.55)";
  if (ratio > 0.2) return "rgba(46,64,9,0.35)";
  return "rgba(46,64,9,0.18)";
}

export function heatTextColour(count, max) {
  if (!count) return "var(--color-brewery-dark)";
  const ratio = max <= 0 ? 0 : count / max;
  return ratio > 0.55 ? "var(--color-warm-canvas)" : "var(--color-brewery-dark)";
}

/* ───────── timestamp helpers ───────── */

export function parseTimestamp(ts) {
  if (!ts) return null;
  const safe = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  const d = new Date(safe);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysBetween(from, to) {
  if (!from) return 999;
  const t = to || new Date();
  return Math.max(0, Math.floor((t.getTime() - from.getTime()) / 86400000));
}

/* ───────── lead scoring ───────── */

export function computeLeadScore(lead, leadType) {
  const now = Date.now();

  let stage = 8, stageLabel = "Brochure";
  /* Score reflects funnel progression: Tour > Call > Quiz > Brochure */
  if (lead.tour_at || lead.clicked_venue_tour_at)       { stage = 30; stageLabel = "Tour"; }
  else if (lead.call_at || lead.clicked_discovery_call_at) { stage = 26; stageLabel = "Call"; }
  else if (lead.form_types?.some(ft => ft.includes("quiz"))) { stage = 18; stageLabel = "Quiz"; }

  const INTENT_SCORE = { asap: 10, ready: 8, comparing: 5, browsing: 2 };
  const intent = INTENT_SCORE[lead.urgency] || 0;

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

  const sessions = lead.sessions_before_conversion || 0;
  const pages = lead.total_page_views || 0;
  let engagement = Math.min(sessions, 5) + Math.min(Math.floor(pages / 3), 5);
  if (lead.submissions_count > 1) engagement += 5;
  engagement = Math.min(engagement, 15);

  let dateProximity = 3;
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

  const score = stage + intent + recency + engagement + dateProximity + revenue;

  let tier;
  if (score >= 60) tier = "hot";
  else if (score >= 35) tier = "warm";
  else if (score >= 15) tier = "cool";
  else tier = "cold";

  const deadDays = DEAD_DAYS[leadType] || 21;
  const isDead = daysSinceActivity > deadDays && stage <= 18;
  if (isDead) tier = "cold";

  return {
    score, tier, stageLabel, isDead, daysSinceActivity,
    breakdown: { stage, intent, recency, engagement, dateProximity, revenue },
  };
}

/* ───────── funnel computation ───────── */

export function computeFunnelStage(lead, leadType) {
  const stages = FUNNEL_STAGES[leadType] || FUNNEL_STAGES.wedding;
  const isLowIntent = leadType === "supperclub" || leadType === "cafe-bar";

  const completed = {};
  let currentStage, stageEnteredAt;

  if (isLowIntent) {
    completed.signup = parseTimestamp(lead.created_at);
    currentStage = "signup";
    stageEnteredAt = completed.signup;
  } else {
    completed.lead = parseTimestamp(lead.created_at);
    currentStage = "lead";
    stageEnteredAt = completed.lead;

    const hasQuiz = lead.form_types?.some(ft => ft.includes("quiz"));
    if (hasQuiz) {
      completed.qualified = parseTimestamp(lead.submitted_at) || completed.lead;
      currentStage = "qualified";
      stageEnteredAt = completed.qualified;
    }

    const callAt = parseTimestamp(lead.clicked_discovery_call_at);
    const tourAt = parseTimestamp(lead.clicked_venue_tour_at);
    const engagedAt = callAt && tourAt ? (callAt < tourAt ? callAt : tourAt) : (callAt || tourAt);
    if (engagedAt) {
      completed.engaged = engagedAt;
      currentStage = "engaged";
      stageEnteredAt = engagedAt;
    }

    const hadCallAt = parseTimestamp(lead.call_at);
    const hadTourAt = parseTimestamp(lead.tour_at);
    const meetingAt = parseTimestamp(lead.meeting_at);
    const cancelledAt = parseTimestamp(lead.cancelled_at);
    const noshowAt = parseTimestamp(lead.noshow_at);
    const proposalAt = parseTimestamp(lead.proposal_at);
    const wonAt = parseTimestamp(lead.won_at);
    const lostAt = parseTimestamp(lead.lost_at);

    if (cancelledAt && !meetingAt && !hadCallAt && !hadTourAt) { currentStage = "cancelled"; stageEnteredAt = cancelledAt; }
    if (noshowAt && !meetingAt && !hadCallAt && !hadTourAt) { currentStage = "noshow"; stageEnteredAt = noshowAt; }

    /* Call / Tour split. Use dedicated fields if available, else infer from
       legacy meeting_at + intent signals. Calls come before tours in the funnel. */
    const effectiveCallAt = hadCallAt || (meetingAt && !hadTourAt && lead.clicked_discovery_call_at && !lead.clicked_venue_tour_at ? meetingAt : null);
    const effectiveTourAt = hadTourAt || (meetingAt && lead.clicked_venue_tour_at ? meetingAt : null);
    /* If meeting_at exists but no intent signals at all, default to tour (most common meeting type) */
    const fallbackTourAt = (!effectiveCallAt && !effectiveTourAt && meetingAt) ? meetingAt : null;

    if (effectiveCallAt) { completed.call = effectiveCallAt; currentStage = "call"; stageEnteredAt = effectiveCallAt; }
    if (effectiveTourAt || fallbackTourAt) { completed.tour = effectiveTourAt || fallbackTourAt; currentStage = "tour"; stageEnteredAt = effectiveTourAt || fallbackTourAt; }
    if (proposalAt) { completed.proposal = proposalAt; currentStage = "proposal"; stageEnteredAt = proposalAt; }
    if (wonAt) { completed.won = wonAt; currentStage = "won"; stageEnteredAt = wonAt; }
    if (lostAt) { currentStage = "lost"; stageEnteredAt = lostAt; }
  }

  const daysInStage = daysBetween(stageEnteredAt, new Date());
  const thresholds = (HEALTH_THRESHOLDS[leadType] || HEALTH_THRESHOLDS.wedding)[currentStage];
  let health = "green";
  if (thresholds) {
    if (daysInStage > thresholds[1]) health = "red";
    else if (daysInStage > thresholds[0]) health = "amber";
  }
  if (currentStage === "won" || currentStage === "lost") health = null;

  const engagementSignals = {
    sessions: lead.sessions_before_conversion || 0,
    pages: lead.total_page_views || 0,
    submissions: lead.submissions_count || 0,
  };

  return {
    stages, completed, currentStage, stageEnteredAt, daysInStage,
    health, engagementSignals, lostReason: lead.lost_reason || null,
  };
}

/* ───────── source channel ───────── */

export function resolveSource(raw) {
  if (!raw) return { label: "Direct", color: "rgba(44,24,16,0.5)", bg: "rgba(44,24,16,0.04)" };
  for (const s of SOURCE_MAP) { if (s.match.test(raw)) return s; }
  const base = raw.split("/")[0].trim();
  const label = base.charAt(0).toUpperCase() + base.slice(1);
  return { label, color: "rgba(44,24,16,0.5)", bg: "rgba(44,24,16,0.04)" };
}
