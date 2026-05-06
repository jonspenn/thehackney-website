import { useEffect, useRef, useState } from "react";
import VirtualTourFeedbackForm from "./VirtualTourFeedbackForm.jsx";

/**
 * VirtualTourPage - Phase 1 of prd-sys-virtual-tour.md
 *
 * Renders Hugo's 5:38 walkthrough behind a tokenised gate. Same surface, two
 * voices: cold-reengage (re-engage stalled wedding leads) vs tour-recap
 * (closing aid for warm leads who already toured). Variant chosen by the
 * token's send_type field, returned by /api/virtual-tour/validate-token.
 *
 * Three render states:
 *   - 'loading'  - waiting on validate-token (initial, ~200ms)
 *   - 'expired'  - no token, bad token, or expired token
 *   - 'valid'    - render variant header + Cloudflare Stream embed +
 *                  CTA stack + feedback form (after 90% watched)
 *
 * Stream UID is read from env.STREAM_VIDEO_UID via the validate-token API.
 * If the value is 'placeholder', the player area shows a "Video uploading"
 * fallback so the page is testable end-to-end before Stream is configured.
 *
 * Tracking: 9 events fire to window.__thk.track. See PRD section
 * "Tracking and Analytics" for the full list. Player events come from the
 * Cloudflare Stream Player SDK (loaded via the parent Astro page).
 */

const VARIANTS = {
  cold_reengage: {
    eyebrow: "From Hugo",
    heading: "A personal note from Hugo",
    sub: "We recorded this for couples who got busy. Take a look around at your own pace - and reach out whenever you are ready.",
    primary: { label: "Book a call with Hugo", href: "/lets-talk/?type=wedding&utm_source=virtual_tour&utm_medium=email&utm_content=cold_reengage", id: "call" },
    secondary: { label: "Book a tour", href: "/check-your-date/?type=wedding&utm_source=virtual_tour&utm_medium=email&utm_content=cold_reengage", id: "tour" },
    feedbackPrompt: "What would have helped you decide?",
  },
  tour_recap: {
    eyebrow: "Your Tour, Recorded",
    heading: "A recap of your visit",
    sub: "Share this with anyone who could not make it in. The link is private and just for you.",
    primary: { label: "See pricing and dates", href: "/check-your-date/?type=wedding&utm_source=virtual_tour&utm_medium=email&utm_content=tour_recap", id: "pricing" },
    secondary: { label: "Reply to Hugo", href: "mailto:hugo@thehackney.co?subject=After%20our%20tour", id: "reply" },
    feedbackPrompt: "Anything you wish I had shown you on the tour?",
  },
  manual: {
    eyebrow: "From Hugo",
    heading: "A personal note from Hugo",
    sub: "Take a look around at your own pace - and reach out whenever you are ready.",
    primary: { label: "Book a call with Hugo", href: "/lets-talk/?type=wedding&utm_source=virtual_tour&utm_medium=email&utm_content=manual", id: "call" },
    secondary: { label: "Book a tour", href: "/check-your-date/?type=wedding&utm_source=virtual_tour&utm_medium=email&utm_content=manual", id: "tour" },
    feedbackPrompt: "What would have helped you decide?",
  },
};

function track(eventType, data) {
  if (typeof window === "undefined") return;
  if (window.__thk && typeof window.__thk.track === "function") {
    window.__thk.track(eventType, data || {});
  }
}

export default function VirtualTourPage() {
  const [state, setState] = useState("loading");
  const [variant, setVariant] = useState(null);
  const [tokenInfo, setTokenInfo] = useState(null); // { token, contact_id, send_type, stream_video_uid }
  const [completionPct, setCompletionPct] = useState(0);
  const iframeRef = useRef(null);
  const playerRef = useRef(null);
  const milestonesFiredRef = useRef(new Set());
  const playFiredRef = useRef(false);

  // Validate token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("t");

    if (!token) {
      setState("expired");
      return;
    }

    fetch(`/api/virtual-tour/validate-token?t=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.valid) {
          setState("expired");
          return;
        }
        setTokenInfo({
          token: data.token,
          contact_id: data.contact_id,
          send_type: data.send_type,
          stream_video_uid: data.stream_video_uid || "placeholder",
          stream_customer_subdomain: data.stream_customer_subdomain || "placeholder",
        });
        setVariant(VARIANTS[data.send_type] || VARIANTS.cold_reengage);
        setCompletionPct(data.completion_pct_max || 0);
        setState("valid");

        if (data.first_open) {
          track("virtual_tour_link_opened", {
            token: data.token,
            contact_id: data.contact_id,
            send_type: data.send_type,
          });
        }
      })
      .catch(() => setState("expired"));
  }, []);

  // Wire Cloudflare Stream Player SDK once iframe is mounted with a real UID
  useEffect(() => {
    if (state !== "valid") return;
    if (!tokenInfo) return;
    if (tokenInfo.stream_video_uid === "placeholder") return;
    if (tokenInfo.stream_customer_subdomain === "placeholder") return;
    if (!iframeRef.current) return;

    let cancelled = false;

    function attach() {
      if (cancelled) return;
      if (!window.Stream || !iframeRef.current) {
        // SDK not ready yet, retry after a short delay
        setTimeout(attach, 200);
        return;
      }
      const player = window.Stream(iframeRef.current);
      playerRef.current = player;

      const baseProps = {
        token: tokenInfo.token,
        contact_id: tokenInfo.contact_id,
        send_type: tokenInfo.send_type,
      };

      player.addEventListener("play", () => {
        if (playFiredRef.current) return;
        playFiredRef.current = true;
        track("virtual_tour_played", baseProps);
      });

      player.addEventListener("timeupdate", () => {
        const duration = player.duration;
        const current = player.currentTime;
        if (!duration || duration <= 0) return;
        const pct = Math.floor((current / duration) * 100);
        setCompletionPct((prev) => (pct > prev ? pct : prev));

        const thresholds = [25, 50, 75, 100];
        for (const t of thresholds) {
          if (pct >= t && !milestonesFiredRef.current.has(t)) {
            milestonesFiredRef.current.add(t);
            track(`virtual_tour_milestone_${t}`, {
              ...baseProps,
              completion_pct: t,
            });
          }
        }
      });

      player.addEventListener("ended", () => {
        if (!milestonesFiredRef.current.has(100)) {
          milestonesFiredRef.current.add(100);
          track("virtual_tour_milestone_100", {
            ...baseProps,
            completion_pct: 100,
          });
        }
      });
    }

    attach();
    return () => {
      cancelled = true;
    };
  }, [state, tokenInfo]);

  function handleCtaClick(cta) {
    if (!tokenInfo) return;
    track("virtual_tour_cta_click", {
      token: tokenInfo.token,
      contact_id: tokenInfo.contact_id,
      send_type: tokenInfo.send_type,
      cta_destination: cta.id,
    });
    // Let the anchor navigate naturally - sendBeacon takes care of the event
  }

  function handleFeedbackSubmitted(text) {
    if (!tokenInfo) return;
    fetch("/api/virtual-tour/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: tokenInfo.token, feedback_text: text }),
      keepalive: true,
    }).catch(() => {});
    track("virtual_tour_feedback_submit", {
      token: tokenInfo.token,
      contact_id: tokenInfo.contact_id,
      send_type: tokenInfo.send_type,
      length_chars: text.length,
    });
  }

  // ── Render branches ──

  if (state === "loading") {
    return (
      <section className="vt-section">
        <div className="vt-container">
          <div className="vt-skeleton" aria-hidden="true" />
        </div>
      </section>
    );
  }

  if (state === "expired") {
    return (
      <section className="vt-section">
        <div className="vt-container">
          <div className="vt-expired">
            <p className="eyebrow vt-eyebrow">The Hackney</p>
            <h1 className="vt-heading">This link has expired</h1>
            <p className="vt-sub">
              These links are private and time-limited. We would still love to hear from you - book
              a tour, book a call, or just reply to whatever email got you here.
            </p>
            <a className="btn vt-cta vt-cta--primary" href="/lets-talk/?type=wedding&utm_source=virtual_tour&utm_medium=expired_link">
              Get back in touch
            </a>
          </div>
        </div>
      </section>
    );
  }

  // Valid state
  const isPlaceholder =
    tokenInfo.stream_video_uid === "placeholder" ||
    tokenInfo.stream_customer_subdomain === "placeholder";
  const showFeedback = completionPct >= 90;
  const streamSrc = isPlaceholder
    ? null
    : `https://${tokenInfo.stream_customer_subdomain}.cloudflarestream.com/${tokenInfo.stream_video_uid}/iframe?primaryColor=%2349590e&letterboxColor=%23F5F0E8`;

  return (
    <section className="vt-section">
      <div className="vt-container">
        <header className="vt-header">
          <p className="eyebrow vt-eyebrow">{variant.eyebrow}</p>
          <h1 className="vt-heading">{variant.heading}</h1>
          <p className="vt-sub">{variant.sub}</p>
        </header>

        <div className="vt-player-wrap">
          {isPlaceholder ? (
            <div className="vt-player-fallback" role="status">
              <div className="vt-player-fallback-inner">
                <p className="vt-fallback-eyebrow">Video uploading</p>
                <p className="vt-fallback-body">Hugo will be back here shortly.</p>
              </div>
            </div>
          ) : (
            <div className="vt-player-frame">
              <iframe
                ref={iframeRef}
                src={streamSrc}
                title="The Hackney - virtual tour"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                loading="lazy"
              />
            </div>
          )}
        </div>

        <div className="vt-cta-stack">
          <a
            className="btn vt-cta vt-cta--primary"
            href={variant.primary.href}
            onClick={() => handleCtaClick(variant.primary)}
            data-track-id={`virtual_tour_cta_${variant.primary.id}`}
          >
            {variant.primary.label}
          </a>
          <a
            className="btn vt-cta vt-cta--secondary"
            href={variant.secondary.href}
            onClick={() => handleCtaClick(variant.secondary)}
            data-track-id={`virtual_tour_cta_${variant.secondary.id}`}
          >
            {variant.secondary.label}
          </a>
        </div>

        {showFeedback && (
          <VirtualTourFeedbackForm
            prompt={variant.feedbackPrompt}
            onSubmit={handleFeedbackSubmitted}
          />
        )}
      </div>
    </section>
  );
}
