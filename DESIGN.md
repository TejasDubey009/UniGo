# UniGo UI system

Light, high-contrast campus-services UI. Ink type on a white canvas, heavy uppercase display headlines, and one lime "go" signal for actions. Researched on Refero: Wise is the primary style (canvas, type, lime CTA, forest selected states, big rounded surfaces); Uber's ride and rental booking screens shape the booking layouts (form panel beside a large map).

Tokens and component classes live in `src/index.css`. Shared React pieces live in `src/components/ui.jsx` (`Reveal`, `Segmented`, `PageHeader`, `Wordmark`, `CoinIcon`) and `src/hooks/useMotion.js` (`useInView`, `useCountUp`, `useSlidingThumb`).

## Colors (Tailwind names) and their only jobs

| Token | Use for | Never |
|---|---|---|
| `canvas` #fff | page background, cards on paper | |
| `paper` #f4f5f1 | large secondary surfaces (`.surface`), footer, hover rows | |
| `ash` #e8ebe6 | nested blocks, quiet buttons, segmented track, neutral badges | |
| `ink` #0e0f0c | headings, primary text, the dark `.console` | |
| `body` #454745 | body copy | headings |
| `muted` #6a6c6a / `subtle` #868685 | captions, metadata / placeholders, disabled | body copy |
| `hairline` | 1px dividers and rings | |
| `lime` #9fe870 | primary CTA fill, live/active badges, success, selected icon chips | large backgrounds, text on white |
| `forest` #163300 | text on lime, selected states, links, `.surface-feature` | |
| `gold` #ffd300 | UniGo coins only (`CoinIcon`) | anything else |
| `teal` + `mint-wash` | info badges | |
| `alert` + `alert-wash` | errors, destructive actions | |

Do not use Tailwind's default palette (`slate-*`, `purple-*`, `emerald-*`, `indigo-*`, `pink-*`, etc.), gradients, glows, colored shadows, glassmorphism, or emoji as icons. Map pins and data viz inside the 3D maps may keep their own category colors.

## Type

- `.display`: Archivo 900, uppercase, tight. Page titles and one big statement per page. Sizes 44 / 64 / 76px (via `PageHeader`) or larger on home.
- `.heading`: Archivo 800, sentence case. Section and card titles (20–40px).
- Body: Inter 15–17px, `text-body`. Labels 13px semibold `text-ink` (`.label`).
- `.eyebrow`: 12px uppercase, tracked, `text-muted`. Section kickers.
- `font-mono`: only for IDs, OTPs, coordinates, logs and code. Never for buttons, labels or prose.
- `.num` for tabular numbers (prices, counts).

## Shape

- Buttons, badges, chips, segmented controls: full pill.
- Inputs: 10px (`.field`). Option tiles: 18px (`.option`). Panels/cards: 28px (`.surface`, `.surface-line`). Feature block: 38px (`.surface-feature`).
- Depth comes from surface color, not shadows. `shadow-[var(--shadow-float)]` only for floating layers (dropdowns, modals, map overlays). `--shadow-ring` for 1px outlines.

## Components (classes)

- Buttons: `.btn` + `.btn-primary` (lime, main action, one per view area) / `.btn-forest` (strong secondary) / `.btn-outline` / `.btn-quiet` (ash) / `.btn-danger` / `.btn-link` (underlined text action). Sizes `.btn-sm`, `.btn-lg`. Add `<ArrowRight className="btn-arrow" />` for forward actions. `.btn-icon` for round icon buttons.
- Badges: `.badge` + `.badge-lime` (live/success) / `.badge-forest` / `.badge-neutral` / `.badge-ghost` / `.badge-info` / `.badge-alert`. Prefix live states with `<span className="live-dot" />`.
- Surfaces: `.surface` (paper, 28px), `.surface-ash`, `.surface-line` (white + 1px ring), `.surface-feature` (forest), `.console` (ink, mono; logs/terminal only), `.media-frame` (maps, photos).
- Forms: `.label`, `.field` (input/select/textarea; selects get a chevron), `.field-error`. Radio-like choices: `<button className="option" aria-pressed={selected}>`.
- `Segmented` for 2–4 way toggles (sliding thumb). `PageHeader` to open every page.
- Cards only for things you interact with (selectable options, list items that open something, forms). Group static info with spacing, dividers (`border-hairline`, `divide-hairline`) and type instead.

## Layout

- Page container: `max-w-[1280px] mx-auto px-5 lg:px-8`, top padding `pt-12 sm:pt-16`, bottom `pb-24`.
- Section gaps 64–144px. Element gap 8px multiples.
- Booking pages follow Uber: a form/summary column (about 5/12) beside a large map or media column (7/12) on desktop, stacked on mobile.

## Motion (purposeful, short)

- Page switch: handled globally (`animate-page-in` on tab change).
- Sections and list items: wrap in `<Reveal delay={i * 60}>` for scroll-in. Do not reveal things above the fold that the user needs instantly (forms, primary buttons) with long delays.
- Hover 120–160ms, press `scale(.97)` (built into `.btn`, `.option`, `.tile`). State changes 200–260ms. Popovers/modals `animate-pop-in` / `animate-sheet-up`, overlay `animate-fade-in`.
- Changing numbers (fares, totals, counters): `useCountUp(value)`.
- New items in a list or a status change: key the element and add `animate-pop-in`.
- Live states: `.live-dot`. No other infinite loops.
- Never `transition-all`; list properties (`transition-colors`, `transition-[transform,background-color]`).
- Reduced motion is handled globally in `index.css`.

## Campus map (Apple Maps style)

The WebGL campus map (`src/components/CampusMap3D.jsx`) follows Apple Maps rather than the page system, because it is a map, not a page. Refero references: Apple-Maps-based screens in Tilt, amo and Sunlitt.

- Scene: pastel land, tan university grounds, soft green lawns and rounded trees, white roads with a light casing, the East Coast Road as a yellow highway, pale blue sea, off-white buildings with thin outlines and soft shadows. Day, Sunset and Night (Apple dark map) palettes live in `THEMES`.
- Places: HTML markers, a coloured glyph dot with the name beside it in the same colour and a halo. Colours by category in `POI_STYLES` (gates blue, academic brown, food orange, sports green, health red, girls hostels pink, boys hostels teal). Hostel names appear only when zoomed in. The selected place gets a balloon pin that drops in.
- Controls: frosted glass (`.map-glass`) is allowed here only, for chips, the style/2D/recentre stack, compass and zoom. The place card uses UniGo's lime primary button for its main action.
- Styles live in the "Campus map" section of `index.css`.

## Voice

Short, specific, sentence case. Name real places (Gate 1, SJC, Bharathiar Hostel). No "Exclusive", "Unbeatable", exclamation marks or emoji.
