---
name: DriveLock Industrial Safety
colors:
  surface: '#051424'
  surface-dim: '#051424'
  surface-bright: '#2c3a4c'
  surface-container-lowest: '#010f1f'
  surface-container-low: '#0d1c2d'
  surface-container: '#122131'
  surface-container-high: '#1c2b3c'
  surface-container-highest: '#273647'
  on-surface: '#d4e4fa'
  on-surface-variant: '#d8c3ad'
  inverse-surface: '#d4e4fa'
  inverse-on-surface: '#233143'
  outline: '#a08e7a'
  outline-variant: '#534434'
  surface-tint: '#ffb95f'
  primary: '#ffc174'
  on-primary: '#472a00'
  primary-container: '#f59e0b'
  on-primary-container: '#613b00'
  inverse-primary: '#855300'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffbcb7'
  on-tertiary: '#68000a'
  tertiary-container: '#ff938c'
  on-tertiary-container: '#8d0012'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffddb8'
  primary-fixed-dim: '#ffb95f'
  on-primary-fixed: '#2a1700'
  on-primary-fixed-variant: '#653e00'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#051424'
  on-background: '#d4e4fa'
  surface-variant: '#273647'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: 0em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: 0em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 26px
    letterSpacing: 0em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-telemetry:
    fontFamily: JetBrains Mono
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: 0.05em
  label-status:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.08em
  label-caption:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system is engineered specifically for mission-critical in-cab environments across commercial fleets, transit buses, cabs, and auto-rickshaws. The operating reality involves intense glare, vibration, harsh sunlight, pitch-black night shifts, one-handed operation, and gloved or calloused hands. The visual direction balances automotive-grade functional minimalism with high-contrast industrial instrumentation and Android Material You ergonomics.

The emotional tone is authoritative, fail-safe, unyielding, and calm under operational stress. Every element prioritizes immediate situational awareness over ornamental decoration. Rather than consumer-grade gloss, the interface behaves like dedicated cab hardware—combining high-legibility telemetry displays, unequivocal status annunciators, and tactile physical affordances.

## Colors

The palette operates on high-contrast industrial color coding rooted in automotive standards:

- **Deep Carbon Foundation (`#0D1117`, `#161B22`, `#21262D`)**: Ultra-deep matte dark surfaces reduce OLED battery consumption, prevent night blindness, and eliminate windshield reflections while maximizing contrast against status indicators.
- **Warning Amber / Ignition Lock Alert (`#F59E0B`, secondary accent `#D97706`)**: Denotes caution, immobilizer active, phone unlocked while in transit, or restricted drive mode. Serves as the primary operational visual beacon.
- **Safety / Ready Green (`#10B981`, secondary accent `#059669`)**: Indicates a safe operational envelope—device docked, breathalyzer verified, speed within thresholds, and ignition unlocked.
- **Emergency Crimson (`#EF4444`, secondary accent `#DC2626`)**: Reserved strictly for high-severity interruptions: SOS triggers, hard collision alerts, driver distress, and catastrophic hardware disconnections.
- **Monochrome & Telemetry Steel (`#FFFFFF`, `#94A3B8`, `#30363D`)**: Pure white guarantees Grade-AAA WCAG contrast for primary readouts; muted steel provides noise-free secondary metric framing.

Backgrounds must never use tinted or desaturated primaries; ambient backdrops remain strictly neutral Deep Carbon to prevent cognitive overload.

## Typography

The typographic hierarchy is calibrated for glancing recognition at arm's length (dashboard mount distance):

- **Headlines (`Space Grotesk`)**: Bold, structural, industrial proportions provide quick visual parsing of high-level states (e.g., "ENGINE IMMOBILIZED", "DOCK VERIFIED").
- **Body Text (`Hanken Grotesk`)**: Highly legible, open apertures and robust stroke weights ensure readable operational copy across shaking vehicle mounts. Body text never falls below 14px.
- **Instrumentation & Labels (`JetBrains Mono`)**: Strict tabular numerals and monospaced character widths guarantee numbers (km/h, voltage, trip timers, pin states) never shift layout bounds during rapid value updates. All critical hardware codes and statuses use uppercase formatting.

## Layout & Spacing

The layout utilizes a direct, fluid single-column model on portrait handsets and a strict split-view dashboard grid on landscape mounted tablets:

- **Target Ergonomics**: All interactive elements adhere to a strict minimum touch target of 56dp by 56dp (scaled to 64dp for primary state controls) to accommodate glove wearers and jarring cab movement.
- **Vertical Hierarchy**: Top zone accommodates persistent hardware status telemetry (GPS lock, OBD-II link, Bluetooth dock state). Center zone houses large-format glanceable states. Bottom zone is reserved for emergency actions, manual overrides, and dispatch acknowledgments within natural thumb arc reach.
- **Responsive Adaptations**:
  - **Portrait (Phones / In-cab dash mounts)**: 1-column fluid stacking, 16px horizontal margins, with sticky persistent action bars fixed to the lower screen edge.
  - **Landscape / In-Vehicle Tablets (7" - 10")**: 2-column asymmetric layout (60% state telemetry & instrumentation on the left, 40% interaction controls & emergency actions pinned to the right).

## Elevation & Depth

To maintain legibility under harsh direct sunlight and ensure rapid rendering on low-cost Android hardware, this design system avoids diffuse drop shadows and CPU-heavy glassmorphism blurs.

Visual hierarchy relies on **Tonal Structural Layering** paired with **High-Contrast Industrial Borders**:
- **Base Canvas (`#0D1117`)**: Primary background for ambient road view.
- **Card & Component Surfaces (`#161B22`)**: Neutral elevated container with a crisp `1px solid #30363D` border.
- **Critical Status Surfaces (`#21262D`)**: High-priority interactive modules highlighted by intentional state-colored borders (`2px solid #F59E0B`, `2px solid #10B981`, or `2px solid #EF4444`).
- **Tactile Pressed States**: Depressed buttons swap border colors, introduce a 2px inner inset border, and darken surface fill by 12% to simulate heavy physical industrial toggle switches.

## Shapes

The design system embraces an industrial, mechanical aesthetic utilizing **Soft (`1`)** geometry:
- Standard buttons and cards feature tight `0.25rem` (4px) to `0.5rem` (8px) corner radii, evoking hardware-molded enclosures.
- Pills and circles are strictly reserved for state indicators, status LEDs, and badge tallies.
- Sharp, structural geometry maximizes usable screen real estate, ensuring controls fill the available footprint without losing touch area to deep rounded curves.

## Components

### Buttons & Critical Triggers
- **Primary / Actionable**: Minimum height 56px (up to 64px for emergency actions). Solid high-contrast fill (`#F59E0B` or `#10B981`) with dark ink (`#0D1117`) in `Space Grotesk` 18px Bold.
- **Emergency SOS Button**: Distinctive full-width, minimum 72px height, colored in `#EF4444` with a persistent high-contrast white border. Features a 1.5-second hold-to-activate mechanic to prevent false triggers over rough terrain.
- **Haptic Feedback**: Every touch interaction binds strictly to Android's `HapticFeedbackConstants.CONFIRM` or `REJECT`.

### Status Banners & Sensor Indicators
- Displayed prominently in the top view tier.
- Integrated monospaced status badges (`#161B22` background, `JetBrains Mono` 12px uppercase) paired with pulsing 8px visual LEDs (Green for docked, Amber for scanning, Crimson for fault).

### Cards & Telemetry Containers
- Structured with `#161B22` fill and `#30363D` borders. Internal padding is locked to `1.25rem`.
- Split value displays: Small caption label on top (`#94A3B8`), massive metric display below (`#FFFFFF`, `JetBrains Mono` 28px).

### Input Fields & Keypads
- Numerical PIN pads and unlock screens feature oversized, high-hit-target key blocks (minimum 64px x 64px) with high-contrast text and instant high-impact audio-haptic feedback.

### Toggles, Checkboxes & Locks
- Oversized switch rails (min 60px wide x 36px high) with unmistakable color state shifts. Amber/Crimson clearly conveys locked states; Ready Green indicates unlocked or verified states.