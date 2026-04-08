import { useState, useEffect } from "react";

/* âââ Industrial Romance palette âââ */
const BRAND = {
  warmCanvas: "#F5F0E8",
  breweryDark: "#2C1810",
  forestOlive: "#2E4009",
  firedBrick: "#8C472E",
  dustyCoral: "#BF7256",
  confirmGreen: "#2E4009", /* forest-olive - replaces off-brand #28A745 */
  midOlive: "#49590E",
  mahogany: "#40160C",
};

/* âââ Data constants âââ */
const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

/* Year list auto-rolls every Jan 1 - shows current year + next 2 years.
   Couples can always book at least 2 full years ahead. No annual code change. */
const _currentYearForList = new Date().getFullYear();
const YEARS = [
  String(_currentYearForList),
  String(_currentYearForList + 1),
  String(_currentYearForList + 2),
  "Not sure yet",
];

const URGENCY_OPTIONS = [
  { label: "Just starting to look around", value: "browsing" },
  { label: "Comparing a few venues", value: "comparing" },
  { label: "Ready to book - just need the right venue", value: "ready" },
  { label: "We have a date in mind and need to move fast", value: "asap" },
];

const GUEST_OPTIONS = [
  { label: "Under 20", value: "under-20", sublabel: "Intimate & personal", tag: "intimate" },
  { label: "20 - 40", value: "20-40", sublabel: "Cosy & relaxed", tag: "intimate" },
  { label: "40 - 60", value: "40-60", sublabel: "Our sweet spot - max seated", tag: "classic" },
  { label: "60 - 100", value: "60-100", sublabel: "Standing reception style", tag: "standing" },
  { label: "Over 100", value: "100+", sublabel: "Talk to us - we may have some wiggle room", tag: "over-capacity" },
];

const BUDGET_OPTIONS = [
  { label: "Under \u00A35,000", value: "under-5k", fit: "low" },
  { label: "\u00A35,000 - \u00A310,000", value: "5k-10k", fit: "good" },
  { label: "\u00A310,000 - \u00A320,000", value: "10k-20k", fit: "great" },
  { label: "\u00A320,000+", value: "20k+", fit: "premium" },
  { label: "Not sure yet", value: "unsure", fit: "unknown" },
];

/* Style step removed - it was the weakest qualifier (couples often don't know yet)
   and we already capture format intent via guest count. Cutting it shortened the
   funnel from 6 steps to 5. */

/* New funnel order:
   1. Date - hook them with the most concrete question
   2. Urgency - gauge intent
   3. Guests - qualify capacity fit
   4. Capture - email + first name (phone optional). Lead is captured here.
   5. Budget - asked AFTER capture so it can't kill the lead. Skippable.
   6. Confirmation
*/
const TOTAL_STEPS = 5;

/* âââ Shared components âââ */

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

/* âââ Step components âââ */

function StepDate({ data, setData, onNext }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIndex = now.getMonth(); // 0-based (0 = Jan)

  function isMonthDisabled(monthAbbr) {
    if (!data.year || data.year === "Not sure yet") return false;
    const selectedYear = parseInt(data.year, 10);
    if (selectedYear > currentYear) return false;
    if (selectedYear < currentYear) return true;
    // Same year: disable months before current month
    const monthIndex = MONTHS.indexOf(monthAbbr);
    return monthIndex < currentMonthIndex;
  }

  function handleYearSelect(y) {
    // If switching to current year and selected month is in the past, clear it
    let newMonth = data.month;
    if (y !== "Not sure yet" && parseInt(y, 10) === currentYear && data.month) {
      const monthIndex = MONTHS.indexOf(data.month);
      if (monthIndex < currentMonthIndex) {
        newMonth = "";
      }
    }
    setData({ ...data, year: y, month: newMonth });
  }

  const canProceed = data.month && data.year;
  return (
    <div className="wq-step">
      <FadeIn>
        <h2 className="wq-heading">Let's start with your date</h2>
        <p className="wq-subtext">Five quick questions. We'll send you a personalised wedding guide with pricing, menus, and availability for your date.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-label">When are you thinking?</div>
        <div className="wq-year-row">
          {YEARS.map(y => (
            <button
              key={y}
              type="button"
              className={`wq-year ${data.year === y ? "wq-year--selected" : ""}`}
              onClick={() => handleYearSelect(y)}
            >
              {y}
            </button>
          ))}
        </div>
      </FadeIn>
      <FadeIn delay={250}>
        <div className="wq-label" style={{ marginTop: 28 }}>Month</div>
        <div className="wq-month-grid">
          {MONTHS.map(m => {
            const disabled = isMonthDisabled(m);
            return (
              <button
                key={m}
                type="button"
                className={`wq-month ${data.month === m ? "wq-month--selected" : ""} ${disabled ? "wq-month--disabled" : ""}`}
                onClick={() => !disabled && setData({ ...data, month: m })}
                disabled={disabled}
              >
                {m}
              </button>
            );
          })}
        </div>
      </FadeIn>
      <FadeIn delay={350}>
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

function StepUrgency({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Where are you in your search?</h2>
        <p className="wq-subtext">No wrong answer - we'll tailor everything to your timeline</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {URGENCY_OPTIONS.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              sublabel={opt.sublabel}
              selected={data.urgency === opt.value}
              onClick={() => {
                setData({ ...data, urgency: opt.value });
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
        <p className="wq-subtext">We're an intimate venue - perfect for 20 to 60 seated guests</p>
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
                setData({ ...data, guests: opt.value, guestTag: opt.tag });
                setTimeout(onNext, 300);
              }}
            />
          ))}
        </div>
      </FadeIn>
    </div>
  );
}

function StepCapture({ data, setData, onNext, onBack, submitting }) {
  /* Phone is optional - requiring it tanks form completion ~25-50% per UX research.
     First name + email is enough to qualify and follow up. */
  const canSubmit = data.firstName?.trim() && data.email?.trim();

  const summaryPills = [
    data.month && data.year ? `${data.month} ${data.year}` : null,
    URGENCY_OPTIONS.find(o => o.value === data.urgency)?.label,
    GUEST_OPTIONS.find(o => o.value === data.guests)?.label ? `${GUEST_OPTIONS.find(o => o.value === data.guests)?.label} guests` : null,
  ].filter(Boolean);

  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Where should we send your guide?</h2>
        <p className="wq-subtext">We'll get back to you within 24 hours with availability and pricing for your date.</p>
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
            <label className="wq-field__label" htmlFor="wq-fname">First name</label>
            <input
              id="wq-fname"
              type="text"
              className="wq-field__input"
              placeholder="Your first name"
              value={data.firstName || ""}
              onChange={e => setData({ ...data, firstName: e.target.value })}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="wq-email">Email</label>
            <input
              id="wq-email"
              type="email"
              className="wq-field__input"
              placeholder="you@email.com"
              value={data.email || ""}
              onChange={e => setData({ ...data, email: e.target.value })}
            />
          </div>
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="wq-phone">
              Mobile <span className="wq-field__optional">(optional)</span>
            </label>
            <input
              id="wq-phone"
              type="tel"
              className="wq-field__input"
              placeholder="+44"
              value={data.phone || ""}
              onChange={e => setData({ ...data, phone: e.target.value })}
            />
            <p className="wq-field__note">For WhatsApp updates on availability and pricing</p>
          </div>
          <button
            onClick={onNext}
            className="wq-btn wq-btn--primary wq-btn--full"
            type="button"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Sending..." : "Get Your Wedding Guide"}
          </button>
          <p className="wq-hint" style={{ marginTop: 12, textAlign: "left" }}>
            We'll send your personalised guide and a few helpful follow-ups. No spam, ever. Unsubscribe anytime.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}

/* Budget step - now AFTER capture, fully optional. The lead is already saved.
   This step refines the lead but never blocks it. */
function StepBudget({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">One last thing - what's your rough budget?</h2>
        <p className="wq-subtext">Optional - it just helps us send you the right options. No judgement.</p>
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
  const isHot = (data.urgency === "ready" || data.urgency === "asap")
    && ["good","great","premium"].includes(data.budgetFit)
    && data.guestTag !== "large";
  const isLarge = data.guests === "100+";
  const isLowBudget = data.budgetFit === "low";
  const isBrowser = data.urgency === "browsing" || data.urgency === "comparing";

  const tourUrl = isHot
    ? "/bookacall/?utm_source=website&utm_medium=questionnaire&utm_campaign=wedding-quiz-urgent"
    : "/bookacall/?utm_source=website&utm_medium=questionnaire&utm_campaign=wedding-quiz";

  const dcUrl = isHot
    ? "/bookacall/?type=discovery-call&utm_source=website&utm_medium=questionnaire&utm_campaign=wedding-quiz-urgent"
    : "/bookacall/?type=discovery-call&utm_source=website&utm_medium=questionnaire&utm_campaign=wedding-quiz";

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
          It's on its way{data.firstName ? `, ${data.firstName}` : ""}
        </h2>
        <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
          Look out for an email from <strong style={{ color: "var(--brewery-dark)", opacity: 1 }}>hello@thehackney.co</strong> within the next few minutes. If it does not arrive, check your spam or promotions folder.
        </p>
      </FadeIn>

      {/* Hot lead - prominent tour CTA */}
      {isHot && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card wq-confirm-card--hot">
            <p>Since you're ready to move, skip the emails and book a free venue tour directly with Hugo, our General Manager.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href={dcUrl}
                className="wq-btn wq-btn--primary"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "quiz_success_dc_click" })}
              >
                Book a Discovery Call
              </a>
              <a
                href={tourUrl}
                className="wq-btn wq-btn--outline"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "quiz_success_tour_click" })}
              >
                Book a Venue Tour
              </a>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Browser - what happens next */}
      {isBrowser && !isHot && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card">
            <h3 className="wq-confirm-card__title">What happens next</h3>
            <p>Check your inbox - your personalised guide is on its way. Over the next couple of weeks, we'll send you a few helpful emails with real wedding stories, planning tips, and everything you need to know about The Hackney.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href={dcUrl}
                className="wq-btn wq-btn--primary"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "quiz_success_dc_click" })}
              >
                Book a Discovery Call
              </a>
              <a
                href={tourUrl}
                className="wq-btn wq-btn--outline"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "quiz_success_tour_click" })}
              >
                Book a Venue Tour
              </a>
            </div>
          </div>
        </FadeIn>
      )}

      {/* Large guest count warning */}
      {isLarge && (
        <FadeIn delay={isBrowser || isHot ? 450 : 300}>
          <div className="wq-confirm-card wq-confirm-card--amber">
            <p>With 100+ guests, our seated capacity is a snug fit - but standing receptions work beautifully for larger groups. Your guide includes both options.</p>
          </div>
        </FadeIn>
      )}

      {/* Low budget - gentle confirmation, no tour push */}
      {isLowBudget && !isBrowser && !isHot && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card">
            <p>Your guide includes our entry-level options and a breakdown of how our pricing works. We'll follow up with some helpful information over the next week or two.</p>
          </div>
        </FadeIn>
      )}

      {/* Default for warm leads that don't match other conditions */}
      {!isHot && !isBrowser && !isLowBudget && !isLarge && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card">
            <p>Check your inbox - your personalised guide is on its way. If you'd like to see the space in person, book a free tour with Hugo.</p>
            <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
              <a
                href={dcUrl}
                className="wq-btn wq-btn--outline"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "quiz_success_dc_click" })}
              >
                Book a Discovery Call
              </a>
              <a
                href={tourUrl}
                className="wq-btn wq-btn--outline"
                onClick={() => window.dataLayer && window.dataLayer.push({ event: "quiz_success_tour_click" })}
              >
                Book a Venue Tour
              </a>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

/* âââ Main component âââ */

/* Step number â human-readable name for tracking. Keeps GA4 reports legible.
   New ordering: Date â Urgency â Guests â Capture â Budget â Confirmation.
   Budget moved to AFTER capture so it can't kill the lead. */
const STEP_NAMES = {
  1: "date",
  2: "urgency",
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

export default function WeddingQuiz() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [data, setData] = useState({
    month: "", year: "",
    urgency: "",
    guests: "", guestTag: "",
    budget: "", budgetFit: "",
    firstName: "", email: "", phone: "",
  });

  /* Fire wedding_quiz_start once on mount + wedding_quiz_step for the first step */
  useEffect(() => {
    pushDL({ event: "wedding_quiz_start" });
    pushDL({
      event: "wedding_quiz_step",
      step_number: 1,
      step_name: STEP_NAMES[1],
    });
  }, []);

  /* Fire wedding_quiz_abandon if user leaves before completing.
     "Completed" means lead is captured (step 4 submission), so abandons
     after that point are not counted as lost leads. */
  useEffect(() => {
    function handleUnload() {
      if (!completed && step >= 1 && step <= 5) {
        pushDL({
          event: "wedding_quiz_abandon",
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
        event: "wedding_quiz_step",
        step_number: next,
        step_name: STEP_NAMES[next],
      });
      return next;
    });
    /* Scroll the questionnaire section into view on step change */
    const el = document.getElementById("wedding-quiz");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goBack() {
    setStep(s => Math.max(1, s - 1));
  }

  async function handleCaptureSubmit() {
    setSubmitting(true);
    /* ââ PLACEHOLDER: Replace with real endpoint when platform is chosen ââ */
    const payload = {
      first_name: data.firstName,
      email: data.email,
      phone: data.phone,
      wedding_date: data.month && data.year ? `${data.month} ${data.year}` : "",
      booking_urgency: data.urgency,
      guest_count: data.guests,
    };
    console.log("[WeddingQuiz] Capture payload:", payload);

    /* The lead is officially captured at this point - mark as completed
       so beforeunload doesn't fire abandon. Budget step is post-capture. */
    pushDL({
      event: "wedding_quiz_complete",
      quiz_urgency: data.urgency,
      quiz_guests: data.guests,
    });

    /* Simulate a brief delay for the real API call */
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    setCompleted(true);
    goNext();
  }

  return (
    <div className="wq" id="wedding-quiz">
      {/* Hide dots on Step 1 - showing "1 of 5" before they engage feels like a chore */}
      {step > 1 && step < 6 && (
        <ProgressDots current={step - 1} total={TOTAL_STEPS} />
      )}

      {/* Welcome step removed - hero CTA "Plan Your Wedding" replaces it.
          Style step removed - weakest qualifier, already implied by guests.
          Budget moved AFTER capture so it can't kill the lead. */}
      {step === 1 && <StepDate data={data} setData={setData} onNext={goNext} />}
      {step === 2 && <StepUrgency data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 3 && <StepGuests data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 4 && <StepCapture data={data} setData={setData} onNext={handleCaptureSubmit} onBack={goBack} submitting={submitting} />}
      {step === 5 && <StepBudget data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 6 && <StepConfirmation data={data} />}
    </div>
  );
}
