/**
 * AttributeRow - K:V data row used in event details, contact details and
 * any other "label left, value right" attribute list on the dashboard.
 *
 * Props:
 *   label      string           left column copy
 *   value      ReactNode        right column content (string, link, badge)
 *   empty      boolean          render value as italic muted "Not provided"
 *                               look (uses .lp-attr-row__value--empty).
 *   valueClass string           extra className on the value span
 *
 * Visual: hairline divider beneath, 9px vertical padding.
 * Label: DM Sans 11px Brewery Dark @ 60%.
 * Value: DM Sans 11px 500 Brewery Dark, right-aligned, tabular-nums.
 */

export default function AttributeRow({ label, value, empty = false, valueClass = "" }) {
  const cls = "lp-attr-row__value"
    + (empty ? " lp-attr-row__value--empty" : "")
    + (valueClass ? ` ${valueClass}` : "");
  return (
    <div className="lp-attr-row">
      <span className="lp-attr-row__label">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}
