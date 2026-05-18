import { useState, useEffect } from "react";
import { submitFormWithRetry } from "../lib/form-submit.js";

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

const EVENT_TYPE_OPTIONS = [
  { label: "Birthday party", value: "birthday", sublabel: "Milestone birthdays, dinners, evening celebrations" },
  { label: "Baby shower", value: "baby-shower", sublabel: "Daytime, all-inclusive per-person packages" },
  { label: "Anniversary", value: "anniversary", sublabel: "Wedding anniversaries, milestone celebrations" },
  { label: "Engagement party", value: "engagement", sublabel: "Pre-wedding celebration with friends and family" },
  { label: "Gender reveal", value: "gender-reveal", sublabel: "Daytime gathering to share the news" },
  { label: "Christmas party", value: "christmas", sublabel: "Private group, not corporate-led" },
  { label: "Something else", value: "other", sublabel: "Retirement, family gathering, anything we have not listed" },
];

const GUEST_OPTIONS = [
  { label: "Up to 30", value: "under-30", sublabel: "Intimate seated dinner" },
  { label: "30 to 60", value: "30-60", sublabel: "Max seated capacity" },
  { label: "60 to 100", value: "60-100", sublabel: "Standing or mixed format" },
  { label: "Not sure yet", value: "unsure", sublabel: "We can help you work it out" },
];

const FORMAT_OPTIONS = [
  { label: "Standing reception", value: "standing", sublabel: "Cocktails, canapes, mingling, dancing" },
  { label: "Seated dinner", value: "seated", sublabel: "Full sit-down meal, dancing after" },
  { label: "Mixed", value: "mixed", sublabel: "Seated portion plus standing reception" },
  { label: "Not sure yet", value: "unsure", sublabel: "We can help you work it out" },
];

/* Funnel order:
   1. Date - native date input. Gives us lead time AND day-of-week (Sat/Fri carve-outs).
   2. Event type - what are you celebrating
   3. Guests - capacity fit
   4. Format - critical for the standing-only Sat/Fri rule
   5. Capture - first name, email, phone. Lead is captured here.
   6. Confirmation - branches on (within-3-months × day-of-week × format)
*/
const TOTAL_STEPS = 5;

/* ─── 3-month and day-of-week helpers ─── */

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function isWithinThreeMonths(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() + 3);
  return d <= cutoff;
}

function monthsAway(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  const today = new Date();
  const diffMs = d - today;
  const diffMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
  return Math.max(0, diffMonths);
}

function dayOfWeek(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return null;
  return d.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat
}

function isStandingOnlyDay(dateStr) {
  const dow = dayOfWeek(dateStr);
  return dow === 5 || dow === 6; // Fri or Sat
}

function isoTodayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateLong(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

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

function StepDate({ data, setData, onNext }) {
  const minDate = isoTodayPlus(0);
  const canProceed = !!data.eventDate;
  return (
    <div className="wq-step">
      <FadeIn>
        <h2 className="wq-heading">When is your celebration?</h2>
        <p className="wq-subtext">A few quick questions to confirm your date, walk you through pricing, and put you in touch with Hugo. Two minutes.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-field" style={{ maxWidth: 320, margin: "0 auto" }}>
          <label className="wq-field__label" htmlFor="pq-date">Event date</label>
          <input
            id="pq-date"
            type="date"
            className="wq-field__input"
            value={data.eventDate || ""}
            min={minDate}
            onChange={e => setData({ ...data, eventDate: e.target.value })}
          />
        </div>
      </FadeIn>
      <FadeIn delay={300}>
        <button
          onClick={onNext}
          className="wq-btn wq-btn--primary"
          type="button"
          disabled={!canProceed}
          style={{ marginTop: 32 }}
        >
          Continue
        </button>
      </FadeIn>
    </div>
  );
}

function StepEventType({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">What are you celebrating?</h2>
        <p className="wq-subtext">This helps us match you with the right pricing model and package</p>
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
        <h2 className="wq-heading">Roughly how many guests?</h2>
        <p className="wq-subtext">We hold up to 60 seated or 100 standing - the whole venue is yours either way</p>
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

function StepFormat({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">What format are you thinking?</h2>
        <p className="wq-subtext">Our minimum spend pricing applies to standing celebrations. Seated dinners on any day are quoted separately as wedding-style bookings.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {FORMAT_OPTIONS.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              sublabel={opt.sublabel}
              selected={data.format === opt.value}
              onClick={() => {
                setData({ ...data, format: opt.value });
                setTimeout(onNext, 300);
              }}
            />
          ))}
        </div>
      </FadeIn>
    </div>
  );
}

function StepCapture({ data, setData, onNext, onBack, submitting, submitError, clearSubmitError }) {
  const canSubmit = data.firstName?.trim() && data.email?.trim();
  const clearErr = () => { if (submitError && clearSubmitError) clearSubmitError(); };

  const eventLabel = EVENT_TYPE_OPTIONS.find(o => o.value === data.eventType)?.label;
  const guestLabel = GUEST_OPTIONS.find(o => o.value === data.guests)?.label;
  const formatLabel = FORMAT_OPTIONS.find(o => o.value === data.format)?.label;
  const summaryPills = [
    data.eventDate ? formatDateLong(data.eventDate) : null,
    eventLabel,
    guestLabel ? `${guestLabel} guests` : null,
    formatLabel,
  ].filter(Boolean);

  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Where can Hugo reach you?</h2>
        <p className="wq-subtext">We will come back within one working day with availability and a quote tailored to your celebration.</p>
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
            <label className="wq-field__label" htmlFor="pq-fname">Your name</label>
            <input
              id="pq-fname"
              type="text"
              className="wq-field__input"
              placeholder="First and last name"
              value={data.firstName || ""}
              onChange={e => setData({ ...data, firstName: e.target.value })}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="pq-email">Email</label>
            <input
              id="pq-email"
              type="email"
              className="wq-field__input"
              placeholder="you@example.com"
              value={data.email || ""}
              onChange={e => { clearErr(); setData({ ...data, email: e.target.value }); }}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="pq-phone">
              Phone <span className="wq-field__optional">so we can call you back quickly</span>
            </label>
            <input
              id="pq-phone"
              type="tel"
              className="wq-field__input"
              placeholder="+44"
              value={data.phone || ""}
              onChange={e => setData({ ...data, phone: e.target.value })}
            />
          </div>
          {submitError && (
            <div
              role="alert"
              style={{
                marginBottom: 12,
                padding: "10px 14px",
                background: "rgba(140,71,46,0.08)",
                border: "1px solid rgba(140,71,46,0.35)",
                borderRadius: 2,
                color: "#8C472E",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                lineHeight: 1.45,
              }}
            >
              {submitError}
            </div>
          )}
          <button
            onClick={onNext}
            className="wq-btn wq-btn--primary wq-btn--full"
            type="button"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Sending..." : "Send My Details"}
          </button>
          <p className="wq-hint" style={{ marginTop: 12, textAlign: "left" }}>
            We will send a quote and follow up once. No spam, no mailing list. Unsubscribe anytime.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Confirmation: routes A / B / C ─── */

function ConfirmCardWeddings({ data }) {
  const weddingsUrl = `/weddings/?utm_source=website&utm_medium=questionnaire&utm_campaign=private-events-quiz&utm_content=soft-route-${data.eventType || "general"}`;
  function trackWeddingsClick() {
    if (window.dataLayer) window.dataLayer.push({ event: "private_quiz_routed_wedding_click" });
    if (window.__thk) window.__thk.track("cta_click", {
      cta_id: "private-quiz-routed-wedding",
      cta_text: "See Wedding Pricing",
      destination: weddingsUrl,
      quiz_type: "private",
      event_type: data.eventType || null,
    });
  }
  function trackMessageAnywayClick() {
    if (window.dataLayer) window.dataLayer.push({ event: "private_quiz_routed_message_anyway_click" });
    if (window.__thk) window.__thk.track("cta_click", {
      cta_id: "private-quiz-message-anyway",
      cta_text: "Message us anyway",
      destination: "/lets-talk/?type=private",
      quiz_type: "private",
      event_type: data.eventType || null,
    });
    fetch("/api/booking-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "discovery-call", source: "private-events-quiz-message-anyway" }),
      keepalive: true,
    }).catch(() => {});
  }
  return (
    <div className="wq-confirm-card wq-confirm-card--hot">
      <h3 className="wq-confirm-card__title">See our wedding venue</h3>
      <p>Same restored 1856 brewery, same in-house team, same exclusive hire - priced as a full wedding day with everything included.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <a href={weddingsUrl} className="wq-btn wq-btn--primary" onClick={trackWeddingsClick}>
          See Wedding Pricing
        </a>
      </div>
      <p style={{ marginTop: 20, marginBottom: 0, fontSize: 14, textAlign: "center" }}>
        <a
          href="/lets-talk/?type=private&utm_source=website&utm_medium=questionnaire&utm_campaign=private-events-quiz&utm_content=message-anyway"
          onClick={trackMessageAnywayClick}
          style={{ color: BRAND.dustyCoral, textDecoration: "underline" }}
        >
          Still think it is a private event? Message us and we will take a look.
        </a>
      </p>
    </div>
  );
}

function ConfirmCardDiscovery({ data, variant }) {
  const discoveryUrl = `/lets-talk/?type=private&utm_source=website&utm_medium=questionnaire&utm_campaign=private-events-quiz&utm_content=${variant}-${data.eventType || "general"}`;
  function trackDiscoveryClick() {
    if (window.dataLayer) window.dataLayer.push({ event: `private_quiz_${variant}_discovery_click` });
    if (window.__thk) window.__thk.track("cta_click", {
      cta_id: `private-quiz-${variant}-discovery`,
      cta_text: "Book a Discovery Call",
      destination: discoveryUrl,
      quiz_type: "private",
      event_type: data.eventType || null,
    });
    fetch("/api/booking-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent: "discovery-call", source: `private-events-quiz-${variant}` }),
      keepalive: true,
    }).catch(() => {});
  }
  return (
    <div className="wq-confirm-card">
      <h3 className="wq-confirm-card__title">Want to skip ahead?</h3>
      <p>If you would rather book a quick call with Hugo directly, you can grab a slot on his calendar now.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
        <a href={discoveryUrl} className="wq-btn wq-btn--primary" onClick={trackDiscoveryClick}>
          Book a Discovery Call
        </a>
      </div>
    </div>
  );
}

function StepConfirmation({ data }) {
  const withinWindow = isWithinThreeMonths(data.eventDate);
  const standingOnlyDay = isStandingOnlyDay(data.eventDate);
  const pureStanding = data.format === "standing";
  const away = monthsAway(data.eventDate);
  const firstName = data.firstName ? `, ${data.firstName.split(" ")[0]}` : "";

  /* Route A: date >3 months → soft-route to /weddings/ */
  if (!withinWindow) {
    return (
      <div className="wq-step wq-step--confirmation">
        <FadeIn>
          <div className="wq-confirm-icon" style={{ background: "transparent" }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="19" stroke={BRAND.firedBrick} strokeWidth="2"/>
              <path d="M20 12V21" stroke={BRAND.firedBrick} strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="20" cy="27" r="1.8" fill={BRAND.firedBrick}/>
            </svg>
          </div>
        </FadeIn>
        <FadeIn delay={150}>
          <h2 className="wq-heading">
            Your date is {away ? `${away} months` : "a while"} away
          </h2>
          <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
            Our private event pricing applies to dates within three months of the event. For dates further out, our wedding venue offering may be a better fit - the whole venue, a full day, from £5,000.
          </p>
        </FadeIn>
        <FadeIn delay={300}>
          <ConfirmCardWeddings data={data} />
        </FadeIn>
      </div>
    );
  }

  /* Route B: within 3 months + format not pure standing → discovery call route
     (minimum spend pricing is standing-only on all days; seated/mixed needs tailored quote) */
  if (!pureStanding) {
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
            We have your details{firstName}.
          </h2>
          <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
            Our minimum spend pricing applies to standing celebrations. Seated and mixed-format events are quoted separately as wedding-style bookings - Hugo will come back to you within one working day with availability and a price for your celebration.
          </p>
        </FadeIn>
        <FadeIn delay={300}>
          <ConfirmCardDiscovery data={data} variant="seated-or-mixed" />
        </FadeIn>
      </div>
    );
  }

  /* Route C: within 3 months + pure standing OR weekday (Sun-Thu) → standard success */
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
          Looks good{firstName}. Hugo will be in touch.
        </h2>
        <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
          We have your details. Hugo will reply within one working day with availability for {formatDateLong(data.eventDate)} and a quote tailored to your celebration.
        </p>
      </FadeIn>
      <FadeIn delay={300}>
        <ConfirmCardDiscovery data={data} variant="success" />
      </FadeIn>
    </div>
  );
}

/* ─── Main component ─── */

const STEP_NAMES = {
  1: "date",
  2: "event-type",
  3: "guests",
  4: "format",
  5: "capture",
  6: "confirmation",
};

function pushDL(payload) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push(payload);
  }
}

export default function PrivateEventsQuiz() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [data, setData] = useState({
    eventDate: "",
    eventType: "",
    guests: "",
    format: "",
    firstName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    pushDL({ event: "private_quiz_start" });
    pushDL({
      event: "private_quiz_step",
      step_number: 1,
      step_name: STEP_NAMES[1],
    });
  }, []);

  useEffect(() => {
    function handleUnload() {
      if (!completed && step >= 1 && step <= 5) {
        pushDL({
          event: "private_quiz_abandon",
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
        event: "private_quiz_step",
        step_number: next,
        step_name: STEP_NAMES[next],
      });
      return next;
    });
    const el = document.getElementById("private-events-quiz");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goBack() {
    setStep(s => Math.max(1, s - 1));
  }

  async function handleCaptureSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const withinWindow = isWithinThreeMonths(data.eventDate);
    const pureStanding = data.format === "standing";
    let routedTo = "private-standard";
    if (!withinWindow) routedTo = "weddings-soft-route";
    else if (!pureStanding) routedTo = "discovery-call-seated-or-mixed";

    const formData = {
      event_type: data.eventType,
      guest_count: data.guests,
      event_date: data.eventDate,
      event_format: data.format,
      within_three_months: withinWindow,
      routed_to: routedTo,
    };

    const outcome = await submitFormWithRetry({
      form_type: "private-events-quiz",
      email: data.email,
      first_name: data.firstName,
      phone: data.phone,
      form_data: formData,
    });

    setSubmitting(false);
    console.log("[PrivateEventsQuiz] Submit outcome:", outcome, "routedTo:", routedTo);

    if (!outcome.ok && !outcome.queued) {
      setSubmitError(outcome.userMessage);
      return;
    }

    pushDL({
      event: "private_quiz_complete",
      quiz_event_type: data.eventType,
      quiz_guests: data.guests,
      quiz_format: data.format,
      quiz_within_window: withinWindow,
      quiz_routed_to: routedTo,
    });

    if (routedTo === "weddings-soft-route") {
      pushDL({
        event: "private_quiz_routed_wedding",
        quiz_event_type: data.eventType,
      });
    } else if (routedTo === "discovery-call-seated-or-mixed") {
      pushDL({
        event: "private_quiz_routed_discovery_call",
        quiz_event_type: data.eventType,
        quiz_format: data.format,
      });
    }

    setCompleted(true);
    goNext();
  }

  return (
    <div className="wq" id="private-events-quiz">
      {step > 1 && step < 6 && (
        <ProgressDots current={step - 1} total={TOTAL_STEPS} />
      )}

      {step === 1 && <StepDate data={data} setData={setData} onNext={goNext} />}
      {step === 2 && <StepEventType data={data} setData={setData} onNext={goNext} onBack={goBack}/>}
      {step === 3 && <StepGuests data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 4 && <StepFormat data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 5 && <StepCapture data={data} setData={setData} onNext={handleCaptureSubmit} onBack={goBack} submitting={submitting} submitError={submitError} clearSubmitError={() => setSubmitError(null)} />}
      {step === 6 && <StepConfirmation data={data} />}
    </div>
  );
}
