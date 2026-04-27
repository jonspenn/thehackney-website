---
name: The Hackney - Industrial Romance
description: Machine-readable design tokens for thehackney.co. Source of truth is src/styles/global.css; this file mirrors those tokens in YAML for design agents (Stitch, Lovable, Figma Make, future Claude sessions). Validated in CI by scripts/validate-design-tokens.mjs.
last-updated: 2026-04-27

colors:
  # Core palette
  warm-canvas: "#F5F0E8"      # Background - never pure white
  brewery-dark: "#2C1810"     # Primary text, dark sections
  forest-olive: "#2E4009"     # Primary accent on light, CTA hover
  fired-brick: "#8C472E"      # Warm highlight, quote text
  dusty-coral: "#BF7256"      # Eyebrows, links, accent text
  mid-olive: "#49590E"        # CTA fill on ALL backgrounds
  mahogany: "#40160C"         # Depth - borders, shadows only
  signal-green: "#28A745"     # Success states only

  # Semantic roles (alias the core palette)
  background: "#F5F0E8"       # warm-canvas
  text: "#2C1810"             # brewery-dark
  cta-fill: "#49590E"         # mid-olive (light AND dark backgrounds)
  cta-hover: "#2E4009"        # forest-olive
  eyebrow: "#BF7256"          # dusty-coral
  link: "#2E4009"             # forest-olive
  quote: "#8C472E"            # fired-brick

  # Banned (CI fails if any of these appear in global.css)
  banned:
    - "#9A0053"   # old magenta
    - "#D1CAAF"   # old beige
    - "#2D1E40"   # old plum
    - "#B87333"   # copper
    - "#7A8B6F"   # sage

typography:
  heading:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontWeight: 600
    letterSpacing: "-0.01em"
    case: "title-or-sentence"   # never uppercase
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "16px"
    lineHeight: 1.65
  eyebrow:
    fontFamily: "DM Sans"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.15em"
    case: "uppercase"           # only place uppercase is allowed
  scale:
    h1: "clamp(2.625rem, 6vw, 4.5rem)"
    h2: "clamp(1.875rem, 4vw, 2.75rem)"
    h3: "clamp(1.375rem, 2.5vw, 1.75rem)"
    h4: "1.125rem"
  banned-fonts:
    - League Spartan
    - Glacial Indifference
    - Barlow
    - Poppins
    - Lora

spacing:
  xs: "0.25rem"               # 4px
  sm: "0.5rem"                # 8px
  md: "1rem"                  # 16px
  lg: "2rem"                  # 32px
  xl: "4rem"                  # 64px
  2xl: "6rem"                 # 96px
  section: "4.5rem"           # 72px - standard sections
  section-compact: "3rem"     # 48px - proof bars, cross-sells, FAQs

layout:
  max-width: "1200px"
  header-height: "96px"

cards:
  # Public site cards (default - applies to thehackney.co marketing pages)
  background: "rgba(255, 255, 255, 0.3)"
  border-color: "rgba(44, 24, 16, 0.04)"
  border-color-hover: "rgba(44, 24, 16, 0.1)"
  radius: "2px"
  padding-x: "2rem"
  padding-y: "1rem"
  shadow-hover: "0 4px 16px rgba(64, 22, 12, 0.08)"
  # Dashboard cards (internal admin at /admin/* - softer language than the public site)
  radius-dashboard: "8px"
  border-color-dashboard: "rgba(64, 22, 12, 0.10)"

buttons:
  radius: "2px"
  padding: "0.875rem 1.75rem"
  font-size: "0.8125rem"
  font-weight: 500
  letter-spacing: "0.05em"
  case: "uppercase"
---

# The Hackney Design System (DESIGN.md)

A wedding and events venue in a converted 1856 brewery on Hackney Road. This file is the agent-readable counterpart to the human-facing `BRAND_GUIDE.md` (in the Drive folder). The YAML front matter above carries every visual token in machine-readable form so design tools (Stitch, Lovable, Figma Make, future Claude sessions) can ingest the brand deterministically without parsing prose.

**Three artifacts, three jobs, all must agree:**

1. **`src/styles/global.css`** - the live implementation. CSS custom properties power every page on thehackney.co. This is the canonical source.
2. **`DESIGN.md`** (this file) - machine-readable mirror of those tokens. Validated against `global.css` in CI via `scripts/validate-design-tokens.mjs` on every push to `main`.
3. **`reference/BRAND_GUIDE.md`** (Drive folder, not in repo) - the human voice + rationale document. Tone, copy rules, do's and don'ts in prose, full strategic context.

If a token changes in `global.css`, this file must be updated in the same commit. If they drift, CI fails and the deploy is blocked.

## Philosophy

The venue is the constant. The occasion changes. The design feels romantic, warm, considered, and confident, never sleek or corporate. Industrial bones with floral softness.

## Colours

Industrial Romance palette. Warm earth tones. Never sleek tech.

- **Warm Canvas** (#F5F0E8) - Background. Never use pure white anywhere on the site.
- **Brewery Dark** (#2C1810) - Primary text on light backgrounds, dark hero sections, footer.
- **Forest Olive** (#2E4009) - Primary accent on light backgrounds, CTA hover state, link colour.
- **Mid Olive** (#49590E) - CTA fill colour. Used on light AND dark backgrounds. Green is the action signal everywhere.
- **Fired Brick** (#8C472E) - Quote text, warm highlights, secondary buttons. Never fills a primary CTA. Never used as a section background.
- **Dusty Coral** (#BF7256) - Eyebrow labels, links, accent text. Never fills a CTA button.
- **Mahogany** (#40160C) - Depth only. Borders, shadows. Never used as text or fill.
- **Signal Green** (#28A745) - Success states only. Not a brand colour for general use.

## Typography

- **Headings**: Cormorant Garamond (serif), weight 600, letter-spacing -0.01em. Title or sentence case. Never uppercase.
- **Body**: DM Sans, weight 400, 16px, line-height 1.65. Optimised for long-form readability.
- **Eyebrow labels and nav**: DM Sans uppercase, 12px, letter-spacing 0.15em, weight 500. Only place uppercase is permitted in the system.

## Components

### Buttons (CTAs)

Primary: Mid Olive fill, Warm Canvas text, 2px radius, uppercase label, DM Sans 13px, letter-spacing 0.05em, padding 0.875rem 1.75rem.

Hover: shifts to Forest Olive fill (darker green). Same colour scheme on light and dark backgrounds.

Coral and Fired Brick never fill a CTA button.

One CTA per section, always.

### Cards

**Public site cards** (default): 2px radius (sharp/architectural, not rounded). Translucent white background (30% opacity over the page background). 32px horizontal padding, 16px vertical. Soft mahogany-tinted hover shadow.

All public-site cards consume the `--card-*` CSS custom properties (declared in `:root` of `global.css`). Never hardcode card chrome on individual components.

**Dashboard cards** (`/admin/*` only): 8px radius, Mahogany 10% border (`rgba(64, 22, 12, 0.10)`). The internal admin dashboard is its own visual language - softer corners read as a tooling surface rather than a customer-facing marketing page. The 2px sharp rule was a public-site decision; carrying it into the dashboard makes Stitch-derived layouts feel rigid where they should feel like an interface to work in.

Dashboard card chrome is currently inlined in `src/pages/admin/dashboard/index.astro` rather than tokenised, because the dashboard CSS is page-scoped. If the dashboard grows to multiple Astro pages, lift these into their own `--dashboard-card-*` tokens.

Pills, buttons, and small UI elements stay at 2px on both surfaces - the radius bump is for big content containers only.

## Do's and Don'ts

- **Do** use Mid Olive for every CTA, on every background, light or dark.
- **Do** keep one CTA per section.
- **Do** maintain Warm Canvas (#F5F0E8) as the page background. No pure white.
- **Do** use Cormorant Garamond title or sentence case for headings.
- **Don't** use uppercase on headings (only eyebrow labels and nav use uppercase).
- **Don't** use em dashes anywhere in copy. Spaced hyphens or rephrase.
- **Don't** use the old palette (#9A0053 magenta, #D1CAAF beige, #2D1E40 plum) anywhere - the validator will fail the build.
- **Don't** put coral or fired-brick fills inside a button.
- **Don't** introduce new colours without updating this file AND `global.css` in the same commit.

## Validation

CI runs `node scripts/validate-design-tokens.mjs` on every push. The validator:

1. Parses every `--token: value;` declaration in `:root` of `src/styles/global.css`.
2. Confirms every hex colour value resolved from those tokens appears at least once in DESIGN.md.
3. Confirms no banned colour (listed in `colors.banned` above) appears in `global.css.

Build fails if any check fails. Run locally with `node scripts/validate-design-tokens.mjs`.

## See also

- `BRAND_GUIDE.md` (in the Drive folder, not in this repo) - voice, copy rules, full brand rationale.
- `sales & marketing/website/page-design-reference.md` (Drive) - per-template block sequences, component library.
- `sales & marketing/website/tech-stack.md` (Drive) - how the site is built, deploy pipeline.
