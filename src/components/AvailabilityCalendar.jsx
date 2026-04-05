import { useState, useEffect, useCallback } from "react";

/**
 * AvailabilityCalendar.jsx
 *
 * Month-view calendar showing venue availability from Google Calendar.
 * Fetches booked/held dates from /api/availability (Cloudflare Pages Function).
 * Clicking an available date calls onSelectDate(YYYY-MM-DD).
 *
 * States per date cell:
 *   - past:      greyed out, not clickable
 *   - booked:    marked with X indicator, not clickable
 *   - held:      marked as "enquired", not clickable
 *   - available: green-tinted, clickable
 *   - selected:  solid green highlight (the date user clicked)
 *
 * Privacy: Only date availability status is fetched.
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
  const [held, setHeld] = useState(new Set());
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
      setHeld(new Set(data.held || []));
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

  // Can't go before current month
  const canGoPrev = viewYear > today.getFullYear() ||
    (viewYear === today.getFullYear() && viewMonth > today.getMonth());

  // Don't allow more than 18 months ahead
  const maxDate = new Date(today);
  maxDate.setMonth(maxDate.getMonth() + 18);
  const canGoNext = new Date(viewYear, viewMonth + 1, 1) <= maxDate;

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
    const isHeld = held.has(dateStr);
    const isSelected = isSameDay(dateStr, selectedDate);
    const isToday = dateStr === todayStr;
    const isAvailable = !isPast && !isBooked && !isHeld;

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
      isHeld,
      isSelected,
      isToday,
      isAvailable,
      isWeekend,
    });
  }

  function handleDateClick(cell) {
    if (!cell.isAvailable) return;
    if (onSelectDate) onSelectDate(cell.dateStr);
  }

  return (
    <div className="ac">
      {/* Month navigation */}
      <div className="ac-nav">
        <button
          className="ac-nav__btn"
          onClick={prevMonth}
          disabled={!canGoPrev}
          type="button"
          aria-label="Previous month"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 15L7 10L12 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h3 className="ac-nav__title">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <button
          className="ac-nav__btn"
          onClick={nextMonth}
          disabled={!canGoNext}
          type="button"
          aria-label="Next month"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M8 5L13 10L8 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
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
          else if (cell.isHeld) cellClass += " ac-cell--held";
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
              aria-label={`${cell.day} ${MONTH_NAMES[viewMonth]} ${viewYear}${cell.isBooked ? " - booked" : cell.isHeld ? " - enquired" : cell.isAvailable ? " - available" : ""}`}
            >
              <span className="ac-cell__num">{cell.day}</span>
              {/* No indicator needed - booked styling handles it via CSS */}
              {cell.isHeld && (
                <span className="ac-cell__indicator ac-cell__indicator--held" />
              )}
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

      {/* Legend */}
      <div className="ac-legend">
        <LegendItem colour="rgba(46,64,9,0.12)" label="Available" />
        <LegendItem colour="rgba(44,24,16,0.08)" border="1px solid rgba(44,24,16,0.1)" label="Booked" />
        <LegendItem colour="rgba(191,114,86,0.15)" border="1px solid rgba(191,114,86,0.25)" label="Enquired" />
      </div>

      {/* Prompt to select */}
      {!selectedDate && !loading && !error && (
        <p className="ac-prompt">Select an available date to check availability</p>
      )}
    </div>
  );
}
