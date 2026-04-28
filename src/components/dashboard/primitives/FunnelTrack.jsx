/**
 * FunnelTrack - horizontal funnel-stage progression with completed / current / future dots.
 *
 * Renders the "lead's path through the funnel" as a row of stage dots connected by lines.
 * Used on the lead profile (per-lead view) and the Pipeline tab (cohort view).
 *
 * Props:
 *   funnel    : computeFunnelStage() output - { stages, currentStage, completed,
 *               health, daysInStage, lostReason }
 *   tierColor : tier accent colour for done dots (typically TIER_CONFIG[tier].color
 *               on a per-lead view; defaults to Forest Olive for cohort views).
 *
 * CSS lives in src/pages/admin/dashboard/index.astro under .lp-funnel*. Class names
 * preserved so the cascade resolves identically after the extraction.
 *
 * Extracted from LeadProfile.jsx 2026-04-28 to enable reuse on PipelineView.jsx.
 */

import { FUNNEL_LABELS, HEALTH_COLORS } from "../constants.js";

const DEFAULT_TIER_COLOR = "#2E4009"; // Forest Olive

export default function FunnelTrack({ funnel, tierColor }) {
  const tc = { color: tierColor || DEFAULT_TIER_COLOR };
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
