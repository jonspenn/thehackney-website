import { useEffect, useMemo, useState } from "react";

/**
 * Internal report dashboard for the date-click tracking system.
 * Powers the obscure /reports/dc-7k3m9p2x/ page so Hugo and James
 * can see what dates couples are clicking on /check-your-date.
 *
 * Fetches everything in one call from /api/click-stats.
 *
 * NOT linked from anywhere on the public site, noindexed at the
 * page level. Read-only - no actions, no data export.
 */

const DAY_LABELS_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_LABELS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatLongDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${DAY_LABELS_FULL[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  // D1 datetime() returns "YYYY-MM-DD HH:MM:SS" - normalise to UTC ISO
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const then = new Date(safe);
  if (Number.isNaN(then.getTime())) return iso;
  const diffSec = Math.floor((Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function formatAbsoluteTime(iso) {
  if (!iso) return "—";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const d = new Date(safe);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildHeatmapMonths(heatmap) {
  // Build a Map<YYYY-MM-DD, count> for fast lookup
  const counts = new Map();
  for (const row of heatmap) {
    counts.set(row.clicked_date, row.click_count);
  }

  // Show next 12 months from the start of the current month
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1)
    );
    const year = monthStart.getUTCFullYear();
    const month = monthStart.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstDow = monthStart.getUTCDay();

    const cells = [];
    // Leading blanks so day-of-week alignment is correct
    for (let b = 0; b < firstDow; b++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(
        d
      ).padStart(2, "0")}`;
      cells.push({
        iso,
        day: d,
        count: counts.get(iso) || 0,
        dow: new Date(Date.UTC(year, month, d)).getUTCDay(),
      });
    }

    months.push({
      label: `${MONTH_LABELS[month]} ${year}`,
      cells,
    });
  }
  return months;
}

function heatColour(count, max) {
  if (!count || count === 0) return "transparent";
  // 5-step ramp from light to deep olive
  const ratio = max <= 0 ? 0 : count / max;
  if (ratio > 0.8) return "rgba(46,64,9,0.95)";
  if (ratio > 0.6) return "rgba(46,64,9,0.75)";
  if (ratio > 0.4) return "rgba(46,64,9,0.55)";
  if (ratio > 0.2) return "rgba(46,64,9,0.35)";
  return "rgba(46,64,9,0.18)";
}

function heatTextColour(count, max) {
  if (!count) return "var(--color-brewery-dark)";
  const ratio = max <= 0 ? 0 : count / max;
  return ratio > 0.55 ? "var(--color-warm-canvas)" : "var(--color-brewery-dark)";
}

export default function ClickStatsReport() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/click-stats", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (err) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const heatmapMonths = useMemo(
    () => (data ? buildHeatmapMonths(data.heatmap || []) : []),
    [data]
  );
  const heatmapMax = useMemo(() => {
    if (!data) return 0;
    let m = 0;
    for (const row of data.heatmap || []) {
      if (row.click_count > m) m = row.click_count;
    }
    return m;
  }, [data]);

  const dowSorted = useMemo(() => {
    if (!data) return [];
    // Reorder Sun-Sat into Mon-Sun for UK readers
    const map = new Map();
    for (const row of data.dayOfWeek || []) {
      map.set(row.dow, row.click_count);
    }
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.map((dow) => ({
      dow,
      label: DAY_LABELS_SHORT[dow],
      count: map.get(dow) || 0,
    }));
  }, [data]);

  const dowMax = useMemo(
    () => Math.max(1, ...dowSorted.map((d) => d.count)),
    [dowSorted]
  );

  const topDateMax = useMemo(() => {
    if (!data || !data.topDates.length) return 1;
    return data.topDates[0].click_count;
  }, [data]);

  if (loading) {
    return <div className="rep-state">Loading click data…</div>;
  }
  if (error) {
    return (
      <div className="rep-state rep-state--error">
        Could not load click data: {error}
        <br />
        <button className="rep-retry" onClick={load} type="button">
          Retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { totals, topDates, recent } = data;
  const noData = totals.totalClicks === 0;

  return (
    <div className="rep">
      {/* Totals strip */}
      <div className="rep-totals">
        <div className="rep-stat">
          <div className="rep-stat__num">{totals.totalClicks}</div>
          <div className="rep-stat__label">Total clicks</div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat__num">{totals.uniqueDates}</div>
          <div className="rep-stat__label">Unique dates clicked</div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat__num">
            {totals.lastClickAt ? formatRelativeTime(totals.lastClickAt) : "—"}
          </div>
          <div className="rep-stat__label">Most recent click</div>
        </div>
        <div className="rep-stat">
          <div className="rep-stat__num">
            {totals.firstClickAt ? formatAbsoluteTime(totals.firstClickAt) : "—"}
          </div>
          <div className="rep-stat__label">Tracking since</div>
        </div>
      </div>

      <button
        className="rep-refresh"
        onClick={load}
        type="button"
        aria-label="Refresh data"
      >
        Refresh
      </button>

      {noData && (
        <div className="rep-empty">
          No clicks yet. Once couples start using the calendar on
          /check-your-date, this page will fill up automatically. Cached
          for 60 seconds — hit refresh.
        </div>
      )}

      {/* Top dates */}
      <section className="rep-section">
        <h2 className="rep-h2">Top dates by click count</h2>
        <p className="rep-sub">
          Future dates only, ranked by interest. This is the demand signal.
        </p>
        {topDates.length === 0 ? (
          <p className="rep-empty-small">No future-date clicks yet.</p>
        ) : (
          <ol className="rep-toplist">
            {topDates.map((row, i) => {
              const pct = (row.click_count / topDateMax) * 100;
              return (
                <li key={row.clicked_date} className="rep-toprow">
                  <span className="rep-toprank">{i + 1}</span>
                  <span className="rep-topdate">
                    {formatLongDate(row.clicked_date)}
                  </span>
                  <span className="rep-topbar">
                    <span
                      className="rep-topbar__fill"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="rep-topcount">{row.click_count}</span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Day of week */}
      <section className="rep-section">
        <h2 className="rep-h2">Clicks by day of week</h2>
        <p className="rep-sub">
          Confirms or challenges the assumption that Saturday is king.
        </p>
        <div className="rep-dow">
          {dowSorted.map((d) => {
            const pct = (d.count / dowMax) * 100;
            return (
              <div key={d.dow} className="rep-dow__col">
                <div className="rep-dow__bar">
                  <div
                    className="rep-dow__fill"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                    title={`${d.count} clicks`}
                  />
                </div>
                <div className="rep-dow__count">{d.count}</div>
                <div className="rep-dow__label">{d.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Heatmap */}
      <section className="rep-section">
        <h2 className="rep-h2">12-month heatmap</h2>
        <p className="rep-sub">
          Darker = more clicks. Spot seasonal patterns at a glance.
        </p>
        <div className="rep-heatmap">
          {heatmapMonths.map((m) => (
            <div key={m.label} className="rep-month">
              <div className="rep-month__label">{m.label}</div>
              <div className="rep-month__dow">
                {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => (
                  <span key={i}>{l}</span>
                ))}
              </div>
              <div className="rep-month__grid">
                {/* Reorder cells from Sun-start to Mon-start for UK calendars */}
                {(() => {
                  // The first non-null cell tells us the first day-of-week (0=Sun)
                  const cells = m.cells.slice();
                  // Find the first real cell, work out leading blanks for Mon-start
                  const firstReal = cells.find((c) => c !== null);
                  const startDow = firstReal ? firstReal.dow : 1;
                  const monStartBlanks = (startDow + 6) % 7;
                  // Strip the Sun-start leading blanks then prepend the new Mon-start ones
                  const stripped = cells.filter((c) => c !== null);
                  const out = [];
                  for (let i = 0; i < monStartBlanks; i++) out.push(null);
                  out.push(...stripped);
                  return out.map((cell, i) => {
                    if (!cell) {
                      return <span key={i} className="rep-month__cell rep-month__cell--blank" />;
                    }
                    return (
                      <span
                        key={i}
                        className="rep-month__cell"
                        title={`${formatLongDate(cell.iso)} - ${cell.count} click${cell.count === 1 ? "" : "s"}`}
                        style={{
                          background: heatColour(cell.count, heatmapMax),
                          color: heatTextColour(cell.count, heatmapMax),
                        }}
                      >
                        {cell.day}
                      </span>
                    );
                  });
                })()}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent activity */}
      <section className="rep-section">
        <h2 className="rep-h2">Recent activity</h2>
        <p className="rep-sub">
          Last {RECENT_LIMIT_DISPLAY} clicks. Useful for sanity-checking the
          system is working.
        </p>
        {recent.length === 0 ? (
          <p className="rep-empty-small">No clicks logged yet.</p>
        ) : (
          <table className="rep-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Date clicked</th>
                <th>Came from</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((row, i) => (
                <tr key={i}>
                  <td>{formatRelativeTime(row.clicked_at)}</td>
                  <td>{formatLongDate(row.clicked_date)}</td>
                  <td className="rep-table__ref">{row.referrer || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const RECENT_LIMIT_DISPLAY = 50;
