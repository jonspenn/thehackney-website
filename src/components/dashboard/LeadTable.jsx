/**
 * LeadTable - Sortable, filterable leads table with type sub-tabs and toolbar.
 * Owns its own sort/filter/search state. Reports lead selection + active type to parent.
 */

import { useMemo, useState } from "react";

import {
  URGENCY_LABELS, URGENCY_STAGE,
  TIER_CONFIG,
  FUNNEL_LABELS, HEALTH_COLORS,
  LEAD_TABS,
} from "./constants.js";

import {
  formatRelativeTime,
  computeLeadScore, computeFunnelStage, resolveSource,
} from "./utils.js";

export default function LeadTable({ leads, deletedLeads, selectedLeadId, onSelectLead, onLeadTypeChange, onDelete, onRestore, showRecycleBin, onToggleRecycleBin }) {
  const [activeLeadType, setActiveLeadType] = useState("wedding");
  const [leadSort, setLeadSort] = useState({ field: "created_at", dir: "desc" });
  const [heatFilter, setHeatFilter] = useState("all");
  const [breakdownFilter, setBreakdownFilter] = useState(null);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadSearchDraft, setLeadSearchDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState(null); // null | "confirm1" | "confirm2"
  const [deleteLoading, setDeleteLoading] = useState(false);

  function changeLeadType(type) {
    setActiveLeadType(type);
    setLeadSort({ field: "created_at", dir: "desc" });
    setHeatFilter("all");
    setBreakdownFilter(null);
    setLeadSearch("");
    setLeadSearchDraft("");
    setSelectedIds(new Set());
    setDeleteConfirm(null);
    if (onLeadTypeChange) onLeadTypeChange(type);
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === sortedLeads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedLeads.map(l => l.contact_id)));
    }
  }

  async function handleDelete() {
    if (!deleteConfirm || selectedIds.size === 0) return;
    if (deleteConfirm === "confirm1") {
      setDeleteConfirm("confirm2");
      return;
    }
    // confirm2 - actually delete
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/lead-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: [...selectedIds], action: "delete" }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setDeleteConfirm(null);
        if (onDelete) onDelete();
      }
    } catch (err) {
      console.error("[lead-delete]", err);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRestore() {
    if (selectedIds.size === 0) return;
    setDeleteLoading(true);
    try {
      const res = await fetch("/api/lead-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_ids: [...selectedIds], action: "restore" }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        if (onRestore) onRestore();
      }
    } catch (err) {
      console.error("[lead-restore]", err);
    } finally {
      setDeleteLoading(false);
    }
  }

  // Notify parent of initial type on first render
  useMemo(() => { if (onLeadTypeChange) onLeadTypeChange(activeLeadType); }, []);

  const currentLeads = showRecycleBin ? deletedLeads?.[activeLeadType] : leads[activeLeadType];

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

  return (
    <>
      {/* ── Leads control panel ── */}
      <div className="lead-panel">
        {/* Lead type sub-tabs */}
        <div className="lead-panel__tabs">
          {LEAD_TABS.map((lt) => (
            <button
              key={lt.type}
              className={`adm-subtab${activeLeadType === lt.type ? " adm-subtab--active" : ""}`}
              onClick={() => changeLeadType(lt.type)}
              type="button"
            >
              {lt.label}
              {(leads[lt.type]?.total || 0) > 0 && (
                <span className="adm-subtab__count">{leads[lt.type].total}</span>
              )}
            </button>
          ))}
        </div>

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
          <span>
            {showRecycleBin
              ? `Recycle bin: ${sortedLeads.length} archived lead${sortedLeads.length !== 1 ? "s" : ""}.`
              : `Showing ${sortedLeads.length} of ${scoredLeads.length} leads. Click a row to view full profile.`}
          </span>
          <button
            type="button"
            className={`lead-toolbar__recycle-btn${showRecycleBin ? " lead-toolbar__recycle-btn--active" : ""}`}
            onClick={() => { onToggleRecycleBin?.(); setSelectedIds(new Set()); setDeleteConfirm(null); }}
          >
            {showRecycleBin ? "\u2190 Back to leads" : "\uD83D\uDDD1\uFE0F Recycle bin"}
          </button>
        </div>
        {/* Selection action bar */}
        {selectedIds.size > 0 && (
          <div className="lead-panel__actions">
            <span className="lead-panel__actions-count">{selectedIds.size} selected</span>
            {showRecycleBin ? (
              <button
                type="button"
                className="lead-panel__restore-btn"
                onClick={handleRestore}
                disabled={deleteLoading}
              >
                {deleteLoading ? "Restoring\u2026" : `Restore ${selectedIds.size} lead${selectedIds.size !== 1 ? "s" : ""}`}
              </button>
            ) : !deleteConfirm ? (
              <button
                type="button"
                className="lead-panel__delete-btn"
                onClick={() => setDeleteConfirm("confirm1")}
              >
                Archive {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""}
              </button>
            ) : deleteConfirm === "confirm1" ? (
              <span className="lead-panel__confirm">
                <span>Move {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} to recycle bin?</span>
                <button type="button" className="lead-panel__confirm-yes" onClick={handleDelete}>Yes, archive</button>
                <button type="button" className="lead-panel__confirm-no" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              </span>
            ) : (
              <span className="lead-panel__confirm">
                <span style={{ fontWeight: 700 }}>Are you sure? This moves them out of the active leads list.</span>
                <button type="button" className="lead-panel__confirm-yes lead-panel__confirm-yes--final" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading ? "Archiving\u2026" : "Confirm archive"}
                </button>
                <button type="button" className="lead-panel__confirm-no" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              </span>
            )}
          </div>
        )}
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
                  <th style={{ width: "36px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={sortedLeads.length > 0 && selectedIds.size === sortedLeads.length}
                      onChange={toggleSelectAll}
                      title="Select all"
                      className="lead-checkbox"
                    />
                  </th>
                  <th onClick={() => toggleSort("score")} style={{ cursor: "pointer", width: "52px" }}>Score{sortIndicator("score")}</th>
                  <th style={{ width: "80px" }}>Stage</th>
                  <th onClick={() => toggleSort("created_at")} style={{ cursor: "pointer" }}>Created{sortIndicator("created_at")}</th>
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
                  <th style={{ width: "60px" }}>HubSpot</th>
                </tr>
              </thead>
              <tbody>
                {sortedLeads.map((lead) => {
                  const sc = lead._score;
                  const tc = TIER_CONFIG[sc.tier];
                  const funnel = computeFunnelStage(lead, activeLeadType);
                  const hc = funnel.health ? HEALTH_COLORS[funnel.health] : null;
                  return (
                    <tr
                      key={lead.contact_id}
                      className={`lead-row lead-row--${sc.tier}${sc.isDead ? " lead-row--dead" : ""}${selectedLeadId === lead.contact_id ? " lead-row--selected" : ""}`}
                      style={{ borderLeft: `4px solid ${tc.border}`, background: tc.bg, cursor: "pointer" }}
                      onClick={() => onSelectLead(lead, activeLeadType)}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(lead.contact_id)}
                          onChange={() => toggleSelect(lead.contact_id)}
                          className="lead-checkbox"
                        />
                      </td>
                      {/* Score badge */}
                      <td>
                        <span
                          className="lead-score-badge"
                          style={{ background: sc.tier === "cold" ? "rgba(44,24,16,0.08)" : tc.color, color: sc.tier === "cold" ? "rgba(44,24,16,0.35)" : "#fff" }}
                          title={`Stage ${sc.breakdown.stage} + Intent ${sc.breakdown.intent} + Recency ${sc.breakdown.recency} + Engagement ${sc.breakdown.engagement} + Date ${sc.breakdown.dateProximity} + Revenue ${sc.breakdown.revenue}`}
                        >
                          {sc.score}
                        </span>
                      </td>
                      {/* Funnel stage pills */}
                      <td>
                        <span className="lead-stage-pills">
                          {funnel.stages.map((stageKey) => {
                            const done = !!funnel.completed[stageKey];
                            const current = funnel.currentStage === stageKey;
                            let bg = undefined;
                            if (done && !current) bg = tc.color;
                            else if (current && hc) bg = hc.color;
                            else if (current) bg = tc.color;
                            return (
                              <span
                                key={stageKey}
                                className={`lead-stage-pill${done || current ? " lead-stage-pill--filled" : ""}${current ? " lead-stage-pill--current" : ""}`}
                                style={bg ? { background: bg } : {}}
                                title={`${FUNNEL_LABELS[stageKey]}${current ? ` (${funnel.daysInStage}d)` : ""}`}
                              />
                            );
                          })}
                          <span className="lead-stage-label">{FUNNEL_LABELS[funnel.currentStage]}</span>
                          {funnel.health && funnel.health !== "green" && (
                            <span className="lead-health-badge" style={{ color: hc.color, background: hc.bg }}>{funnel.daysInStage}d</span>
                          )}
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
                            <span className={`rep-urgency rep-urgency--${URGENCY_STAGE[lead.urgency] != null ? lead.urgency : "unknown"}`}>
                              <span className="rep-urgency__stage">{URGENCY_STAGE[lead.urgency] ?? 0}</span>
                              {URGENCY_LABELS[lead.urgency]?.replace(/^\d\s*\u00B7\s*/, "") || "No signal"}
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
                      {(() => { const src = resolveSource(lead.source_channel); return (
                        <td><span className="lead-source-badge" style={{ color: src.color, background: src.bg }}>{src.label}</span></td>
                      ); })()}
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
                      <td onClick={(e) => e.stopPropagation()}>
                        {lead.hubspot_contact_id ? (
                          <a
                            href={`https://app.hubspot.com/contacts/25870094/contact/${lead.hubspot_contact_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="cust-hs-link"
                            title="Open in HubSpot"
                          >View</a>
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
  );
}
