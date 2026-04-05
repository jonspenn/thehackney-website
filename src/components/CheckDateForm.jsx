import { useState, useEffect } from "react";
import AvailabilityCalendar from "./AvailabilityCalendar.jsx";

/**
 * CheckDateForm.jsx
 *
 * Simple availability checker. The calendar IS the page.
 * Users browse months, see which dates are booked vs available,
 * and get their answer in 10 seconds. When they find an available
 * date they like, we surface a CTA to get in touch.
 *
 * Flow: Calendar -> click available date -> CTA to contact Hugo
 */

/* ─── Industrial Romance palette ─── */
const BRAND = {
  warmCanvas: "#F5F0E8",
  breweryDark: "#2C1810",
  forestOlive: "#2E4009",
  firedBrick: "#8C472E",
  dustyCoral: "#BF7256",
  midOlive: "#49590E",
};

const WHATSAPP_NUMBER = "442079611604";

/* ─── GTM push helper ─── */
function pushEvent(event, props = {}) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push({ event, ...props });
  }
}

/* WhatsApp icon */
function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, verticalAlign: "middle" }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/* Format a date string nicely */
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function FadeIn({ children, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)",
      transition: "opacity 0.4s ease, transform 0.4s ease",
    }}>
      {children}
    </div>
  );
}

export default function CheckDateForm() {
  const [selectedDate, setSelectedDate] = useState("");

  function handleSelectDate(dateStr) {
    setSelectedDate(dateStr);
    pushEvent("check_date_calendar_select", { date: dateStr });
  }

  function handleClear() {
    setSelectedDate("");
  }

  // WhatsApp message with date pre-filled
  const waMessage = selectedDate
    ? `Hi, I'm looking at ${formatDate(selectedDate)} at The Hackney. Is it available?`
    : "Hi, I'm interested in holding an event at The Hackney. Could you help with availability?";
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(waMessage)}`;

  return (
    <div className="cd" id="check-date-form">
      {/* Calendar - the main event */}
      <AvailabilityCalendar
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />

      {/* When a date is selected, show the CTA */}
      {selectedDate && (
        <FadeIn>
          <div className="cd-date-result">
            <div className="cd-date-result__status">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="12" fill={BRAND.forestOlive}/>
                <path d="M7 12L10.5 15.5L17 8.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div>
                <div className="cd-date-result__date">{formatDate(selectedDate)}</div>
                <div className="cd-date-result__available">This date looks available</div>
              </div>
            </div>

            <div className="cd-date-result__actions">
              <a
                href={waUrl}
                className="wq-btn wq-btn--primary"
                target="_blank"
                rel="noopener"
                onClick={() => pushEvent("whatsapp_click", { context: "date-selected", date: selectedDate })}
              >
                <WhatsAppIcon /> Enquire on WhatsApp
              </a>
              <a
                href={`/check-your-date/book-a-call/?date=${selectedDate}`}
                className="wq-btn wq-btn--outline"
                onClick={() => pushEvent("book_call_click", { context: "date-selected", date: selectedDate })}
              >
                Book a call with Hugo
              </a>
            </div>

            <button
              onClick={handleClear}
              className="cd-date-result__change"
              type="button"
            >
              Check a different date
            </button>
          </div>
        </FadeIn>
      )}
    </div>
  );
}
