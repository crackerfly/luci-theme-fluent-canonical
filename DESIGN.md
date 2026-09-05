# Luci-Theme-Fluent Design Document

## Overview

Luci-Theme-Fluent is a modern, FluentUI-inspired theme for OpenWrt's LuCI web interface. Built as a fully independent theme with zero dependencies on luci-theme-argon, it features a complete design system using CSS custom properties, SCSS preprocessing, and ucode templates.

---

## Architecture

### Directory Structure

```
luci-theme-fluent/
├── package/
│   └── luci-theme-fluent/
│       ├── htdocs/luci-static/
│       │   ├── fluent/
│       │   │   ├── background/          # User-uploaded background images
│       │   │   ├── fonts/               # Self-contained font files (optional)
│       │   │   ├── icon/                # Theme icons
│       │   │   └── img/                 # Theme images (logo, placeholders)
│       │   └── resources/
│       │       ├── menu-fluent.js       # Compiled sidebar navigation (LuCI module)
│       │       └── view/
│       │           └── fluent-config.js # Compiled configuration UI
│       ├── ucode/template/themes/fluent/
│       │   ├── header.ut                # Main header template
│       │   ├── header_login.ut          # Login page header
│       │   ├── footer.ut                # Main footer
│       │   ├── footer_login.ut          # Login footer
│       │   ├── out_header_login.ut      # Outer login header
│       │   └── sysauth.ut               # Login/auth page
│       ├── root/
│       │   ├── etc/config/fluent        # Default UCI config
│       │   ├── etc/uci-defaults/        # Theme registration and config setup
│       │   └── usr/                     # Scripts, RPCD, ACL files
│       ├── po/                          # Translation sources
│       └── Makefile                     # OpenWrt package definition
├── src/
│   ├── scss/
│   │   ├── fluent.scss          # Main entry point (imports partials)
│   │   ├── _variables.scss      # Design tokens (Typography, Spacing, Radius, Brand ramps)
│   │   ├── _mixins.scss         # Reusable patterns
│   │   ├── _base.scss           # Reset & typography
│   │   ├── components/          # Component SCSS partials
│   │   ├── layouts/             # Layout SCSS partials
│   │   ├── themes/              # Light/Dark variables
│   │   └── overrides/           # Page-scoped overrides
│   ├── web/
│   │   └── resources/
│   │       ├── menu-fluent.tsx  # Sidebar navigation TSX source
│   │       └── view/
│   │           └── fluent-config.tsx # Config UI TSX source
│   ├── script/                  # Build scripts (extract-ucode, generate-icons, etc.)
│   └── rsbuild.config.ts        # Rsbuild configuration
└── package.json                 # Project build tooling (pnpm workspace)
```

---

## CSS Architecture

### Design Tokens (Variables System)

All design tokens are CSS custom properties, defined in `:root` and aligned with `@fluentui/tokens` v2. The authoritative source for these values is `src/scss/_variables.scss`:

```scss
:root {
  // Typography
  --fluent-font-family: "Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
  --fluent-font-size-base: 14px;
  --fluent-font-size-xs: 10px;
  --fluent-font-size-sm: 12px;
  --fluent-font-size-md: 16px;
  --fluent-font-size-lg: 20px;
  --fluent-font-size-xl: 24px;
  --fluent-font-size-xxl: 28px;
  --fluent-font-size-xxxl: 40px;

  --fluent-font-weight-regular: 400;
  --fluent-font-weight-semibold: 600;
  --fluent-font-weight-bold: 700;

  --fluent-line-height-tight: 1.2;
  --fluent-line-height-normal: 1.43;
  --fluent-line-height-relaxed: 1.57;

  // Spacing (4px grid)
  --fluent-space-unit: 4px;
  --fluent-space-xxs: 2px;
  --fluent-space-xs: 4px;
  --fluent-space-sm: 8px;
  --fluent-space-md: 12px;
  --fluent-space-lg: 16px;
  --fluent-space-xl: 24px;
  --fluent-space-xxl: 32px;
  --fluent-space-xxxl: 48px;

  // Border Radius (nested radii step down by at least 2px)
  --fluent-radius-xs: 4px;
  --fluent-radius-sm: 4px;   // = UCI border_radius / 2
  --fluent-radius-md: 8px;   // = UCI border_radius — inputs, buttons
  --fluent-radius-card: 10px; // nav items, KPI tiles
  --fluent-radius-lg: 12px;  // top-level panels, popovers
  --fluent-radius-xl: 16px;  // modals
  --fluent-radius-circular: 10000px;
  --fluent-radius-round: 50%;

  // Duration & Easing
  --fluent-duration-fast: 120ms;   // hover / press
  --fluent-duration-normal: 180ms; // controls, overlays
  --fluent-duration-slow: 280ms;   // content reflow
  --fluent-duration-slower: 400ms;
  --fluent-easing-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --fluent-easing-decelerate: cubic-bezier(0, 0, 0, 1);
  --fluent-easing-accelerate: cubic-bezier(1, 0, 1, 1);
  --fluent-easing-easy-ease: cubic-bezier(0.33, 0, 0.67, 1);

  // Z-Index
  --fluent-zindex-actions: 1000;
  --fluent-zindex-modal: 1100;
  --fluent-zindex-tooltip: 1200;
  --fluent-zindex-toast: 1300;
  --fluent-zindex-dropdown: 1500;
  --fluent-zindex-menu: 1050;
}
```

### Colour System (Canonical v3.2)

Colour is organised in three layers; a later layer may only reference an earlier one:

1. **Reference** — `--ref-*`, theme-independent ramps and locked anchors, defined in `_variables.scss`
2. **Semantic** — `--fluent-*` role names, mapped per theme in `themes/_light.scss` and `themes/_dark.scss`
3. **Component** — fixed pairings such as the Primary button triad and the nav rail

Component rules consume layers 2 and 3 only; they never read `--ref-*` directly.

Locked anchors: the Light brand is `#024AD8` (Electric Blue 7) and the Dark brand is `#9058FC`.
The Dark brand anchor stays the brand graphic, focus and selection colour, but white text on it is
only `4.2106:1`, so solid fills that carry white text use a separate, independently verified Primary
Component triad — `#8A52F2 / #7D45DE / #6F37C9` at `4.5955 / 5.5585 / 6.8498:1`.

Dark mode is entirely variable-driven: both themes define the same key set and only the values
differ. The theme is resolved onto `data-theme` on `<html>`, and each scope sets its own
`color-scheme` so native controls follow the page theme rather than the OS preference:

```css
:root,
[data-theme="light"] {
  color-scheme: light;
  --fluent-primary: var(--ref-electric-blue-7);   /* #024AD8 */
  --fluent-bg-page: var(--ref-canvas-light);      /* #F2FBFF */
  --fluent-bg-card: var(--ref-neutral-0);         /* #FFFFFF */
  --fluent-text: var(--ref-text-light);           /* #1A1A1A */
}

[data-theme="dark"] {
  color-scheme: dark;
  --fluent-primary: var(--ref-status-purple-6);   /* #9058FC */
  --fluent-bg-page: var(--ref-neutral-950);       /* #080B12 */
  --fluent-bg-card: var(--ref-neutral-900);       /* #101622 */
  --fluent-text: var(--ref-neutral-90);           /* #EEF1FF */
  --fluent-btn-primary-bg: #8a52f2;               /* white-text safe */
}
```

`header.ut` injects the UCI-configurable subset inline, so `src/web/resources/fluent-defaults.ts`
must stay in sync with the defaults in `_variables.scss` and the two theme files.

---

## Template Architecture

### ucode Template System

All server-side templates are written in ucode syntax:

* **Code Execution**: `{% if (mode === 'dark') { %} ... {% } %}`
* **Expression Output**: `{{ media }}` or `{{ border_radius }}`
* **Comments**: `{# Comments #}`

### Global Variables
Ucode templates have automatic access to LuCI global properties: `theme`, `media`, `resource`, `node`, `dispatcher`, `version`, `ctx`.

### UCI Configuration Integration
`header.ut` reads settings directly from UCI config `/etc/config/fluent` using ucode's `uci` cursor and dynamically injects them as inline CSS custom properties, allowing user customization of colors, radii, sidebar widths, and layout spacing at runtime.

---

## Build System & Tooling

The project uses **Rsbuild** (configured in `src/rsbuild.config.ts`) instead of standard Sass compilers. It builds two environments:
1. **CSS environment** (`src/scss/fluent.scss`): Preprocesses SCSS files, inlines inline SVGs, and outputs CSS to `package/luci-theme-fluent/htdocs/luci-static/fluent/css/fluent.css`.
2. **JS environment** (`src/web/resources/`): Compiles React-like JSX/TSX views into OpenWrt-compatible LuCI modules using custom banner/footer plugins.

### Package Scripts

Authoritative scripts inside `package.json`:
* `pnpm run build`: Compiles both SCSS styles and LuCI JS modules.
* `pnpm run watch`: Watches files for dynamic hot-rebuilding.
* `pnpm run lint`: Formats and checks codebase using Biome.
* `pnpm run i18n:build`: Re-extracts and translates all ucode and Javascript strings.
