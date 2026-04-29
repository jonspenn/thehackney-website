/**
 * DateDetailDrawer - Per-date detail panel for the Dates tab.
 *
 * Slides in from the right when a date is clicked in DatesCalendar or
 * DatesTopList. Shows:
 *   - Header: full date, status (Available / Booked / Past), day type
 *   - Click totals + per-stream breakdown bars
 *   - 90d sparkline (weekly buckets)
 *   - Recent leads who clicked this date (links to LeadProfile)
 *   - Pricing block: rate-card price + override input + history
 *   - Save / Clear override buttons
 *
 * All override edits POST to /api/date-pricing - append-only, latest-row-
 * wins on read. History list shows the audit trail.
 *
 * Props:
 *   date          ISO date string YYYY-MM-DD
 *   bookedDates   Set of booked ISO dates
 *   onClose       () => void
 *   onSelectLead  (lead, leadType) => void  - hand off to AdminDashboard
 *
 * Class prefix: dt- (Dates tab)
 */

import { useEffect, useState } from "react";
import { LEAD_TYPE_LABELS } from "./constants.js";

function fmt(n) { return n == null ? "-" : `£${n.toLocaleString("en-GB")}`; }

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

export default function DateDetailDrawer({ date, bookedDates, onClose, onSelectLead, leads, pricing }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feeInput, setFeeInput] = useState("");
  const [minInput, setMinInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  /* Fetch detail when date changes */
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

  /* ESC closes the drawer */
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
      // Refresh detail to pull new history + override row
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

  // Look up rate-card baseline for this date (via prop drilling from AdminDashboard)
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
            <div className="dt-drawer-eyebrow">{dayTypeLabel} · {status}</div>
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
            {/* Click overview */}
            <section className="dt-section">
              <div className="dt-stat-row">
                <div className="dt-stat">
                  <div className="dt-stat-eyebrow">CLICKS (ALL TIME)</div>
                  <div className="dt-stat-value">{data.totalClicks}</div>
                </div>
                <div className="dt-stat">
                  <div className="dt-stat-eyebrow">KNOWN LEADS</div>
                  <div className="dt-stat-value">{(data.recentLeads || []).length}{data.recentLeads?.length === 5 ? "+" : ""}</div>
                </div>
                <div className="dt-stat">
                  <div className="dt-stat-eyebrow">STATUS</div>
                  <div className="dt-stat-value dt-stat-value--small">{status}</div>
                </div>
              </div>
            </section>

            {/* Per-stream breakdown */}
            {data.breakdown && data.breakdown.length > 0 && (
              <section className="dt-section">
                <h3 className="dt-section-h">Per-stream click breakdown</h3>
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
              </section>
            )}

            {/* Recent leads */}
            {data.recentLeads && data.recentLeads.length > 0 && (
              <section className="dt-section">
                <h3 className="dt-section-h">Recent leads who clicked this date</h3>
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
                          <span className="dt-leads-stream">{LEAD_TYPE_LABELS[l.lead_type] || l.lead_type}</span>
                          <span className="dt-leads-when">{l.last_click_at?.slice(0, 10)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {/* Pricing block */}
            <section className="dt-section dt-pricing">
              <h3 className="dt-section-h">Pricing</h3>
              <div className="dt-pricing-summary">
                <div>
                  <div className="dt-stat-eyebrow">Effective hire fee</div>
                  <div className="dt-stat-value">{fmt(effectiveFee)}</div>
                  {data.override?.fee != null && <div className="dt-pricing-tag">Override active</div>}
                </div>
                <div>
                  <div className="dt-stat-eyebrow">Effective min spend</div>
                  <div className="dt-stat-value">{fmt(effectiveMin)}</div>
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
            </section>

            {/* Override history */}
            {data.history && data.history.length > 0 && (
              <section className="dt-section">
                <h3 className="dt-section-h">Override history (append-only)</h3>
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
              </section>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
