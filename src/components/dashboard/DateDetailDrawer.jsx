/**
 * DateDetailDrawer - Per-date detail panel for the Dates tab.
 *
 * Slides in from the right. Inner sections use the lp-card chrome to
 * visually align with lead-profile / pipeline cards. Status pill via
 * SoftPill, eyebrows via EyebrowLabel, big numbers in Cormorant tabular.
 *
 * Props:
 *   date          ISO YYYY-MM-DD
 *   bookedDates   Set of booked ISO dates
 *   onClose       () => void
 *   onSelectLead  (lead, leadType) => void
 *   leads         AdminDashboard's leads state (per stream)
 *   pricing       wedding-pricing.json content
 */

import { useEffect, useState } from "react";
import { LEAD_TYPE_LABELS } from "./constants.js";
import { SoftPill, EyebrowLabel } from "./primitives/index.js";

function fmt(n) { return n == null ? "—" : `£${n.toLocaleString("en-GB")}`; }

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function dayType(iso) {
  const d = new Date(iso);
  const dow = d.getDay();
  if (dow === 6) return "Saturday";
  if (dow === 5) return "Friday";
  if (dow === 0) return "Sunday";
  return "Sun - Thu";
}

function daysFromToday(iso) {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function statusVariant(status) {
  if (status === "Booked") return "brick";
  if (status === "Past") return "muted";
  return "olive"; // Available
}

export default function DateDetailDrawer({ date, bookedDates, onClose, onSelectLead, leads, pricing }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeInput, setFeeInput] = useState("");
  const [minInput, setMinInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!date) return;
    setLoading(true);
    setError(null);
    fetch(`/api/dates?mode=detail&date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) {
          setData(j);
          setFeeInput(j.override?.fee != null ? String(j.override.fee) : "");
          setMinInput(j.override?.min != null ? String(j.override.min) : "");
          setNoteInput("");
        } else {
          setError(j.error || "fetch_failed");
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [date]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose && onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function saveOverride(clearedAction = false) {
    setSaving(true);
    setError(null);
    try {
      const body = clearedAction
        ? { date, cleared: true, note: noteInput || null }
        : {
            date,
            fee: feeInput === "" ? null : parseInt(feeInput, 10),
            min: minInput === "" ? null : parseInt(minInput, 10),
            note: noteInput || null,
          };
      const r = await fetch("/api/date-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "save_failed");
      const refresh = await fetch(`/api/dates?mode=detail&date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const rj = await refresh.json();
      if (rj.ok) {
        setData(rj);
        setFeeInput(rj.override?.fee != null ? String(rj.override.fee) : "");
        setMinInput(rj.override?.min != null ? String(rj.override.min) : "");
        setNoteInput("");
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setSaving(false);
    }
  }

  if (!date) return null;

  const dayTypeLabel = dayType(date);
  const daysOut = daysFromToday(date);
  const status = bookedDates && bookedDates.has(date) ? "Booked" : daysOut < 0 ? "Past" : "Available";
  const month = parseInt(date.slice(5, 7), 10);
  const year = date.slice(0, 4);

  // Rate-card baseline lookup
  let baseline = null;
  if (pricing?.rateCards?.[year]) {
    const card = pricing.rateCards[year];
    const dayTypeCode =
      dayTypeLabel === "Saturday" ? "sat" :
      dayTypeLabel === "Friday" ? "fri" : "sun-thu";
    const row = card.rows.find((r) => r.month === month && r.dayType === dayTypeCode);
    if (row) baseline = { fee: row.hire, min: row.min, dayType: dayTypeCode };
  }

  const effectiveFee = data?.override?.fee != null ? data.override.fee : baseline?.fee;
  const effectiveMin = data?.override?.min != null ? data.override.min : baseline?.min;

  return (
    <>
      <div className="dt-drawer-backdrop" onClick={onClose} />
      <aside className="dt-drawer" role="dialog" aria-label={`Detail for ${date}`}>
        <header className="dt-drawer-head">
          <div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <SoftPill variant={statusVariant(status)} dot uppercase>{status}</SoftPill>
              <SoftPill variant="muted" uppercase>{dayTypeLabel}</SoftPill>
            </div>
            <h2 className="dt-drawer-title">{fmtDate(date)}</h2>
            <div className="dt-drawer-sub">
              {daysOut === 0 ? "Today" : daysOut > 0 ? `${daysOut} days from today` : `${Math.abs(daysOut)} days ago`}
            </div>
          </div>
          <button className="dt-drawer-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </header>

        {loading && <div className="dt-drawer-body"><p className="rep-empty-small">Loading…</p></div>}

        {error && <div className="dt-drawer-body"><p className="rep-empty-small">Error: {error}</p></div>}

        {!loading && !error && data && (
          <div className="dt-drawer-body">
            {/* Click overview - card with metadata strip */}
            <div className="lp-card dt-drawer-card">
              <div className="dt-drawer-stat-row">
                <div>
                  <EyebrowLabel size="sm">Clicks (all time)</EyebrowLabel>
                  <div className="pipe-metric" style={{ marginTop: 4 }}>{data.totalClicks}</div>
                </div>
                <div>
                  <EyebrowLabel size="sm">Known leads</EyebrowLabel>
                  <div className="pipe-metric" style={{ marginTop: 4 }}>
                    {(data.recentLeads || []).length}{data.recentLeads?.length === 5 ? "+" : ""}
                  </div>
                </div>
              </div>
            </div>

            {/* Per-stream breakdown */}
            {data.breakdown && data.breakdown.length > 0 && (
              <div className="lp-card dt-drawer-card">
                <h3 className="dt-drawer-h">Per-stream click breakdown</h3>
                <div className="dt-breakdown">
                  {data.breakdown.map((b) => {
                    const max = Math.max(...data.breakdown.map((x) => x.clicks));
                    const pct = Math.max(8, Math.round((b.clicks / max) * 100));
                    const label = LEAD_TYPE_LABELS[b.stream] || b.stream;
                    return (
                      <div className="dt-breakdown-row" key={b.stream}>
                        <span className="dt-breakdown-label">{label}</span>
                        <span className="dt-breakdown-bar-wrap">
                          <span className="dt-breakdown-bar" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="dt-breakdown-count">{b.clicks}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent leads */}
            {data.recentLeads && data.recentLeads.length > 0 && (
              <div className="lp-card dt-drawer-card">
                <h3 className="dt-drawer-h">Recent leads who clicked this date</h3>
                <ul className="dt-leads">
                  {data.recentLeads.map((l) => {
                    const fullLead = leads?.[l.lead_type]?.leads?.find((x) => x.contact_id === l.contact_id);
                    return (
                      <li key={l.contact_id}>
                        <button
                          type="button"
                          className="dt-leads-row"
                          onClick={() => fullLead && onSelectLead && onSelectLead(fullLead, l.lead_type)}
                          disabled={!fullLead}
                          title={!fullLead ? "Lead not found in current view" : ""}
                        >
                          <span className="dt-leads-name">{l.first_name || "(no name)"}</span>
                          <SoftPill variant="muted">{LEAD_TYPE_LABELS[l.lead_type] || l.lead_type}</SoftPill>
                          <span className="dt-leads-when">{l.last_click_at?.slice(0, 10)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Pricing - lp-card */}
            <div className="lp-card dt-drawer-card">
              <h3 className="dt-drawer-h">Pricing</h3>
              <div className="dt-pricing-summary">
                <div>
                  <EyebrowLabel size="sm">Effective hire fee</EyebrowLabel>
                  <div className="pipe-metric" style={{ marginTop: 4 }}>{fmt(effectiveFee)}</div>
                  {data.override?.fee != null && (
                    <div style={{ marginTop: 6 }}>
                      <SoftPill variant="brick" uppercase>Override active</SoftPill>
                    </div>
                  )}
                </div>
                <div>
                  <EyebrowLabel size="sm">Effective min spend</EyebrowLabel>
                  <div className="pipe-metric" style={{ marginTop: 4 }}>{fmt(effectiveMin)}</div>
                </div>
              </div>
              {baseline && (
                <p className="dt-pricing-note">
                  Rate-card baseline ({baseline.dayType}): {fmt(baseline.fee)} hire / {fmt(baseline.min)} min.
                </p>
              )}
              <div className="dt-pricing-edit">
                <label className="dt-input-row">
                  <span>Override hire fee (£)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={baseline ? String(baseline.fee) : "0"}
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                  />
                </label>
                <label className="dt-input-row">
                  <span>Override min spend (£)</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={baseline ? String(baseline.min) : "0"}
                    value={minInput}
                    onChange={(e) => setMinInput(e.target.value)}
                  />
                </label>
                <label className="dt-input-row">
                  <span>Note (optional)</span>
                  <input
                    type="text"
                    placeholder="Why is this override set?"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                  />
                </label>
                <div className="dt-pricing-actions">
                  <button
                    type="button"
                    className="rep-cta"
                    disabled={saving || (feeInput === "" && minInput === "")}
                    onClick={() => saveOverride(false)}
                  >
                    {saving ? "Saving…" : "Save override"}
                  </button>
                  {data.override && (
                    <button
                      type="button"
                      className="rep-refresh"
                      disabled={saving}
                      onClick={() => saveOverride(true)}
                    >
                      Clear override
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Audit history */}
            {data.history && data.history.length > 0 && (
              <div className="lp-card dt-drawer-card">
                <h3 className="dt-drawer-h">Override history</h3>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "rgba(44,24,16,0.5)", margin: "0 0 8px" }}>
                  Append-only audit log. Latest row wins on read.
                </p>
                <ul className="dt-history">
                  {data.history.map((h, i) => (
                    <li key={i} className="dt-history-row">
                      <span className="dt-history-when">{h.edited_at?.replace(" ", " · ")}</span>
                      <span className="dt-history-by">{h.edited_by}</span>
                      <span className="dt-history-what">
                        {h.cleared
                          ? "cleared override"
                          : `set ${h.override_fee != null ? `hire £${h.override_fee}` : ""}${h.override_fee != null && h.override_min_spend != null ? " / " : ""}${h.override_min_spend != null ? `min £${h.override_min_spend}` : ""}`}
                      </span>
                      {h.note && <span className="dt-history-note">{h.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
