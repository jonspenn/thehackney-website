/**
 * DatesView - Top-level container for the Dates tab.
 *
 * Treats the venue's calendar as 365 perishable SKUs of inventory per
 * year. Renders three views in one tab:
 *   1. Stream + year + direction filter toolbar
 *   2. Calendar heat map (12 months, click-to-select)
 *   3. Top dates list (hot dates by default; toggle to cold)
 *   4. Date detail drawer (slides in on cell or row click)
 *
 * Per-stream calibration is applied at the API level - thresholds in the
 * heat map come from the stream's own click distribution, not a global
 * scale (per prd-sys-dates-tab.md Data Principles).
 *
 * Pricing prop is the wedding-pricing.json content - drilled to the
 * detail drawer for rate-card baseline lookup.
 *
 * Class prefix: dt-
 */

import { useEffect, useMemo, useState } from "react";
import DatesCalendar from "./DatesCalendar.jsx";
import DateDetailDrawer from "./DateDetailDrawer.jsx";
import DatesTopList from "./DatesTopList.jsx";

const STREAM_OPTIONS = [
  { value: "all", label: "All streams" },
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate" },
  { value: "private-events", label: "Private Events" },
  { value: "supperclub", label: "Supper Club" },
  // cafe-bar excluded per prd-sys-dates-tab.md (decided 29 Apr 2026)
];

const TODAY = new Date();
const YEAR_OPTIONS = [TODAY.getFullYear(), TODAY.getFullYear() + 1, TODAY.getFullYear() + 2];

export default function DatesView({ pricing, leads, onSelectLead }) {
  const [year, setYear] = useState(TODAY.getFullYear());
  const [stream, setStream] = useState("all");
  const [direction, setDirection] = useState("hot");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookedDates, setBookedDates] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  /* Heat data fetch */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/dates?mode=heat&year=${year}&stream=${stream}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setData(j);
        else setError(j.error || "fetch_failed");
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [year, stream, refreshKey]);

  /* Booked dates from /api/availability (Google Calendar). 6 months at a time;
     pull 12 months in 2 batched requests. */
  useEffect(() => {
    let cancelled = false;
    const start1 = `${year}-01-01`;
    const start2 = `${year}-07-01`;
    Promise.all([
      fetch(`/api/availability?start=${start1}&months=6`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/availability?start=${start2}&months=6`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        const set = new Set();
        for (const d of a?.booked || []) set.add(d);
        for (const d of b?.booked || []) set.add(d);
        setBookedDates(set);
      })
      .catch(() => {
        if (!cancelled) setBookedDates(new Set());
      });
    return () => { cancelled = true; };
  }, [year]);

  const summary = useMemo(() => {
    if (!data) return null;
    const max = data.heat?.reduce((m, r) => Math.max(m, r.clicks), 0) || 0;
    return {
      activeDates: data.activeDates || 0,
      totalClicks: data.totalClicks || 0,
      peakDate: (data.heat || []).find((r) => r.clicks === max),
      overrideCount: Object.keys(data.overrides || {}).length,
    };
  }, [data]);

  return (
    <section className="dt-view">
      <header className="dt-view-head">
        <div>
          <h2 className="rep-h2" style={{ marginBottom: "6px" }}>Dates</h2>
          <p className="rep-sub" style={{ marginTop: 0, maxWidth: "640px" }}>
            The venue's 365 SKUs per year. Cell intensity shows demand;
            corner badge marks booked dates. Click any date for the
            click breakdown, recent leads, and pricing override controls.
          </p>
        </div>
        <button
          type="button"
          className="rep-refresh"
          onClick={() => setRefreshKey((k) => k + 1)}
          aria-label="Refresh data"
        >
          Refresh
        </button>
      </header>

      {/* Filter toolbar */}
      <div className="dt-toolbar">
        <label className="dt-toolbar-field">
          <span>Stream</span>
          <select value={stream} onChange={(e) => setStream(e.target.value)}>
            {STREAM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="dt-toolbar-field">
          <span>Year</span>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {summary && (
          <div className="dt-toolbar-summary">
            <span><strong>{summary.activeDates}</strong> dates with clicks</span>
            <span><strong>{summary.totalClicks}</strong> clicks total</span>
            {summary.peakDate && <span>Peak: <strong>{summary.peakDate.clicked_date}</strong> ({summary.peakDate.clicks})</span>}
            {summary.overrideCount > 0 && <span><strong>{summary.overrideCount}</strong> manual override{summary.overrideCount !== 1 ? "s" : ""}</span>}
          </div>
        )}
      </div>

      {/* Heat map calendar */}
      <div className="dt-card">
        {loading && <p className="rep-empty-small">Loading heat map…</p>}
        {error && <p className="rep-empty-small">Error: {error}</p>}
        {!loading && !error && data && (
          <>
            <DatesCalendar
              year={year}
              data={data}
              bookedDates={bookedDates}
              onSelectDate={setSelectedDate}
              selectedDate={selectedDate}
            />
            {data.thresholds && (
              <div className="dt-legend">
                <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--zero" />0</span>
                <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--low" />1 - {data.thresholds.mid - 1}</span>
                <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--mid" />{data.thresholds.mid} - {data.thresholds.high - 1}</span>
                <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--high" />{data.thresholds.high}+</span>
                <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--booked-mini" />Booked</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Top dates list */}
      <div className="dt-card">
        <div className="dt-card-head">
          <h3 className="rep-h2" style={{ fontSize: "20px", marginBottom: 0 }}>
            {direction === "hot" ? "Hot dates" : "Cold dates (within 90 days)"}
          </h3>
          <div className="dt-toggle">
            <button
              type="button"
              className={direction === "hot" ? "dt-toggle--active" : ""}
              onClick={() => setDirection("hot")}
            >Hot</button>
            <button
              type="button"
              className={direction === "cold" ? "dt-toggle--active" : ""}
              onClick={() => setDirection("cold")}
            >Cold</button>
          </div>
        </div>
        <DatesTopList
          year={year}
          stream={stream}
          direction={direction}
          onSelectDate={setSelectedDate}
          selectedDate={selectedDate}
          refreshKey={refreshKey}
        />
      </div>

      {/* Detail drawer */}
      {selectedDate && (
        <DateDetailDrawer
          date={selectedDate}
          bookedDates={bookedDates}
          onClose={() => setSelectedDate(null)}
          onSelectLead={onSelectLead}
          leads={leads}
          pricing={pricing}
        />
      )}
    </section>
  );
}
