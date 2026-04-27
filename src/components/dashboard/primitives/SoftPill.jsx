/**
 * SoftPill - Generic soft-tint status pill. Sibling of StagePill but
 * variant-driven rather than data-driven, so it can be used for stuck-stage
 * indicators, source pills, generic status flags, etc.
 *
 * Props:
 *   variant  "olive" | "coral" | "brick" | "muted" | "warning"
 *   children ReactNode  pill text
 *   dot      boolean    leading 6px coloured dot in the variant colour
 *
 * Variants:
 *   olive   → Forest Olive 18% bg, Forest Olive text
 *   coral   → Dusty Coral 18% bg, Mahogany text
 *   brick   → Fired Brick 18% bg, Mahogany 85% text (matches lp-stage-stuck)
 *   muted   → Mahogany 14% bg, Mahogany 60% text
 *   warning → Fired Brick 18% bg, Mahogany 80% text + Mahogany border
 *
 * Visual: 22px tall, 2px radius, DM Sans 11px 500.
 */

const VARIANTS = {
  olive:   { bg: "rgba(46,64,9,0.18)",   color: "#2E4009",            border: "transparent",         dot: "#2E4009" },
  coral:   { bg: "rgba(191,114,86,0.18)", color: "rgba(64,22,12,0.85)", border: "transparent",         dot: "#BF7256" },
  brick:   { bg: "rgba(140,71,46,0.18)",  color: "#5C2E1F",             border: "rgba(140,71,46,0.28)", dot: "#8C472E" },
  muted:   { bg: "rgba(64,22,12,0.14)",   color: "rgba(64,22,12,0.6)",  border: "transparent",         dot: "rgba(64,22,12,0.5)" },
  warning: { bg: "rgba(140,71,46,0.18)",  color: "#5C2E1F",             border: "rgba(140,71,46,0.28)", dot: "#8C472E" },
};

export default function SoftPill({ variant = "muted", children, dot = false }) {
  const v = VARIANTS[variant] || VARIANTS.muted;
  return (
    <span
      className="lp-soft-pill"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 22,
        padding: "0 9px",
        borderRadius: 2,
        background: v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: v.dot, flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  );
}
