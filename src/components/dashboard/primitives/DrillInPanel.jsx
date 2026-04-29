/**
 * DrillInPanel - card panel that opens below a click target with a
 * standard eyebrow + Cormorant headline + close button header, then
 * renders whatever children the consumer provides as the body.
 *
 * Used for click-to-drill patterns across the dashboard:
 *   BookingsView    Click a month cell -> per-deal breakdown
 *   AttributionView Click a platform row -> per-campaign breakdown
 *
 * NOT used for:
 *   PipelineView    Click a stage -> inline lead-table drill (different shape)
 *   DateDetailDrawer  Slide-out drawer (different shape)
 *   LeadProfile     Full timeline toggle (different shape)
 *
 * Renders the shared `.lp-drill-card` chrome (defined in
 * src/pages/admin/dashboard/index.astro). Consumers compose their own
 * table / empty state / footer inside `children`.
 *
 * Props:
 *   eyebrow    string. Uppercase letter-spaced eyebrow above the title
 *              (e.g. "Drill-in · MARCH 2026" or "DRILL-IN · GOOGLE ADS").
 *   title      ReactNode. Cormorant 22px headline. Pass a string for a
 *              simple title, or a fragment when the title needs a
 *              sub-line ("£79,000 from 12 deals").
 *   onClose    function. Called when the close button is clicked.
 *   className  extra classes appended to the wrapper. Use this for
 *              tab-specific bottom margins or table widths.
 *   children   ReactNode. Body content.
 */
export default function DrillInPanel({
  eyebrow,
  title,
  onClose,
  className = "",
  children,
}) {
  const cls = ["lp-card", "lp-drill-card", className].filter(Boolean).join(" ");
  return (
    <section className={cls}>
      <div className="lp-drill-card__header">
        <div className="lp-drill-card__title-wrap">
          {eyebrow && <span className="lp-meta-cell__eyebrow">{eyebrow}</span>}
          <h3 className="lp-drill-card__title">{title}</h3>
        </div>
        <button
          type="button"
          className="lp-drill-card__close"
          onClick={onClose}
          title="Close drill-in"
          aria-label="Close drill-in"
        >×</button>
      </div>
      {children}
    </section>
  );
}
