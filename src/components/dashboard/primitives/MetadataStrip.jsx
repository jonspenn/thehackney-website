/**
 * MetadataStrip + MetadataCell - metadata band beneath an identity strip.
 * Renders eyebrow above value with tight vertical rhythm.
 *
 * MetadataStrip props:
 *   children  ReactNode  MetadataCell children (the .lp-meta-strip flex row)
 *
 * MetadataCell props:
 *   eyebrow  string     small uppercased coral label
 *   children ReactNode  cell value content (string, ScoreRing, etc.)
 *   align    "start" | "center"  reserved (currently centre via content area)
 *   variant  "default" | "ring"  applies .lp-meta-cell--ring for the score
 *                                 ring cell (top-aligns the ring inside the
 *                                 content area).
 *
 * Visual: flex row, left-packed. Cells size to content with a 140px min-width
 * floor and 40px gap; the right side stays open so future cells (engagement %,
 * owner, days-in-system, etc.) can be appended without restructuring.
 * Each cell is itself a flex column: eyebrow on top, then a content area
 * with min-height 64px (matches the score ring) so values vertically centre
 * against the ring across all cells.
 * Eyebrow: DM Sans 10px 500 uppercase tracking 0.13em Dusty Coral.
 * Value: DM Sans 16px 500 Brewery Dark, vertically centred in the content area.
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
      <div className="lp-meta-cell__content">{children}</div>
    </div>
  );
}

export default MetadataStrip;
