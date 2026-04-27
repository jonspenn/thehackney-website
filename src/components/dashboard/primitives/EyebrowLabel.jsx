/**
 * EyebrowLabel - Small uppercase tracked label used above values, section
 * headings, body columns, etc. Centralises the "eyebrow" pattern (Dusty
 * Coral by default, optional muted variant).
 *
 * Props:
 *   children  ReactNode
 *   color     "coral" | "muted"  default "coral"
 *   size      "sm" | "md"        sm = 9.5-10px, md = 11px
 *   as        string             defaults to "span"
 *   className string             extra class to add (no replacement)
 *
 * Visual: DM Sans 500 uppercase, letter-spacing 0.13em (md) / 0.14em (sm).
 *   coral → #BF7256
 *   muted → rgba(44,24,16,0.5)
 */

export default function EyebrowLabel({
  children,
  color = "coral",
  size = "md",
  as: Component = "span",
  className = "",
}) {
  const fontSize = size === "sm" ? "9.5px" : "11px";
  const tracking = size === "sm" ? "0.14em" : "0.13em";
  const colour = color === "muted" ? "rgba(44,24,16,0.5)" : "#BF7256";
  return (
    <Component
      className={className}
      style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: tracking,
        color: colour,
        lineHeight: 1.2,
      }}
    >
      {children}
    </Component>
  );
}
