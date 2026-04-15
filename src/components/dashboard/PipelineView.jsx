/**
 * PipelineView - Visual funnel pipeline showing lead counts per stage.
 * Sub-tabs by revenue stream. Click a stage to see leads in that stage.
 * Click a lead row to open their full profile.
 */

import { useMemo, useState } from "react";

import {
  LEAD_TABS,
  FUNNEL_STAGES, FUNNEL_LABELS, STAGE_DEFINITIONS,
  TIER_CONFIG, HEALTH_COLORS,
} from "./constants.js";

import {
  formatRelativeTime,
  computeLeadScore, computeFunnelStage, resolveSource,
} from "./utils.js";

/* Non-terminal stages that appear on the main track */
const TERMINAL_STAGES = new Set(["lost", "cancelled", "noshow"]);

export default function PipelineView({ leads, onSelectLead }) {
  const [activeType, setActiveType] = useState("wedding");
  const [selectedStage, setSelectedStage] = useState(null);

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
      const curr = stageCounts[stages[i]] || 0;
      // Cumulative: sum of this stage + all later stages
      let cumulative = 0;
      for (let j = i; j < stages.length; j++) cumulative += (stageCounts[stages[j]] || 0);
      rates[stages[i]] = prev > 0 ? Math.round((cumulative / prev) * 100) : null;
    }
    return rates;
  }, [stageCounts, stages]);

  const selectedLeads = selectedStage ? (stageLeads[selectedStage] || []) : [];
  // Sort by score descending
  const sortedSelectedLeads = useMemo(() => {
    return [...selectedLeads].sort((a, b) => (b._score?.score || 0) - (a._score?.score || 0));
  }, [selectedLeads]);

  const totalTerminal = terminalCounts.lost + terminalCounts.cancelled + terminalCounts.noshow;

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

        {/* ── Visual pipeline ── */}
        <div className="pipe-funnel">
          {stages.map((stageKey, i) => {
            const count = stageCounts[stageKey] || 0;
            const isSelected = selectedStage === stageKey;
            const barWidth = maxCount > 0 ? Math.max(8, (count / maxCount) * 100) : 8;

            return (
              <div key={stageKey} className="pipe-stage-col">
                {/* Conversion arrow between stages */}
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

        {/* Terminal stages row (lost, cancelled, no-show) */}
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

        {/* Summary line */}
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

      {/* ── Leads in selected stage ── */}
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
