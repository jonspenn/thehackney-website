/**
 * LeadProfile - Full-page lead profile with hero, details, score breakdown, and journey.
 * Extracted from AdminDashboard.jsx for reuse and maintainability.
 */

import { useState, useEffect } from "react";

import {
  FORM_TYPE_LABELS, LEAD_TYPE_LABELS,
  URGENCY_LABELS, URGENCY_STAGE, BUDGET_LABELS,
  TIER_CONFIG,
  FUNNEL_LABELS, HEALTH_COLORS,
  JOURNEY_EVENT_LABELS,
  LOST_REASONS, DAY_TYPE_LABELS,
} from "./constants.js";

import {
  formatDuration, formatTime, formatRelativeTime, formatAbsoluteTime,
  shortenUrl, parseEventData,
  parseTimestamp, daysBetween,
  computeLeadScore, computeFunnelStage,
} from "./utils.js";

/* ── Sub-sections ── */

function FunnelTrack({ funnel, tc }) {
  return (
    <div className="lp-funnel" style={{ marginTop: "16px" }}>
      {funnel.stages.map((stageKey, i) => {
        const isCompleted = !!funnel.completed[stageKey];
        const isCurrent = funnel.currentStage === stageKey;
        const isFuture = !isCompleted && !isCurrent;
        const isLost = funnel.currentStage === "lost";
        const isCancelled = funnel.currentStage === "cancelled";
        const isNoshow = funnel.currentStage === "noshow";
        const hc = funnel.health ? HEALTH_COLORS[funnel.health] : null;
        const completedDate = funnel.completed[stageKey];

        let dotClass = "lp-funnel__dot";
        let dotStyle = {};
        let lineStyle = {};
        if (isCompleted && !isCurrent) {
          dotClass += " lp-funnel__dot--done";
          dotStyle = { background: tc.color, borderColor: tc.color };
          lineStyle = { background: tc.color };
        } else if (isCurrent) {
          dotClass += " lp-funnel__dot--current";
          if (isLost) {
            dotStyle = { background: "#8C472E", borderColor: "#8C472E" };
          } else if (isCancelled || isNoshow) {
            dotStyle = { background: "#BF7256", borderColor: "#BF7256" };
          } else if (hc) {
            dotStyle = { background: hc.color, borderColor: hc.color };
          } else {
            dotStyle = { background: tc.color, borderColor: tc.color };
          }
        }

        return (
          <div key={stageKey} className={`lp-funnel__step${isCurrent ? " lp-funnel__step--current" : ""}${isFuture ? " lp-funnel__step--future" : ""}`}>
            {i > 0 && <div className="lp-funnel__line" style={isCompleted || isCurrent ? lineStyle : {}} />}
            <div className={dotClass} style={dotStyle}>
              {isCompleted && !isCurrent && <span className="lp-funnel__check">{"\u2713"}</span>}
              {isCurrent && !isLost && !isCancelled && !isNoshow && funnel.health && (
                <span className="lp-funnel__pulse" />
              )}
            </div>
            <span className="lp-funnel__label">{FUNNEL_LABELS[stageKey]}</span>
            {isCompleted && !isCurrent && completedDate && (
              <span className="lp-funnel__date">{completedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            )}
            {isCurrent && (
              <>
                {funnel.health && (
                  <span className="lp-funnel__health" style={{ color: hc.color, background: hc.bg }}>
                    {funnel.daysInStage === 0 ? "Today" : `${funnel.daysInStage}d`}
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
      {/* Lost / cancelled / no-show indicator */}
      {(funnel.currentStage === "lost" || funnel.currentStage === "cancelled" || funnel.currentStage === "noshow") && (
        <div className="lp-funnel__step lp-funnel__step--current">
          <div className="lp-funnel__line" />
          <div className={`lp-funnel__dot lp-funnel__dot--current`} style={{ background: funnel.currentStage === "lost" ? "#8C472E" : "#BF7256", borderColor: funnel.currentStage === "lost" ? "#8C472E" : "#BF7256" }}>
            <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700 }}>{funnel.currentStage === "lost" ? "\u2717" : "\u2014"}</span>
          </div>
          <span className="lp-funnel__label">{FUNNEL_LABELS[funnel.currentStage]}</span>
          {funnel.lostReason && (
            <span className="lp-funnel__date">{funnel.lostReason.replace(/_/g, " ")}</span>
          )}
        </div>
      )}
    </div>
  );
}

function JourneySummary({ journey, showFullJourney, setShowFullJourney }) {
  if (!journey || journey.sessions.length === 0) return null;

  const allEvents = journey.sessions.flatMap(s => s.events.map(e => ({ ...e, session_source: s.source, session_campaign: s.campaign, ad_platform: s.ad_platform })));
  const firstSession = journey.sessions[0];
  const lastSession = journey.sessions[journey.sessions.length - 1];
  const firstDate = firstSession.started_at;
  const lastDate = lastSession.started_at;
  const totalPages = allEvents.filter(e => e.event_type === "page_view").length;

  // Key milestones
  const milestones = [];
  milestones.push({ time: firstDate, icon: "\uD83D\uDC41", label: "First visit", detail: firstSession.source + (firstSession.ad_platform ? " (" + firstSession.ad_platform + ")" : "") });

  // Unique pages visited (top 5)
  const pageCounts = {};
  allEvents.filter(e => e.event_type === "page_view").forEach(e => {
    const p = (() => { try { return new URL(e.page_url, "https://x").pathname; } catch { return e.page_url; } })();
    pageCounts[p] = (pageCounts[p] || 0) + 1;
  });
  const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Date checks
  const dateChecks = allEvents.filter(e => e.event_type === "date_check");
  const checkedDates = [...new Set(dateChecks.map(e => { const d = parseEventData(e.event_data); return d?.date || ""; }).filter(Boolean))];
  if (dateChecks.length > 0) {
    milestones.push({ time: dateChecks[0].created_at, icon: "\uD83D\uDCC5", label: "Checked " + checkedDates.length + " date" + (checkedDates.length !== 1 ? "s" : ""), detail: checkedDates.slice(0, 3).join(", ") + (checkedDates.length > 3 ? " + " + (checkedDates.length - 3) + " more" : "") });
  }

  // Questionnaire events
  const quizComplete = allEvents.filter(e => e.event_type === "questionnaire_complete");
  const quizStart = allEvents.filter(e => e.event_type === "questionnaire_start");
  if (quizComplete.length > 0) {
    milestones.push({ time: quizComplete[0].created_at, icon: "\u2705", label: "Completed questionnaire", detail: "" });
  } else if (quizStart.length > 0) {
    milestones.push({ time: quizStart[0].created_at, icon: "\uD83D\uDCDD", label: "Started questionnaire", detail: "Not completed" });
  }

  // Form submissions
  const formSubmits = allEvents.filter(e => e.event_type === "form_submit");
  formSubmits.forEach(e => {
    const d = parseEventData(e.event_data);
    const fl = d?.form_type ? (FORM_TYPE_LABELS[d.form_type] || d.form_type) : "Form";
    milestones.push({ time: e.created_at, icon: "\uD83D\uDCE8", label: "Submitted " + fl, detail: "" });
  });

  // CTA clicks (book tour / book call)
  const ctaClicks = allEvents.filter(e => e.event_type === "cta_click");
  const bookingCtas = ctaClicks.filter(e => {
    const d = parseEventData(e.event_data);
    const text = (d?.cta_text || d?.track_id || d?.cta_id || "").toLowerCase();
    return text.includes("tour") || text.includes("call") || text.includes("book");
  });
  bookingCtas.forEach(e => {
    const d = parseEventData(e.event_data);
    const ctaName = d?.cta_text || d?.track_id || d?.cta_id || "CTA";
    milestones.push({ time: e.created_at, icon: "\uD83D\uDCDE", label: "Clicked " + ctaName, detail: "" });
  });

  // Brochure downloads
  const brochureDownloads = allEvents.filter(e => e.event_type === "brochure_download");
  if (brochureDownloads.length > 0) {
    milestones.push({ time: brochureDownloads[0].created_at, icon: "\uD83D\uDCC4", label: "Downloaded brochure", detail: brochureDownloads.length > 1 ? brochureDownloads.length + " times" : "" });
  }

  // Last activity
  const firstD = firstDate.substring(0, 10);
  const lastD = lastDate.substring(0, 10);
  if (firstD !== lastD) {
    milestones.push({ time: lastDate, icon: "\uD83D\uDD53", label: "Last seen", detail: journey.total_sessions + " sessions over " + daysBetween(parseTimestamp(firstDate), parseTimestamp(lastDate)) + " days" });
  }

  milestones.sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  // Source breakdown
  const sourceCounts = {};
  journey.sessions.forEach(s => {
    let label = s.source || "Direct";
    if (label.startsWith("http")) {
      try { label = new URL(label).hostname.replace("www.", ""); } catch { /* keep raw */ }
    }
    sourceCounts[label] = (sourceCounts[label] || 0) + 1;
  });

  // Ad attribution
  const adPlatforms = {};
  const campaigns = {};
  const keywords = {};
  const clickIdTypes = new Set();
  journey.sessions.forEach(s => {
    if (s.ad_platform) adPlatforms[s.ad_platform] = (adPlatforms[s.ad_platform] || 0) + 1;
    if (s.campaign) campaigns[s.campaign] = (campaigns[s.campaign] || 0) + 1;
    if (s.keyword) keywords[s.keyword] = (keywords[s.keyword] || 0) + 1;
    if (s.click_ids) Object.keys(s.click_ids).forEach(k => clickIdTypes.add(k));
  });
  const hasAttribution = Object.keys(adPlatforms).length > 0 || Object.keys(campaigns).length > 0 || Object.keys(keywords).length > 0 || clickIdTypes.size > 0;

  const daysSpan = daysBetween(parseTimestamp(firstDate), parseTimestamp(lastDate));

  return (
    <>
      {/* Stats row */}
      <div className="jny-stats">
        <div className="jny-stat">
          <span className="jny-stat__val">{journey.total_sessions}</span>
          <span className="jny-stat__label">sessions</span>
        </div>
        <div className="jny-stat">
          <span className="jny-stat__val">{totalPages}</span>
          <span className="jny-stat__label">pages viewed</span>
        </div>
        <div className="jny-stat">
          <span className="jny-stat__val">{Object.keys(pageCounts).length}</span>
          <span className="jny-stat__label">unique pages</span>
        </div>
        <div className="jny-stat">
          <span className="jny-stat__val">{dateChecks.length}</span>
          <span className="jny-stat__label">date checks</span>
        </div>
        <div className="jny-stat">
          <span className="jny-stat__val">{daysSpan === 0 ? "Same day" : daysSpan + "d"}</span>
          <span className="jny-stat__label">time span</span>
        </div>
      </div>

      {/* Sources + Attribution tags */}
      <div className="jny-tags-row">
        <div className="jny-tags-group">
          <span className="jny-tags-group__label">Sources</span>
          {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([src, cnt]) => (
            <span key={src} className="lp-journey-tag">{src}{cnt > 1 ? " (" + cnt + ")" : ""}</span>
          ))}
        </div>
        {hasAttribution && (
          <div className="jny-tags-group">
            <span className="jny-tags-group__label">Ads</span>
            {Object.entries(adPlatforms).map(([p, cnt]) => (
              <span key={p} className="lp-journey-tag lp-journey-tag--platform">{p}{cnt > 1 ? " (" + cnt + ")" : ""}</span>
            ))}
            {Object.entries(campaigns).map(([c, cnt]) => (
              <span key={c} className="lp-journey-tag lp-journey-tag--campaign">{c}{cnt > 1 ? " (" + cnt + ")" : ""}</span>
            ))}
            {Object.entries(keywords).map(([k, cnt]) => (
              <span key={k} className="lp-journey-tag lp-journey-tag--keyword">{k}{cnt > 1 ? " (" + cnt + ")" : ""}</span>
            ))}
            {clickIdTypes.size > 0 && (
              <span className="lp-journey-tag lp-journey-tag--clickid">{[...clickIdTypes].join(", ")}</span>
            )}
          </div>
        )}
      </div>

      {/* Key milestones */}
      <div className="jny-milestones">
        <div className="jny-milestones__title">Key moments</div>
        {milestones.map((m, mi) => (
          <div key={mi} className="jny-milestone">
            <span className="jny-milestone__icon">{m.icon}</span>
            <span className="jny-milestone__time">{formatAbsoluteTime(m.time)}</span>
            <span className="jny-milestone__label">{m.label}</span>
            {m.detail && <span className="jny-milestone__detail">{m.detail}</span>}
          </div>
        ))}
      </div>

      {/* Top pages */}
      <div className="jny-toppages">
        <div className="jny-toppages__title">Most viewed pages</div>
        {topPages.map(([page, count]) => (
          <div key={page} className="jny-toppage">
            <span className="jny-toppage__path">{page}</span>
            <span className="jny-toppage__count">{count} view{count !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>

      {/* Expandable full session log */}
      <button type="button" className="jny-expand-btn" onClick={() => setShowFullJourney(prev => !prev)}>
        {showFullJourney ? "Hide full session log" : "Show full session log (" + journey.total_sessions + " sessions)"}
      </button>

      {showFullJourney && journey.sessions.map((sess, si) => {
        const pageViews = sess.events.filter(e => e.event_type === "page_view");
        const actions = sess.events.filter(e => e.event_type !== "page_view" && e.event_type !== "scroll_depth");
        return (
          <div key={sess.session_id} className="lp-journey-session lp-journey-session--open">
            <div className="lp-journey-session__header lp-journey-session__header--static">
              <span className="lp-journey-session__num">Session {si + 1}</span>
              <span className="lp-journey-session__date">{formatAbsoluteTime(sess.started_at)}</span>
              {sess.duration != null && <span className="lp-journey-session__dur">{formatDuration(sess.duration)}</span>}
            </div>
            <div className="lp-journey-session__source">
              {sess.ad_platform && <span className="lp-journey-tag lp-journey-tag--platform">{sess.ad_platform}</span>}
              <span className="lp-journey-tag">{sess.source}</span>
              {sess.campaign && <span className="lp-journey-tag">{sess.campaign}</span>}
              {sess.keyword && <span className="lp-journey-tag lp-journey-tag--keyword">{sess.keyword}</span>}
              {sess.device_type && <span className="lp-journey-tag">{sess.device_type}</span>}
            </div>
            {Object.keys(sess.click_ids).length > 0 && (
              <div className="lp-journey-session__clickids">
                {Object.entries(sess.click_ids).map(([k, v]) => (
                  <span key={k} className="lp-journey-clickid" title={v}>{k}</span>
                ))}
              </div>
            )}
            <div className="lp-journey-pages">
              {pageViews.map((ev, ei) => {
                const nextEv = pageViews[ei + 1];
                let timeOnPage = null;
                if (nextEv) {
                  const t1 = new Date(ev.created_at.replace(" ", "T") + (ev.created_at.includes("Z") ? "" : "Z")).getTime();
                  const t2 = new Date(nextEv.created_at.replace(" ", "T") + (nextEv.created_at.includes("Z") ? "" : "Z")).getTime();
                  const diff = Math.round((t2 - t1) / 1000);
                  if (Number.isFinite(diff) && diff >= 0) timeOnPage = diff;
                }
                const path = (() => { try { return new URL(ev.page_url, "https://x").pathname; } catch { return ev.page_url; } })();
                return (
                  <div key={ev.event_id} className="lp-journey-page">
                    <span className="lp-journey-page__time">{formatTime(ev.created_at)}</span>
                    <span className="lp-journey-page__path">{path}</span>
                    {timeOnPage != null && <span className="lp-journey-page__dur">{formatDuration(timeOnPage)}</span>}
                  </div>
                );
              })}
            </div>
            {actions.length > 0 && (
              <div className="lp-journey-actions">
                {actions.map(ev => {
                  let label = JOURNEY_EVENT_LABELS[ev.event_type] || ev.event_type;
                  const data = parseEventData(ev.event_data);
                  let detail = "";
                  if (ev.event_type === "cta_click") {
                    const ctaName = data?.cta_text || data?.track_id || data?.cta_id || "";
                    const page = ev.page_url ? shortenUrl(ev.page_url) : "";
                    label = ctaName ? `Clicked "${ctaName}"` : "Clicked CTA";
                    if (page) detail = `on ${page}`;
                  }
                  if (ev.event_type === "date_check" && data?.date) detail = data.date;
                  if (ev.event_type === "questionnaire_complete") detail = "All steps finished";
                  if (ev.event_type === "form_submit" && data?.form_type) detail = FORM_TYPE_LABELS[data.form_type] || data.form_type;
                  return (
                    <div key={ev.event_id} className="lp-journey-action">
                      <span className="lp-journey-action__dot" />
                      <span className="lp-journey-action__time">{formatTime(ev.created_at)}</span>
                      <span className="lp-journey-action__label">{label}</span>
                      {detail && <span className="lp-journey-action__detail">{detail}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ── Status action dialogs ── */

function LostDialog({ onConfirm, onCancel }) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="lp-dialog-backdrop" onClick={onCancel}>
      <div className="lp-dialog" onClick={e => e.stopPropagation()}>
        <h4 className="lp-dialog__title">Mark as Lost</h4>
        <label className="lp-dialog__label">Reason (required)</label>
        <select className="lp-dialog__select" value={reason} onChange={e => setReason(e.target.value)}>
          <option value="">Select a reason...</option>
          {LOST_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <label className="lp-dialog__label">Note (optional)</label>
        <input className="lp-dialog__input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Chose Asylum Chapel" />
        <div className="lp-dialog__actions">
          <button className="lp-dialog__btn lp-dialog__btn--cancel" onClick={onCancel} type="button">Cancel</button>
          <button className="lp-dialog__btn lp-dialog__btn--confirm lp-dialog__btn--lost" onClick={() => onConfirm(reason, note)} disabled={!reason} type="button">Confirm Lost</button>
        </div>
      </div>
    </div>
  );
}

function WonDialog({ lead, onConfirm, onCancel }) {
  const [loading, setLoading] = useState(false);
  const [rateCard, setRateCard] = useState(null);
  const [dayType, setDayType] = useState("sat");
  const [hireFee, setHireFee] = useState("");
  const [minSpend, setMinSpend] = useState("");
  const [error, setError] = useState(null);

  // Fetch rate card on mount
  useEffect(() => {
    if (!lead.event_date) return;
    setLoading(true);
    fetch(`/api/rate-card-lookup?date=${encodeURIComponent(lead.event_date)}&dayType=sat`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          setRateCard(data);
          setHireFee(String(data.selected.hire));
          setMinSpend(String(data.selected.min));
          setDayType(data.selected.dayType);
        } else {
          setError(data.message || data.error);
        }
        setLoading(false);
      })
      .catch(() => { setError("Failed to load rate card"); setLoading(false); });
  }, [lead.event_date]);

  function handleDayTypeChange(dt) {
    setDayType(dt);
    if (rateCard) {
      const opt = rateCard.options.find(o => o.dayType === dt);
      if (opt) {
        setHireFee(String(opt.hire));
        setMinSpend(String(opt.min));
      }
    }
  }

  const hf = parseInt(hireFee) || 0;
  const ms = parseInt(minSpend) || 0;
  const tier = rateCard ? `${rateCard.year}/${String(rateCard.month).padStart(2, "0")}/${dayType}` : null;

  return (
    <div className="lp-dialog-backdrop" onClick={onCancel}>
      <div className="lp-dialog lp-dialog--won" onClick={e => e.stopPropagation()}>
        <h4 className="lp-dialog__title">Mark as Won</h4>
        {loading && <p className="lp-dialog__muted">Loading rate card...</p>}
        {error && <p className="lp-dialog__muted">{error}</p>}
        {rateCard && (
          <>
            <p className="lp-dialog__info">
              Rate card: {rateCard.season?.label} {rateCard.year}
              {rateCard.extrapolated && <span className="lp-dialog__warn"> (extrapolated - pending James review)</span>}
            </p>
            <label className="lp-dialog__label">Day type</label>
            <div className="lp-dialog__daytype-row">
              {rateCard.options.map(opt => (
                <button
                  key={opt.dayType}
                  type="button"
                  className={`lp-dialog__daytype-btn${dayType === opt.dayType ? " lp-dialog__daytype-btn--active" : ""}`}
                  onClick={() => handleDayTypeChange(opt.dayType)}
                >{opt.dayTypeLabel}</button>
              ))}
            </div>
          </>
        )}
        {!lead.event_date && <p className="lp-dialog__muted">No event date - enter values manually.</p>}
        <div className="lp-dialog__fields">
          <div>
            <label className="lp-dialog__label">Hire fee</label>
            <div className="lp-dialog__currency">
              <span className="lp-dialog__currency-symbol">&pound;</span>
              <input className="lp-dialog__input lp-dialog__input--number" type="number" value={hireFee} onChange={e => setHireFee(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="lp-dialog__label">Min spend</label>
            <div className="lp-dialog__currency">
              <span className="lp-dialog__currency-symbol">&pound;</span>
              <input className="lp-dialog__input lp-dialog__input--number" type="number" value={minSpend} onChange={e => setMinSpend(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div>
            <label className="lp-dialog__label">Deal value</label>
            <p className="lp-dialog__total">&pound;{(hf + ms).toLocaleString()}</p>
          </div>
        </div>
        <div className="lp-dialog__actions">
          <button className="lp-dialog__btn lp-dialog__btn--cancel" onClick={onCancel} type="button">Cancel</button>
          <button className="lp-dialog__btn lp-dialog__btn--confirm lp-dialog__btn--won" onClick={() => onConfirm(hf, ms, tier)} disabled={hf === 0 && ms === 0} type="button">Confirm Won</button>
        </div>
      </div>
    </div>
  );
}

function ActionButtons({ lead, funnel, activeLeadType, onStatusChange }) {
  const [showLost, setShowLost] = useState(false);
  const [showWon, setShowWon] = useState(false);
  const [saving, setSaving] = useState(false);

  // Don't show actions for low-intent streams (supper club, cafe-bar) or already terminal
  const isLowIntent = activeLeadType === "supperclub" || activeLeadType === "cafe-bar";
  if (isLowIntent) return null;
  if (funnel.currentStage === "won") return null;

  async function fireAction(action, extra = {}) {
    setSaving(true);
    try {
      const res = await fetch("/api/lead-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contact_id: lead.contact_id, action, ...extra }),
      });
      const data = await res.json();
      if (data.ok && onStatusChange) onStatusChange(data);
    } catch (err) {
      console.error("[action]", err);
    }
    setSaving(false);
  }

  // Determine which buttons to show based on current funnel stage
  const stage = funnel.currentStage;
  const showMeeting = ["lead", "qualified", "engaged", "cancelled", "noshow"].includes(stage);
  const showCancelled = ["engaged"].includes(stage);
  const showNoshow = ["engaged"].includes(stage);
  const showProposal = ["meeting"].includes(stage);
  const showWonBtn = ["meeting", "proposal"].includes(stage);
  const showLostBtn = stage !== "lost";

  return (
    <>
      <div className="lp-actions">
        <span className="lp-actions__label">Actions</span>
        {showMeeting && <button className="lp-actions__btn lp-actions__btn--meeting" onClick={() => fireAction("meeting")} disabled={saving} type="button">Had Meeting</button>}
        {showCancelled && <button className="lp-actions__btn lp-actions__btn--cancel" onClick={() => fireAction("cancelled")} disabled={saving} type="button">Cancelled</button>}
        {showNoshow && <button className="lp-actions__btn lp-actions__btn--cancel" onClick={() => fireAction("noshow")} disabled={saving} type="button">No-show</button>}
        {showProposal && <button className="lp-actions__btn lp-actions__btn--proposal" onClick={() => fireAction("proposal")} disabled={saving} type="button">Sent Proposal</button>}
        {showWonBtn && <button className="lp-actions__btn lp-actions__btn--won" onClick={() => setShowWon(true)} disabled={saving} type="button">Won</button>}
        {showLostBtn && <button className="lp-actions__btn lp-actions__btn--lost" onClick={() => setShowLost(true)} disabled={saving} type="button">Mark as Lost</button>}
      </div>
      {showLost && (
        <LostDialog
          onConfirm={(reason, note) => { setShowLost(false); fireAction("lost", { lost_reason: reason, lost_reason_note: note || undefined }); }}
          onCancel={() => setShowLost(false)}
        />
      )}
      {showWon && (
        <WonDialog
          lead={lead}
          onConfirm={(hf, ms, tier) => { setShowWon(false); fireAction("won", { hire_fee: hf, min_spend: ms, rate_card_tier: tier || undefined }); }}
          onCancel={() => setShowWon(false)}
        />
      )}
    </>
  );
}

/* ── Deal value display ── */

function DealValueBadge({ lead }) {
  if (!lead.deal_value) return null;
  return (
    <div className="lp-deal-value">
      <span className="lp-deal-value__label">Deal value</span>
      <span className="lp-deal-value__amount">&pound;{lead.deal_value.toLocaleString()}</span>
      {lead.hire_fee != null && lead.min_spend != null && (
        <span className="lp-deal-value__breakdown">Hire &pound;{lead.hire_fee.toLocaleString()} + Min spend &pound;{lead.min_spend.toLocaleString()}</span>
      )}
      {lead.rate_card_tier && (
        <span className="lp-deal-value__tier">Rate card: {lead.rate_card_tier}</span>
      )}
    </div>
  );
}

/* ── Main component ── */

export default function LeadProfile({ lead, activeLeadType, journey, journeyLoading, showFullJourney, setShowFullJourney, onBack, onStatusChange }) {
  const sc = computeLeadScore(lead, activeLeadType);
  const tc = TIER_CONFIG[sc.tier];
  const funnel = computeFunnelStage(lead, activeLeadType);
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";

  return (
    <div className="lp-fullpage">
      {/* Back button */}
      <button className="lp-back" onClick={onBack} type="button">{"\u2190"} Back to leads</button>

      {/* Profile card */}
      <div className="lp-card">
        {/* Hero header */}
        <div className="lp-hero">
          <div className="lp-hero__score">
            <span className="lead-score-badge" style={{ background: sc.tier === "cold" ? "rgba(44,24,16,0.08)" : tc.color, color: sc.tier === "cold" ? "rgba(44,24,16,0.35)" : "#fff", width: 64, height: 64, fontSize: 24 }}>
              {sc.score}
            </span>
            <span className="lp-hero__tier" style={{ color: tc.color }}>{sc.tier === "cold" && sc.isDead ? "Dead" : tc.label}</span>
          </div>
          <div className="lp-hero__info">
            <h2 className="lp-hero__name">{name}</h2>
            <div className="lp-hero__contact">
              <a href={`mailto:${lead.email}`} className="lp-hero__link">{lead.email}</a>
              {lead.phone && <> &middot; <a href={`tel:${lead.phone}`} className="lp-hero__link">{lead.phone}</a></>}
              {lead.company && <> &middot; {lead.company}</>}
            </div>

            <FunnelTrack funnel={funnel} tc={tc} />

            {/* Engagement depth bar */}
            <div className="lp-funnel-engagement" style={{ marginTop: "8px" }}>
              <span className="lp-funnel-engagement__label">Engagement</span>
              <span className="lp-funnel-engagement__detail">
                {funnel.engagementSignals.sessions} session{funnel.engagementSignals.sessions !== 1 ? "s" : ""}, {funnel.engagementSignals.pages} pages
              </span>
              <div className="lp-funnel-engagement__bar">
                <div className="lp-funnel-engagement__fill" style={{ width: `${Math.min((funnel.engagementSignals.sessions * 8 + funnel.engagementSignals.pages * 2), 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons + deal value */}
        <ActionButtons lead={lead} funnel={funnel} activeLeadType={activeLeadType} onStatusChange={onStatusChange} />
        <DealValueBadge lead={lead} />

        {/* Two-column: left = details, right = score */}
        <div className="lp-cols">
          <div className="lp-col">
            {/* Contact details */}
            <div className="lp-section">
              <h3 className="lp-section__title">Contact</h3>
              <div className="lp-detail-grid">
                <div className="lp-detail">
                  <span className="lp-detail__label">Email</span>
                  <a href={`mailto:${lead.email}`} className="lp-detail__value lp-detail__link">{lead.email}</a>
                </div>
                <div className="lp-detail">
                  <span className="lp-detail__label">Phone</span>
                  {lead.phone ? <a href={`tel:${lead.phone}`} className="lp-detail__value lp-detail__link">{lead.phone}</a> : <span className="lp-detail__value lp-detail__muted">Not provided</span>}
                </div>
                {lead.company && (
                  <div className="lp-detail">
                    <span className="lp-detail__label">Company</span>
                    <span className="lp-detail__value">{lead.company}</span>
                  </div>
                )}
                <div className="lp-detail">
                  <span className="lp-detail__label">Location</span>
                  <span className="lp-detail__value">{[lead.ip_city, lead.ip_country].filter(Boolean).join(", ") || "Unknown"}</span>
                </div>
              </div>
            </div>

            {/* Event / form details */}
            <div className="lp-section">
              <h3 className="lp-section__title">Event details</h3>
              <div className="lp-detail-grid">
                {lead.event_date && <div className="lp-detail"><span className="lp-detail__label">Event date</span><span className="lp-detail__value">{lead.event_date}</span></div>}
                {lead.event_type_label && <div className="lp-detail"><span className="lp-detail__label">Event type</span><span className="lp-detail__value">{lead.event_type_label}</span></div>}
                {lead.guest_count && <div className="lp-detail"><span className="lp-detail__label">Guests</span><span className="lp-detail__value">{lead.guest_count}</span></div>}
                {lead.urgency_label && <div className="lp-detail"><span className="lp-detail__label">Urgency</span><span className="lp-detail__value">{lead.urgency_label}</span></div>}
                {lead.budget_label && <div className="lp-detail"><span className="lp-detail__label">Budget</span><span className="lp-detail__value">{lead.budget_label}</span></div>}
                {lead.wedding_year && !lead.event_date && <div className="lp-detail"><span className="lp-detail__label">Wedding year</span><span className="lp-detail__value">{lead.wedding_year}</span></div>}
                {!lead.event_date && !lead.event_type_label && !lead.guest_count && !lead.urgency_label && !lead.budget_label && (
                  <p className="lp-detail__muted" style={{ gridColumn: "1 / -1" }}>Brochure download only - no questionnaire data yet.</p>
                )}
              </div>
            </div>

            {/* Cross-sell */}
            {lead.cross_sell_labels?.length > 0 && (
              <div className="lp-section">
                <h3 className="lp-section__title">Also interested in</h3>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {lead.cross_sell_labels.map(label => (
                    <span key={label} className="rep-cross-sell__badge">{label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lp-col">
            {/* Score breakdown */}
            <div className="lp-section">
              <h3 className="lp-section__title">Score breakdown</h3>
              <div className="lp-score-grid">
                {[
                  { label: "Stage", val: sc.breakdown.stage, max: 30, desc: sc.stageLabel },
                  { label: "Intent", val: sc.breakdown.intent, max: 10, desc: URGENCY_LABELS[lead.urgency] || "No signal" },
                  { label: "Recency", val: sc.breakdown.recency, max: 25, desc: sc.daysSinceActivity <= 1 ? "Active today" : `${sc.daysSinceActivity}d ago` },
                  { label: "Engagement", val: sc.breakdown.engagement, max: 15, desc: `${lead.sessions_before_conversion || 0} sessions, ${lead.total_page_views || 0} pages` },
                  { label: "Date", val: sc.breakdown.dateProximity, max: 10, desc: lead.event_date || "No date" },
                  { label: "Revenue", val: sc.breakdown.revenue, max: 10, desc: [lead.budget_label, lead.guest_count ? `${lead.guest_count} guests` : null].filter(Boolean).join(", ") || "Unknown" },
                ].map(row => (
                  <div key={row.label} className="lp-score-row">
                    <span className="lp-score-row__label">{row.label}</span>
                    <div className="lp-score-row__bar">
                      <div className="lp-score-row__fill" style={{ width: `${(row.val / row.max) * 100}%`, background: tc.color }} />
                    </div>
                    <span className="lp-score-row__val">{row.val}/{row.max}</span>
                    <span className="lp-score-row__desc">{row.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Journey */}
        <div className="lp-section">
          <h3 className="lp-section__title">Journey</h3>
          {journeyLoading && <p className="lp-detail__muted">Loading journey...</p>}
          {!journeyLoading && !journey && <p className="lp-detail__muted">No journey data available.</p>}
          {!journeyLoading && journey && journey.sessions.length === 0 && <p className="lp-detail__muted">No sessions recorded for this visitor.</p>}
          {!journeyLoading && journey && journey.sessions.length > 0 && (
            <JourneySummary journey={journey} showFullJourney={showFullJourney} setShowFullJourney={setShowFullJourney} />
          )}
        </div>
      </div>{/* end lp-card */}
    </div>
  );
}
