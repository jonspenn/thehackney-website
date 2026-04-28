/**
 * FunnelTrack - horizontal funnel-stage progression.
 *
 * Two modes, same visual language (dots + connector lines + stage labels):
 *
 *   PROFILE MODE — one lead's path. Dot per stage with completed / current / future
 *   states, optional date / health pulse on the current stage. Pass `funnel`
 *   (computeFunnelStage output).
 *
 *   COHORT MODE — counts per stage (used by the Pipeline tab). Dot per stage with
 *   a Cormorant count under each, optional "selected" highlight, optional
 *   click-to-select-stage affordance. Pass `cohort` (an object).
 *
 * Profile mode props:
 *   funnel    : computeFunnelStage() output - { stages, currentStage, completed,
 *               health, daysInStage, lostReason }
 *   tierColor : tier accent colour for completed dots (default Forest Olive).
 *
 * Cohort mode props:
 *   cohort.stages         : ordered array of stage keys, e.g. FUNNEL_STAGES[type]
 *   cohort.counts         : map of stage key -> count
 *   cohort.conversionRates: map of stage key -> percent string (rendered above pairs)
 *   cohort.selectedStage  : optional key of the currently-selected stage
 *   cohort.onSelectStage  : optional click handler (stage) => void; when provided,
 *                           dots become buttons.
 *
 * CSS lives in src/pages/admin/dashboard/index.astro under .lp-funnel*.
 */

import { FUNNEL_LABELS, HEALTH_COLORS } from "../constants.js";

const DEFAULT_TIER_COLOR = "#2E4009"; // Forest Olive

export default function FunnelTrack({ funnel, tierColor, cohort }) {
  if (cohort) return <CohortTrack cohort={cohort} tierColor={tierColor || DEFAULT_TIER_COLOR} />;
  return <ProfileTrack funnel={funnel} tierColor={tierColor || DEFAULT_TIER_COLOR} />;
}

/* ── Profile mode ── (extracted verbatim from LeadProfile.jsx 2026-04-28) ── */

function ProfileTrack({ funnel, tierColor }) {
  const tc = { color: tierColor };
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

/* ── Cohort mode ── (used by PipelineView for stage-count overview) ── */

function CohortTrack({ cohort, tierColor }) {
  const { stages, counts, conversionRates = {}, selectedStage, onSelectStage } = cohort;

  return (
    <div className="lp-funnel lp-funnel--cohort">
      {stages.map((stageKey, i) => {
        const count = counts[stageKey] || 0;
        const isSelected = selectedStage === stageKey;
        const isClickable = !!onSelectStage;
        const isEmpty = count === 0;
        const conv = i > 0 ? conversionRates[stageKey] : null;

        const dotStyle = isEmpty
          ? { background: "rgba(64,22,12,0.14)", borderColor: "rgba(64,22,12,0.14)" }
          : { background: tierColor, borderColor: tierColor };

        const stepClass = [
          "lp-funnel__step",
          "lp-funnel__step--cohort",
          isSelected ? "lp-funnel__step--selected" : "",
          isEmpty ? "lp-funnel__step--empty" : "",
          isClickable ? "lp-funnel__step--clickable" : "",
        ].filter(Boolean).join(" ");

        const inner = (
          <>
            {i > 0 && <div className="lp-funnel__line" style={{ background: tierColor, opacity: 0.45 }} />}
            {conv != null && (
              <span className="lp-funnel__conv">{conv}%</span>
            )}
            <div className="lp-funnel__dot" style={dotStyle} />
            <span className="lp-funnel__count">{count}</span>
            <span className="lp-funnel__label">{FUNNEL_LABELS[stageKey]}</span>
          </>
        );

        if (isClickable) {
          return (
            <button
              key={stageKey}
              type="button"
              className={stepClass}
              onClick={() => onSelectStage(isSelected ? null : stageKey)}
            >
              {inner}
            </button>
          );
        }
        return <div key={stageKey} className={stepClass}>{inner}</div>;
      })}
    </div>
  );
}
