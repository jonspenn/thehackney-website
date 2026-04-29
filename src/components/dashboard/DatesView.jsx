/**
 * DatesView - Top-level container for the Dates tab.
 *
 * Treats the venue's calendar as 365 perishable SKUs of inventory per
 * year. Built to feel like Pipeline / Leads (sub-tabs + metric strip +
 * funnel-style panel) rather than a bespoke layout.
 *
 * Layout:
 *   1. pipe-panel   sub-tabs (stream filter) + year selector + metric
 *                   strip + heat-map calendar + legend
 *   2. pipe-panel   collapse-toggle (Hot/Cold heading) + direction tabs +
 *                   top-dates table
 *   3. drawer       slides in on cell or row click
 *
 * Per-stream calibration is applied at the API level - thresholds in the
 * heat map come from the stream's own click distribution.
 *
 * Pricing prop is the wedding-pricing.json content - drilled to the
 * detail drawer for rate-card baseline lookup.
 */

import { useEffect, useMemo, useState } from "react";
import DatesCalendar from "./DatesCalendar.jsx";
import DateDetailDrawer from "./DateDetailDrawer.jsx";
import DatesTopList from "./DatesTopList.jsx";
import { MetadataStrip, MetadataCell } from "./primitives/index.js";

const STREAM_OPTIONS = [
  { value: "all", label: "All" },
  { value: "wedding", label: "Wedding" },
  { value: "corporate", label: "Corporate" },
  { value: "private-events", label: "Private Events" },
  { value: "supperclub", label: "Supper Club" },
  // cafe-bar excluded per prd-sys-dates-tab.md (decided 29 Apr 2026)
];

const TODAY = new Date();
const YEAR_OPTIONS = [TODAY.getFullYear(), TODAY.getFullYear() + 1, TODAY.getFullYear() + 2];

function formatPeak(peak) {
  if (!peak) return "—";
  const d = new Date(peak.clicked_date);
  const m = d.toLocaleDateString("en-GB", { month: "short" });
  const day = d.getDate();
  return `${day} ${m}`;
}

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

    // Index click data by ISO date for O(1) lookup
    const clicksByDate = {};
    for (const r of data.heat || []) clicksByDate[r.clicked_date] = r.clicks;

    // Cold dates: count of dates in the next 90 days with < 5 clicks AND
    // not booked. Includes zero-click dates which are the riskiest.
    // Restricted to the selected year so the cell tracks the strip's scope.
    let coldCount = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 90; i++) {
      const d = new Date(today.getTime() + i * 86400000);
      const iso = d.toISOString().slice(0, 10);
      if (!iso.startsWith(String(year))) continue;
      if (bookedDates.has(iso)) continue;
      if ((clicksByDate[iso] || 0) < 5) coldCount += 1;
    }

    // Booked %: proportion of the selected year's dates already booked
    const yearStr = String(year);
    let bookedInYear = 0;
    for (const d of bookedDates) if (typeof d === "string" && d.startsWith(yearStr)) bookedInYear += 1;
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const yearDates = isLeap ? 366 : 365;
    const bookedPct = Math.round((bookedInYear / yearDates) * 100);

    return {
      totalClicks: data.totalClicks || 0,
      peakDate: (data.heat || []).find((r) => r.clicks === max),
      peakCount: max,
      coldCount,
      bookedInYear,
      bookedPct,
      yearDates,
    };
  }, [data, bookedDates, year]);

  return (
    <>
      {/* Page header (no local Refresh - the global Refresh in the tab nav
           handles reload; /api/dates uses cache: no-store on every fetch). */}
      <header className="dt-page-head">
        <div>
          <h2 className="rep-h2" style={{ marginBottom: "6px" }}>Dates</h2>
          <p className="rep-sub" style={{ marginTop: 0, maxWidth: "640px" }}>
            The venue's 365 SKUs per year. Cell intensity shows demand; corner badge marks booked dates. Click any date for the click breakdown, recent leads, and pricing controls.
          </p>
        </div>
      </header>

      {/* ── Calendar panel: sub-tabs + metric strip + heat map ── */}
      <div className="pipe-panel">
        <div className="pipe-panel__tabs">
          {STREAM_OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`adm-subtab${stream === o.value ? " adm-subtab--active" : ""}`}
              onClick={() => setStream(o.value)}
              type="button"
            >
              {o.label}
            </button>
          ))}
          <div className="dt-year-wrap">
            <label className="dt-year-label">Year</label>
            <select
              className="dt-year-select"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
            >
              {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Metric strip - matches Pipeline pattern */}
        <div className="pipe-meta-wrap">
          <MetadataStrip>
            <MetadataCell eyebrow="Total clicks">
              <span className="pipe-metric">{summary?.totalClicks ?? "—"}</span>
            </MetadataCell>
            <MetadataCell eyebrow="Peak date">
              <span className="pipe-metric">
                {formatPeak(summary?.peakDate)}
                {summary?.peakCount > 0 && <span className="pipe-metric__unit">{summary.peakCount} clicks</span>}
              </span>
            </MetadataCell>
            <MetadataCell eyebrow="Cold dates">
              <span className="pipe-metric">
                {summary?.coldCount ?? "—"}
                <span className="pipe-metric__unit">within 90d</span>
              </span>
            </MetadataCell>
            <MetadataCell eyebrow="Booked">
              <span className="pipe-metric">
                {summary?.bookedPct ?? "—"}<span className="pipe-metric__unit">% of {summary?.yearDates || 365}</span>
              </span>
            </MetadataCell>
          </MetadataStrip>
        </div>

        {/* Heat map */}
        <div className="dt-cal-wrap">
          {loading && <p className="rep-empty-small" style={{ padding: "0 28px 16px" }}>Loading heat map…</p>}
          {error && <p className="rep-empty-small" style={{ padding: "0 28px 16px" }}>Error: {error}</p>}
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
                  <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--booked-hot-mini" />Booked + clicks</span>
                  <span className="dt-legend-item"><span className="dt-legend-swatch dt-cell--override-mini" />Manual override</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Top dates panel: collapse-toggle heading + direction tabs + table ── */}
      <div className="pipe-panel" style={{ marginTop: "16px" }}>
        <div className="pipe-collapse-toggle" style={{ cursor: "default" }}>
          <span>{direction === "hot" ? "Hot dates" : "Cold dates"}</span>
          <span className="pipe-collapse-toggle__summary">
            {direction === "hot" ? "most-clicked future dates" : "low click count, within 90 days, candidates for discount"}
          </span>
        </div>
        <div className="pipe-panel__tabs" style={{ paddingTop: 0 }}>
          <button
            className={`adm-subtab${direction === "hot" ? " adm-subtab--active" : ""}`}
            onClick={() => setDirection("hot")}
            type="button"
          >Hot</button>
          <button
            className={`adm-subtab${direction === "cold" ? " adm-subtab--active" : ""}`}
            onClick={() => setDirection("cold")}
            type="button"
          >Cold</button>
        </div>
        <div style={{ padding: "8px 16px 18px" }}>
          <DatesTopList
            year={year}
            stream={stream}
            direction={direction}
            onSelectDate={setSelectedDate}
            selectedDate={selectedDate}
            refreshKey={refreshKey}
            bookedDates={bookedDates}
          />
        </div>
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
    </>
  );
}
