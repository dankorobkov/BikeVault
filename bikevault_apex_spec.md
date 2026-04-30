# BikeVault — Apex

App icon system, v1. Direction D · Cut.

## Concept

A single forward-leaning velocity stripe, cut by a horizontal vault slot. Speed and security fused into one mark. The stripe carries the energy of a race line; the slot grounds it as a vault — the app's namesake — without ever showing a literal lock or bicycle.

The mark reads at every size, in every context, and contains no cycling cliché.

## Geometry

The icon is built on an 88-unit grid (scaled to 1024 for production). All measurements below are in 88-unit space.

| Element | Value |
|---|---|
| Canvas | 88 × 88, no rounded corners (iOS applies the squircle mask) |
| Stripe path | `M 22 66 L 40 66 L 66 22 L 48 22 Z` |
| Stripe width | 18 units (perpendicular to slope) |
| Stripe slope | −1.69 (rise / run) |
| Slot rect | x=24, y=42, w=40, h=4 (in master only) |
| Slot height | 4 units (4.5 % of icon) |

The slot is dropped from the small variant — below 60 px display size, 4.5 % of the icon's height renders below 1 px and reads as visual noise rather than a feature.

## Palette

| Name | Hex | Role |
|---|---|---|
| Obsidian | `#0A0A12` | Icon background, slot fill |
| Signal | `#FF4936` | Velocity stripe — never recolored |
| Graphite | `#161310` | Surrounding UI surfaces, dark home rows |
| Bone | `#F2EDE3` | Typography on dark, light surfaces |

Two-color icon. Signal is the only chromatic note — its scarcity is what makes it work.

## Asset matrix

| File | Use | Size |
|---|---|---|
| `bikevault_icon_master.svg` | App Store, home screen, Spotlight, settings | ≥ 60 px |
| `bikevault_icon_small.svg` | Notifications, status bar, table cells, favicons | < 60 px |
| `bikevault_apex_preview.html` | Internal review and stakeholder hand-off | — |

For App Store submission, render `icon_master.svg` to a flat 1024 × 1024 PNG with no transparency and no rounded corners. iOS applies the mask.

For iOS asset catalogs, generate the standard sizes (180, 167, 152, 120, 87, 80, 76, 60, 58, 40, 29, 20) by scaling the appropriate source: master for ≥ 60, small for < 60.

## Clearspace

Minimum clearspace around the mark in any layout context is ½ stripe-width — that is, 9 units on the 88-unit grid, or roughly 10 % of the icon's edge length. Inside the icon canvas itself the geometry already accounts for this.

## Do

- Keep ½-stripe-width clearspace on all sides
- Use master at ≥ 60 px, small below
- Pair with Bone or Graphite for surrounding UI surfaces
- Render the stripe in solid Signal red only
- Animate per the moments below — never freestyle

## Don't

- Recolor the stripe (no team-jersey variants, no seasonal palettes)
- Rotate, skew, mirror, or change the slope of the mark
- Add gradients, glows, drop shadows, or any surface effects
- Place on a busy or photographic background
- Render the slot at sizes where it falls below 1 px

## Dynamic behavior

Three motion moments. Anything outside these should be reviewed.

**App launch.** Stripe wipes in left-to-right over ~700 ms with a soft ease-out. Slot pops in last (~80 ms) — the "vault closes" beat. Total motion under 800 ms; the user is in the app within a second of the splash appearing.

**Pull-to-refresh.** Stripe rotates 360° around the icon centroid while data loads. On completion, the slot widens by 2 units, then snaps back — a small, satisfying "data secured" tell.

**Workout active.** While a ride or activity is being tracked, the slot pulses 4–6 px at the rider's cadence. The icon's only moving element becomes a live heart-rate / cadence read. Subtle. Not the focus, but present.

## Typography (suggested)

The mark stands on its own, but for product wordmark and UI:

- Display / wordmark: a geometric grotesk such as Söhne, Inter, or SF Pro Display, tracked −0.025 em at 56 px
- UI: SF Pro Text or Inter, regular 400 / medium 500 only
- Mono (data, hex codes, ride stats): SF Mono or JetBrains Mono

Match the icon's weight discipline: two weights, never bold, never italic for body.

## Versioning

This is v1 of the Apex direction. Future versions should preserve:

1. The single forward-leaning stripe at slope −1.69
2. The horizontal slot at the icon's vertical midline
3. Signal red as the only chromatic note
4. The master / small split below 60 px

Anything else is open to revision.

---

## UI icon system

The Apex mark is the brand. The UI icons are how the app actually feels in the hand.

### Style

Icons are designed on a 24-unit grid (renders cleanly at 24, 28, 32, 48, 56 px).

The system uses two states per icon:

- **`-line`** — bold-line outline. 2 px stroke, rounded line caps and joins, no fill. Used for inactive tabs, inline icons, toolbars, list items.
- **`-fill`** — geometric solid. Filled silhouette of the same form, with a Signal-red accent on the focal element (saddle, chainring center, lens, alert triangle). Used for the active tab, selected state, and the alert family (overdue, add, complete).

This matches Apple's native tab-bar pattern: outline → filled when selected.

### Stroke and fill discipline

- Line stroke: exactly `2 px` at 24-unit source. Don't use 1.5 or 2.5 for general icons — only the Apex mark itself uses other weights.
- Line caps and joins: always `round`.
- Fill icons: `currentColor` for the body, `#FF4936` for the focal accent, and the surrounding background color (`#161310` graphite or `#EFE8D8` cream) for any "punched" hole (cog center, cassette rings).
- No gradients, no glows, no shadows.

### Signal-red accent

Signal red appears on `-fill` icons on **one element only** — the element that "earns" the highlight. Examples:

| Icon | Accent target |
|---|---|
| `bike-fill` | saddle dot |
| `wheel-fill` | hub |
| `chain-fill` | middle link |
| `cassette-fill` | innermost ring |
| `complete-fill` | the whole circle |
| `overdue-fill` | the whole triangle |
| `add-fill` | the whole circle |

Never tint two elements. The accent is a focal point, not decoration.

### Naming

`{category}-{state}` — examples: `garage-line`, `bike-fill`, `overdue-fill`. All lowercase, kebab-case, no underscores. Sprite IDs match.

### Manifest (28 icons × 2 states = 56 symbols)

**Navigation (6).** garage, bike, parts, wrench, rides, profile.

**Actions (9).** add, search, filter, sort, edit, delete, settings, bell, sync.

**Components (10).** frame, fork, wheel, drivetrain, brakes, cockpit, saddle, chain, cassette, pedals.

**Service states (3).** due, overdue, complete.

### Usage

Sprite is consumed via `<use>`:

```html
<svg width="24" height="24" style="color: #F2EDE3">
  <use href="bikevault_icons.svg#garage-line"/>
</svg>
```

For active state, swap to the `-fill` symbol. For light surfaces, set `color` to `#1F1A14`. For dark, `#F2EDE3`. The Signal-red and "punched hole" colors are baked into the symbol — don't override them in CSS.

### Files

| File | Use |
|---|---|
| `bikevault_icons.svg` | Sprite. 56 symbols. Include once per page; reference via `<use>`. |
| `bikevault_icons_preview.html` | Internal review and stakeholder hand-off. |

---

BikeVault · Apex · D · Cut · v1 · plus icon system v1
