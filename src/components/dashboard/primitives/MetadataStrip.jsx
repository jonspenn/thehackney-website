/**
 * MetadataStrip + MetadataCell - 4-column metadata band beneath an identity
 * strip. Renders eyebrow above value with tight vertical rhythm.
 *
 * MetadataStrip props:
 *   children  ReactNode  4 MetadataCell children (the .lp-meta-strip grid)
 *
 * MetadataCell props:
 *   eyebrow  string     small uppercased coral label
 *   children ReactNode  cell value content (string, ScoreRing, etc.)
 *   align    "start" | "center"  reserved (currently centre via parent grid)
 *   variant  "default" | "ring"  applies .lp-meta-cell--ring for the score
 *                                 ring cell (tighter gap, flex-start align).
 *
 * Visual: 4-col grid, 2 explicit rows (eyebrow row + 64px content row),
 * 24px/32px padding. Cells use display:contents so eyebrow + value become
 * direct grid children of the strip - this is what aligns all 4 eyebrows
 * to a shared top baseline regardless of the score ring's height.
 * Eyebrow: DM Sans 10px 500 uppercase tracking 0.13em Dusty Coral.
 * Value: DM Sans 16px 500 Brewery Dark, vertically centred against the ring.
 */

export function MetadataStrip({ children }) {
  return <div className="lp-meta-strip">{children}</div>;
}

export function MetadataCell({ eyebrow, children, align = "start", variant = "default" }) {
  void align;
  const cls = variant === "ring"
    ? "lp-meta-cell lp-meta-cell--ring"
    : "lp-meta-cell";
  return (
    <div className={cls}>
      <span className="lp-meta-cell__eyebrow">{eyebrow}</span>
      {children}
    </div>
  );
}

export default MetadataStrip;
