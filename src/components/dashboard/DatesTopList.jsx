/**
 * DatesTopList - Sortable top-dates table for the Dates tab.
 *
 * Direction prop:
 *   "hot"  - most-clicked future dates, hold-price candidates
 *   "cold" - low-click dates within 90 days, discount candidates
 *
 * Uses the shared .rep-table chrome for visual consistency with other
 * dashboard tables. Click a row to open the DateDetailDrawer.
 */

import { useEffect, useState } from "react";

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function dayOfWeek(iso) {
  const d = new Date(iso);
  const dow = d.getDay();
  if (dow === 6) return "Sat";
  if (dow === 5) return "Fri";
  if (dow === 0) return "Sun";
  return ["Mon", "Tue", "Wed", "Thu"][dow - 1] || "?";
}

function relative(iso) {
  if (!iso) return "";
  const ts = new Date(iso.replace(" ", "T") + "Z").getTime();
  if (Number.isNaN(ts)) return iso;
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}h ago`;
  return `${Math.floor(diffMin / (60 * 24))}d ago`;
}

export default function DatesTopList({ year, stream, direction, onSelectDate, selectedDate, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/dates?mode=top&year=${year}&stream=${stream}&direction=${direction}&limit=20`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setRows(j.dates || []);
        else setError(j.error || "fetch_failed");
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [year, stream, direction, refreshKey]);

  if (loading) return <p className="rep-empty-small">Loading dates…</p>;
  if (error) return <p className="rep-empty-small">Error: {error}</p>;
  if (!rows || rows.length === 0) {
    return (
      <p className="rep-empty-small">
        {direction === "hot"
          ? "No clicks recorded yet for this view. Once visitors start checking dates, the most-clicked ones appear here."
          : "No cold dates within 90 days for this view. Either everything is selling well, or there isn't yet enough click data to flag dying SKUs."}
      </p>
    );
  }

  return (
    <div className="rep-table-wrap">
      <table className="rep-table dt-top-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Day</th>
            <th style={{ textAlign: "right" }}>Clicks</th>
            <th>Last click</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.clicked_date}
              className={`dt-top-row${selectedDate === r.clicked_date ? " dt-top-row--selected" : ""}`}
              onClick={() => onSelectDate && onSelectDate(r.clicked_date)}
            >
              <td>{fmtDate(r.clicked_date)}</td>
              <td>{dayOfWeek(r.clicked_date)}</td>
              <td style={{ textAlign: "right" }}>
                <span className="dt-clicks">{r.clicks}</span>
              </td>
              <td className="dt-when">{relative(r.last_click_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
