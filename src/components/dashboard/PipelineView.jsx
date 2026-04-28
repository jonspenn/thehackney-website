/**
 * PipelineView - Visual funnel pipeline showing lead counts per stage.
 * Sub-tabs by revenue stream. Click a stage to see leads in that stage.
 * Click a lead row to open their full profile.
 * Funnel and monthly chart are collapsible so the drill-in table stays accessible.
 */

import { useMemo, useState } from "react";

import {
  LEAD_TABS,
  FUNNEL_STAGES, FUNNEL_LABELS, STAGE_DEFINITIONS,
  TIER_CONFIG, HEALTH_COLORS,
} from "./constants.js";

import {
  formatRelativeTime,
  computeLeadScore, computeFunnelStage, resolveSource, parseTimestamp,
} from "./utils.js";

import { CardSurface, FunnelTrack, SoftPill, MetadataStrip, MetadataCell } from "./primitives/index.js";

/* Non-terminal stages that appear on the main track */
const TERMINAL_STAGES = new Set(["lost", "cancelled", "noshow"]);

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Colours for each metric bar in the monthly chart */
const TREND_METRICS = [
  { key: "new",       label: "New leads",  color: "#2C1810", weight: 2.5 },
  { key: "qualified", label: "Qualified",  color: "#49590E", dash: "6 4" },
  { key: "engaged",   label: "Engaged",    color: "#2E4009" },
  { key: "call",      label: "Calls",      color: "#BF7256" },
  { key: "tour",      label: "Tours",      color: "#40160C", dash: "6 4" },
  { key: "won",       label: "Won",        color: "#8C472E", weight: 2.5 },
  { key: "lost",      label: "Lost",       color: "#BF7256", dash: "2 3" },
];

/* Catmull-Rom spline -> cubic Bezier path. Produces a smooth curve through
   each point, no straight segments. tension=1 is the standard uniform curve
   that the reference design uses. */
function smoothPath(points, tension = 0.7) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || points[i + 1];
    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export default function PipelineView({ leads, onSelectLead, initialType, onTypeChange }) {
  const [activeType, setActiveType] = useState(initialType || "wedding");
  const [selectedStage, setSelectedStage] = useState(null);
  const [funnelOpen, setFunnelOpen] = useState(true);
  const [trendsOpen, setTrendsOpen] = useState(true);
  const [hiddenMetrics, setHiddenMetrics] = useState(new Set());

  /* Compute funnel for every lead in active type */
  const { stageCounts, stageLeads, totalActive, terminalCounts } = useMemo(() => {
    const currentLeads = leads[activeType]?.leads || [];
    const counts = {};
    const byStage = {};
    const terminal = { lost: 0, cancelled: 0, noshow: 0 };
    const stages = FUNNEL_STAGES[activeType] || FUNNEL_STAGES.wedding;

    for (const s of stages) { counts[s] = 0; byStage[s] = []; }
    for (const k of Object.keys(terminal)) { byStage[k] = []; }

    for (const lead of currentLeads) {
      const funnel = computeFunnelStage(lead, activeType);
      const score = computeLeadScore(lead, activeType);
      const enriched = { ...lead, _funnel: funnel, _score: score };

      if (TERMINAL_STAGES.has(funnel.currentStage)) {
        terminal[funnel.currentStage] = (terminal[funnel.currentStage] || 0) + 1;
        byStage[funnel.currentStage]?.push(enriched);
      } else if (counts[funnel.currentStage] !== undefined) {
        counts[funnel.currentStage]++;
        byStage[funnel.currentStage].push(enriched);
      }
    }

    return {
      stageCounts: counts,
      stageLeads: byStage,
      totalActive: currentLeads.length,
      terminalCounts: terminal,
    };
  }, [leads, activeType]);

  const stages = FUNNEL_STAGES[activeType] || FUNNEL_STAGES.wedding;

  /* Conversion rate between consecutive stages.
   *
   * Bounded read: of leads at-or-past the prior stage, what % made it to
   * at-or-past this stage. Always 0-100. Replaces the previous unbounded
   * (cumulative / prior_only) calculation that could exceed 100% because
   * leads currently sit at later stages while only a snapshot remains at
   * the prior stage.
   */
  const conversionRates = useMemo(() => {
    const rates = {};
    let cumulativePrev = 0;
    for (let j = 0; j < stages.length; j++) cumulativePrev += (stageCounts[stages[j]] || 0);
    for (let i = 1; i < stages.length; i++) {
      cumulativePrev -= (stageCounts[stages[i - 1]] || 0);
      const priorSnapshot = stageCounts[stages[i - 1]] || 0;
      // Suppress when the prior stage has no live cohort. A 100% rate from an
      // empty stage is mathematically true but operationally misleading -
      // there's no actual cohort sitting at the prior stage to convert from.
      if (priorSnapshot === 0) { rates[stages[i]] = null; continue; }
      let cumulativeThis = 0;
      for (let j = i; j < stages.length; j++) cumulativeThis += (stageCounts[stages[j]] || 0);
      const denom = cumulativeThis + priorSnapshot; // at-or-past prior
      rates[stages[i]] = denom > 0 ? Math.round((cumulativeThis / denom) * 100) : null;
    }
    return rates;
  }, [stageCounts, stages]);

  /* ── Pipeline-level metrics for the metadata strip header ── */
  const pipelineMetrics = useMemo(() => {
    const currentLeads = leads[activeType]?.leads || [];
    const stages = FUNNEL_STAGES[activeType] || FUNNEL_STAGES.wedding;
    const tourIdx = stages.indexOf("tour");

    const activeNonTerminal = currentLeads.filter(l => {
      const f = computeFunnelStage(l, activeType);
      return !TERMINAL_STAGES.has(f.currentStage);
    });

    /* Tour rate: of active leads, how many have reached at-or-past Tour. */
    let atOrPastTour = 0;
    if (tourIdx >= 0) {
      for (const l of activeNonTerminal) {
        const f = computeFunnelStage(l, activeType);
        const idx = stages.indexOf(f.currentStage);
        if (idx >= tourIdx) atOrPastTour++;
      }
    }
    const tourRate = activeNonTerminal.length > 0
      ? Math.round((atOrPastTour / activeNonTerminal.length) * 100)
      : null;

    /* Avg days a lead has been in the pipeline (live, not closed). */
    let totalAgeDays = 0; let aged = 0;
    const now = Date.now();
    for (const l of activeNonTerminal) {
      const created = parseTimestamp(l.created_at);
      if (created) { totalAgeDays += (now - created.getTime()) / (1000 * 60 * 60 * 24); aged++; }
    }
    const avgAgeDays = aged > 0 ? Math.round(totalAgeDays / aged) : null;

    /* Pipeline value £ - sum of event-budget enum mid-points across active leads.
       Leads without a budget aren't counted. Mid-points: under-5k=2.5k, 5-10k=7.5k,
       10-20k=15k, 20k-plus=25k. */
    const BUDGET_MIDPOINT = {
      "under-5k": 2500,
      "5k-10k": 7500,
      "10k-20k": 15000,
      "20k-plus": 25000,
    };
    let pipelineValue = 0;
    for (const l of activeNonTerminal) {
      const v = BUDGET_MIDPOINT[l.event_budget];
      if (v) pipelineValue += v;
    }

    return {
      activeCount: activeNonTerminal.length,
      tourRate,
      avgAgeDays,
      pipelineValue,
    };
  }, [leads, activeType]);

  function formatPipelineValue(v) {
    if (!v) return "\u2014";
    if (v >= 1000) return "\u00A3" + (v / 1000).toFixed(v >= 10000 ? 0 : 1) + "k";
    return "\u00A3" + v;
  }

  const selectedLeads = selectedStage ? (stageLeads[selectedStage] || []) : [];
  const sortedSelectedLeads = useMemo(() => {
    return [...selectedLeads].sort((a, b) => (b._score?.score || 0) - (a._score?.score || 0));
  }, [selectedLeads]);

  const totalTerminal = terminalCounts.lost + terminalCounts.cancelled + terminalCounts.noshow;

  /* ── Monthly trends (always Jan-Dec current year) ── */
  const monthlyData = useMemo(() => {
    const currentLeads = leads[activeType]?.leads || [];
    if (currentLeads.length === 0) return { months: [], maxVal: 0 };

    const isHighIntent = activeType === "wedding" || activeType === "corporate" || activeType === "private-events";
    const currentYear = new Date().getUTCFullYear();
    const currentMonth = new Date().getUTCMonth(); // 0-based

    function toMonthKey(ts) {
      const d = parseTimestamp(ts);
      if (!d) return null;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    /* Always Jan-Dec of current year */
    const monthKeys = [];
    for (let m = 1; m <= 12; m++) {
      monthKeys.push(`${currentYear}-${String(m).padStart(2, "0")}`);
    }

    const buckets = {};
    for (const mk of monthKeys) {
      buckets[mk] = { new: 0, qualified: 0, engaged: 0, call: 0, tour: 0, won: 0, lost: 0 };
    }

    for (const lead of currentLeads) {
      const newKey = toMonthKey(lead.created_at);
      if (newKey && buckets[newKey]) buckets[newKey].new++;

      if (isHighIntent) {
        const hasQuiz = lead.form_types?.some(ft => ft.includes("quiz"));
        if (hasQuiz) {
          const qKey = toMonthKey(lead.submitted_at || lead.created_at);
          if (qKey && buckets[qKey]) buckets[qKey].qualified++;
        }
        const engagedTs = lead.clicked_discovery_call_at || lead.clicked_venue_tour_at;
        if (engagedTs) {
          const eKey = toMonthKey(engagedTs);
          if (eKey && buckets[eKey]) buckets[eKey].engaged++;
        }
        /* Calls: use call_at if available, else infer from meeting_at + intent */
        const callTs = lead.call_at || (lead.meeting_at && lead.clicked_discovery_call_at && !lead.clicked_venue_tour_at ? lead.meeting_at : null);
        if (callTs) {
          const cKey = toMonthKey(callTs);
          if (cKey && buckets[cKey]) buckets[cKey].call++;
        }
        /* Tours: use tour_at if available, else infer from meeting_at + intent */
        const tourTs = lead.tour_at || (lead.meeting_at && lead.clicked_venue_tour_at ? lead.meeting_at : null);
        const fallbackTour = (!callTs && !tourTs && lead.meeting_at) ? lead.meeting_at : null;
        if (tourTs || fallbackTour) {
          const tKey = toMonthKey(tourTs || fallbackTour);
          if (tKey && buckets[tKey]) buckets[tKey].tour++;
        }
        if (lead.won_at) {
          const wKey = toMonthKey(lead.won_at);
          if (wKey && buckets[wKey]) buckets[wKey].won++;
        }
        if (lead.lost_at) {
          const lKey = toMonthKey(lead.lost_at);
          if (lKey && buckets[lKey]) buckets[lKey].lost++;
        }
      }
    }

    let maxVal = 0;
    const months = monthKeys.map((mk, idx) => {
      const [y, m] = mk.split("-");
      const monthIdx = parseInt(m, 10) - 1; // 0-based
      const data = buckets[mk];
      const isFuture = monthIdx > currentMonth;
      for (const v of Object.values(data)) { if (v > maxVal) maxVal = v; }
      return { key: mk, label: `${SHORT_MONTHS[monthIdx]} ${y}`, shortLabel: SHORT_MONTHS[monthIdx], isFuture, ...data };
    });

    return { months, maxVal, isHighIntent, currentYear };
  }, [leads, activeType]);

  return (
    <>
      {/* Revenue stream sub-tabs */}
      <div className="pipe-panel">
        <div className="pipe-panel__tabs">
          {LEAD_TABS.map((lt) => (
            <button
              key={lt.type}
              className={`adm-subtab${activeType === lt.type ? " adm-subtab--active" : ""}`}
              onClick={() => { setActiveType(lt.type); setSelectedStage(null); if (onTypeChange) onTypeChange(lt.type); }}
              type="button"
            >
              {lt.label}
              {(leads[lt.type]?.total || 0) > 0 && (
                <span className="adm-subtab__count">{leads[lt.type].total}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Pipeline-level metrics strip ── */}
        <div className="pipe-meta-wrap">
          <MetadataStrip>
            <MetadataCell eyebrow="Tour rate">
              <span className="pipe-metric">{pipelineMetrics.tourRate != null ? pipelineMetrics.tourRate + "%" : "\u2014"}</span>
            </MetadataCell>
            <MetadataCell eyebrow="Avg days in pipeline">
              <span className="pipe-metric">{pipelineMetrics.avgAgeDays != null ? pipelineMetrics.avgAgeDays : "\u2014"}<span className="pipe-metric__unit">d</span></span>
            </MetadataCell>
            <MetadataCell eyebrow="Active leads">
              <span className="pipe-metric">{pipelineMetrics.activeCount}</span>
            </MetadataCell>
            <MetadataCell eyebrow="Pipeline value">
              <span className="pipe-metric">{formatPipelineValue(pipelineMetrics.pipelineValue)}</span>
            </MetadataCell>
          </MetadataStrip>
        </div>

        {/* ── Collapsible funnel ── */}
        <button
          type="button"
          className="pipe-collapse-toggle"
          onClick={() => setFunnelOpen(p => !p)}
        >
          <span className={`pipe-collapse-toggle__arrow${funnelOpen ? " pipe-collapse-toggle__arrow--open" : ""}`}>{"\u25B6"}</span>
          Pipeline {!funnelOpen && <span className="pipe-collapse-toggle__summary">{totalActive} leads across {stages.length} stages</span>}
        </button>

        {funnelOpen && (
          <>
            <div className="pipe-funnel">
              <FunnelTrack
                cohort={{
                  stages,
                  counts: stageCounts,
                  conversionRates,
                  selectedStage,
                  onSelectStage: (next) => setSelectedStage(next),
                }}
              />
            </div>

            {totalTerminal > 0 && (
              <div className="pipe-terminal">
                {["lost", "cancelled", "noshow"].map(key => {
                  if (!terminalCounts[key]) return null;
                  const isSelected = selectedStage === key;
                  const variant = key === "lost" ? "muted" : "warning";
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`pipe-terminal__btn${isSelected ? " pipe-terminal__btn--selected" : ""}`}
                      onClick={() => setSelectedStage(isSelected ? null : key)}
                    >
                      <SoftPill variant={variant} dot>
                        {FUNNEL_LABELS[key]}: {terminalCounts[key]}
                      </SoftPill>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Summary / status line */}
        <div className="pipe-panel__status">
          {selectedStage ? (
            <span>
              <strong>{FUNNEL_LABELS[selectedStage]}</strong>: {sortedSelectedLeads.length} lead{sortedSelectedLeads.length !== 1 ? "s" : ""}
              {STAGE_DEFINITIONS[selectedStage] && (
                <span className="pipe-panel__defn"> - {STAGE_DEFINITIONS[selectedStage]}</span>
              )}
            </span>
          ) : (
            <span>{totalActive} total leads across {stages.length} stages. Click a stage to see leads.</span>
          )}
        </div>
      </div>

      {/* ── Drill-in table for the selected stage (sits directly below the funnel) ── */}
      {selectedStage && sortedSelectedLeads.length > 0 && (
        <div style={{ marginTop: "4px" }}>
          <div className="rep-table-wrap">
            <table className="rep-table rep-table--sortable">
              <thead>
                <tr>
                  <th style={{ width: "52px" }}>Score</th>
                  <th>Health</th>
                  <th>When</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  {activeType === "corporate" && <th>Company</th>}
                  {activeType === "wedding" && <th>Wedding date</th>}
                  {activeType === "corporate" && <th>Event type</th>}
                  <th>Source</th>
                  <th>Engagement</th>
                </tr>
              </thead>
              <tbody>
                {sortedSelectedLeads.map((lead) => {
                  const sc = lead._score;
                  const tc = TIER_CONFIG[sc.tier];
                  const funnel = lead._funnel;
                  const hc = funnel.health ? HEALTH_COLORS[funnel.health] : null;
                  const src = resolveSource(lead.source_channel);

                  return (
                    <tr
                      key={lead.contact_id}
                      className={`lead-row lead-row--${sc.tier}${sc.isDead ? " lead-row--dead" : ""}`}
                      style={{ borderLeft: `4px solid ${tc.border}`, background: tc.bg, cursor: "pointer" }}
                      onClick={() => onSelectLead(lead, activeType)}
                    >
                      <td>
                        <span
                          className="lead-score-badge"
                          style={{ background: sc.tier === "cold" ? "rgba(44,24,16,0.08)" : tc.color, color: sc.tier === "cold" ? "rgba(44,24,16,0.35)" : "#fff" }}
                        >
                          {sc.score}
                        </span>
                      </td>
                      <td>
                        {hc && funnel.health !== "green" ? (
                          <span className="lead-health-badge" style={{ color: hc.color, background: hc.bg }}>
                            {hc.label} ({funnel.daysInStage}d)
                          </span>
                        ) : funnel.health === "green" ? (
                          <span style={{ color: "#2E4009", fontSize: "12px" }}>On track</span>
                        ) : (
                          <span style={{ color: "rgba(44,24,16,0.3)", fontSize: "12px" }}>{"\u2014"}</span>
                        )}
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
                      {activeType === "corporate" && <td>{lead.company || "\u2014"}</td>}
                      {activeType === "wedding" && <td>{lead.event_date || "\u2014"}</td>}
                      {activeType === "corporate" && <td>{lead.event_type_label || "\u2014"}</td>}
                      <td>
                        <span className="lead-source-badge" style={{ color: src.color, background: src.bg }}>{src.label}</span>
                      </td>
                      <td>{lead.sessions_before_conversion != null ? `${lead.sessions_before_conversion}s / ${lead.total_page_views || 0}p` : "\u2014"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedStage && sortedSelectedLeads.length === 0 && (
        <p className="rep-empty-small" style={{ marginTop: "12px" }}>No leads at this stage.</p>
      )}

      {/* ── Monthly trends (independent reference, lives below the drill-in) ── */}
      {monthlyData.months.length > 0 && (
        <div className="pipe-trends">
          <button
            type="button"
            className="pipe-collapse-toggle"
            onClick={() => setTrendsOpen(p => !p)}
          >
            <span className={`pipe-collapse-toggle__arrow${trendsOpen ? " pipe-collapse-toggle__arrow--open" : ""}`}>{"\u25B6"}</span>
            Monthly trends {monthlyData.currentYear && ` ${monthlyData.currentYear}`} {!trendsOpen && <span className="pipe-collapse-toggle__summary">Jan - Dec</span>}
          </button>

          {trendsOpen && (
            <>
              <p className="pipe-trends__sub">Month-by-month breakdown. Spot seasonal patterns, drops, and growth.</p>

              <div className="pipe-legend">
                {(monthlyData.isHighIntent ? TREND_METRICS : TREND_METRICS.slice(0, 1)).map(m => (
                  <button
                    key={m.key}
                    className="pipe-legend__item"
                    style={{ opacity: hiddenMetrics.has(m.key) ? 0.35 : 1, cursor: "pointer", background: "none", border: "none", padding: "2px 6px", borderRadius: "3px", textDecoration: hiddenMetrics.has(m.key) ? "line-through" : "none" }}
                    onClick={() => setHiddenMetrics(prev => {
                      const next = new Set(prev);
                      next.has(m.key) ? next.delete(m.key) : next.add(m.key);
                      return next;
                    })}
                    title={hiddenMetrics.has(m.key) ? `Show ${m.label}` : `Hide ${m.label}`}
                  >
                    <span className="pipe-legend__swatch" style={{ background: hiddenMetrics.has(m.key) ? "rgba(44,24,16,0.15)" : (m.dash ? "transparent" : m.color), border: m.dash ? `1px dashed ${hiddenMetrics.has(m.key) ? "rgba(44,24,16,0.15)" : m.color}` : "none" }} />
                    {m.label}
                  </button>
                ))}
              </div>

              {(() => {
                const metrics = monthlyData.isHighIntent ? TREND_METRICS : TREND_METRICS.slice(0, 1);
                const maxVal = monthlyData.maxVal || 1;
                const months = monthlyData.months;
                const currentMonth = new Date().getUTCMonth(); // 0-based

                /* SVG dimensions */
                const W = 800, H = 180, PAD_T = 18, PAD_B = 28, PAD_L = 24, PAD_R = 12;
                const plotW = W - PAD_L - PAD_R;
                const plotH = H - PAD_T - PAD_B;

                /* Gridlines */
                const gridSteps = Math.min(maxVal, 5);
                const gridLines = [];
                for (let i = 0; i <= gridSteps; i++) {
                  const val = Math.round((maxVal / gridSteps) * i);
                  const y = PAD_T + plotH - (plotH * (val / maxVal));
                  gridLines.push({ val, y });
                }

                return (
                  <div className="pipe-line-chart">
                    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto", maxHeight: "220px" }}>
                      {/* Light gridlines with subtle Y-axis numeric labels. */}
                      {gridLines.map(g => (
                        <g key={g.val}>
                          <line x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y} stroke="rgba(44,24,16,0.05)" strokeWidth="1" />
                          <text x={PAD_L - 4} y={g.y + 3} textAnchor="end" fontSize="9" fill="rgba(44,24,16,0.35)" fontVariantNumeric="tabular-nums">{g.val}</text>
                        </g>
                      ))}

                      {/* Future month shading */}
                      {currentMonth < 11 && (
                        <rect
                          x={PAD_L + plotW * ((currentMonth + 1) / 11)}
                          y={PAD_T}
                          width={plotW * ((11 - currentMonth - 1) / 11)}
                          height={plotH}
                          fill="rgba(44,24,16,0.02)"
                        />
                      )}

                      {/* Month labels */}
                      {months.map((m, i) => {
                        const x = PAD_L + (plotW * (i / 11));
                        return (
                          <text
                            key={m.key} x={x} y={H - 6}
                            textAnchor="middle" fontSize="10"
                            fill={m.isFuture ? "rgba(44,24,16,0.2)" : "rgba(44,24,16,0.5)"}
                            fontWeight="500"
                          >
                            {m.shortLabel}
                          </text>
                        );
                      })}

                      {/* Smooth lines with end-of-line marker only.
                          Quieter than the previous straight-segment + per-point
                          labels treatment. */}
                      {metrics.filter(metric => !hiddenMetrics.has(metric.key)).map(metric => {
                        const visibleMonths = months.filter(m => !m.isFuture);
                        const points = visibleMonths.map((m, i) => ({
                          x: PAD_L + (plotW * (months.indexOf(m) / 11)),
                          y: PAD_T + plotH - (plotH * ((m[metric.key] || 0) / maxVal)),
                          val: m[metric.key] || 0,
                        }));

                        if (points.length === 0) return null;

                        const pathD = smoothPath(points);
                        const endPoint = points[points.length - 1];

                        return (
                          <g key={metric.key}>
                            <path
                              d={pathD}
                              fill="none"
                              stroke={metric.color}
                              strokeWidth={metric.weight ?? (metric.dash ? 1.5 : 2)}
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              strokeDasharray={metric.dash}
                            />
                            {/* Single end-of-line dot to mark the latest data point */}
                            {endPoint.val > 0 && (
                              <circle
                                cx={endPoint.x}
                                cy={endPoint.y}
                                r={4}
                                fill={metric.color}
                                stroke="#F5F0E8"
                                strokeWidth="2"
                              />
                            )}
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

    </>
  );
}
