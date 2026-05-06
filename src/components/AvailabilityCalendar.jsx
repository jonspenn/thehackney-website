import { useState, useEffect, useCallback } from "react";

/**
 * AvailabilityCalendar.jsx
 *
 * Month-view calendar showing venue availability from Google Calendar.
 * Fetches booked dates from /api/availability (Cloudflare Pages Function),
 * which proxies the public-facing Bookings calendar only. The internal
 * "Enquiries & Held Dates" calendar is intentionally NOT exposed - it tracks
 * tentative holds for the team and must not be visible to website visitors.
 * Clicking an available date calls onSelectDate(YYYY-MM-DD).
 *
 * States per date cell:
 *   - past:      greyed out, not clickable
 *   - booked:    grey background, faded number, not clickable
 *   - available: green-tinted, clickable
 *   - selected:  solid green highlight (the date user clicked)
 *
 * Privacy: Only date availability status is fetched via the freebusy endpoint.
 * Event titles and descriptions never leave the server.
 */

const BRAND = {
  warmCanvas: "#F5F0E8",
  breweryDark: "#2C1810",
  forestOlive: "#2E4009",
  dustyCoral: "#BF7256",
  midOlive: "#49590E",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a, b) {
  return a && b && a === b;
}

/**
 * Fire-and-forget click tracking for Phase 1 of prd-dynamic-pricing.md.
 * Posts the clicked date to /api/track-click which writes to D1. We never
 * await the result, never surface errors, and never block the user flow.
 * If the endpoint is down, the calendar still works exactly as before.
 */
function trackDateClick(dateString) {
  try {
    fetch("/api/track-click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: dateString,
        referrer: document.referrer || window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* no-op */
  }
}

/** Legend item */
function LegendItem({ colour, border, label, icon }) {
  return (
    <span className="ac-legend__item">
      <span
        className="ac-legend__dot"
        style={{
          background: colour || "transparent",
          border: border || "none",
        }}
      >
        {icon || null}
      </span>
      {label}
    </span>
  );
}

export default function AvailabilityCalendar({ onSelectDate, selectedDate }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [booked, setBooked] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch availability data
  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Fetch 3 months from the start of the viewed month
    const start = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;

    try {
      const resp = await fetch(`/api/availability?start=${start}&months=3`);
      if (!resp.ok) throw new Error("Failed to load availability");

      const data = await resp.json();
      if (data.error) throw new Error(data.error);

      setBooked(new Set(data.booked || []));
    } catch (err) {
      console.error("[AvailabilityCalendar]", err);
      setError("Unable to load availability right now. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, [viewYear, viewMonth]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Show through December of (current year + 5). Wider than the typical
  // 12-24 month wedding planning horizon on purpose: clicks on 4-5-year-out
  // dates are a useful demand signal even though we wouldn't take a
  // booking that far ahead, and the cap stops infinite scroll into the
  // 2090s. Auto-rolls each 1 Jan - no annual code change needed. See
  // prd-sys-check-your-date.md changelog 2 May 2026 for the data
  // collection rationale.
  const maxDate = new Date(today.getFullYear() + 5, 11, 31);
  const minMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);

  // Navigation
  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  // Year jumps. If a full 12-month jump would overshoot the allowed range,
  // clamp to the nearest valid month rather than refusing to navigate -
  // a couple sitting on May 2028 still wants `>>` to take them somewhere
  // useful (Dec 2028) rather than nothing.
  function prevYear() {
    const targetDate = new Date(viewYear - 1, viewMonth, 1);
    if (targetDate >= minMonthDate) {
      setViewYear(viewYear - 1);
    } else {
      // Clamp to the earliest viewable month (today's month)
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
    }
  }

  function nextYear() {
    const targetMonthEnd = new Date(viewYear + 1, viewMonth + 1, 1);
    if (targetMonthEnd <= maxDate) {
      setViewYear(viewYear + 1);
    } else {
      // Clamp to the last viewable month (Dec of today.year + 5)
      setViewYear(maxDate.getFullYear());
      setViewMonth(maxDate.getMonth());
    }
  }

  // Can't go before current month
  const canGoPrev = viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  const canGoNext = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

  // Year-jump buttons go disabled when there's no useful jump left.
  // Specifically: at the floor (today's month + year) `<<` is disabled,
  // at the ceiling (Dec of today.year + 5) `>>` is disabled. In every
  // other position a click yields a meaningful jump, even if clamped.
  const canGoPrevYear = !(viewYear === today.getFullYear() && viewMonth === today.getMonth());
  const canGoNextYear = !(viewYear === maxDate.getFullYear() && viewMonth === maxDate.getMonth());

  // Build calendar grid
  // First day of month (0=Sun, convert to Mon-start: 0=Mon)
  const firstDay = new Date(viewYear, viewMonth, 1);
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const cells = [];

  // Empty cells before first day
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ type: "empty", key: `e-${i}` });
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const isPast = dateStr < todayStr;
    const isBooked = booked.has(dateStr);
    const isSelected = isSameDay(dateStr, selectedDate);
    const isToday = dateStr === todayStr;
    const isAvailable = !isPast && !isBooked;

    // Day of week (0=Mon, 5=Sat, 6=Sun)
    const dow = (firstDayOfWeek + d - 1) % 7;
    const isWeekend = dow === 5 || dow === 6;

    cells.push({
      type: "day",
      key: dateStr,
      day: d,
      dateStr,
      isPast,
      isBooked,
      isSelected,
      isToday,
      isAvailable,
      isWeekend,
    });
  }

  function handleDateClick(cell) {
    if (!cell.isAvailable) return;
    // Anonymous aggregate (demand signal, feeds dynamic pricing model)
    trackDateClick(cell.dateStr);
    // Identity-stitched (appears on the lead profile once visitor becomes a contact)
    // See pages/calendar/prd-sys-date-click-history.md Phase 1
    if (typeof window !== "undefined" && window.__thk) {
      try { window.__thk.track("date_check", { date: cell.dateStr }); } catch { /* no-op */ }
    }
    if (onSelectDate) onSelectDate(cell.dateStr);
  }

  return (
    <div className="ac">
      {/* Month + year navigation. `<<` `>>` jump 12 months at a time so
          couples looking 18-24 months ahead don't have to chevron through
          every single month. Clamps to the bounds of the allowed range
          when a full 12-month jump would overshoot. */}
      <div className="ac-nav">
        <div className="ac-nav__group">
          <button
            className="ac-nav__btn"
            onClick={prevYear}
            disabled={!canGoPrevYear}
            type="button"
            aria-label="Previous year"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M14 15L9 10L14 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9 15L4 10L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="ac-nav__btn"
            onClick={prevMonth}
            disabled={!canGoPrev}
            type="button"
            aria-label="Previous month"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <h3 className="ac-nav__title">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <div className="ac-nav__group">
          <button
            className="ac-nav__btn"
            onClick={nextMonth}
            disabled={!canGoNext}
            type="button"
            aria-label="Next month"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M8 5L13 10L8 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="ac-nav__btn"
            onClick={nextYear}
            disabled={!canGoNextYear}
            type="button"
            aria-label="Next year"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M6 5L11 10L6 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M11 5L16 10L11 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="ac-grid ac-grid--header">
        {DAY_LABELS.map(label => (
          <div key={label} className="ac-cell ac-cell--header">{label}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="ac-grid" style={{ position: "relative" }}>
        {loading && (
          <div className="ac-loading">
            <span className="ac-spinner" />
          </div>
        )}
        {cells.map(cell => {
          if (cell.type === "empty") {
            return <div key={cell.key} className="ac-cell ac-cell--empty" />;
          }

          let cellClass = "ac-cell ac-cell--day";
          if (cell.isPast) cellClass += " ac-cell--past";
          else if (cell.isBooked) cellClass += " ac-cell--booked";
          else cellClass += " ac-cell--available";

          if (cell.isSelected) cellClass += " ac-cell--selected";
          if (cell.isToday) cellClass += " ac-cell--today";
          if (cell.isWeekend) cellClass += " ac-cell--weekend";

          const clickable = cell.isAvailable;

          return (
            <button
              key={cell.key}
              className={cellClass}
              onClick={() => handleDateClick(cell)}
              disabled={!clickable}
              type="button"
              aria-label={`${cell.day} ${MONTH_NAMES[viewMonth]} ${viewYear}${cell.isBooked ? " - booked" : cell.isAvailable ? " - available" : ""}`}
            >
              <span className="ac-cell__num">{cell.day}</span>
              {/* No indicator needed - booked styling handles it via CSS */}
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {error && (
        <div className="ac-error">
          <p>{error}</p>
          <button onClick={fetchAvailability} className="ac-error__retry" type="button">
            Try again
          </button>
        </div>
      )}

      {/* Legend - solid brand colours so the two swatches are unmistakably
          distinct at 14px. The cells themselves rely on the bold green
          number for visual signal; the small swatches don't have that, so
          they need stronger fills than the cell backgrounds. */}
      <div className="ac-legend">
        <LegendItem colour="#49590E" label="Available" />
        <LegendItem colour="#C9C2B5" border="1px solid #B5AE9F" label="Booked" />
      </div>

      {/* Prompt to select */}
      {!selectedDate && !loading && !error && (
        <p className="ac-prompt">Select an available date to check availability</p>
      )}
    </div>
  );
}
