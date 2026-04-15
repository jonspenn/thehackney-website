/**
 * CustomersView - Customer table with type sub-tabs, search, sort.
 * Matches the Leads tab format but shows customer-relevant columns:
 * name, email, phone, event type/date, deal value, source, won date.
 *
 * Fetches from /api/customers?type=X independently.
 */

import { useEffect, useMemo, useState } from "react";

import { LEAD_TABS } from "./constants.js";
import { formatRelativeTime, resolveSource } from "./utils.js";

const EVENT_TYPE_LABEL = {
  "photo-film": "Photo/Film Shoot",
  "team-building": "Team Building",
  conference: "Conference",
  meeting: "Meeting",
  "product-launch": "Product Launch",
  "christmas-party": "Christmas Party",
  "summer-party": "Summer Party",
  other: "Other",
  wedding: "Wedding",
  corporate: "Corporate",
  "private-events": "Private Event",
};

function formatCurrency(n) {
  if (n == null) return "\u2014";
  return "\u00A3" + n.toLocaleString("en-GB");
}

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

export default function CustomersView({ onSelectCustomer }) {
  const [activeType, setActiveType] = useState("wedding");
  const [data, setData] = useState({}); // keyed by type
  const [loading, setLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState({ field: "won_at", dir: "desc" });
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

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

  const currentData = data[activeType];
  const customers = currentData?.customers || [];
  const summary = currentData?.summary || {};

  // Filter + sort
  const filtered = useMemo(() => {
    let arr = [...customers];
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
  }, [customers, search, sortConfig]);

  function changeType(type) {
    setActiveType(type);
    setSortConfig({ field: "won_at", dir: "desc" });
    setSearch("");
    setSearchDraft("");
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

  // Total customers across all types for the summary
  const totalCustomers = LEAD_TABS.reduce((sum, lt) => sum + (data[lt.type]?.total || 0), 0);

  return (
    <>
      {/* ── KPI cards ── */}
      <div className="cust-kpis">
        <div className="cust-kpi">
          <div className="cust-kpi__value">{totalCustomers}</div>
          <div className="cust-kpi__label">Total customers</div>
        </div>
        <div className="cust-kpi">
          <div className="cust-kpi__value">{currentData?.total || 0}</div>
          <div className="cust-kpi__label">{currentData?.lead_type_label || "Wedding"} customers</div>
        </div>
        <div className="cust-kpi">
          <div className="cust-kpi__value">{formatCurrency(summary.total_deal_value)}</div>
          <div className="cust-kpi__label">Total deal value</div>
        </div>
        <div className="cust-kpi">
          <div className="cust-kpi__value">{formatCurrency(summary.avg_deal_value)}</div>
          <div className="cust-kpi__label">Avg deal value</div>
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
        <div className="lead-panel__filters">
          <form className="lead-toolbar__search" onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}>
            <input
              type="text"
              className="lead-toolbar__input"
              placeholder="Search name, email, or phone\u2026"
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
          <span>Showing {filtered.length} of {customers.length} customers.{onSelectCustomer ? " Click a row to view full profile." : ""}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ marginTop: "4px" }}>
        {loading && customers.length === 0 ? (
          <p className="rep-empty-small">Loading customers\u2026</p>
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
                      <td style={{ fontWeight: 600 }}>{formatCurrency(c.deal_value)}</td>
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
                <div className="cust-source-card__value">{formatCurrency(s.value)}</div>
                <div className="cust-source-card__count">{s.count} customer{s.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
