/**
 * CardSurface - Standard "this is a card on the dashboard" wrapper. Applies
 * the lp-card chrome (rgba white-tint bg, Mahogany 10% border, 8px corners).
 *
 * Props:
 *   as        "section" | "div"     element to render. Default "div".
 *   variant   "default" | "header" | "funnel" | "event" | "score" |
 *             "activity" | "timeline"
 *             Maps to the existing .lp-card--{variant} class. Variants are
 *             currently identification-only (no CSS delta) but kept on the
 *             API so future per-variant rules don't require refactors.
 *   children  ReactNode
 *   className string?              extra class merged after the variant
 *
 * Visual: rgba(255,255,255,0.7) bg, 1px rgba(64,22,12,0.10) border, 8px
 *   border-radius, overflow hidden.
 */

export default function CardSurface({
  as: Component = "div",
  variant = "default",
  children,
  className = "",
}) {
  const variantClass = variant === "default" ? "" : `lp-card--${variant}`;
  const cls = ["lp-card", variantClass, className].filter(Boolean).join(" ");
  return <Component className={cls}>{children}</Component>;
}
