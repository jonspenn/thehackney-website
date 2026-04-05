import { useState, useEffect } from "react";

/* ─── Industrial Romance palette ─── */
const BRAND = {
  warmCanvas: "#F5F0E8",
  breweryDark: "#2C1810",
  forestOlive: "#2E4009",
  firedBrick: "#8C472E",
  dustyCoral: "#BF7256",
  midOlive: "#49590E",
  mahogany: "#40160C",
};

/* ─── Data constants ─── */
const EVENT_TYPES = [
  { label: "Wedding", value: "wedding", sublabel: "Planning your wedding" },
  { label: "Corporate event", value: "corporate", sublabel: "Team events, launches, parties" },
  { label: "Private celebration", value: "private", sublabel: "Birthdays, baby showers, milestones" },
  { label: "Something else", value: "other", sublabel: "Get in touch" },
];

const CORPORATE_SUBTYPES = [
  { label: "Christmas party", value: "christmas-party" },
  { label: "Away day", value: "away-day" },
  { label: "Product launch", value: "product-launch" },
  { label: "Meeting", value: "meeting" },
  { label: "Film shoot", value: "film-shoot" },
  { label: "Other", value: "other" },
];

const PRIVATE_OCCASIONS = [
  { label: "Birthday", value: "birthday" },
  { label: "Baby shower", value: "baby-shower" },
  { label: "Celebration", value: "celebration" },
  { label: "Other", value: "other" },
];

const WHATSAPP_NUMBER = "442079611604";

function whatsappUrl(eventType, flexible) {
  const messages = {
    wedding: flexible
      ? "Hi, I'm interested in having our wedding at The Hackney. I'm flexible on dates - can you help?"
      : "Hi, I'm interested in having our wedding at The Hackney. Could you help with availability?",
    corporate: flexible
      ? "Hi, I'm interested in hosting a corporate event at The Hackney. I'm flexible on dates - can you help?"
      : "Hi, I'm interested in hosting a corporate event at The Hackney. Could you help with availability?",
    private: flexible
      ? "Hi, I'm interested in hosting a private celebration at The Hackney. I'm flexible on dates - can you help?"
      : "Hi, I'm interested in hosting a private celebration at The Hackney. Could you help with availability?",
    other: "Hi, I'm interested in The Hackney for an event. Could you help?",
  };
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(messages[eventType] || messages.other)}`;
}

/* ─── UTM + GCLID capture ─── */
function getTrackingParams() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const tracking = {};
  ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid"].forEach(key => {
    const val = params.get(key);
    if (val) tracking[key] = val;
  });
  // Also check GCLID cookie (same pattern as live site)
  if (!tracking.gclid) {
    const match = document.cookie.match("(^|;) ?track_gclid=([^;]*)(;|$)");
    if (match) tracking.gclid = match[2];
  }
  return tracking;
}

/* ─── GTM push helper ─── */
function pushEvent(event, props = {}) {
  if (typeof window !== "undefined" && window.dataLayer) {
    window.dataLayer.push({ event, ...props });
  }
}

/* ─── Shared components (matching WeddingQuiz patterns) ─── */

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

/* WhatsApp icon */
function WhatsAppIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 8, verticalAlign: "middle" }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

/* ─── Step 1: Event Type ─── */
function StepEventType({ data, setData, onNext }) {
  return (
    <div className="wq-step">
      <FadeIn>
        <h2 className="wq-heading">What are you planning?</h2>
        <p className="wq-subtext">Tell us what you have in mind and we'll check availability. Takes 60 seconds.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          {EVENT_TYPES.map(opt => (
            <SelectionCard
              key={opt.value}
              label={opt.label}
              sublabel={opt.sublabel}
              selected={data.eventType === opt.value}
              onClick={() => {
                setData({ ...data, eventType: opt.value });
                pushEvent("check_date_event_type", { event_type: opt.value });
                if (opt.value === "other") {
                  // "Something else" goes straight to WhatsApp
                  window.open(whatsappUrl("other", true), "_blank");
                } else {
                  setTimeout(onNext, 300);
                }
              }}
            />
          ))}
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Step 2: Specific Date or Flexible? ─── */
function StepDateBranch({ data, setData, onSpecific, onFlexible, onBack }) {
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Do you have a specific date?</h2>
        <p className="wq-subtext">Either way is fine - we'll point you in the right direction</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-cards">
          <SelectionCard
            label="Yes, I have a date"
            sublabel="Check if it's free"
            selected={data.dateBranch === "specific"}
            onClick={() => {
              setData({ ...data, dateBranch: "specific" });
              pushEvent("check_date_branch", { event_type: data.eventType, branch: "specific" });
              setTimeout(onSpecific, 300);
            }}
          />
          <SelectionCard
            label="Not yet, I'm flexible"
            sublabel="Help me find the right date"
            selected={data.dateBranch === "flexible"}
            onClick={() => {
              setData({ ...data, dateBranch: "flexible" });
              pushEvent("check_date_branch", { event_type: data.eventType, branch: "flexible" });
              setTimeout(onFlexible, 300);
            }}
          />
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Step 3a: Flexible Path ─── */
function StepFlexible({ data, onBack }) {
  if (data.eventType === "wedding") {
    return (
      <div className="wq-step">
        <BackButton onClick={onBack} />
        <FadeIn>
          <h2 className="wq-heading">Let's find the right date for you</h2>
          <p className="wq-subtext">
            Answer a few quick questions about your day and we'll send you a personalised guide -
            including availability, pricing, and everything we include.
          </p>
        </FadeIn>
        <FadeIn delay={200}>
          <a
            href="/weddings/#questionnaire?utm_source=website&utm_medium=check-your-date&utm_campaign=wedding-flexible"
            className="wq-btn wq-btn--primary"
            onClick={() => pushEvent("check_date_flexible_redirect", { event_type: "wedding", destination: "questionnaire" })}
          >
            Start the Questionnaire
          </a>
          <p className="wq-hint">Takes about 60 seconds</p>
        </FadeIn>
      </div>
    );
  }

  // Corporate or Private - WhatsApp + Book a Call
  const typeLabel = data.eventType === "corporate" ? "corporate event" : "private celebration";
  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Let's find the right date for you</h2>
        <p className="wq-subtext">
          Hugo can check what's available and talk you through the options for your {typeLabel}.
        </p>
      </FadeIn>
      <FadeIn delay={200}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <a
            href="/check-your-date/book-a-call/?utm_source=website&utm_medium=check-your-date&utm_campaign=flexible-call"
            className="wq-btn wq-btn--primary"
            onClick={() => pushEvent("check_date_flexible_redirect", { event_type: data.eventType, destination: "book-a-call" })}
          >
            Book a Call with Hugo
          </a>
          <a
            href={whatsappUrl(data.eventType, true)}
            className="wq-btn wq-btn--outline"
            target="_blank"
            rel="noopener"
            onClick={() => pushEvent("whatsapp_click", { event_type: data.eventType, context: "flexible" })}
          >
            <WhatsAppIcon /> WhatsApp Hugo
          </a>
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Step 3b: Specific Date Form ─── */
function StepForm({ data, setData, onSubmit, onBack, submitting }) {
  const isPrivate = data.eventType === "private";
  const isCorporate = data.eventType === "corporate";

  // Private celebrations: max 3 months out
  const maxDate = isPrivate
    ? new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString().split("T")[0]
    : new Date(new Date().setFullYear(new Date().getFullYear() + 2)).toISOString().split("T")[0];
  const minDate = new Date().toISOString().split("T")[0];

  const canSubmit = data.eventDate && data.guestCount && data.firstName?.trim() && data.email?.trim();

  return (
    <div className="wq-step">
      <BackButton onClick={onBack} />
      <FadeIn>
        <h2 className="wq-heading">Tell us the details</h2>
        <p className="wq-subtext">We'll check availability and get back to you within 24 hours.</p>
      </FadeIn>
      <FadeIn delay={150}>
        <div className="wq-form">
          {/* Corporate: event subtype */}
          {isCorporate && (
            <div className="wq-field">
              <label className="wq-field__label">What type of event?</label>
              <select
                className="wq-field__input"
                value={data.corporateType || ""}
                onChange={e => setData({ ...data, corporateType: e.target.value })}
              >
                <option value="">Select...</option>
                {CORPORATE_SUBTYPES.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Private: occasion */}
          {isPrivate && (
            <div className="wq-field">
              <label className="wq-field__label">What's the occasion?</label>
              <select
                className="wq-field__input"
                value={data.occasion || ""}
                onChange={e => setData({ ...data, occasion: e.target.value })}
              >
                <option value="">Select...</option>
                {PRIVATE_OCCASIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Private: pricing note */}
          {isPrivate && (
            <div className="cd-info-box">
              <p>No hire fee. Minimum spend from \u00A32,000 (Fridays) or \u00A33,000 (Saturdays). Available up to 3 months ahead on unsold dates.</p>
            </div>
          )}

          {/* Date */}
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cd-date">
              {isPrivate ? "When? (within 3 months)" : "When are you thinking?"}
            </label>
            <input
              id="cd-date"
              type="date"
              className="wq-field__input"
              min={minDate}
              max={maxDate}
              value={data.eventDate || ""}
              onChange={e => setData({ ...data, eventDate: e.target.value })}
              onFocus={() => pushEvent("check_date_form_start", { event_type: data.eventType })}
            />
          </div>

          {/* Guest count */}
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cd-guests">How many guests?</label>
            <input
              id="cd-guests"
              type="number"
              className="wq-field__input"
              placeholder="e.g. 50"
              min="1"
              max="200"
              value={data.guestCount || ""}
              onChange={e => setData({ ...data, guestCount: e.target.value })}
            />
          </div>

          {/* Corporate: seated/standing */}
          {isCorporate && (
            <div className="wq-field">
              <label className="wq-field__label">Format</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={`wq-toggle ${data.format === "seated" ? "wq-toggle--active" : ""}`}
                  onClick={() => setData({ ...data, format: "seated" })}
                >
                  Seated
                </button>
                <button
                  type="button"
                  className={`wq-toggle ${data.format === "standing" ? "wq-toggle--active" : ""}`}
                  onClick={() => setData({ ...data, format: "standing" })}
                >
                  Standing
                </button>
              </div>
            </div>
          )}

          {/* Name */}
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cd-name">Your name</label>
            <input
              id="cd-name"
              type="text"
              className="wq-field__input"
              placeholder="First name"
              value={data.firstName || ""}
              onChange={e => setData({ ...data, firstName: e.target.value })}
            />
          </div>

          {/* Email */}
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cd-email">Email</label>
            <input
              id="cd-email"
              type="email"
              className="wq-field__input"
              placeholder="you@email.com"
              value={data.email || ""}
              onChange={e => setData({ ...data, email: e.target.value })}
            />
          </div>

          {/* Corporate: company */}
          {isCorporate && (
            <div className="wq-field">
              <label className="wq-field__label" htmlFor="cd-company">
                Company <span className="wq-field__optional">(optional)</span>
              </label>
              <input
                id="cd-company"
                type="text"
                className="wq-field__input"
                placeholder="Company name"
                value={data.company || ""}
                onChange={e => setData({ ...data, company: e.target.value })}
              />
            </div>
          )}

          {/* Phone */}
          <div className="wq-field">
            <label className="wq-field__label" htmlFor="cd-phone">
              Phone <span className="wq-field__optional">(optional)</span>
            </label>
            <input
              id="cd-phone"
              type="tel"
              className="wq-field__input"
              placeholder="+44"
              value={data.phone || ""}
              onChange={e => setData({ ...data, phone: e.target.value })}
            />
          </div>

          <button
            onClick={onSubmit}
            className="wq-btn wq-btn--primary wq-btn--full"
            type="button"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "Checking..." : "Check Availability"}
          </button>

          <p className="wq-hint" style={{ marginTop: 8, textAlign: "left" }}>
            We'll check your date and get back to you within 24 hours. No spam, ever.
          </p>
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Step 4: Confirmation ─── */
function StepConfirmation({ data, qualified }) {
  const meetingsUrl = "https://meetings-eu1.hubspot.com/bookings-team/book-a-discovery-call?embed=true";

  // Not qualified (capacity / window issues)
  if (!qualified) {
    return (
      <div className="wq-step wq-step--confirmation">
        <FadeIn>
          <div className="wq-confirm-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="16" fill={BRAND.dustyCoral}/>
              <path d="M16 10V18M16 22H16.01" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="wq-heading">{qualified === "window" ? "That date is a little far out" : "Let's talk about what's possible"}</h2>
          <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
            {qualified === "window"
              ? "Private celebrations are available within 3 months. Your date is further out - get in touch and we'll see what's possible."
              : `Our space seats up to 60 and holds 100 standing. With ${data.guestCount} guests, let's chat about how we can make it work.`
            }
          </p>
        </FadeIn>
        <FadeIn delay={200}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
            <a
              href={whatsappUrl(data.eventType, false)}
              className="wq-btn wq-btn--primary"
              target="_blank"
              rel="noopener"
              onClick={() => pushEvent("whatsapp_click", { event_type: data.eventType, context: "over-capacity" })}
            >
              <WhatsAppIcon /> Chat on WhatsApp
            </a>
          </div>
        </FadeIn>
      </div>
    );
  }

  // Qualified - show success + meetings embed
  return (
    <div className="wq-step wq-step--confirmation">
      <FadeIn>
        <div className="wq-confirm-icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill={BRAND.forestOlive}/>
            <path d="M10 16L14 20L22 12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h2 className="wq-heading">
          {data.firstName ? `Thanks, ${data.firstName}` : "Thanks for your enquiry"}
        </h2>
        <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto" }}>
          We've received your details and will check availability for your date. In the meantime, you can book a call with Hugo to talk things through.
        </p>
      </FadeIn>
      <FadeIn delay={200}>
        <div className="wq-confirm-card wq-confirm-card--hot">
          <h3 className="wq-confirm-card__title">Book a discovery call</h3>
          <p style={{ marginBottom: 16 }}>A 15-minute chat with Hugo. He'll confirm your date and answer any questions about the venue.</p>
          <div className="cd-meetings-embed">
            <div className="meetings-iframe-container" data-src={meetingsUrl}></div>
          </div>
        </div>
      </FadeIn>
      <FadeIn delay={350}>
        <div style={{ marginTop: 20, textAlign: "center" }}>
          <p className="wq-subtext" style={{ maxWidth: "none", textAlign: "center", marginLeft: "auto", marginRight: "auto", marginBottom: 12 }}>
            Prefer to message?
          </p>
          <a
            href={whatsappUrl(data.eventType, false)}
            className="wq-btn wq-btn--outline"
            target="_blank"
            rel="noopener"
            onClick={() => pushEvent("whatsapp_click", { event_type: data.eventType, context: "post-submit" })}
          >
            <WhatsAppIcon /> Chat on WhatsApp
          </a>
        </div>
      </FadeIn>
    </div>
  );
}

/* ─── Main component ─── */
export default function CheckDateForm() {
  const [screen, setScreen] = useState("event-type"); // event-type, date-branch, flexible, form, confirmation
  const [submitting, setSubmitting] = useState(false);
  const [qualified, setQualified] = useState(true);
  const [tracking, setTracking] = useState({});
  const [data, setData] = useState({
    eventType: "",
    dateBranch: "",
    eventDate: "",
    guestCount: "",
    firstName: "",
    email: "",
    phone: "",
    company: "",
    corporateType: "",
    occasion: "",
    format: "seated",
  });

  // Capture UTM + GCLID on mount
  useEffect(() => {
    setTracking(getTrackingParams());
  }, []);

  // Load HubSpot meetings script when confirmation screen shows
  useEffect(() => {
    if (screen === "confirmation" && qualified === true) {
      // Check if script already loaded
      if (!document.querySelector('script[src*="MeetingsEmbedCode"]')) {
        const script = document.createElement("script");
        script.src = "https://static.hsappstatic.net/MeetingsEmbed/ex/MeetingsEmbedCode.js";
        script.async = true;
        document.body.appendChild(script);
      } else {
        // Script already loaded, re-trigger HubSpot's embed scan
        if (window.HubSpotConversations) {
          window.HubSpotConversations.widget.load();
        }
      }
    }
  }, [screen, qualified]);

  function scrollToTop() {
    const el = document.getElementById("check-date-form");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function goTo(s) {
    setScreen(s);
    setTimeout(scrollToTop, 50);
  }

  /* ── Qualification checks ── */
  function runChecks() {
    const guests = parseInt(data.guestCount, 10);
    const isSeated = data.format === "seated" || data.eventType !== "corporate";

    // Guest capacity
    if (isSeated && guests > 60) {
      pushEvent("check_date_over_capacity", { event_type: data.eventType, guest_count: guests });
      return "capacity";
    }
    if (!isSeated && guests > 100) {
      pushEvent("check_date_over_capacity", { event_type: data.eventType, guest_count: guests });
      return "capacity";
    }

    // Private: date > 3 months out
    if (data.eventType === "private" && data.eventDate) {
      const eventDate = new Date(data.eventDate);
      const threeMonths = new Date();
      threeMonths.setMonth(threeMonths.getMonth() + 3);
      if (eventDate > threeMonths) {
        pushEvent("check_date_outside_window", { event_type: data.eventType });
        return "window";
      }
    }

    return true; // qualified
  }

  /* ── Form submission ── */
  async function handleSubmit() {
    setSubmitting(true);

    const qualResult = runChecks();
    setQualified(qualResult);

    // Build payload
    const payload = {
      event_type: data.eventType,
      event_date: data.eventDate,
      guest_count: data.guestCount,
      first_name: data.firstName,
      email: data.email,
      phone: data.phone || "",
      company: data.company || "",
      corporate_type: data.corporateType || "",
      occasion: data.occasion || "",
      format: data.eventType === "corporate" ? data.format : "",
      qualified: qualResult === true ? "yes" : "no",
      ...tracking,
    };

    console.log("[CheckDateForm] Submission payload:", payload);

    // GTM tracking
    pushEvent("check_date_form_submit", {
      event_type: data.eventType,
      guest_count: data.guestCount,
      qualified: qualResult === true ? "yes" : "no",
    });

    if (qualResult === true) {
      pushEvent("check_date_qualified", { event_type: data.eventType });
    }

    /* ── PLACEHOLDER: Klaviyo or Brevo submission ── */
    /* HubSpot is NOT used for form capture on this page.
       HubSpot = CRM + meetings/deals only.
       Top-of-funnel form data goes to Klaviyo/Brevo (platform TBD).
       When decided, replace this block with the chosen platform's API call.
       The payload object above has all the fields ready to map. */
    console.log("[CheckDateForm] Ready for Klaviyo/Brevo integration. Payload:", payload);

    setSubmitting(false);
    goTo("confirmation");
  }

  return (
    <div className="cd" id="check-date-form">
      {screen === "event-type" && (
        <StepEventType
          data={data}
          setData={setData}
          onNext={() => goTo("date-branch")}
        />
      )}

      {screen === "date-branch" && (
        <StepDateBranch
          data={data}
          setData={setData}
          onSpecific={() => goTo("form")}
          onFlexible={() => goTo("flexible")}
          onBack={() => goTo("event-type")}
        />
      )}

      {screen === "flexible" && (
        <StepFlexible
          data={data}
          onBack={() => goTo("date-branch")}
        />
      )}

      {screen === "form" && (
        <StepForm
          data={data}
          setData={setData}
          onSubmit={handleSubmit}
          onBack={() => goTo("date-branch")}
          submitting={submitting}
        />
      )}

      {screen === "confirmation" && (
        <StepConfirmation data={data} qualified={qualified} />
      )}
    </div>
  );
}

/* ─── Note on form submission ─── */
/* Form data goes to Klaviyo or Brevo (top-of-funnel nurture platform, TBD).
   HubSpot is used ONLY for:
   - Meetings embed (booking a discovery call with Hugo)
   - CRM deal tracking (post-tour pipeline)
   See prd-check-your-date.md and the Klaviyo vs Brevo decision in TASKS.md. */
