/**
 * CustomersView - Customer table with type sub-tabs, search, sort.
 * Matches the Leads tab format but shows customer-relevant columns:
 * name, email, phone, event type/date, deal value, source, won date.
 *
 * Fetches from /api/customers?type=X independently.
 */

import { useEffect, useMemo, useState } from "react";

import { LEAD_TABS } from "./constants.js";
import { formatRelativeTime, resolveSource, formatPoundsExact } from "./utils.js";
import { SubModeToggle } from "./primitives/index.js";

/* Event type labels for the Customers view - MUST stay in sync with
   EVENT_TYPE_OPTIONS in src/components/CorporateQuiz.jsx. When the quiz changes,
   update this map, EVENT_TYPE_DISPLAY in dashboard/constants.js, and
   EVENT_TYPE_LABEL in functions/api/leads.js together. Extra entries below
   (wedding/corporate/private-events) are lead_type values that flow through
   the same column - not event_type enum values. */
const EVENT_TYPE_LABEL = {
  // Current CorporateQuiz options (16 Apr 2026)
  conference: "Conference or Seminar",
  "team-day": "Team Day or Offsite",
  "launch-showcase": "Launch, Showcase or Press Event",
  "photo-film": "Photography or Film Shoot",
  other: "Something else",
  // Legacy event_type values still present in D1.
  "team-building": "Team Building",
  meeting: "Meeting",
  "product-launch": "Product Launch",
  "christmas-party": "Christmas Party",
  "summer-party": "Summer Party",
  // Lead-type pass-throughs used by this column.
  wedding: "Wedding",
  corporate: "Corporate",
  "private-events": "Private Event",
};

const HUBSPOT_PORTAL = "25870094";

function hubspotUrl(contactId) {
  if (!contactId) return null;
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/contact/${contactId}`;
}

function formatDate(iso) {
  if (!iso) return "\u2014";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch { return iso; }
}

export default function CustomersView({ onSelectCustomer, initialType, onTypeChange, pendingCustomerId, onPendingResolved }) {
  const [activeType, setActiveType] = useState(initialType || "wedding");
  const [data, setData] = useState({}); // keyed by type
  const [loading, setLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ field: "won_at", dir: "desc" });
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  /* Year filter - default to current calendar year so the table opens
     short and recent. URL persistence via ?year= so the filter survives
     reload. "all" = no year filter (full history). */
  const [yearFilter, setYearFilter] = useState(() => {
    if (typeof window === "undefined") return String(new Date().getFullYear());
    const url = new URLSearchParams(window.location.search);
    const y = url.get("year");
    return y || String(new Date().getFullYear());
  });

  // Fetch customers for all types on mount
  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      const types = LEAD_TABS.map(t => t.type);
      const results = await Promise.all(
        types.map(t =>
          fetch(`/api/customers?type=${t}`, { cache: "no-store" })
            .then(r => r.json())
            .catch(() => null)
        )
      );
      const newData = {};
      for (let i = 0; i < types.length; i++) {
        if (results[i]?.ok) newData[types[i]] = results[i];
      }
      setData(newData);
      setLoading(false);
    }
    fetchAll();
    const timer = setInterval(fetchAll, 60000);
    return () => clearInterval(timer);
  }, []);

  // If parent passed a pendingCustomerId (from URL), find it across all types
  // once data has loaded and call onSelectCustomer to open the profile.
  useEffect(() => {
    if (!pendingCustomerId || loading) return;
    for (const t of LEAD_TABS.map(x => x.type)) {
      const arr = data[t]?.customers;
      if (!arr) continue;
      const hit = arr.find(c => c.contact_id === pendingCustomerId);
      if (hit) {
        if (onSelectCustomer) onSelectCustomer(hit, t);
        if (onPendingResolved) onPendingResolved();
        return;
      }
    }
    // Not found - clear it so the URL gets cleaned up
    if (onPendingResolved) onPendingResolved();
  }, [pendingCustomerId, data, loading]);

  const currentData = data[activeType];
  const customers = currentData?.customers || [];
  const summary = currentData?.summary || {};

  /* Available years from the customers dataset, descending. Used to
     populate the year filter SubModeToggle. */
  const availableYears = useMemo(() => {
    const years = new Set();
    for (const c of customers) {
      if (c.won_at) {
        const y = new Date(c.won_at).getFullYear();
        if (Number.isFinite(y)) years.add(y);
      }
    }
    return [...years].sort((a, b) => b - a);
  }, [customers]);

  /* Modes for the year SubModeToggle: each year that has data, plus "All time". */
  const yearModes = useMemo(() => {
    const modes = availableYears.map(y => ({ id: String(y), label: String(y) }));
    modes.push({ id: "all", label: "All time" });
    return modes;
  }, [availableYears]);

  // Filter + sort
  const filtered = useMemo(() => {
    let arr = [...customers];
    /* Year filter first so search + sort work over the year-scoped subset. */
    if (yearFilter !== "all") {
      const target = parseInt(yearFilter, 10);
      arr = arr.filter(c => {
        if (!c.won_at) return false;
        const y = new Date(c.won_at).getFullYear();
        return y === target;
      });
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(c => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase();
        const email = (c.email || "").toLowerCase();
        const phone = (c.phone || "").toLowerCase();
        return name.includes(q) || email.includes(q) || phone.includes(q);
      });
    }
    const { field, dir } = sortConfig;
    arr.sort((a, b) => {
      let va = a[field], vb = b[field];
      if (va == null) va = dir === "asc" ? "\uffff" : "";
      if (vb == null) vb = dir === "asc" ? "\uffff" : "";
      if (va < vb) return dir === "asc" ? -1 : 1;
      if (va > vb) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [customers, search, sortConfig, yearFilter]);

  function changeType(type) {
    setActiveType(type);
    setSortConfig({ field: "won_at", dir: "desc" });
    setSearch("");
    setSearchDraft("");
    if (onTypeChange) onTypeChange(type);
  }

  function selectYear(id) {
    setYearFilter(id);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (id === String(new Date().getFullYear())) {
      params.delete("year"); /* default - keep URL clean */
    } else {
      params.set("year", id);
    }
    const qs = params.toString();
    window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }

  function toggleSort(field) {
    setSortConfig(prev =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "desc" }
    );
  }

  function sortIndicator(field) {
    if (sortConfig.field !== field) return "";
    return sortConfig.dir === "asc" ? " \u25B2" : " \u25BC";
  }

  /* Filtered KPIs - reflect the year-scoped + searched subset.
     totalDealValue + avgDealValue computed from filtered array because
     the API summary is all-time. typeCount = filtered length for the
     active type. totalCustomers stays all-time across all types as the
     stable headline (year-aware via filteredAcrossTypes). */
  const filteredAcrossTypes = useMemo(() => {
    let n = 0;
    for (const lt of LEAD_TABS) {
      const arr = data[lt.type]?.customers || [];
      for (const c of arr) {
        if (yearFilter !== "all") {
          if (!c.won_at) continue;
          if (new Date(c.won_at).getFullYear() !== parseInt(yearFilter, 10)) continue;
        }
        n++;
      }
    }
    return n;
  }, [data, yearFilter]);

  const filteredSummary = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const c of filtered) {
      if (c.deal_value != null) {
        total += Number(c.deal_value) || 0;
        count++;
      }
    }
    return {
      total_deal_value: count > 0 ? total : null,
      avg_deal_value:   count > 0 ? Math.round(total / count) : null,
      type_count: filtered.length,
    };
  }, [filtered]);

  const totalCustomers = filteredAcrossTypes;

  return (
    <>
      {/* ── KPI cards ── */}
      <div className="cust-kpis">
        <div className="cust-kpi">
          <div className="cust-kpi__value">{totalCustomers}</div>
          <div className="cust-kpi__label">{yearFilter === "all" ? "Total customers" : `Customers (${yearFilter})`}</div>
        </div>
        <div className="cust-kpi">
          <div className="cust-kpi__value">{filteredSummary.type_count}</div>
          <div className="cust-kpi__label">{currentData?.lead_type_label || "Wedding"} customers{yearFilter === "all" ? "" : ` (${yearFilter})`}</div>
        </div>
        <div className="cust-kpi">
          <div className="cust-kpi__value">{formatPoundsExact(filteredSummary.total_deal_value)}</div>
          <div className="cust-kpi__label">Total deal value{yearFilter === "all" ? "" : ` (${yearFilter})`}</div>
        </div>
        <div className="cust-kpi">
          <div className="cust-kpi__value">{formatPoundsExact(filteredSummary.avg_deal_value)}</div>
          <div className="cust-kpi__label">Avg deal value{yearFilter === "all" ? "" : ` (${yearFilter})`}</div>
        </div>
      </div>

      {/* ── Control panel (matches lead-panel) ── */}
      <div className="lead-panel">
        {/* Type sub-tabs */}
        <div className="lead-panel__tabs">
          {LEAD_TABS.map((lt) => (
            <button
              key={lt.type}
              className={`adm-subtab${activeType === lt.type ? " adm-subtab--active" : ""}`}
              onClick={() => changeType(lt.type)}
              type="button"
            >
              {lt.label}
              {(data[lt.type]?.total || 0) > 0 && (
                <span className="adm-subtab__count">{data[lt.type].total}</span>
              )}
            </button>
          ))}
        </div>

        <div className="lead-panel__divider" />

        {/* Search */}
        {/* Year filter - shrinks 261-row history to a single year for legibility.
            Defaults to current year. "All time" option for full history. */}
        {yearModes.length > 1 && (
          <SubModeToggle
            modes={yearModes}
            active={yearFilter}
            onChange={selectYear}
          />
        )}

        <div className="lead-panel__filters">
          <form className="lead-toolbar__search" onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}>
            <input
              type="text"
              className="lead-toolbar__input"
              placeholder="Search name, email, or phone…"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
            />
            <button className="lead-toolbar__search-btn" type="submit">Search</button>
          </form>
        </div>

        {/* Active filters */}
        {search && (
          <div className="lead-panel__filters">
            <div className="lead-toolbar__active">
              <span className="lead-toolbar__tag">Search: "{search}" <button onClick={() => { setSearch(""); setSearchDraft(""); }}>{"\u2715"}</button></span>
              <button className="lead-toolbar__clear-all" onClick={() => { setSearch(""); setSearchDraft(""); }}>Clear</button>
            </div>
          </div>
        )}

        <div className="lead-panel__status">
          <span>Showing {filtered.length} of {customers.length} customers{yearFilter === "all" ? "" : ` (${yearFilter})`}.{onSelectCustomer ? " Click a row to view full profile." : ""}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ marginTop: "4px" }}>
        {loading && customers.length === 0 ? (
          <p className="rep-empty-small">Loading customers…</p>
        ) : filtered.length === 0 ? (
          <p className="rep-empty-small">No {currentData?.lead_type_label?.toLowerCase() || activeType} customers yet.</p>
        ) : (
          <div className="rep-table-wrap">
            <table className="rep-table rep-table--sortable">
              <thead>
                <tr>
                  <th onClick={() => toggleSort("won_at")} style={{ cursor: "pointer" }}>Won{sortIndicator("won_at")}</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  {activeType === "corporate" && <th>Company</th>}
                  {activeType === "wedding" && <th onClick={() => toggleSort("event_date")} style={{ cursor: "pointer" }}>Wedding date{sortIndicator("event_date")}</th>}
                  {activeType === "corporate" && <th>Event type</th>}
                  {activeType === "corporate" && <th>Event date</th>}
                  {(activeType === "private-events" || activeType === "supperclub" || activeType === "cafe-bar") && <th>Event date</th>}
                  <th onClick={() => toggleSort("deal_value")} style={{ cursor: "pointer" }}>Deal value{sortIndicator("deal_value")}</th>
                  <th>Source</th>
                  <th>Location</th>
                  <th style={{ width: "60px" }}>HubSpot</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const src = resolveSource(c.source_channel);
                  return (
                    <tr
                      key={c.contact_id}
                      className="cust-row"
                      style={{ cursor: onSelectCustomer ? "pointer" : "default" }}
                      onClick={() => onSelectCustomer?.(c, activeType)}
                    >
                      <td>{formatDate(c.won_at)}</td>
                      <td>{[c.first_name, c.last_name].filter(Boolean).join(" ") || "\u2014"}</td>
                      <td>{c.email}</td>
                      <td>{c.phone || "\u2014"}</td>
                      {activeType === "corporate" && <td>{c.company || "\u2014"}</td>}
                      {activeType === "wedding" && <td>{c.event_date || "\u2014"}</td>}
                      {activeType === "corporate" && <td>{EVENT_TYPE_LABEL[c.event_type] || c.event_type || "\u2014"}</td>}
                      {activeType === "corporate" && <td>{c.event_date || "\u2014"}</td>}
                      {(activeType === "private-events" || activeType === "supperclub" || activeType === "cafe-bar") && <td>{c.event_date || "\u2014"}</td>}
                      <td style={{ fontWeight: 600 }}>{formatPoundsExact(c.deal_value)}</td>
                      <td><span className="lead-source-badge" style={{ color: src.color, background: src.bg }}>{src.label}</span></td>
                      <td>{[c.ip_city, c.ip_country].filter(Boolean).join(", ") || "\u2014"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {c.hubspot_contact_id ? (
                          <a
                            href={hubspotUrl(c.hubspot_contact_id)}
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

      {/* ── Source attribution summary ── */}
      {(summary.by_source || []).length > 0 && (
        <div className="cust-source-summary">
          <h3 className="cust-source-summary__title">Revenue by source</h3>
          <div className="cust-source-summary__grid">
            {summary.by_source.map((s) => (
              <div key={s.label} className="cust-source-card">
                <div className="cust-source-card__label">{s.label}</div>
                <div className="cust-source-card__value">{formatPoundsExact(s.value)}</div>
                <div className="cust-source-card__count">{s.count} customer{s.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
