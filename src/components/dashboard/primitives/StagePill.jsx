/**
 * StagePill - Soft-tint pill rendered next to a lead's name showing
 * the current funnel stage. Stage-tier colours come from STAGE_PILL_COLORS
 * in constants.js.
 *
 * Props:
 *   stage  string  funnel stage key (e.g. "lead", "qualified", "tour", ...)
 *   label  string? override label text (defaults to FUNNEL_LABELS[stage])
 *   size   "sm" | "md"  reserved (no current visual delta - same height
 *                       in v1; future-proofs nested usage like ScoreRing).
 *
 * Visual: 22px tall, 2px radius, DM Sans 11px 500 uppercase tracking 0.04em.
 * Background and text colour come from STAGE_PILL_COLORS[stage] (or .lead).
 */

import { STAGE_PILL_COLORS, FUNNEL_LABELS } from "../constants.js";

export default function StagePill({ stage, label, size = "md" }) {
  const cfg = STAGE_PILL_COLORS[stage] || STAGE_PILL_COLORS.lead;
  const text = (label !== undefined ? label : (FUNNEL_LABELS[stage] || stage || "")).toUpperCase();
  if (!text) return null;
  /* size kept on the API for future variants - className stays the same so
   * the existing CSS resolves identically. */
  void size;
  return (
    <span className="lp-stage-pill" style={{ background: cfg.bg, color: cfg.color }}>
      {text}
    </span>
  );
}
