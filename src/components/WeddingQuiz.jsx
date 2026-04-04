import { useState, useEffect } from "react";

/* ─── Industrial Romance palette ─── */
const BRAND = {
  warmCanvas: "#F5F0E8",
  breweryDark: "#2C1810",
  forestOlive: "#2E4009",
  firedBrick: "#8C472E",
  dustyCoral: "#BF7256",
  signalGreen: "#28A745",
  midOlive: "#49590E",
  mahogany: "#40160C",
};

/* ─── Data constants ─── */
const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];
const YEARS = ["2026","2027","2028","Not sure yet"];

const URGENCY_OPTIONS = [
  { label: "Just starting to look around", value: "browsing", sublabel: "No rush - gathering ideas" },
  { label: "Comparing a few venues", value: "comparing", sublabel: "Shortlisting our favourites" },
  { label: "Ready to book - just need the right venue", value: "ready", sublabel: "Let's make it happen" },
  { label: "We have a date in mind and need to move fast", value: "asap", sublabel: "Time-sensitive - help us lock it in" },
];

const GUEST_OPTIONS = [
  { label: "Under 20", value: "under-20", sublabel: "Intimate & personal", tag: "intimate" },
  { label: "20 - 40", value: "20-40", sublabel: "Intimate & personal", tag: "intimate" },
  { label: "40 - 60", value: "40-60", sublabel: "Our sweet spot", tag: "classic" },
  { label: "60 - 80", value: "60-80", sublabel: "A lively celebration", tag: "celebration" },
  { label: "80+", value: "80+", sublabel: "Standing receptions up to 120", tag: "large" },
];

const BUDGET_OPTIONS = [
  { label: "Under \u00A35,000", value: "under-5k", fit: "low" },
  { label: "\u00A35,000 - \u00A310,000", value: "5k-10k", fit: "moderate" },
  { label: "\u00A310,000 - \u00A315,000", value: "10k-15k", fit: "good" },
  { label: "\u00A315,000 - \u00A320,000", value: "15k-20k", fit: "great" },
  { label: "\u00A320,000+", value: "20k+", fit: "premium" },
  { label: "Not sure yet", value: "unsure", fit: "unknown" },
];

const STYLE_OPTIONS = [
  { label: "Relaxed standing reception", value: "standing" },
  { label: "Seated dinner with all the details", value: "seated" },
  { label: "Ceremony & celebration - the full day", value: "full-day" },
  { label: "Still exploring - show me everything", value: "exploring" },
];

const TOTAL_STEPS = 6;

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

function StepWelcome({ onStart }) {
  return (
    <div className="wq-step wq-step--welcome">
      <FadeIn>
        <div className="wq-eyebrow">The Hackney, London</div>
      </FadeIn>
      <FadeIn delay={150}>
        <h2 className="wq-heading">Let's start planning your wedding</h2>
      </FadeIn>
      <FadeIn delay={300}>
        <p className="wq-subtext">
          Answer a few quick questions and we'll send you a personalised guide
          tailored to your day - including pricing, menus, and everything
          we include as standard.
        </p>
      </FadeIn>
      <FadeIn delay={450}>
        <button onClick={onStart} className="wq-btn wq-btn--primary" type="button">
          Get Started
        </button>
        <p className="wq-hint">Takes about 60 seconds</p>
      </FadeIn>
    </div>
  );
}

function StepDate({ data, setData, onNext }) {
  const canProceed = data.month && data.year;
  return (
    <div className="wq-step">
      <FadeIn>
        <h2 className="wq-heading">When are you thinking?</h2>
        <p className="wq-subtext">Even a rough idea helps us check availability</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-label">Month</div>
        <div className="wq-month-grid">
          {MONTHS.map(m => (
            <button
              key={m}
              type="button"
              className={`wq-month ${data.month === m ? "wq-month--selected" : ""}`}
              onClick={() => setData({ ...data, month: m })}
            >
              {m}
            </button>
          ))}
        </div>
      </FadeIn>
      <FadeIn delay={250}>
        <div className="wq-label" style={{ marginTop: 28 }}>Year</div>
        <div className="wq-year-row">
          {YEARS.map(y => (
            <button
              key={y}
              type="button"
              className={`wq-year ${data.year === y ? "wq-year--selected" : ""}`}
              onClick={() => setData({ ...data, year: y })}
            >
              {y}
            </button>
          ))}
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
        <p className="wq-subtext">We're an intimate venue - perfect for 20 to 70 seated guests</p>
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

function StepBudget({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">What's your budget?</h2>
        <p className="wq-subtext">No judgement - this helps us tailor the right options for you</p>
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
    </div>
  );
}

function StepStyle({ data, setData, onNext, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">What's your vibe?</h2>
        <p className="wq-subtext">This helps us send you the most relevant pricing and ideas</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {STYLE_OPTIONS.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              selected={data.style === opt.value}
              onClick={() => {
                setData({ ...data, style: opt.value });
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
  const canSubmit = data.firstName?.trim() && data.email?.trim();

  const summaryPills = [
    data.month && data.year ? `${data.month} ${data.year}` : null,
    URGENCY_OPTIONS.find(o => o.value === data.urgency)?.label,
    GUEST_OPTIONS.find(o => o.value === data.guests)?.label ? `${GUEST_OPTIONS.find(o => o.value === data.guests)?.label} guests` : null,
    BUDGET_OPTIONS.find(o => o.value === data.budget)?.label,
    STYLE_OPTIONS.find(o => o.value === data.style)?.label,
  ].filter(Boolean);

  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Your personalised guide is ready</h2>
        <p className="wq-subtext">Tell us where to send it</p>
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
            <label className="wq-field__label" htmlFor="wq-lname">
              Last name <span className="wq-field__optional">(optional)</span>
            </label>
            <input
              id="wq-lname"
              type="text"
              className="wq-field__input"
              placeholder="Your last name"
              value={data.lastName || ""}
              onChange={e => setData({ ...data, lastName: e.target.value })}
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
              Phone <span className="wq-field__optional">(optional)</span>
            </label>
            <input
              id="wq-phone"
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
            {submitting ? "Sending..." : "Send My Guide"}
          </button>
          <p className="wq-hint" style={{ marginTop: 12, textAlign: "left" }}>
            We'll email your personalised pricing guide and a few helpful follow-ups. No spam, ever. Unsubscribe anytime.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}

function StepConfirmation({ data }) {
  const isHot = (data.urgency === "ready" || data.urgency === "asap")
    && ["good","great","premium"].includes(data.budgetFit)
    && data.guestTag !== "large";
  const isLarge = data.guests === "80+";
  const isLowBudget = data.budgetFit === "low";
  const isBrowser = data.urgency === "browsing" || data.urgency === "comparing";

  const tourUrl = isHot
    ? "/bookacall/?utm_source=website&utm_medium=questionnaire&utm_campaign=wedding-quiz-urgent"
    : "/bookacall/?utm_source=website&utm_medium=questionnaire&utm_campaign=wedding-quiz";

  return (
    <div className="wq-step wq-step--confirmation">
      <FadeIn>
        <div className="wq-confirm-icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill={BRAND.signalGreen}/>
            <path d="M10 16L14 20L22 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </FadeIn>
      <FadeIn delay={150}>
        <h2 className="wq-heading">
          It's on its way{data.firstName ? `, ${data.firstName}` : ""}
        </h2>
      </FadeIn>

      {/* Hot lead - prominent tour CTA */}
      {isHot && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card wq-confirm-card--hot">
            <p>Since you're ready to move, skip the emails and book a free venue tour directly with Hugo, our Events Manager.</p>
            <a href={tourUrl} className="wq-btn wq-btn--primary" style={{ marginTop: 16 }}>
              Book a Free Tour
            </a>
          </div>
        </FadeIn>
      )}

      {/* Browser - what happens next */}
      {isBrowser && !isHot && (
        <FadeIn delay={300}>
          <div className="wq-confirm-card">
            <h3 className="wq-confirm-card__title">What happens next</h3>
            <p>Check your inbox - your personalised guide is on its way. Over the next couple of weeks, we'll send you a few helpful emails with real wedding stories, planning tips, and everything you need to know about The Hackney.</p>
            <a href={tourUrl} className="wq-link" style={{ marginTop: 12, display: "inline-block" }}>
              Or skip ahead - book a free tour now
            </a>
          </div>
        </FadeIn>
      )}

      {/* Large guest count warning */}
      {isLarge && (
        <FadeIn delay={isBrowser || isHot ? 450 : 300}>
          <div className="wq-confirm-card wq-confirm-card--amber">
            <p>With 80+ guests, our seated capacity is a snug fit - but standing receptions work beautifully for larger groups. Your guide includes both options.</p>
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
            <a href={tourUrl} className="wq-btn wq-btn--outline" style={{ marginTop: 16 }}>
              Book a Free Tour
            </a>
          </div>
        </FadeIn>
      )}
    </div>
  );
}

/* ─── Main component ─── */

export default function WeddingQuiz() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState({
    month: "", year: "",
    urgency: "",
    guests: "", guestTag: "",
    budget: "", budgetFit: "",
    style: "",
    firstName: "", lastName: "", email: "", phone: "",
  });

  function goNext() {
    setStep(s => s + 1);
    /* Scroll the questionnaire section into view on step change */
    const el = document.getElementById("wedding-quiz");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goBack() {
    setStep(s => Math.max(1, s - 1));
  }

  async function handleSubmit() {
    setSubmitting(true);
    /* ── PLACEHOLDER: Replace with real endpoint when platform is chosen ── */
    const payload = {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      wedding_date: data.month && data.year ? `${data.month} ${data.year}` : "",
      booking_urgency: data.urgency,
      guest_count: data.guests,
      budget_range: data.budget,
      wedding_style: data.style,
    };
    console.log("[WeddingQuiz] Submission payload:", payload);

    /* Push event to dataLayer for GTM tracking */
    if (typeof window !== "undefined" && window.dataLayer) {
      window.dataLayer.push({
        event: "wedding_quiz_complete",
        quiz_urgency: data.urgency,
        quiz_guests: data.guests,
        quiz_budget: data.budget,
        quiz_style: data.style,
      });
    }

    /* Simulate a brief delay for the real API call */
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    goNext();
  }

  return (
    <div className="wq" id="wedding-quiz">
      {step > 0 && step < 7 && (
        <ProgressDots current={step - 1} total={TOTAL_STEPS} />
      )}

      {/* Welcome step removed - hero CTA "Plan Your Wedding" replaces it */}
      {step === 1 && <StepDate data={data} setData={setData} onNext={goNext} />}
      {step === 2 && <StepUrgency data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 3 && <StepGuests data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 4 && <StepBudget data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 5 && <StepStyle data={data} setData={setData} onNext={goNext} onBack={goBack} />}
      {step === 6 && <StepCapture data={data} setData={setData} onNext={handleSubmit} onBack={goBack} submitting={submitting} />}
      {step === 7 && <StepConfirmation data={data} />}
    </div>
  );
}
