# Luci-Theme-Fluent Design Document (Canonical v3.5.2)

## Overview

Luci-Theme-Fluent (Canonical Edition) combines FluentUI 2 layout geometry with the Canonical v3.2 / v3.5.2 perceptual colour and elevation contract for OpenWrt's LuCI web interface (`24.10` and `25.12.6+`). Built as an independent theme with zero dependencies on `luci-theme-argon`, it uses three-layer CSS custom properties (OKLCH progressive enhancement over an sRGB baseline), SCSS partials, TypeScript/TSX modules, and ucode templates.

## Architecture

### Directory Structure

```text
luci-theme-fluent/
├── package/
│   ├── luci-theme-fluent/              # Full theme package
│   │   ├── htdocs/luci-static/
│   │   │   ├── fluent/css/fluent.css   # Compiled full stylesheet
│   │   │   └── resources/              # menu-fluent.js & view/fluent-config.js
│   │   ├── ucode/template/themes/fluent/
│   │   ├── root/                       # UCI config, RPCD luci.fluent, update worker, ACLs
│   │   └── Makefile
│   ├── luci-theme-fluent-lite/         # ROM-friendly lite package (fluent.css.gz)
│   └── luci-mod-fluentdashboard/       # Optional standalone status dashboard
├── src/
│   ├── scss/
│   │   ├── fluent.scss                 # Full Sass entry point
│   │   ├── fluent-lite.scss            # Lite Sass entry point -> fluent.css.gz
│   │   ├── _variables.scss             # Reference ramps, typography, spacing, motion physics
│   │   ├── _mixins.scss                # Responsive, RTL, elevation, and icon mixins
│   │   ├── _base.scss                  # Reset, typography, reduced-motion & print rules
│   │   ├── components/                 # Component SCSS partials
│   │   ├── layouts/                    # Shell & login layout SCSS partials
│   │   ├── themes/                     # Light & Dark semantic mappings
│   │   └── overrides/                  # Scoped LuCI app overrides
│   ├── web/
│   │   ├── resources/                  # menu-fluent.tsx, fluent-config.tsx, utils/
│   │   └── fluentdashboard/            # Standalone dashboard view & CSS
│   ├── script/                         # Build, icon, i18n, and remote dev scripts
│   └── rsbuild.config.ts               # Multi-environment Rsbuild + gzip-9 lite plugin
└── package.json
```

## CSS & Motion Architecture

### Design Tokens (`src/scss/_variables.scss`)

All design tokens are CSS custom properties defined in `:root`:

```scss
:root {
  --fluent-font-family:
    Inter, "Segoe UI", "Segoe UI Web (West European)", -apple-system, BlinkMacSystemFont, Roboto,
    "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue", sans-serif;
  --fluent-font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;

  // Motion Physics (Frequency -> Purpose -> Curve -> Duration)
  --fluent-duration-fast: 120ms;   // hover & tactile press
  --fluent-duration-normal: 180ms; // controls, popovers, dropdowns
  --fluent-duration-slow: 280ms;   // drawers, modals, content reflow
  --fluent-easing-standard: cubic-bezier(0.2, 0.8, 0.2, 1);
  --fluent-easing-out-strong: cubic-bezier(0.23, 1, 0.32, 1);
  --fluent-easing-effects: cubic-bezier(0.31, 0.94, 0.34, 1);
  --fluent-easing-sheet: cubic-bezier(0.32, 0.72, 0, 1);
}
```

### Colour System (Canonical v3.2 / v3.5.2)

Colour is organised in three strict layers; a later layer may only reference an earlier one:

1. **Reference (`--ref-*`)** — theme-independent ramps and locked anchors in `_variables.scss` with positive `@supports (color: oklch(50% 0 0))` enhancement.
2. **Semantic (`--fluent-*`)** — role names mapped identically in `themes/_light.scss` and `themes/_dark.scss`.
3. **Component (`--fluent-*`)** — verified pairings such as the Dark Primary button triad (`#8A52F2 / #7D45DE / #6F37C9`, verified >= `4.59:1` against white text) and Shade 0 + Shade 11 status badge triads (`10.1:1+` in Light mode).

### Gzipped Lite Stylesheet Delivery

`luci-theme-fluent-lite` ships `fluent.css.gz` (compressed at gzip level 9) rather than uncompressed `fluent.css`. When `uhttpd` serves `.gz` without `Content-Encoding: gzip` or through a reverse proxy, `header.ut` inspects the first two payload bytes (`0x1f 0x8b`) before piping through `DecompressionStream('gzip')`, preventing double-decompression faults while saving flash space on constrained routers.
