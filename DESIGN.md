# UniGo UI system

Light, high-contrast campus-services UI. Ink type on a white canvas, heavy uppercase display headlines, and one lime "go" signal for actions. Researched on Refero: Wise is the primary style (canvas, type, lime CTA, forest selected states, big rounded surfaces); Uber's ride and rental booking screens shape the booking layouts (form panel beside a large map).

Tokens and component classes live in `src/index.css`. Shared React pieces live in `src/components/ui.jsx` (`Reveal`, `Segmented`, `PageHeader`, `Wordmark`) and `src/hooks/useMotion.js` (`useInView`, `useCountUp`, `useSlidingThumb`).

## Colors (Tailwind names) and their only jobs

| Token | Use for | Never |
|---|---|---|
| `canvas` #fff | page background, cards on paper | |
| `paper` #f4f5f1 | large secondary surfaces (`.surface`), footer, hover rows | |
| `ash` #e8ebe6 | nested blocks, quiet buttons, segmented track, neutral badges | |
| `ink` #0e0f0c | headings, primary text | |
| `body` #454745 | body copy | headings |
| `muted` #6a6c6a / `subtle` #868685 | captions, metadata / placeholders, disabled | body copy |
| `hairline` | 1px dividers and rings | |
| `lime` #9fe870 | primary CTA fill, live/active badges, success, selected icon chips | large backgrounds, text on white |
| `forest` #163300 | text on lime, selected states, links, `.surface-feature` | |
| `alert` + `alert-wash` | errors, destructive actions | |

Do not use Tailwind's default palette (`slate-*`, `purple-*`, `emerald-*`, `indigo-*`, `pink-*`, etc.), gradients, glows, colored shadows, glassmorphism, or emoji as icons. Map pins and data viz inside the 3D maps may keep their own category colors.

## Type

- `.display`: Archivo 900, uppercase, tight. Page titles and one big statement per page. Sizes 44 / 64 / 76px (via `PageHeader`) or larger on home.
- `.heading`: Archivo 800, sentence case. Section and card titles (20–40px).
- Body: Inter 15–17px, `text-body`. Labels 13px semibold `text-ink` (`.label`).
- `.eyebrow`: 12px uppercase, tracked, `text-muted`. Section kickers.
- `font-mono`: only for booking references, OTPs, coordinates and code. Never for buttons, labels or prose.
- `.num` for tabular numbers (prices, counts).

## Shape

- Buttons, badges, chips, segmented controls: full pill.
- Inputs: 10px (`.field`). Option tiles: 18px (`.option`). Panels/cards: 28px (`.surface`, `.surface-line`). Feature block: 38px (`.surface-feature`).
- Depth comes from surface color, not shadows. `shadow-[var(--shadow-float)]` only for floating layers (dropdowns, modals, map overlays). `--shadow-ring` for 1px outlines.

## Components (classes)

- Buttons: `.btn` + `.btn-primary` (lime, main action, one per view area) / `.btn-forest` (strong secondary) / `.btn-outline` / `.btn-quiet` (ash) / `.btn-danger` / `.btn-link` (underlined text action). Sizes `.btn-sm`, `.btn-lg`. Add `<ArrowRight className="btn-arrow" />` for forward actions. `.btn-icon` for round icon buttons.
- Badges: `.badge` + `.badge-lime` (live/success) / `.badge-forest` / `.badge-neutral` / `.badge-ghost`. Prefix live states with `<span className="live-dot" />`.
- Surfaces: `.surface` (paper, 28px), `.surface-ash`, `.surface-line` (white + 1px ring), `.surface-feature` (forest), `.media-frame` (maps, photos).
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
- Hover 120–160ms, press `scale(.97)` (built into `.btn`, `.option`). State changes 200–260ms. Popovers/modals `animate-pop-in` / `animate-sheet-up`, overlay `animate-fade-in`.
- Changing numbers (fares, totals, counters): `useCountUp(value)`.
- New items in a list or a status change: key the element and add `animate-pop-in`.
- Live states: `.live-dot`. No other infinite loops.
- Never `transition-all`; list properties (`transition-colors`, `transition-[transform,background-color]`).
- Reduced motion is handled globally in `index.css`.

## Campus map (Apple Maps style)

The WebGL campus map (`src/components/CampusMap3D.jsx`, scene in `src/components/campusMapWorld.js`) combines two sources:

- **Where things are: OpenStreetMap.** `scripts/build-campus-map.mjs` turns an Overpass download into `src/data/pu_campus_map.json`: real building outlines, the road network (with speed limits), the university boundary, sports grounds, parks and the coastline. Re-run it with `node scripts/build-campus-map.mjs` (or `--osm saved.json`). Map data © OpenStreetMap contributors (ODbL); the map shows that credit bottom right and it must stay.
- **What things are: the Apple Maps campus spec.** `src/data/APPLE_MAPS_PU_SPEC.md` and `pu_apple_maps_reference.json` supply names, categories, heights, colours, descriptions and camera presets. `src/data/puAppleMap.js` adds badge names and the ids shared with the rest of the app. Only the lazily loaded map imports either file.

Placement rules the build script and world module enforce:

- Each spec building takes its matched OSM outline (67 of 70). A place with no outline keeps the spec rectangle only on open ground; if that rectangle would cover a real building or road it becomes a badge without a building (SJC main complex, the credit society, Mother Teresa Hostel).
- Gates sit where their OSM road ("Pondicherry University Road Gate Number 1/2") crosses the university boundary, on East Coast Road. The Gate 1 shelter waits 40 m inside the gate.
- Bus stops sit at the kerb of the nearest street, never on the carriageway, and are labelled "… stop" so they don't read as a second badge for the building beside them.
- Departments OSM maps as rooms inside a bigger building (the SJC libraries) share the host's walls and badge height. Badge-only places inside a building stand on its roof.
- Running tracks are drawn as a lane oval round a grass infield, fitted to OSM's rough outline.

Look and behaviour:

- Scale is real metres from the spec origin (12.026728° N, 79.855588° E), +X east, +Z south. Spec colour tokens for light and dark; sunset is a warm tint of light. Landmark shapes follow the spec's roof styles (library rotunda, clock tower, barrel and gable roofs, gate arches, temple gopuram).
- Badges are placed in priority order. A badge that collides shrinks to its icon, then hides; badges also stay clear of the map edge and of every control, the legend and the place card (anything marked `data-map-control`). The campus name and the sea label lead; district names give way to badges.
- Building detail: walls carry a window per 3.6 m bay on every 3.4 m floor (one 256 px texture, tinted by each building's wall colour; some windows glow warm in the dark style). Flat roofs on buildings 6 m and taller get a 0.9 m parapet, a stair cabin and black water tanks. Gate pillars stay plain.
- Trees: broadleaf crowns (three lumpy lobes, darker underneath) over a visible trunk across campus; casuarina spires within 260 m of East Coast Road; coconut palms along streets. All instanced, about 420k triangles in all, and only drawn when zoomed in.
- Trees fade out as you zoom out to the whole campus. The overview frames the real campus outline for the map's current shape and reframes on resize until the user moves the map.
- Controls: drag to pan, shift/right-drag to turn and tilt, scroll or pinch to zoom about the pointer, arrow keys and +/- when the map has focus. On touch, two fingers move and zoom; one-finger vertical swipes still scroll the page. Frosted controls (`.map-glass`) are allowed only inside the map.
- The app's hostel lists in `campusData.js` use the spec's ids, so map picks feed the laundry form and ride drop directly.

## Voice

Short, specific, sentence case. Name real places (Gate 1, SJC, Bharathiar Hostel). No "Exclusive", "Unbeatable", exclamation marks or emoji.
