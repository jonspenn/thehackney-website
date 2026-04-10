import { useState, useEffect } from "react";

/* ─── Industrial Romance palette ─── */
const BRAND = {
  warmCanvas: "#F5F0E8",
  breweryDark: "#2C1810",
  forestOlive: "#2E4009",
  firedBrick: "#8C472E",
  dustyCoral: "#BF7256",
  confirmGreen: "#2E4009",
  midOlive: "#49590E",
  mahogany: "#40160C",
};

/* ─── Data constants ─── */
const MONTHS_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const MONTHS_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];
const DAYS_OF_WEEK = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const EVENT_TYPE_OPTIONS = [
  { label: "Conference or Seminar", value: "conference", sublabel: "Presentations, panels, breakout sessions" },
  { label: "Team Day or Offsite", value: "team-day", sublabel: "Workshops, team meals, informal networking" },
  { label: "Product Launch", value: "product-launch", sublabel: "Brand reveals, showcases, demos" },
  { label: "Press or PR Event", value: "press-pr", sublabel: "Media gatherings, press lunches, industry dinners" },
  { label: "Brand Activation", value: "brand-activation", sublabel: "Experiential events, immersive experiences" },
  { label: "Photography or Film Shoot", value: "photo-film", sublabel: "Studio-style space with natural light" },
  { label: "Something else", value: "other", sublabel: "Meetings, workshops, private dining - tell us more" },
];

const GUEST_OPTIONS = [
  { label: "Under 20", value: "under-20", sublabel: "Boardroom-style or intimate dinner" },
  { label: "20 - 40", value: "20-40", sublabel: "Workshop or seated dinner" },
  { label: "40 - 60", value: "40-60", sublabel: "Our sweet spot - max seated" },
  { label: "60 - 100", value: "60-100", sublabel: "Standing reception or mixed format" },
  { label: "Not sure yet", value: "unsure", sublabel: "We can help you work it out" },
];

const BUDGET_OPTIONS = [
  { label: "Under \u00A33,000", value: "under-3k", fit: "entry" },
  { label: "\u00A33,000 - \u00A35,000", value: "3k-5k", fit: "good" },
  { label: "\u00A35,000 - \u00A310,000", value: "5k-10k", fit: "great" },
  { label: "\u00A310,000+", value: "10k+", fit: "premium" },
  { label: "Not sure yet", value: "unsure", fit: "unknown" },
];

/* Funnel order:
   1. Date - corporate buyers (especially agencies) come with a date locked in.
      Leading with the most concrete question hooks them immediately.
   2. Event type - what are you planning
   3. Guests - qualify capacity fit
   4. Capture - name, company, email, phone (optional). Lead is captured here.
   5. Budget - asked AFTER capture so it can't kill the lead. Skippable.
   6. Confirmation
*/
const TOTAL_STEPS = 5;

/* ─── Shared components ─── */

function FadeIn({ children, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(20px)",
      transition: "opacity 0.5s ease, transform 0.5s ease",
    }}>
      {children}
    </div>
  );
}

function ProgressDots({ current, total }) {
  return (
    <div className="wq-progress">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`wq-dot ${i <= current ? "wq-dot--active" : ""} ${i === current ? "wq-dot--current" : ""}`}
        />
      ))}
    </div>
  );
}

function SelectionCard({ label, sublabel, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`wq-card ${selected ? "wq-card--selected" : ""}`}
      type="button"
    >
      <div className="wq-card__text">
        <div className="wq-card__label">{label}</div>
        {sublabel && <div className="wq-card__sublabel">{sublabel}</div>}
      </div>
      {selected && (
        <div className="wq-card__check">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 7L5.5 10.5L12 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}
    </button>
  );
}

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} className="wq-back" type="button">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  );
}

/* ─── Step components ─── */

function StepEventType({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">What are you planning?</h2>
        <p className="wq-subtext">This helps us match you with the right package and team</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {EVENT_TYPE_OPTIONS.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              sublabel={opt.sublabel}
              selected={data.eventType === opt.value}
              onClick={() => {
                setData({ ...data, eventType: opt.value });
                setTimeout(onNext, 300);
              }}
            />
          ))}
        </div>
      </FadeIn>
    </div>
  );
}

function StepGuests({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">How many guests?</h2>
        <p className="wq-subtext">We hold up to 60 seated or 100 standing - perfect for focused, high-impact events</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {GUEST_OPTIONS.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              sublabel={opt.sublabel}
              selected={data.guests === opt.value}
              onClick={() => {
                setData({ ...data, guests: opt.value });
                setTimeout(onNext, 300);
              }}
            />
          ))}
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Mini calendar helpers ─── */
function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfWeek(year, month) {
  // 0=Sun in JS, convert to Mon=0
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}
function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDate();
  const suffix = [,"st","nd","rd"][day % 10 > 3 ? 0 : (day % 100 - day % 10 !== 10) * day % 10] || "th";
  return `${MONTHS_FULL[d.getMonth()]} ${day}${suffix}, ${d.getFullYear()}`;
}

function MiniCalendar({ year, month, selectedDate, onSelect, today }) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const cells = [];
  // Blank cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="cq-cal">
      <div className="cq-cal__header">
        {MONTHS_FULL[month]} {year}
      </div>
      <div className="cq-cal__days">
        {DAYS_OF_WEEK.map(d => (
          <div key={d} className="cq-cal__dow">{d}</div>
        ))}
      </div>
      <div className="cq-cal__grid">
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} className="cq-cal__blank" />;
          const dateStr = `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const isPast = dateStr < todayStr;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={dateStr}
              type="button"
              disabled={isPast}
              className={`cq-cal__day${isSelected ? " cq-cal__day--selected" : ""}${isPast ? " cq-cal__day--past" : ""}${isToday ? " cq-cal__day--today" : ""}`}
              onClick={() => !isPast && onSelect(dateStr)}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepDate({ data, setData, onNext }) {
  const today = new Date();
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDate, setTextDate] = useState("");
  const [calPage, setCalPage] = useState(0); // 0 = months 0-1, 1 = months 2-3

  // Build 4 months from current month
  const calMonths = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    calMonths.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  function handleDateSelect(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    setData({
      ...data,
      eventDate: dateStr,
      month: MONTHS_SHORT[d.getMonth()],
      year: String(d.getFullYear()),
    });
  }

  function handleTextSubmit() {
    if (!textDate.trim()) return;
    // Store the raw text - we'll parse what we can
    setData({
      ...data,
      eventDate: "",
      eventDateText: textDate.trim(),
      month: "",
      year: "",
    });
    onNext();
  }

  const canProceed = data.eventDate || data.eventDateText;
  const displayMonths = calPage === 0 ? calMonths.slice(0, 2) : calMonths.slice(2, 4);

  return (
    <div className="wq-step">
      <FadeIn>
        <h2 className="wq-heading">When is your event?</h2>
        <p className="wq-subtext">Five quick questions. We'll come back with a tailored proposal covering venue hire, catering, bar, and everything your event needs.</p>
      </FadeIn>

      {!showTextInput && (
        <FadeIn delay={150}>
          <div className="cq-cal-pair">
            {displayMonths.map(({ year, month }) => (
              <MiniCalendar
                key={`${year}-${month}`}
                year={year}
                month={month}
                selectedDate={data.eventDate}
                onSelect={handleDateSelect}
                today={today}
              />
            ))}
          </div>
          <div className="cq-cal-nav">
            {calPage > 0 && (
              <button type="button" className="cq-cal-nav__btn" onClick={() => setCalPage(0)}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {MONTHS_SHORT[calMonths[0].month]} - {MONTHS_SHORT[calMonths[1].month]}
              </button>
            )}
            {calPage < 1 && (
              <button type="button" className="cq-cal-nav__btn cq-cal-nav__btn--right" onClick={() => setCalPage(1)}>
                {MONTHS_SHORT[calMonths[2].month]} - {MONTHS_SHORT[calMonths[3].month]}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
          </div>
          {data.eventDate && (
            <div className="cq-cal-selected">
              Selected: <strong>{formatDateDisplay(data.eventDate)}</strong>
            </div>
          )}
          <div className="cq-date-alt">
            <button type="button" className="cq-date-alt__link" onClick={() => setShowTextInput(true)}>
              My date is further out or flexible
            </button>
          </div>
        </FadeIn>
      )}

      {showTextInput && (
        <FadeIn delay={100}>
          <div className="wq-form" style={{ marginTop: 20 }}>
            <div className="wq-field">
              <label className="wq-field__label" htmlFor="cq-date-text">When are you thinking?</label>
              <input
                id="cq-date-text"
                type="text"
                className="wq-field__input"
                placeholder='e.g. "September 2026" or "Q4 this year" or "flexible"'
                value={textDate}
                onChange={e => setTextDate(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                autoFocus
              />
              <p className="wq-hint" style={{ marginTop: 8 }}>Any format works - we'll confirm exact dates in your proposal.</p>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button
                onClick={handleTextSubmit}
                className="wq-btn wq-btn--primary"
                type="button"
                disabled={!textDate.trim()}
              >
                Continue
              </button>
              <button
                onClick={() => setShowTextInput(false)}
                className="wq-btn wq-btn--outline"
                type="button"
              >
                Back to calendar
              </button>
            </div>
          </div>
        </FadeIn>
      )}

      {!showTextInput && (
        <FadeIn delay={350}>
          <button
            onClick={onNext}
            className="wq-btn wq-btn--primary"
            type="button"
            disabled={!canProceed}
            style={{ marginTop: 24 }}
          >
            Continue
          </button>
        </FadeIn>
      )}
    </div>
  );
}

function StepCapture({ data, setData, onNext, onBack, submitting }) {
  const canSubmit = data.firstName?.trim() && data.email?.trim() && data.company?.trim();

  const eventLabel = EVENT_TYPE_OPTIONS.find(o => o.value === data.eventType)?.label;
  const guestLabel = GUEST_OPTIONS.find(o => o.value === data.guests)?.label;
  const datePill = data.eventDate
    ? formatDateDisplay(data.eventDate)
    : data.eventDateText
      ? data.eventDateText
      : data.month && data.year
        ? `${data.month} ${data.year}`
        : null;
  const summaryPills = [
    datePill,
    eventLabel,
    guestLabel ? `${guestLabel} guests` : null,
  ].filter(Boolean);

  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Where should we send your proposal?</h2>
        <p className="wq-subtext">We'll come back within 24 hours with availability, pricing, and a tailored proposal for your event.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-summary">
          {summaryPills.map((pill, i) => (
            <span key={i} className="wq-pill">{pill}</span>
          ))}
        </div>
      </FadeIn>
      <FadeIn delay={250}>
        <div className="wq-form">
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cq-fname">Your name</label>
            <input
              id="cq-fname"
              type="text"
              className="wq-field__input"
              placeholder="First and last name"
              value={data.firstName || ""}
              onChange={e => setData({ ...data, firstName: e.target.value })}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cq-company">Company</label>
            <input
              id="cq-company"
              type="text"
              className="wq-field__input"
              placeholder="Company name"
              value={data.company || ""}
              onChange={e => setData({ ...data, company: e.target.value })}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cq-email">Work email</label>
            <input
              id="cq-email"
              type="email"
              className="wq-field__input"
              placeholder="you@company.com"
              value={data.email || ""}
              onChange={e => setData({ ...data, email: e.target.value })}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cq-phone">
              Phone <span className="wq-field__optional">(optional)</span>
            </label>
            <input
              id="cq-phone"
              type="tel"
              className="wq-field__input"
              placeholder="+44"
              value={data.phone || ""}
              onChange={e => setData({ ...data, phone: e.target.value })}
            />
          </div>
          <button
            onClick={onNext}
            className="wq-btn wq-btn--primary wq-btn--full"
            type="button"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Sending..." : "Get Your Proposal"}
          </button>
          <p className="wq-hint" style={{ marginTop: 12, textAlign: "left" }}>
            We'll send a tailored proposal and follow up once. No spam, no mailing list. Unsubscribe anytime.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}

function StepBudget({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">One last thing - what is your rough budget?</h2>
        <p className="wq-subtext">Optional - it helps us tailor the proposal to your range. No obligation.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {BUDGET_OPTIONS.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              selected={data.budget === opt.value}
              onClick={() => {
                setData({ ...data, budget: opt.value, budgetFit: opt.fit });
                setTimeout(onNext, 300);
              }}
            />
          ))}
        </div>
      </FadeIn>
      <FadeIn delay={300}>
        <button
          onClick={onNext}
          className="wq-btn wq-btn--outline"
          type="button"
          style={{ marginTop: 20 }}
        >
          Skip this question
        </button>
      </FadeIn>
    </div>
  );
}

function StepConfirmation({ data }) {
  const isHighValue = ["great","premium"].includes(data.budgetFit);
  const isPhotoFilm = data.eventType === "photo-film";

  const tourUrl = `/bookacall/?utm_source=website&utm_medium=questionnaire&utm_campaign=corporate-quiz&utm_content=${data.eventType || "general"}`;

  return (
    <div className="wq-step wq-step--confirmation">
      <FadeIn>
        <div className="wq-confirm-icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill={BRAND.confirmGreen}/>
            <path d="M10 16L14 20L22 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </FadeIn>
      <FadeIn delay={150}>
        <h2 className="wq-heading">
          We're on it{data.firstName ? `, ${data.firstName.split(" ")[0]}` : ""}
        </h2>
        <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
          Look out for an email from <strong style={{ color: "var(--brewery-dark)", opacity: 1 }}>hello@thehackney.co</strong> within 24 hours with a tailored proposal for your event.
        </p>
      </FadeIn>

      {/* Photo/film shoot - mention the Winter Garden specifically */}
      {isPhotoFilm && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card wq-confirm-card--hot">
            <p>Our Winter Garden is a studio-style space with floor-to-ceiling windows and abundant natural light - ideal for photography and film. We offer half-day and full-day dry hire. Your proposal will cover rates, access times, and everything you need.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href={tourUrl}
                className="wq-btn wq-btn--primary"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "corp_quiz_success_tour_click" })}
              >
                Book a Venue Tour
              </a>
              <a
                href="https://wa.me/442079611604"
                className="wq-btn wq-btn--outline"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </FadeIn>
      )}

      {/* High-value lead - push towards a tour */}
      {!isPhotoFilm && isHighValue && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card wq-confirm-card--hot">
            <p>Want to see the space before your proposal arrives? Book a walkthrough with Hugo, our General Manager - he'll show you every corner and talk through how we'd set up your event.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href={tourUrl}
                className="wq-btn wq-btn--primary"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "corp_quiz_success_tour_click" })}
              >
                Book a Venue Tour
              </a>
              <a
                href="https://wa.me/442079611604"
                className="wq-btn wq-btn--outline"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Default confirmation */}
      {!isPhotoFilm && !isHighValue && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card">
            <h3 className="wq-confirm-card__title">What happens next</h3>
            <p>We'll review your requirements and email you a detailed proposal covering venue hire, catering, bar, AV, and pricing - everything in one document. If you'd like to see the space in person, you can book a tour with Hugo.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href={tourUrl}
                className="wq-btn wq-btn--outline"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "corp_quiz_success_tour_click" })}
              >
                Book a Venue Tour
              </a>
              <a
                href="https://wa.me/442079611604"
                className="wq-btn wq-btn--outline"
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

/* ─── Main component ─── */

const STEP_NAMES = {
  1: "date",
  2: "event-type",
  3: "guests",
  4: "capture",
  5: "budget",
  6: "confirmation",
};

function pushDL(payload) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push(payload);
  }
}

export default function CorporateQuiz() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [data, setData] = useState({
    eventType: "",
    guests: "",
    month: "", year: "",
    eventDate: "",      // YYYY-MM-DD from calendar picker
    eventDateText: "",  // free-text from "further out" input
    budget: "", budgetFit: "",
    firstName: "", company: "", email: "", phone: "",
  });

  useEffect(() => {
    pushDL({ event: "corporate_quiz_start" });
    pushDL({
      event: "corporate_quiz_step",
      step_number: 1,
      step_name: STEP_NAMES[1],
    });
  }, []);

  useEffect(() => {
    function handleUnload() {
      if (!completed && step >= 1 && step <= 5) {
        pushDL({
          event: "corporate_quiz_abandon",
          last_step: step,
          last_step_name: STEP_NAMES[step],
        });
      }
    }
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [step, completed]);

  function goNext() {
    setStep(s => {
      const next = s + 1;
      pushDL({
        event: "corporate_quiz_step",
        step_number: next,
        step_name: STEP_NAMES[next],
      });
      return next;
    });
    const el = document.getElementById("corporate-quiz");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goBack() {
    setStep(s => Math.max(1, s - 1));
  }

  async function handleCaptureSubmit() {
    setSubmitting(true);
    /* ── PLACEHOLDER: Replace with real endpoint when Klaviyo/Brevo is chosen ── */
    const payload = {
      first_name: data.firstName,
      company: data.company,
      email: data.email,
      phone: data.phone,
      event_type: data.eventType,
      guest_count: data.guests,
      event_date: data.eventDate || data.eventDateText || (data.month && data.year ? `${data.month} ${data.year}` : ""),
    };
    console.log("[CorporateQuiz] Capture payload:", payload);

    pushDL({
      event: "corporate_quiz_complete",
      quiz_event_type: data.eventType,
      quiz_guests: data.guests,
    });

    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    setCompleted(true);
    goNext();
  }

  return (
    <div className="wq" id="corporate-quiz">
      {step > 1 && step < 6 && (
        <ProgressDots current={step - 1} total={TOTAL_STEPS} />
      )}

      {step === 1 && <StepDate data={data} setData={setData} onNext={goNext} />}
      {step === 2 && <StepEventType data={data} setData={setData} onNext={goNext} onBack={goBack}/>}
      {step === 3 && <StepGuests data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 4 && <StepCapture data={data} setData={setData} onNext={handleCaptureSubmit} onBack={goBack} submitting={submitting} />}
      {step === 5 && <StepBudget data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 6 && <StepConfirmation data={data} />}
    </div>
  );
}
