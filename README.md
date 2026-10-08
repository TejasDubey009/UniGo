# UniGo 🦄

Campus companion web app for Pondicherry University students: in-campus bike rides, scooter rentals with a signed digital lease, hostel laundry pickup, and "coming soon" food and party pages. It includes an interactive 3D campus (Google Maps embed or a Three.js WebGL model) and three role dashboards (student, admin, developer).

This is a front-end demo: there is no backend. All state lives in React context and is persisted to `localStorage`, and ride matching is simulated.

## Getting started

```bash
npm install
npm run dev      # start Vite dev server
npm run build    # production build into dist/
npm run lint     # oxlint
```

## Project layout

- `src/context/AppContext.jsx` – `AppProvider`: all app state, actions, `localStorage` persistence, and URL-hash routing (`#rides`, `#laundry`, …)
- `src/context/useApp.js` – context object and the `useApp()` hook
- `src/context/telemetry.js` – last FPS reported by the WebGL map (kept out of React state)
- `src/data/campusData.js` – campus landmarks/hostels (with GPS + 3D positions), rental fleet, seed orders
- `src/components/` – one component per page plus the two map engines:
  - `GoogleCampus3DMap.jsx` – Google Maps satellite/roadmap embed, plus optional photorealistic 3D tiles
  - `CampusMap3D.jsx` – Three.js campus model (lazy-loaded through `LazyCampusMap3D.jsx`)

## Google photorealistic 3D tiles (optional)

The "Photorealistic 3D Tiles" map mode needs a Google Maps Platform API key with the Maps JavaScript API enabled. Enter it in the map; it is stored in `localStorage` under `gmp_api_key`. The satellite and roadmap modes work without a key.

## Resetting demo data

Open **3 Dashboards → Developers Console → Reset Store to Default Demo**, or clear the site's `localStorage`.
