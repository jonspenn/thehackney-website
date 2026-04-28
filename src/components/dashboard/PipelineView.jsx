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

import { CardSurface, FunnelTrack, SoftPill } from "./primitives/index.js";

/* Non-terminal stages that appear on the main track */
const TERMINAL_STAGES = new Set(["lost", "cancelled", "noshow"]);

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Colours for each metric bar in the monthly chart */
const TREND_METRICS = [
  { key: "new",       label: "New leads",  color: "#2C1810" },
  { key: "qualified", label: "Qualified",  color: "#49590E" },
  { key: "engaged",   label: "Engaged",    color: "#2E4009" },
  { key: "call",      label: "Calls",      color: "#BF7256" },
  { key: "tour",      label: "Tours",      color: "#40160C" },
  { key: "won",       label: "Won",        color: "#8C472E" },
  { key: "lost",      label: "Lost",       color: "rgba(44,24,16,0.25)" },
];

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
      let cumulativeThis = 0;
      for (let j = i; j < stages.length; j++) cumulativeThis += (stageCounts[stages[j]] || 0);
      const denom = cumulativeThis + (stageCounts[stages[i - 1]] || 0); // at-or-past prior
      rates[stages[i]] = denom > 0 ? Math.round((cumulativeThis / denom) * 100) : null;
    }
    return rates;
  }, [stageCounts, stages]);

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

      {/* ── Collapsible monthly trends (above the drill-in table) ── */}
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
                    <span className="pipe-legend__swatch" style={{ background: hiddenMetrics.has(m.key) ? "rgba(44,24,16,0.15)" : m.color }} />
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
                const W = 800, H = 180, PAD_T = 24, PAD_B = 28, PAD_L = 28, PAD_R = 12;
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
                      {/* Grid lines */}
                      {gridLines.map(g => (
                        <g key={g.val}>
                          <line x1={PAD_L} y1={g.y} x2={W - PAD_R} y2={g.y} stroke="rgba(44,24,16,0.08)" strokeWidth="1" />
                          <text x={PAD_L - 6} y={g.y + 3} textAnchor="end" fontSize="9" fill="rgba(44,24,16,0.35)">{g.val}</text>
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

                      {/* Lines + dots for each metric */}
                      {metrics.filter(metric => !hiddenMetrics.has(metric.key)).map(metric => {
                        const points = months
                          .filter(m => !m.isFuture)
                          .map((m, i) => ({
                            x: PAD_L + (plotW * (i / 11)),
                            y: PAD_T + plotH - (plotH * ((m[metric.key] || 0) / maxVal)),
                            val: m[metric.key] || 0,
                          }));

                        if (points.length === 0) return null;

                        const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

                        return (
                          <g key={metric.key}>
                            <path d={pathD} fill="none" stroke={metric.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                            {points.map((p, i) => (
                              <g key={i}>
                                <circle cx={p.x} cy={p.y} r={p.val > 0 ? 3.5 : 2} fill={p.val > 0 ? metric.color : "rgba(44,24,16,0.1)"} stroke="#F5F0E8" strokeWidth="1.5" />
                                {p.val > 0 && (
                                  <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fontWeight="600" fill={metric.color}>{p.val}</text>
                                )}
                              </g>
                            ))}
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

      {/* ── Leads in selected stage (now below both collapsible sections) ── */}
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
    </>
  );
}
