/**
 * DatesCalendar - 12-month heat map for the Dates tab.
 *
 * Renders a year of date cells coloured by click intensity. Click a cell
 * to open the DateDetailDrawer. Booked dates take a Mahogany corner
 * triangle (data sourced from /api/availability via parent).
 *
 * Per-stream calibration: thresholds come from the API response, not
 * hardcoded. Each stream's distribution sets its own low/mid/high cuts.
 *
 * Past dates render at 30% opacity (de-emphasised but never hidden -
 * "never limit collection" data principle).
 *
 * Design tokens consumed:
 *   --card-bg, --card-border-color, --card-radius, --card-pad-x/y
 *   --warm-canvas, --forest-olive, --mahogany, --brewery-dark
 *
 * Class prefix: dt- (Dates tab)
 */

import { useMemo } from "react";
import { MONTH_LABELS, DAY_LABELS_SHORT } from "./constants.js";

const TODAY = new Date().toISOString().slice(0, 10);

function intensityClass(clicks, thresholds) {
  if (!clicks || clicks <= 0) return "dt-cell--zero";
  if (clicks >= thresholds.high) return "dt-cell--high";
  if (clicks >= thresholds.mid)  return "dt-cell--mid";
  if (clicks >= thresholds.low)  return "dt-cell--low";
  return "dt-cell--min";
}

function pad(n) { return n < 10 ? `0${n}` : `${n}`; }

function buildMonth(year, month0) {
  /* month0 is 0-11. Returns 6×7 grid of { date, inMonth } objects, Monday-start. */
  const first = new Date(year, month0, 1);
  // 0 = Sunday. Convert to Monday-start: shift so Monday = 0.
  const mondayStart = (first.getDay() + 6) % 7;
  const start = new Date(year, month0, 1 - mondayStart);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    cells.push({
      iso,
      day: d.getDate(),
      dow: (d.getDay() + 6) % 7, // Mon=0, Sun=6
      inMonth: d.getMonth() === month0,
      isPast: iso < TODAY,
      isToday: iso === TODAY,
    });
  }
  return cells;
}

export default function DatesCalendar({
  year,
  data,           // { heat: [{clicked_date, clicks}], thresholds, overrides, totalClicks, activeDates }
  bookedDates,    // Set of ISO date strings that are booked
  onSelectDate,
  selectedDate,
}) {
  // Index heat by date for O(1) lookup
  const clicksByDate = useMemo(() => {
    const m = {};
    for (const r of data?.heat || []) m[r.clicked_date] = r.clicks;
    return m;
  }, [data]);

  const thresholds = data?.thresholds || { low: 1, mid: 6, high: 16 };

  return (
    <div className="dt-calendar">
      {Array.from({ length: 12 }, (_, i) => i).map((month0) => {
        const cells = buildMonth(year, month0);
        return (
          <div className="dt-month" key={month0}>
            <h3 className="dt-month-h">{MONTH_LABELS[month0]}</h3>
            <div className="dt-dow-row">
              {DAY_LABELS_SHORT.slice(1).concat([DAY_LABELS_SHORT[0]]).map((d) => (
                <span key={d} className="dt-dow">{d}</span>
              ))}
            </div>
            <div className="dt-grid">
              {cells.map((c, idx) => {
                if (!c.inMonth) {
                  return <span key={idx} className="dt-cell dt-cell--blank" />;
                }
                const clicks = clicksByDate[c.iso] || 0;
                const booked = bookedDates && bookedDates.has(c.iso);
                const hasOverride = data?.overrides && data.overrides[c.iso];
                const cls = [
                  "dt-cell",
                  intensityClass(clicks, thresholds),
                  c.isPast ? "dt-cell--past" : "",
                  c.isToday ? "dt-cell--today" : "",
                  booked ? "dt-cell--booked" : "",
                  selectedDate === c.iso ? "dt-cell--selected" : "",
                  hasOverride ? "dt-cell--override" : "",
                ].filter(Boolean).join(" ");
                const title = [
                  c.iso,
                  clicks ? `${clicks} click${clicks !== 1 ? "s" : ""}` : "no clicks",
                  booked ? "booked" : null,
                  hasOverride ? "manual override set" : null,
                ].filter(Boolean).join(" · ");
                return (
                  <button
                    key={idx}
                    type="button"
                    className={cls}
                    title={title}
                    onClick={() => onSelectDate && onSelectDate(c.iso)}
                  >
                    <span className="dt-cell-day">{c.day}</span>
                    {clicks > 0 && <span className="dt-cell-count">{clicks}</span>}
                    {booked && <span className="dt-cell-booked-mark" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
