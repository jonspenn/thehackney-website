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

/* Non-terminal stages that appear on the main track */
const TERMINAL_STAGES = new Set(["lost", "cancelled", "noshow"]);

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Colours for each metric bar in the monthly chart */
const TREND_METRICS = [
  { key: "new",       label: "New leads",  color: "#2C1810" },
  { key: "qualified", label: "Qualified",  color: "#49590E" },
  { key: "engaged",   label: "Engaged",    color: "#2E4009" },
  { key: "meeting",   label: "Meeting+",   color: "#BF7256" },
  { key: "won",       label: "Won",        color: "#8C472E" },
  { key: "lost",      label: "Lost",       color: "rgba(44,24,16,0.25)" },
];

export default function PipelineView({ leads, onSelectLead }) {
  const [activeType, setActiveType] = useState("wedding");
  const [selectedStage, setSelectedStage] = useState(null);
  const [funnelOpen, setFunnelOpen] = useState(true);
  const [trendsOpen, setTrendsOpen] = useState(true);

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
  const maxCount = Math.max(1, ...Object.values(stageCounts));

  /* Conversion rates between consecutive stages */
  const conversionRates = useMemo(() => {
    const rates = {};
    for (let i = 1; i < stages.length; i++) {
      const prev = stageCounts[stages[i - 1]] || 0;
      let cumulative = 0;
      for (let j = i; j < stages.length; j++) cumulative += (stageCounts[stages[j]] || 0);
      rates[stages[i]] = prev > 0 ? Math.round((cumulative / prev) * 100) : null;
    }
    return rates;
  }, [stageCounts, stages]);

  const selectedLeads = selectedStage ? (stageLeads[selectedStage] || []) : [];
  const sortedSelectedLeads = useMemo(() => {
    return [...selectedLeads].sort((a, b) => (b._score?.score || 0) - (a._score?.score || 0));
  }, [selectedLeads]);

  const totalTerminal = terminalCounts.lost + terminalCounts.cancelled + terminalCounts.noshow;

  /* ── Monthly trends ── */
  const monthlyData = useMemo(() => {
    const currentLeads = leads[activeType]?.leads || [];
    if (currentLeads.length === 0) return { months: [], maxVal: 0 };

    const isHighIntent = activeType === "wedding" || activeType === "corporate" || activeType === "private-events";

    function toMonthKey(ts) {
      const d = parseTimestamp(ts);
      if (!d) return null;
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    }

    let earliest = null;
    for (const lead of currentLeads) {
      const d = parseTimestamp(lead.created_at);
      if (d && (!earliest || d < earliest)) earliest = d;
    }
    if (!earliest) return { months: [], maxVal: 0 };

    const now = new Date();
    const monthKeys = [];
    const cur = new Date(Date.UTC(earliest.getUTCFullYear(), earliest.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    while (cur <= end) {
      monthKeys.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, "0")}`);
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }

    const buckets = {};
    for (const mk of monthKeys) {
      buckets[mk] = { new: 0, qualified: 0, engaged: 0, meeting: 0, won: 0, lost: 0 };
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
        if (lead.meeting_at) {
          const mKey = toMonthKey(lead.meeting_at);
          if (mKey && buckets[mKey]) buckets[mKey].meeting++;
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
    const months = monthKeys.map(mk => {
      const [y, m] = mk.split("-");
      const data = buckets[mk];
      for (const v of Object.values(data)) { if (v > maxVal) maxVal = v; }
      return { key: mk, label: `${SHORT_MONTHS[parseInt(m, 10) - 1]} ${y}`, shortLabel: SHORT_MONTHS[parseInt(m, 10) - 1], ...data };
    });

    return { months, maxVal, isHighIntent };
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
              onClick={() => { setActiveType(lt.type); setSelectedStage(null); }}
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
              {stages.map((stageKey, i) => {
                const count = stageCounts[stageKey] || 0;
                const isSelected = selectedStage === stageKey;
                const barWidth = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 8;

                return (
                  <div key={stageKey} className="pipe-stage-col">
                    {i > 0 && conversionRates[stageKey] != null && (
                      <div className="pipe-conv-arrow">
                        <span className="pipe-conv-arrow__pct">{conversionRates[stageKey]}%</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className={`pipe-stage${isSelected ? " pipe-stage--selected" : ""}${count === 0 ? " pipe-stage--empty" : ""}`}
                      onClick={() => setSelectedStage(isSelected ? null : stageKey)}
                    >
                      <div className="pipe-stage__bar" style={{ width: `${barWidth}%` }} />
                      <div className="pipe-stage__count">{count}</div>
                      <div className="pipe-stage__label">{FUNNEL_LABELS[stageKey]}</div>
                    </button>
                  </div>
                );
              })}
            </div>

            {totalTerminal > 0 && (
              <div className="pipe-terminal">
                {["lost", "cancelled", "noshow"].map(key => {
                  if (!terminalCounts[key]) return null;
                  const isSelected = selectedStage === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`pipe-terminal__btn${isSelected ? " pipe-terminal__btn--selected" : ""}`}
                      onClick={() => setSelectedStage(isSelected ? null : key)}
                    >
                      {FUNNEL_LABELS[key]}: {terminalCounts[key]}
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
            Monthly trends {!trendsOpen && <span className="pipe-collapse-toggle__summary">{monthlyData.months.length} month{monthlyData.months.length !== 1 ? "s" : ""}</span>}
          </button>

          {trendsOpen && (
            <>
              <p className="pipe-trends__sub">Month-by-month breakdown. Spot seasonal patterns, drops, and growth.</p>

              <div className="pipe-legend">
                {(monthlyData.isHighIntent ? TREND_METRICS : TREND_METRICS.slice(0, 1)).map(m => (
                  <span key={m.key} className="pipe-legend__item">
                    <span className="pipe-legend__swatch" style={{ background: m.color }} />
                    {m.label}
                  </span>
                ))}
              </div>

              <div className="pipe-chart">
                {monthlyData.months.map((month) => {
                  const metrics = monthlyData.isHighIntent ? TREND_METRICS : TREND_METRICS.slice(0, 1);
                  const maxVal = monthlyData.maxVal || 1;

                  return (
                    <div key={month.key} className="pipe-chart__col">
                      <div className="pipe-chart__bars">
                        {metrics.map(m => {
                          const val = month[m.key] || 0;
                          const pct = Math.max(0, (val / maxVal) * 100);
                          return (
                            <div
                              key={m.key}
                              className={`pipe-chart__bar${val === 0 ? " pipe-chart__bar--empty" : ""}`}
                              style={{ height: `${Math.max(pct, val > 0 ? 4 : 0)}%`, background: m.color }}
                              title={`${m.label}: ${val}`}
                            >
                              {val > 0 && <span className="pipe-chart__val">{val}</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="pipe-chart__label">{month.shortLabel}</div>
                      {month.key.endsWith("-01") && (
                        <div className="pipe-chart__year">{month.key.split("-")[0]}</div>
                      )}
                    </div>
                  );
                })}
              </div>
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
