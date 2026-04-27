/**
 * ScoreRing - Circular SVG ring showing a lead's score (0-100) with the
 * tier label inside. Two variants:
 *   size="lg" → 96px ring (legacy body usage)
 *   size="sm" → 64px ring (metadata strip cell 1)
 *
 * Props:
 *   score      number  0-100
 *   tierLabel  string  e.g. "Hot", "Warm", "Won", "Lost"
 *   tierColor  string  CSS colour for the tier label inside the ring
 *   size       "sm" | "lg"
 *
 * Also exports `resolveRingDisplay(sc, lead, funnel)` - the helper that
 * applies Won/Lost short-circuits and resolves tier colour from the
 * scored result. Lives here so any caller (LeadProfile, future header
 * widgets, etc.) can use the same logic.
 */

import { TIER_CONFIG } from "../constants.js";

const TIER_RING_COLORS = {
  hot:  "#2E4009",            // Forest Olive (best leads - traffic-light green)
  warm: "#BF7256",            // Dusty Coral
  cool: "#8C472E",            // Fired Brick (cooling off - traffic-light red/brown)
  cold: "#40160C",            // Mahogany (dying/dead)
};

export function resolveRingDisplay(sc, lead, funnel) {
  let ringScore = sc.score;
  let ringTierLabel = (TIER_CONFIG[sc.tier] && TIER_CONFIG[sc.tier].label) || "Cool";
  let ringTierColor = TIER_RING_COLORS[sc.tier] || TIER_RING_COLORS.cool;

  const isWon = lead.contact_type === "customer" || (funnel && funnel.currentStage === "won");
  const isLost = funnel && funnel.currentStage === "lost";
  if (isWon) {
    ringScore = 100;
    ringTierLabel = "Won";
    ringTierColor = "#2E4009";
  } else if (isLost) {
    ringTierLabel = "Lost";
    ringTierColor = "rgba(64,22,12,0.6)";
  }
  return { score: ringScore, tierLabel: ringTierLabel, tierColor: ringTierColor };
}

export default function ScoreRing({ score, tierLabel, tierColor, size = "lg" }) {
  const isSm = size === "sm";
  const dim = isSm ? 64 : 96;
  const center = dim / 2;
  const stroke = isSm ? 5 : 6;
  const radius = isSm ? 27 : 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const cls = isSm ? "lp-score-ring lp-score-ring--sm" : "lp-score-ring";
  return (
    <div className={cls}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(64,22,12,0.12)" strokeWidth={stroke} />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          stroke="#2E4009" strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
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
