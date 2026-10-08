---
name: Adaptive Command
colors:
  surface: '#111415'
  surface-dim: '#111415'
  surface-bright: '#373a3b'
  surface-container-lowest: '#0c0f10'
  surface-container-low: '#191c1d'
  surface-container: '#1d2021'
  surface-container-high: '#272a2b'
  surface-container-highest: '#323536'
  on-surface: '#e1e3e4'
  on-surface-variant: '#b9ccb5'
  inverse-surface: '#e1e3e4'
  inverse-on-surface: '#2e3132'
  outline: '#849581'
  outline-variant: '#3b4b3a'
  surface-tint: '#00e55b'
  primary: '#edffe8'
  on-primary: '#003911'
  primary-container: '#00ff66'
  on-primary-container: '#007128'
  inverse-primary: '#006e27'
  secondary: '#ffbd58'
  on-secondary: '#442b00'
  secondary-container: '#ea9f00'
  on-secondary-container: '#5b3b00'
  tertiary: '#fcf8ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#dbdaff'
  on-tertiary-container: '#4c4ed9'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6bff83'
  primary-fixed-dim: '#00e55b'
  on-primary-fixed: '#002107'
  on-primary-fixed-variant: '#00531b'
  secondary-fixed: '#ffddb1'
  secondary-fixed-dim: '#ffba4b'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#624000'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#111415'
  on-background: '#e1e3e4'
  surface-variant: '#323536'
typography:
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: '0'
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.02em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-lg: 1.5rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes an adaptive dual-state environment engineered for operators navigating between accessible everyday task orchestration and high-density, low-latency telemetry work. 

The system transitions across two operational identities:
- **Casual Mode:** Soft modern minimalism infused with approachable tactile qualities. It creates a calm, supportive workspace using generous whitespace, pill-like contours, subtle tinted shadows, and warm pastel undertones that lower cognitive friction.
- **Pro Mode:** Technical brutalism fused with terminal precision. Designed for maximum information density, it shifts to deep void grays, razor-sharp geometry, high-contrast neon data points, and monospaced telemetry readouts reminiscent of industrial mission-control software.

The unified experience balances immediate ergonomics with elite workflow velocity, letting the operator dictate visual tension and signal density on demand.

## Colors

The system uses a contextual variable architecture to toggle cleanly between operational modes while retaining core semantic meanings.

### Pro Mode (Default / Active Focus)
- **Primary (`#00FF66`):** Phosphor Neon Green. Primary actions, healthy system pulses, affirmative metrics, and execution triggers.
- **Secondary (`#FFB020`):** Electric Amber. Alert levels, active session highlights, warnings, and latency monitors.
- **Tertiary (`#6366F1`):** Electric Indigo. Auxiliary network nodes, external routing signals, and system telemetry markers.
- **Neutral (`#0A0D0E`):** Pitch Carbon. Ground canvas backed by layered tiered tones: `#121619` (Surfaces), `#1C2327` (Card / Panel fills), and `#2B363C` (Borders and dividers).
- **Text & Foreground:** High-luminance crisp white (`#F4F6F8`) for primary data, `#8B9DA8` for low-priority telemetry labels.

### Casual Mode (Soft Alternative)
- When switched to Casual Mode, color assignments pivot to a daylight-balanced palette:
  - **Canvas & Surface:** Light warm cream `#F8FAFC` canvas with `#FFFFFF` floating cards.
  - **Primary:** Mint Pastel `#10B981` (balanced for accessibility on light grounds).
  - **Secondary:** Warm Ochre `#F59E0B`.
  - **Tertiary & Accents:** Soft Iris `#818CF8` and Soft Rose `#FDA4AF`.
  - **Neutral & Text:** Rich Slate `#0F172A` body text with `#64748B` supporting labels and subtle `#E2E8F0` hairline borders.

## Typography

The typographic hierarchy bridges structured data density and expressive human factors:
- **Headlines (`Space Grotesk`):** Delivers a technical, engineered character with geometric clarity that grounds dashboard zones and large numerical indices.
- **Body & Continuous Copy (`Plus Jakarta Sans`):** Provides approachable readability, wide apertures, and humanist touches, keeping descriptive text ergonomic and legible during sustained sessions.
- **Metadata, Counters, & Telemetry (`JetBrains Mono`):** Enforces tabular alignment, zero-ambiguity character differentiation (e.g., `0` vs `O`, `1` vs `l`), and an authentic terminal texture across status tags, code snippets, timestamps, and parameters.

In Pro Mode, labels default to uppercase tracking (`letter-spacing: 0.08em`) to enforce military-spec hierarchy. In Casual Mode, headline weights soften slightly, and labels switch to sentence case with reduced letter-spacing.

## Layout & Spacing

The system runs on an adaptable 12-column responsive grid with a strict 4px/8px incremental spatial cadence.

### Grid & Structure
- **Desktop (>= 1280px):** 12-column layout with `2.5rem` outer margins and `1.5rem` gutters. Accommodates multi-split command consoles, side-by-side terminal logs, and live telemetry feeds.
- **Tablet (768px - 1279px):** 8-column layout with `1.5rem` outer margins and `1rem` gutters. Peripheral sidebars collapse into utility drawers.
- **Mobile (< 768px):** 4-column layout with `1rem` outer margins and `0.5rem` to `1rem` gutters. Multi-column metric sets reflow into single-column vertical telemetry stacks.

### Density Modulation
- **Pro Mode Density:** Gaps compress toward `space-xs` and `space-sm` inside component containers to maximize screen real estate and data visibility per square inch.
- **Casual Mode Density:** Gaps expand toward `space-md` and `space-lg` to create breathing room, relaxation, and intuitive tactile touch targets.

## Elevation & Depth

Visual hierarchy diverges intentionally between the two system modes:

### Pro Mode: Low-Contrast Tonal Stacking & Laser Accents
- No diffuse, blurry drop shadows.
- Depth is achieved exclusively through 3-tier background elevation:
  - Base: `#0A0D0E`
  - Layer 1 (Containers/Panels): `#121619` with a 1px solid border (`#2B363C`)
  - Layer 2 (Floating Popovers/Modals): `#1A2126` with a 1px active phosphor border (`#00FF6640`)
- Hover states initiate an immediate inner outline stroke or high-contrast 1px neon line-glow (`box-shadow: 0 0 10px rgba(0, 255, 102, 0.25)`).

### Casual Mode: Ambient Warm Diffusion & Tonal Layers
- Layering relies on clean white surface containers on a soft warm-gray canvas (`#F8FAFC`).
- Elevation levels use ultra-diffused, multi-layered shadows tinted with slate:
  - Low (Cards, Buttons): `0 2px 8px -2px rgba(15, 23, 42, 0.04), 0 4px 12px -2px rgba(15, 23, 42, 0.03)`
  - High (Dialogs, Overlays): `0 12px 32px -4px rgba(15, 23, 42, 0.08), 0 4px 16px -2px rgba(15, 23, 42, 0.04)`
- Borders remain muted (`#E2E8F0`) with zero harsh glows.

## Shapes

The design system establishes a dynamic shape bridge calibrated at foundational base level 1 (Soft):

- **Pro Mode Overrides:** System corner radii collapse toward sharp discipline (`0px` to `2px` maximum). Cards, status chips, data grids, and button edges use crisp, square edges or cut-corner bevels (`clip-path: polygon(...)`) to emphasize technical precision.
- **Casual Mode Overrides:** System components inherit soft, friendly curvature. Buttons shift to pill contours (`9999px` or `rounded-xl`), cards expand to `1rem` (`16px`) corners, and input containers use smooth organic boundaries that soften the screen.

## Components

### Buttons
- **Pro Mode:** Sharp corners (`0px`), monospaced text (`label-md`), uppercase. Primary button features a solid `#00FF66` fill with jet-black `#0A0D0E` text. Ghost buttons use a 1px hairline border with neon-green text that inverts on hover.
- **Casual Mode:** Rounded pill (`9999px`), bold sans-serif text (`Plus Jakarta Sans`), subtle lift on hover via ambient shadow. Primary button features a soft mint or deep slate fill with white text.

### Chips & Badges
- **Pro Mode:** Monospaced tags enclosed in brackets or sharp-bordered frames (`[ LIVE ]`, `[ ERR: 502 ]`). Background is translucent black with high-visibility amber or green text and an accompanying blinking dot indicator.
- **Casual Mode:** Pastel pills with soft background tints (e.g., `#ECFDF5` background with `#065F46` label). Friendly rounded icons accompany the label.

### Cards & Panels
- **Pro Mode:** Modular terminal tiles. 1px borders in `#2B363C`. Optional top-corner technical breadcrumbs (`SYS.MOD.01 // METRICS`). Header sections separated by a razor-thin 1px horizontal rule. Zero backdrop blur.
- **Casual Mode:** Clean floating cards with 16px corner radii, seamless borderless drops, or delicate gray outlines. Generous internal padding (`space-lg`).

### Input Fields
- **Pro Mode:** Monospaced input text with an active block cursor (`█`). Dark surface (`#121619`) with sharp borders. Focus state activates an instantaneous `#00FF66` border stroke without transition smoothing.
- **Casual Mode:** Smooth, rounded inputs (`0.5rem` radius) on `#FFFFFF`. Focus triggers an ambient indigo or emerald focus ring with smooth 150ms ease transitions.

### Checkboxes & Switches
- **Pro Mode:** Mechanical toggles. Checkboxes are sharp squares displaying an ASCII cross (`X`) or solid square mark when active. Switches resemble tactile bi-stable hardware toggles with instant state snapping.
- **Casual Mode:** Smooth organic toggles with gentle sliding animations and friendly rounded check ticks.

### Command HUD / Mode Switcher (Specialized Component)
- A persistent floating utility bar allowing seamless visual morphing between Casual and Pro modes. Features a bi-state tactile rocker button displaying icon cues (`Sun / Casual` vs `Terminal / Pro`). Switching modes applies a CSS theme swap affecting token variables for radius, surface color, font role weighting, and border-sharpness across all mounted dashboard components.