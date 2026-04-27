/**
 * LeadProfile - 5-band lead profile.
 *
 * Bands (top to bottom):
 *   1. .lp-id-strip       - one quiet row, avatar + name + meta
 *   2. .lp-meta-strip     - 4 cells: Score / Projected value / Lead source / Last visit
 *   3. .lp-funnel-hero    - funnel track + stage callout + stage-aware actions
 *   4. .lp-body           - 3 cols: Event details / Score breakdown / Activity summary
 *   5. Dialogs            - Won / Lost / confirmation (unchanged)
 *
 * See sales & marketing/website/pages/dashboard/prd-sys-lead-profile.md.
 *
 * V1 deferrals (handled in v2):
 *   - last_touched_at / last_touched_by schema migration. Falls back to
 *     deriving "Last visit" from the journey's most-recent session timestamp.
 *   - Circular score ring (Option B). Defaults to compact bars (Option A).
 *   - Pin/star toggle, click-to-advance funnel, inline edit on event details.
 */

import { useState, useEffect } from "react";

import {
  FORM_TYPE_LABELS,
  URGENCY_LABELS,
  TIER_CONFIG,
  FUNNEL_LABELS, HEALTH_COLORS, STAGE_DEFINITIONS,
  STAGE_PRIMARY_ACTION,
  STAGE_PILL_COLORS,
  LEAD_TYPE_LABELS,
  EVENT_TYPE_DISPLAY,
  JOURNEY_EVENT_LABELS,
  LOST_REASONS,
} from "./constants.js";

import {
  formatDuration, formatTime, formatRelativeTime, formatAbsoluteTime,
  shortenUrl, parseEventData,
  parseTimestamp, daysBetween,
  computeLeadScore, computeFunnelStage,
  resolveSource,
} from "./utils.js";

/* ── Funnel track (unchanged from v0 - already battle-tested) ── */

function FunnelTrack({ funnel, tc }) {
  return (
    <div className="lp-funnel">
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
              {isCompleted && !isCurrent && <span className="lp-funnel__check">{"✓"}</span>}
              {isCurrent && !isLost && !isCancelled && !isNoshow && funnel.health && (
                <span className="lp-funnel__pulse" />
              )}
            </div>
            <span className="lp-funnel__label">{FUNNEL_LABELS[stageKey]}</span>
            {isCompleted && !isCurrent && completedDate && (
              <span className="lp-funnel__date">{completedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
            )}
            {isCurrent && funnel.health && (
              <span className="lp-funnel__health" style={{ color: hc.color, background: hc.bg }}>
                {funnel.daysInStage === 0 ? "Today" : `${funnel.daysInStage}d`}
              </span>
            )}
          </div>
        );
      })}
      {(funnel.currentStage === "lost" || funnel.currentStage === "cancelled" || funnel.currentStage === "noshow") && (
        <div className="lp-funnel__step lp-funnel__step--current">
          <div className="lp-funnel__line" />
          <div className={`lp-funnel__dot lp-funnel__dot--current`} style={{ background: funnel.currentStage === "lost" ? "#8C472E" : "#BF7256", borderColor: funnel.currentStage === "lost" ? "#8C472E" : "#BF7256" }}>
            <span style={{ color: "#fff", fontSize: "10px", fontWeight: 700 }}>{funnel.currentStage === "lost" ? "✗" : "—"}</span>
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

/* ── Full journey drill-in (kept for "View full timeline" toggle) ── */

function JourneySummary({ journey, showFullJourney, setShowFullJourney }) {
  if (!journey || journey.sessions.length === 0) return null;

  const allEvents = journey.sessions.flatMap(s => s.events.map(e => ({ ...e, session_source: s.source, session_campaign: s.campaign, ad_platform: s.ad_platform })));
  const firstSession = journey.sessions[0];
  const lastSession = journey.sessions[journey.sessions.length - 1];
  const firstDate = firstSession.started_at;
  const lastDate = lastSession.started_at;
  const totalPages = allEvents.filter(e => e.event_type === "page_view").length;

  const milestones = [];
  milestones.push({ time: firstDate, icon: "👁", label: "First visit", detail: firstSession.source + (firstSession.ad_platform ? " (" + firstSession.ad_platform + ")" : "") });

  const pageCounts = {};
  allEvents.filter(e => e.event_type === "page_view").forEach(e => {
    const p = (() => { try { return new URL(e.page_url, "https://x").pathname; } catch { return e.page_url; } })();
    pageCounts[p] = (pageCounts[p] || 0) + 1;
  });
  const topPages = Object.entries(pageCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const dateChecks = allEvents.filter(e => e.event_type === "date_check");
  const checkedDates = [...new Set(dateChecks.map(e => { const d = parseEventData(e.event_data); return d?.date || ""; }).filter(Boolean))];
  if (dateChecks.length > 0) {
    milestones.push({ time: dateChecks[0].created_at, icon: "📅", label: "Checked " + checkedDates.length + " date" + (checkedDates.length !== 1 ? "s" : ""), detail: checkedDates.slice(0, 3).join(", ") + (checkedDates.length > 3 ? " + " + (checkedDates.length - 3) + " more" : "") });
  }

  const quizComplete = allEvents.filter(e => e.event_type === "questionnaire_complete");
  const quizStart = allEvents.filter(e => e.event_type === "questionnaire_start");
  if (quizComplete.length > 0) {
    milestones.push({ time: quizComplete[0].created_at, icon: "✅", label: "Completed questionnaire", detail: "" });
  } else if (quizStart.length > 0) {
    milestones.push({ time: quizStart[0].created_at, icon: "📝", label: "Started questionnaire", detail: "Not completed" });
  }

  const formSubmits = allEvents.filter(e => e.event_type === "form_submit");
  formSubmits.forEach(e => {
    const d = parseEventData(e.event_data);
    const fl = d?.form_type ? (FORM_TYPE_LABELS[d.form_type] || d.form_type) : "Form";
    milestones.push({ time: e.created_at, icon: "📨", label: "Submitted " + fl, detail: "" });
  });

  const ctaClicks = allEvents.filter(e => e.event_type === "cta_click");
  const bookingCtas = ctaClicks.filter(e => {
    const d = parseEventData(e.event_data);
    const text = (d?.cta_text || d?.track_id || d?.cta_id || "").toLowerCase();
    return text.includes("tour") || text.includes("call") || text.includes("book");
  });
  bookingCtas.forEach(e => {
    const d = parseEventData(e.event_data);
    const ctaName = d?.cta_text || d?.track_id || d?.cta_id || "CTA";
    milestones.push({ time: e.created_at, icon: "📞", label: "Clicked " + ctaName, detail: "" });
  });

  const brochureDownloads = allEvents.filter(e => e.event_type === "brochure_download");
  if (brochureDownloads.length > 0) {
    milestones.push({ time: brochureDownloads[0].created_at, icon: "📄", label: "Downloaded brochure", detail: brochureDownloads.length > 1 ? brochureDownloads.length + " times" : "" });
  }

  const firstD = firstDate.substring(0, 10);
  const lastD = lastDate.substring(0, 10);
  if (firstD !== lastD) {
    milestones.push({ time: lastDate, icon: "🕓", label: "Last seen", detail: journey.total_sessions + " sessions over " + daysBetween(parseTimestamp(firstDate), parseTimestamp(lastDate)) + " days" });
  }

  milestones.sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  const sourceCounts = {};
  journey.sessions.forEach(s => {
    let label = s.source || "Direct";
    if (label.startsWith("http")) {
      try { label = new URL(label).hostname.replace("www.", ""); } catch { /* keep raw */ }
    }
    sourceCounts[label] = (sourceCounts[label] || 0) + 1;
  });

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
      <div className="jny-stats">
        <div className="jny-stat"><span className="jny-stat__val">{journey.total_sessions}</span><span className="jny-stat__label">sessions</span></div>
        <div className="jny-stat"><span className="jny-stat__val">{totalPages}</span><span className="jny-stat__label">pages viewed</span></div>
        <div className="jny-stat"><span className="jny-stat__val">{Object.keys(pageCounts).length}</span><span className="jny-stat__label">unique pages</span></div>
        <div className="jny-stat"><span className="jny-stat__val">{dateChecks.length}</span><span className="jny-stat__label">date checks</span></div>
        <div className="jny-stat"><span className="jny-stat__val">{daysSpan === 0 ? "Same day" : daysSpan + "d"}</span><span className="jny-stat__label">time span</span></div>
      </div>

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

      <div className="jny-toppages">
        <div className="jny-toppages__title">Most viewed pages</div>
        {topPages.map(([page, count]) => (
          <div key={page} className="jny-toppage">
            <span className="jny-toppage__path">{page}</span>
            <span className="jny-toppage__count">{count} view{count !== 1 ? "s" : ""}</span>
          </div>
        ))}
      </div>

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

/* ── Status action dialogs (unchanged) ── */

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

const CONFIRM_LABELS = {
  meeting: "Mark as Had Meeting?",
  call: "Mark as Had Call?",
  tour: "Mark as Had Tour?",
  cancelled: "Mark as Cancelled?",
  noshow: "Mark as No-show?",
  proposal: "Mark as Sent Proposal?",
  reopen: "Re-open this lead?",
  revert: "Undo this stage?",
};

/* ── Stage actions (rendered inside the funnel hero callout) ──
   Stage-aware primary button driven by STAGE_PRIMARY_ACTION (constants.js).
   All other actions remain ghost buttons. Lost is a danger-ghost button. */

function StageActions({ lead, funnel, activeLeadType, onStatusChange }) {
  const [showLost, setShowLost] = useState(false);
  const [showWon, setShowWon] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const isLowIntent = activeLeadType === "supperclub" || activeLeadType === "cafe-bar";
  if (isLowIntent) return null;

  async function fireAction(action, extra = {}) {
    setSaving(true);
    setConfirmAction(null);
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

  function requestAction(action) { setConfirmAction(action); }

  function handleAction(action) {
    if (action === "call" || action === "tour") fireAction("meeting");
    else fireAction(action);
  }

  const stage = funnel.currentStage;
  const manualStages = ["call", "tour", "meeting", "cancelled", "noshow", "proposal", "won"];
  const isManualStage = manualStages.includes(stage);
  const primary = STAGE_PRIMARY_ACTION[stage] || null;

  const showCall = ["lead", "qualified", "engaged", "cancelled", "noshow"].includes(stage);
  const showTour = ["lead", "qualified", "engaged", "call", "cancelled", "noshow"].includes(stage);
  const showCancelled = ["engaged"].includes(stage);
  const showNoshow = ["engaged"].includes(stage);
  const showProposal = ["call", "tour", "meeting"].includes(stage);
  const showWonBtn = ["call", "tour", "meeting", "proposal"].includes(stage);
  const showLostBtn = stage !== "lost" && stage !== "won";
  const showReopenBtn = stage === "lost";

  /* Decide which button on this stage acts as the Mid Olive primary. */
  function isPrimaryAction(action) { return primary && primary.action === action; }

  function callBtn() {
    if (!showCall) return null;
    const variant = isPrimaryAction("call") ? "primary" : "ghost";
    return (
      <button key="call" className={`lp-stage-actions__btn lp-stage-actions__btn--${variant}`}
        onClick={() => requestAction("call")} disabled={saving} type="button">Had call</button>
    );
  }
  function tourBtn() {
    if (!showTour) return null;
    const variant = isPrimaryAction("tour") ? "primary" : "ghost";
    return (
      <button key="tour" className={`lp-stage-actions__btn lp-stage-actions__btn--${variant}`}
        onClick={() => requestAction("tour")} disabled={saving} type="button">Had tour</button>
    );
  }
  function proposalBtn() {
    if (!showProposal) return null;
    const variant = isPrimaryAction("proposal") ? "primary" : "ghost";
    return (
      <button key="proposal" className={`lp-stage-actions__btn lp-stage-actions__btn--${variant}`}
        onClick={() => requestAction("proposal")} disabled={saving} type="button">Sent proposal</button>
    );
  }
  function wonBtn() {
    if (!showWonBtn) return null;
    const variant = isPrimaryAction("won") ? "primary" : "ghost";
    return (
      <button key="won" className={`lp-stage-actions__btn lp-stage-actions__btn--${variant}`}
        onClick={() => setShowWon(true)} disabled={saving} type="button">Won</button>
    );
  }
  function cancelBtn() {
    if (!showCancelled) return null;
    return (
      <button key="cancelled" className="lp-stage-actions__btn lp-stage-actions__btn--ghost"
        onClick={() => requestAction("cancelled")} disabled={saving} type="button">Cancelled</button>
    );
  }
  function noshowBtn() {
    if (!showNoshow) return null;
    return (
      <button key="noshow" className="lp-stage-actions__btn lp-stage-actions__btn--ghost"
        onClick={() => requestAction("noshow")} disabled={saving} type="button">No-show</button>
    );
  }
  function lostBtn() {
    if (!showLostBtn) return null;
    return (
      <button key="lost" className="lp-stage-actions__btn lp-stage-actions__btn--danger"
        onClick={() => setShowLost(true)} disabled={saving} type="button">Mark as lost</button>
    );
  }
  function revertBtn() {
    if (!isManualStage) return null;
    return (
      <button key="revert" className="lp-stage-actions__btn lp-stage-actions__btn--ghost"
        onClick={() => requestAction("revert")} disabled={saving} type="button">{"↩"} Undo {FUNNEL_LABELS[stage] || stage}</button>
    );
  }
  function reopenBtn() {
    if (!showReopenBtn) return null;
    return (
      <button key="reopen" className="lp-stage-actions__btn lp-stage-actions__btn--ghost"
        onClick={() => requestAction("reopen")} disabled={saving} type="button">Re-open lead</button>
    );
  }

  /* Order: primary first (driven by STAGE_PRIMARY_ACTION), then secondary
     ghosts in their natural funnel order, then revert + lost at the end. */
  const orderedRenderers = (() => {
    const out = [];
    if (primary) {
      const map = { call: callBtn, tour: tourBtn, proposal: proposalBtn, won: wonBtn };
      const fn = map[primary.action];
      if (fn) out.push(fn());
    }
    [callBtn, tourBtn, proposalBtn, wonBtn].forEach(fn => {
      const node = fn();
      if (node && !out.find(n => n && n.key === node.key)) out.push(node);
    });
    out.push(cancelBtn());
    out.push(noshowBtn());
    out.push(reopenBtn());
    out.push(revertBtn());
    out.push(lostBtn());
    return out.filter(Boolean);
  })();

  return (
    <>
      <div className="lp-stage-actions">
        {confirmAction && (
          <span className="lp-stage-actions__confirm">
            <span className="lp-stage-actions__confirm-label">{CONFIRM_LABELS[confirmAction] || "Are you sure?"}</span>
            <button className="lp-stage-actions__btn lp-stage-actions__btn--primary" onClick={() => handleAction(confirmAction)} disabled={saving} type="button">Yes</button>
            <button className="lp-stage-actions__btn lp-stage-actions__btn--ghost" onClick={() => setConfirmAction(null)} disabled={saving} type="button">No</button>
          </span>
        )}
        {!confirmAction && orderedRenderers}
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

/* ── Score breakdown (ring headline + compact bars below - PRD Option B) ── */

function ScoreRing({ score, tierLabel, tierColor }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="lp-score-ring">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(64,22,12,0.12)" strokeWidth="6" />
        <circle
          cx="48" cy="48" r={radius} fill="none"
          stroke="#2E4009" strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 48 48)"
          strokeLinecap="round"
        />
      </svg>
      <div className="lp-score-ring__inner">
        <div className="lp-score-ring__num">{score}</div>
        <div className="lp-score-ring__tier" style={{ color: tierColor }}>{tierLabel}</div>
      </div>
    </div>
  );
}

function ScoreBreakdownColumn({ sc, lead, funnel }) {
  const rows = [
    { label: "Stage", val: sc.breakdown.stage, max: 30 },
    { label: "Intent", val: sc.breakdown.intent, max: 10 },
    { label: "Recency", val: sc.breakdown.recency, max: 25 },
    { label: "Engage", val: sc.breakdown.engagement, max: 15 },
    { label: "Date", val: sc.breakdown.dateProximity, max: 10 },
    { label: "Revenue", val: sc.breakdown.revenue, max: 10 },
  ];

  // Tier colours match the brand palette + tier thresholds in computeLeadScore.
  const TIER_RING_COLORS = {
    hot:  "#8C472E",            // Fired Brick
    warm: "#BF7256",            // Dusty Coral
    cool: "#2E4009",            // Forest Olive
    cold: "rgba(44,24,16,0.5)", // Brewery Dark @ 50%
  };

  // Won / Lost short-circuit (mirrors computeLeadScore: Won = 100/hot already).
  let ringScore = sc.score;
  let ringTierLabel = (TIER_CONFIG[sc.tier] && TIER_CONFIG[sc.tier].label) || "Cool";
  let ringTierColor = TIER_RING_COLORS[sc.tier] || TIER_RING_COLORS.cool;

  const isWon = lead.contact_type === "customer" || (funnel && funnel.currentStage === "won");
  const isLost = funnel && funnel.currentStage === "lost";

  if (isWon) {
    ringScore = 100;
    ringTierLabel = "Won";
    ringTierColor = "#2E4009"; // Forest Olive
  } else if (isLost) {
    ringTierLabel = "Lost";
    ringTierColor = "rgba(64,22,12,0.6)"; // Mahogany @ 60%
  }

  return (
    <div className="lp-body-col">
      <h3 className="lp-body-col__title">
        <span>Score breakdown</span>
        <span className="lp-body-col__title-meta">Total {sc.score}</span>
      </h3>
      <ScoreRing score={ringScore} tierLabel={ringTierLabel} tierColor={ringTierColor} />
      {rows.map(row => (
        <div key={row.label} className="lp-sb-row">
          <span className="lp-sb-row__label">{row.label}</span>
          <div className="lp-sb-row__bar">
            <div className="lp-sb-row__fill" style={{ width: `${(row.val / row.max) * 100}%` }} />
          </div>
          <span className="lp-sb-row__val">{row.val}/{row.max}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Milestone-builder + relative-time helper for the compact Activity column ── */

/* Richer relative-time formatter than utils.formatRelativeTime - uses
 * "Today HH:MM", "Yesterday", "Tue 23 Apr" tiers like the Stitch reference. */
function formatMilestoneTime(iso) {
  if (!iso) return "";
  const safe = iso.includes("T") ? iso : iso.replace(" ", "T") + "Z";
  const then = new Date(safe);
  if (Number.isNaN(then.getTime())) return iso;
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  /* Same calendar day in local time → "Today HH:MM" */
  const sameDay = then.toDateString() === now.toDateString();
  if (sameDay) {
    return `Today ${then.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  }
  /* Yesterday in local time */
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (then.toDateString() === yest.toDateString()) return "Yesterday";
  /* Within last 7 days → "Tue 23 Apr" */
  const days = Math.floor((now - then) / 86400000);
  if (days < 7) {
    return then.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }
  /* Else absolute "23 Apr" or "23 Apr 2025" if different year */
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/* Format a YYYY-MM-DD wedding date as "12 Sep 2026" */
function formatEventDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr.length === 10 ? dateStr + "T00:00:00Z" : dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/* Returns an array of { time, title, detail } sorted DESC.
 *
 * Sources:
 *   - journey events (form_submit, cta_click w/ booking intent, date_check,
 *     brochure_download, questionnaire_complete/start, plus first-visit anchor)
 *   - manual lead-status timestamps on the contact (meeting_at, call_at,
 *     tour_at, proposal_at, won_at, lost_at, cancelled_at, noshow_at)
 *
 * Skips page_view + questionnaire_step (too noisy for the compact column).
 */
function buildLeadMilestones(lead, journey) {
  const out = [];

  /* ── Journey-derived milestones ── */
  if (journey && journey.sessions && journey.sessions.length > 0) {
    const allEvents = journey.sessions.flatMap(s => s.events.map(e => ({
      ...e,
      session_source: s.source,
      session_ad_platform: s.ad_platform,
    })));

    /* First-visit anchor (uses first session, not first event, so source is meaningful) */
    const firstSession = journey.sessions[0];
    if (firstSession) {
      const src = resolveSource(firstSession.source || "");
      out.push({
        time: firstSession.started_at,
        title: `First visit · ${src.label}`,
        detail: firstSession.ad_platform ? `via ${firstSession.ad_platform}` : "",
      });
    }

    /* form_submit */
    allEvents.filter(e => e.event_type === "form_submit").forEach(e => {
      const d = parseEventData(e.event_data);
      const fl = d?.form_type ? (FORM_TYPE_LABELS[d.form_type] || d.form_type) : "form";
      out.push({
        time: e.created_at,
        title: `Submitted ${fl}`,
        detail: d?.form_action || "",
      });
    });

    /* cta_click - only booking-intent ones (tour, call, book) */
    allEvents.filter(e => e.event_type === "cta_click").forEach(e => {
      const d = parseEventData(e.event_data);
      const text = (d?.cta_text || d?.track_id || d?.cta_id || "").toLowerCase();
      if (!(text.includes("tour") || text.includes("call") || text.includes("book"))) return;
      const ctaName = d?.cta_text || d?.track_id || d?.cta_id || "CTA";
      const page = e.page_url ? shortenUrl(e.page_url) : "";
      out.push({
        time: e.created_at,
        title: `Clicked "${ctaName}"`,
        detail: page ? `on ${page}` : "",
      });
    });

    /* date_check - one milestone per check (limited to top 4 anyway) */
    allEvents.filter(e => e.event_type === "date_check").forEach(e => {
      const d = parseEventData(e.event_data);
      const dateLabel = d?.date ? formatEventDate(d.date) : "a date";
      out.push({
        time: e.created_at,
        title: `Checked ${dateLabel}`,
        detail: "",
      });
    });

    /* brochure_download */
    allEvents.filter(e => e.event_type === "brochure_download").forEach(e => {
      const d = parseEventData(e.event_data);
      const which = d?.brochure_type ? ` (${d.brochure_type})` : "";
      out.push({
        time: e.created_at,
        title: `Downloaded brochure${which}`,
        detail: "",
      });
    });

    /* questionnaire_complete - prefer over start */
    const qComplete = allEvents.filter(e => e.event_type === "questionnaire_complete");
    if (qComplete.length > 0) {
      qComplete.forEach(e => {
        const d = parseEventData(e.event_data);
        const stream = d?.stream || d?.questionnaire_type || lead.lead_type || "";
        out.push({
          time: e.created_at,
          title: stream ? `Completed ${stream} quiz` : "Completed questionnaire",
          detail: "",
        });
      });
    } else {
      const qStart = allEvents.filter(e => e.event_type === "questionnaire_start");
      if (qStart.length > 0) {
        const e = qStart[0];
        out.push({
          time: e.created_at,
          title: "Started questionnaire",
          detail: "Not completed",
        });
      }
    }
  }

  /* ── Manual lead-status milestones (from contact record) ── */
  /* call_at: prefer explicit call_at column, else infer from meeting_at when
   * the lead has discovery-call intent and no tour intent. */
  const effectiveCallAt = lead.call_at || (
    lead.meeting_at && lead.clicked_discovery_call_at && !lead.clicked_venue_tour_at
      ? lead.meeting_at
      : null
  );
  /* tour_at: prefer explicit tour_at column, else infer from meeting_at when
   * tour intent is present (or as default fallback for legacy meetings). */
  const effectiveTourAt = lead.tour_at || (
    lead.meeting_at && (lead.clicked_venue_tour_at || (!lead.clicked_discovery_call_at && !effectiveCallAt))
      ? lead.meeting_at
      : null
  );

  if (effectiveCallAt && effectiveCallAt !== effectiveTourAt) {
    out.push({ time: effectiveCallAt, title: "Had call", detail: "" });
  }
  if (effectiveTourAt) {
    out.push({ time: effectiveTourAt, title: "Had tour", detail: "" });
  }
  /* If meeting_at is set but neither call nor tour was inferred from it, surface as a generic meeting. */
  if (lead.meeting_at && lead.meeting_at !== effectiveCallAt && lead.meeting_at !== effectiveTourAt) {
    out.push({ time: lead.meeting_at, title: "Had meeting", detail: "" });
  }
  if (lead.proposal_at) {
    out.push({ time: lead.proposal_at, title: "Sent proposal", detail: "" });
  }
  if (lead.won_at) {
    const dv = lead.deal_value ? ` · £${Number(lead.deal_value).toLocaleString()}` : "";
    out.push({ time: lead.won_at, title: `Marked Won${dv}`, detail: "" });
  }
  if (lead.lost_at) {
    const reasonLabel = (LOST_REASONS.find(r => r.value === lead.lost_reason) || {}).label;
    const reason = reasonLabel ? ` · ${reasonLabel}` : "";
    out.push({
      time: lead.lost_at,
      title: `Marked Lost${reason}`,
      detail: lead.lost_reason_note || "",
    });
  }
  if (lead.cancelled_at) {
    out.push({ time: lead.cancelled_at, title: "Cancelled", detail: "" });
  }
  if (lead.noshow_at) {
    out.push({ time: lead.noshow_at, title: "No-show", detail: "" });
  }

  /* Sort DESC and dedupe by (time + title) so we don't show two
   * identical rows when meeting_at + tour_at coincide. */
  const seen = new Set();
  out.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  return out.filter(m => {
    const k = `${m.time}|${m.title}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ── Activity summary (top 4 event milestones + drill-in toggle) ── */

function ActivitySummaryColumn({ lead, journey, journeyLoading, showFullJourney, setShowFullJourney }) {
  if (journeyLoading) {
    return (
      <div className="lp-body-col">
        <h3 className="lp-body-col__title"><span>Activity</span></h3>
        <p className="activity-mini__empty">Loading...</p>
      </div>
    );
  }

  const milestones = buildLeadMilestones(lead, journey);

  if (milestones.length === 0) {
    return (
      <div className="lp-body-col">
        <h3 className="lp-body-col__title"><span>Activity</span></h3>
        <p className="activity-mini__empty">No activity yet</p>
      </div>
    );
  }

  const top = milestones.slice(0, 4);
  const sessionCount = journey && journey.total_sessions ? journey.total_sessions : 0;

  return (
    <div className="lp-body-col">
      <h3 className="lp-body-col__title">
        <span>Activity</span>
        {sessionCount > 0 && (
          <span className="lp-body-col__title-meta">{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
        )}
      </h3>
      <div className="activity-mini activity-mini--timeline">
        {top.map((m, i) => (
          <div key={`${m.time}-${i}`} className="activity-mini__row">
            <div className="activity-mini__title">{m.title}</div>
            <div className="activity-mini__when">{formatMilestoneTime(m.time)}</div>
            {m.detail && <div className="activity-mini__detail">{m.detail}</div>}
          </div>
        ))}
      </div>
      <button type="button" className="activity-mini__link" onClick={() => setShowFullJourney(prev => !prev)}>
        {showFullJourney ? "Hide full timeline" : "View full timeline →"}
      </button>
    </div>
  );
}

/* ── Event details column ── */

function EventDetailsColumn({ lead }) {
  const rows = [
    { label: "Event date", value: lead.event_date || lead.wedding_year, empty: !lead.event_date && !lead.wedding_year },
    lead.event_type_label ? { label: "Event type", value: lead.event_type_label } : null,
    { label: "Guests", value: lead.guest_count, empty: !lead.guest_count },
    { label: "Urgency", value: lead.urgency_label, empty: !lead.urgency_label },
    { label: "Budget", value: lead.budget_label, empty: !lead.budget_label },
    { label: "Location", value: [lead.ip_city, lead.ip_country].filter(Boolean).join(", ") || null, empty: !lead.ip_city && !lead.ip_country },
    lead.company ? { label: "Company", value: lead.company } : null,
  ].filter(Boolean);

  return (
    <div className="lp-body-col">
      <h3 className="lp-body-col__title"><span>Event details</span></h3>
      {/* Contact rows - moved here from identity strip (2026-04-27 redesign) */}
      <div className="lp-attr-row">
        <span className="lp-attr-row__label">Email</span>
        <span className={`lp-attr-row__value${lead.email ? "" : " lp-attr-row__value--empty"}`}>
          {lead.email ? (
            <a href={`mailto:${lead.email}`} className="lp-attr-row__link">{lead.email}</a>
          ) : "Not provided"}
        </span>
      </div>
      <div className="lp-attr-row">
        <span className="lp-attr-row__label">Phone</span>
        <span className={`lp-attr-row__value${lead.phone ? "" : " lp-attr-row__value--empty"}`}>
          {lead.phone ? (
            <a href={`tel:${lead.phone}`} className="lp-attr-row__link">{lead.phone}</a>
          ) : "Not provided"}
        </span>
      </div>
      {rows.map(r => (
        <div key={r.label} className="lp-attr-row">
          <span className="lp-attr-row__label">{r.label}</span>
          <span className={`lp-attr-row__value${r.empty ? " lp-attr-row__value--empty" : ""}`}>
            {r.empty ? "Not provided" : r.value}
          </span>
        </div>
      ))}
      {lead.cross_sell_labels?.length > 0 && (
        <div className="lp-attr-row">
          <span className="lp-attr-row__label">Also wants</span>
          <span className="lp-attr-row__value">{lead.cross_sell_labels.join(", ")}</span>
        </div>
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
  const initials = (lead.first_name || "?").charAt(0).toUpperCase() + (lead.last_name || "").charAt(0).toUpperCase();
  const src = resolveSource(lead.source_channel);

  /* ── Identity strip derived data (2026-04-27 redesign) ── */
  /* Stage pill: background + colour driven by STAGE_PILL_COLORS, label from
     FUNNEL_LABELS, uppercase. Defaults to Forest Olive tint if stage unknown. */
  const stagePillCfg = STAGE_PILL_COLORS[funnel.currentStage] || STAGE_PILL_COLORS.lead;
  const stagePillLabel = (FUNNEL_LABELS[funnel.currentStage] || funnel.currentStage || "").toUpperCase();
  const stagePill = stagePillLabel ? { bg: stagePillCfg.bg, color: stagePillCfg.color, label: stagePillLabel } : null;

  /* Subtitle: "{Event type} · {Event date}" - Dusty Coral tracked uppercase.
     Event type comes from activeLeadType (wedding / corporate / etc.) plus
     for corporate the more specific event_type_label if present.
     Event date is formatted "MMM YYYY" or "Date TBC". */
  const eventTypeLabel = (() => {
    if (activeLeadType === "corporate" && lead.event_type) {
      return EVENT_TYPE_DISPLAY[lead.event_type] || LEAD_TYPE_LABELS[activeLeadType] || activeLeadType;
    }
    return LEAD_TYPE_LABELS[activeLeadType] || activeLeadType || "Lead";
  })();
  const eventDateLabel = (() => {
    const raw = lead.event_date;
    if (!raw) return "Date TBC";
    /* event_date is typically YYYY-MM-DD; parse safely. */
    const safe = raw.includes("T") ? raw : raw + "T00:00:00Z";
    const d = new Date(safe);
    if (Number.isNaN(d.getTime())) return raw;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  })();
  const idSubtitle = `${eventTypeLabel} · ${eventDateLabel}`;

  /* ── Band 2 metadata: derive last visit from journey when no
     last_touched_by column exists yet (v2 deferral). ── */
  let lastVisitText = null;
  if (journey && journey.sessions && journey.sessions.length > 0) {
    const mostRecent = journey.sessions
      .reduce((acc, s) => (!acc || (s.started_at || "") > (acc.started_at || "") ? s : acc), null);
    if (mostRecent) {
      lastVisitText = `Last visit ${formatRelativeTime(mostRecent.started_at)}`;
    }
  }

  /* Projected value: prefer recorded deal_value, otherwise leave blank/muted. */
  const projectedValue = lead.deal_value
    ? `£${lead.deal_value.toLocaleString()}`
    : null;

  /* Stage callout text: definition + a single muted "last touch" line. */
  const stageDef = STAGE_DEFINITIONS[funnel.currentStage] || "";
  const stuckThresholds = funnel.health === "amber" || funnel.health === "red";
  const hc = funnel.health ? HEALTH_COLORS[funnel.health] : null;

  /* Won / lost stages display the stage name with a small Forest Olive or
     Fired Brick coloured stage name, but the band still renders cleanly. */

  return (
    <div className="lp-fullpage">
      <button className="lp-back" onClick={onBack} type="button">{"←"} Back to leads</button>

      <div className="lp-card-stack">
        {/* ── Card 1: Identity + Metadata ── */}
        <div className="lp-card lp-card--header">
        {/* ── Band 1: Identity strip (compact 2-row layout - 2026-04-27 redesign) ── */}
        <div className="lp-id-strip">
          <span className="lp-id-strip__avatar" aria-hidden="true">{initials || "?"}</span>
          <div className="lp-id-text">
            <div className="lp-id-name-row">
              <h2 className="lp-id-strip__name">{name}</h2>
              {stagePill && (
                <span className="lp-stage-pill" style={{ background: stagePill.bg, color: stagePill.color }}>
                  {stagePill.label}
                </span>
              )}
            </div>
            <p className="lp-id-subtitle">{idSubtitle}</p>
          </div>
          <div className="lp-id-actions">
            {lead.hubspot_contact_id && (
              <a
                href={`https://app.hubspot.com/contacts/25870094/contact/${lead.hubspot_contact_id}`}
                target="_blank" rel="noopener noreferrer"
                className="lp-id-actions__btn lp-id-actions__btn--ghost"
                title="Open in HubSpot"
              >Open in HubSpot {"↗"}</a>
            )}
            {funnel.currentStage === "won" && (
              <button
                type="button"
                className="lp-id-actions__btn lp-id-actions__btn--primary"
                onClick={() => { /* placeholder - finalise booking flow */ }}
              >Finalise booking</button>
            )}
          </div>
        </div>

        {/* ── Band 2: Metadata strip ── */}
        <div className="lp-meta-strip">
          {/* Score */}
          <div className="lp-meta-cell">
            <span className="lp-meta-cell__eyebrow">Score</span>
            <span className="lp-meta-cell__value">
              <span className="lp-meta-cell__dot" style={{ background: tc.color }} />
              {sc.score} {"·"} {tc.label}
            </span>
          </div>
          {/* Projected value */}
          <div className="lp-meta-cell">
            <span className="lp-meta-cell__eyebrow">Projected value</span>
            {projectedValue ? (
              <span className="lp-meta-cell__value">{projectedValue}</span>
            ) : (
              <span className="lp-meta-cell__value lp-meta-cell__value--muted">Not yet estimated</span>
            )}
          </div>
          {/* Lead source */}
          <div className="lp-meta-cell">
            <span className="lp-meta-cell__eyebrow">Lead source</span>
            <span className="lp-meta-cell__value">
              <span className="lp-meta-cell__dot" style={{ background: src.color }} />
              {src.label}
            </span>
          </div>
          {/* Last visit (v2 will replace with last_touched_by) */}
          <div className="lp-meta-cell">
            <span className="lp-meta-cell__eyebrow">Last visit</span>
            {lastVisitText ? (
              <span className="lp-meta-cell__value">{lastVisitText.replace("Last visit ", "")}</span>
            ) : (
              <span className="lp-meta-cell__value lp-meta-cell__value--muted">No activity</span>
            )}
          </div>
        </div>
        </div>{/* end lp-card--header */}

        {/* ── Card 2: Funnel hero ── */}
        <div className="lp-card lp-card--funnel">
        {/* ── Band 3: Funnel hero ── */}
        <div className="lp-funnel-hero">
          <FunnelTrack funnel={funnel} tc={tc} />

          <div className="stage-callout">
            <div className="stage-callout__head">
              <p className="stage-callout__eyebrow">Current stage</p>
              <div className="stage-callout__row">
                <h3 className="lp-stage-name" style={
                  funnel.currentStage === "lost" ? { color: "#8C472E" } :
                  funnel.currentStage === "won" ? { color: "#2E4009" } : {}
                }>
                  {FUNNEL_LABELS[funnel.currentStage] || funnel.currentStage}
                </h3>
                {stuckThresholds && hc && (
                  <span className="lp-stage-stuck">
                    <span className="lp-stage-stuck__dot" style={{ background: hc.color }} />
                    {hc.label} {"·"} {funnel.daysInStage}d in stage
                  </span>
                )}
              </div>
              {(stageDef || funnel.stageEnteredAt) && (
                <p className="stage-callout__def">
                  {stageDef}
                  {stageDef && funnel.stageEnteredAt && <span className="stage-callout__def-sep">{"·"}</span>}
                  {funnel.stageEnteredAt && (
                    <>last touch {formatRelativeTime(funnel.stageEnteredAt instanceof Date ? funnel.stageEnteredAt.toISOString() : funnel.stageEnteredAt)}</>
                  )}
                </p>
              )}
            </div>
            <StageActions lead={lead} funnel={funnel} activeLeadType={activeLeadType} onStatusChange={onStatusChange} />
          </div>
        </div>
        </div>{/* end lp-card--funnel */}

        {/* ── Card 3: 3-column body + timeline drill-in ── */}
        <div className="lp-card lp-card--body">
        {/* ── Band 4: 3-column body ── */}
        <div className="lp-body">
          <EventDetailsColumn lead={lead} />
          <ScoreBreakdownColumn sc={sc} lead={lead} funnel={funnel} />
          <ActivitySummaryColumn
            lead={lead}
            journey={journey}
            journeyLoading={journeyLoading}
            showFullJourney={showFullJourney}
            setShowFullJourney={setShowFullJourney}
          />
        </div>

        {/* Full timeline drill-in - kept inside the card under the 3-col body
            and only renders when toggled. Replaces the old always-on Journey
            section so the page stays compact by default. */}
        {showFullJourney && (
          <div className="lp-section">
            <h3 className="lp-section__title">Full timeline</h3>
            <JourneySummary journey={journey} showFullJourney={showFullJourney} setShowFullJourney={setShowFullJourney} />
          </div>
        )}
        </div>{/* end lp-card--body */}
      </div>{/* end lp-card-stack */}
    </div>
  );
}
