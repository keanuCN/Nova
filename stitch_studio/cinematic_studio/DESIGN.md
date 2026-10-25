---
name: Cinematic Studio
colors:
  surface: '#101418'
  surface-dim: '#101418'
  surface-bright: '#36393f'
  surface-container-lowest: '#0b0e13'
  surface-container-low: '#191c21'
  surface-container: '#1d2025'
  surface-container-high: '#272a2f'
  surface-container-highest: '#32353a'
  on-surface: '#e1e2e9'
  on-surface-variant: '#bacbbc'
  inverse-surface: '#e1e2e9'
  inverse-on-surface: '#2e3036'
  outline: '#859587'
  outline-variant: '#3c4a3f'
  surface-tint: '#1ce388'
  primary: '#45f99c'
  on-primary: '#00391d'
  primary-container: '#00dc82'
  on-primary-container: '#005b32'
  inverse-primary: '#006d3e'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#cfdcff'
  on-tertiary: '#002e6a'
  tertiary-container: '#a4c0ff'
  on-tertiary-container: '#004ba3'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#59ffa4'
  primary-fixed-dim: '#1ce388'
  on-primary-fixed: '#00210f'
  on-primary-fixed-variant: '#00522d'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#101418'
  on-background: '#e1e2e9'
  surface-variant: '#32353a'
typography:
  display:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  headline-sm:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter, PingFang SC, Noto Sans SC, sans-serif
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-code:
    fontFamily: JetBrains Mono, monospace
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-metric:
    fontFamily: JetBrains Mono, monospace
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-md: 1rem
  margin: 1rem
  margin-dock: 0.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system targets professional AIGC creators, video editors, and technical directors who demand precise control over generative video, audio nodes, and timeline synthesis. The aesthetic reflects a restrained, modern cinematic workstation: quiet, focused, and dark, where interface chrome recedes entirely so generated assets take center stage.

The aesthetic is built on a technical-minimalist dark theme with low-contrast structural grids, subtle micro-borders, and high-precision status indicators. Unnecessary decorative glow, large skeuomorphic shadows, and frivolous rounded containers are avoided in favor of utility, dense information balance, and cinema-grade discipline.

## Colors

The palette relies on deep graphite and slate surfaces to simulate professional post-production software suites (e.g., DaVinci Resolve, Nuke, Blender):

- **Background Canvas:** Graphite Black (`#0D0F12`) provides the absolute baseline canvas.
- **Surface Level 1:** Deep Graphite Slate (`#14171C`) for sidebars, inspector docks, and timeline tracks.
- **Surface Level 2 (Panels & Overlays):** Dark Charcoal (`#1C2027`) for floating cards, popovers, and modal windows.
- **Structural Borders & Separators:** Muted Steel (`#2A313C`) rendered at 1px thickness to construct precise structural grids.
- **Primary Accent & Key Action:** Professional Emerald / Neon Mint (`#00DC82` / `#10B981`) provides high-contrast luminance for active states, render progress, and primary calls to action.
- **Functional Semantics:**
  - Warning: Amber (`#F59E0B`)
  - Danger: Crimson Red (`#EF4444`)
  - Info / Secondary Logic: Slate Blue (`#3B82F6`)
  - Success: Mint Green (`#10B981`)
- **Typography Tone Hierarchy:**
  - High-contrast Heading: Chalk White (`#F3F4F6`)
  - Body & Form Values: Cool Grey (`#9CA3AF`)
  - Tertiary / Metadata / Labels: Dimmed Slate (`#6B7280`)

## Typography

Typography prioritizes tabular legibility, dense timeline readings, and cross-language harmony between Chinese and Latin characters:

- **Primary Latin & Numerals:** `Inter` handles alphanumeric UI labels, ensuring consistent vertical metrics and neutral geometric structure.
- **Chinese Fallback Hierarchy:** `PingFang SC`, `Noto Sans SC`, and `system-ui` ensure native font rendering across macOS and Linux/Windows environments without layout shifting.
- **Monospace Parameters & Timecodes:** `JetBrains Mono` is reserved strictly for frame counts, prompt syntax variables, seed IDs, audio bitrates, and generation tokens.
- **Type Scale Rules:** Headings are compact to conserve vertical viewport space for preview players and node graphs. The baseline body text defaults to `13px` (`body-md`), optimized for dense studio control suites.

## Layout & Spacing

The layout is built upon an anchor-docked workspace architecture with fixed, resizable panels rather than conventional marketing grids:

- **Dock Grid Layout:** A 3-panel studio layout (Node Tree / Asset Browser on the left, Central Viewport & Canvas in the middle, Parameter Inspector on the right) with a bottom collapsible timeline track.
- **Adaptive Breakpoints:**
  - **Desktop (>= 1440px):** Full persistent multi-panel layout with continuous frame scrubbing.
  - **Compact Desktop / Tablet Landscape (1024px - 1439px):** Inspector and Asset drawers collapse into flyout panels.
  - **Mobile (< 1024px):** Single-view workflow centered on asset generation preview, with inspector tools relegated to a bottom sheet modal.
- **Spacing Rhythm:** Density is compact. Internal component spacing defaults to `space-sm` (8px) and `space-md` (12px), preventing excess whitespace from displacing parameter controls.

## Elevation & Depth

Visual hierarchy is constructed through tonal layering and razor-sharp border separation rather than diffuse drop shadows:

- **Layer 0 (Canvas Base):** Solid `#0D0F12` with no shadow or elevation.
- **Layer 1 (Docks & Drawers):** `#14171C` bounded by a 1px border of `#2A313C`.
- **Layer 2 (Cards, Viewport Overlays, Floating Toolbars):** `#1C2027` with a 1px border (`#2A313C`). Subtle grounding shadow: `0 4px 16px -2px rgba(0, 0, 0, 0.4)`.
- **Layer 3 (Modals, Popovers, Context Menus):** `#1C2027` with crisp 1px border (`#2A313C`) and depth shadow: `0 8px 24px -4px rgba(0, 0, 0, 0.6)`.
- **Focus & Selection Rims:** Active cards, running nodes, or focused inputs receive a crisp `1px` ring in `#00DC82`, avoiding large blurs or saturated halos.

## Shapes

The interface balances sharp industrial geometry with ergonomic utility:
- **Default Elements:** 0.5rem (8px) corner radius for input fields, buttons, and micro cards.
- **Panels & Viewport Containers:** `rounded-lg` (1rem / 16px) for master dock windows and floating modal containers.
- **Inline Badges & Variable Capsules:** Pill-shaped or subtle 4px radius to distinguish data tokens and syntax variables from operational cards.

## Components

### Buttons
- **Primary Action (Generate / Render):** Background `#00DC82`, text `#0D0F12`, font weight `600`, radius `8px`. Hover: `#34D399`. Active: `#059669`.
- **Secondary (Ghost / Subtle):** Background `rgba(42, 49, 60, 0.3)`, border `1px solid #2A313C`, text `#F3F4F6`. Hover: `background: #1C2027`, `border-color: #6B7280`.
- **Danger (Abort / Delete):** Background `transparent`, border `1px solid #EF4444`, text `#EF4444`. Hover: `rgba(239, 68, 68, 0.1)`.

### Input Fields & Parameter Steppers
- Background `#0D0F12`, border `1px solid #2A313C`, text `#F3F4F6`, placeholder `#6B7280`.
- Focus ring: `1px solid #00DC82`.
- Numeric parameter inputs include scrubber arrows and monospace numbers (`JetBrains Mono`).

### Dropdowns & Select Menus
- Container `#1C2027`, border `1px solid #2A313C`, rounded `8px`.
- Options: Default `#9CA3AF`, hover `#F3F4F6` over `rgba(255, 255, 255, 0.04)`. Selected: text `#00DC82` accompanied by a leading checkmark.

### Variable & Syntax Pills (Prompt Capsules)
- Background `rgba(0, 220, 130, 0.08)`, border `1px solid rgba(0, 220, 130, 0.25)`, text `#00DC82`, font `JetBrains Mono`, rounded `4px`, padding `2px 6px`.

### Status Badges
- **Online / Ready:** Dot `#10B981`, background `rgba(16, 185, 129, 0.1)`, text `#10B981`.
- **Rendering / In-Progress:** Dot `#00DC82` with subtle pulse animation, text `#F3F4F6`.
- **Warning / Degraded:** Dot `#F59E0B`, background `rgba(245, 158, 11, 0.1)`, text `#F59E0B`.
- **Error / Expired:** Dot `#EF4444`, background `rgba(239, 68, 68, 0.1)`, text `#EF4444`.

### Cards & Workflow Nodes
- Background `#14171C`, border `1px solid #2A313C`, rounded `8px`.
- Selected Node: Border switches to `1px solid #00DC82`. Hover reveals technical metadata via a fixed tooltip anchor.