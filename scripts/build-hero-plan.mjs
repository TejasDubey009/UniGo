// Builds the home hero's backdrop from src/data/pu_campus_map.json:
//   src/assets/campus-plan.svg    the campus plan in hairlines (roads, buildings, boundary, shore)
//   src/data/heroCampusPlan.json  where that plan sits, plus one real road route to draw over it
//
//   node scripts/build-hero-plan.mjs   # re-run after build-campus-map.mjs
//
// Map data © OpenStreetMap contributors, ODbL (credited in the footer).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_PU_LOCATIONS } from '../src/data/campusData.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(root, 'src/data/pu_campus_map.json'), 'utf8'));
const spec = JSON.parse(readFileSync(join(root, 'src/data/pu_apple_maps_reference.json'), 'utf8'));

// Same local frame as the campus map: metres from the spec origin, +X east, +Z south
const { origin_gps: ORIGIN, constants } = spec.metadata.coordinate_reference_system.local_cartesian_projection;
const toLocal = ({ lat, lng }) => [(lng - ORIGIN.lng) * constants.lng_to_meters, -(lat - ORIGIN.lat) * constants.lat_to_meters];

// The trip the hero draws: short enough to sit in the margin beside the copy on wide screens
const ROUTE = { from: 'gh-narmatha', to: 'health-centre' };

// Area the plan covers (OSM data ends about 1.7 km west of the origin; east of the shore is sea)
const EXTENT = { x: -1750, y: -1400, width: 3750, height: 3600 };
const MARGIN = 60;

const inside = ([x, z]) =>
  x > EXTENT.x - MARGIN && x < EXTENT.x + EXTENT.width + MARGIN && z > EXTENT.y - MARGIN && z < EXTENT.y + EXTENT.height + MARGIN;

const n = (v) => Math.round(v);
const line = (pts) => 'M' + pts.map(([x, z]) => `${n(x)} ${n(z)}`).join('L');
const ring = (pts) => line(pts) + 'Z';

// Keep the parts of a polyline that touch the extent
function clip(pts) {
  const runs = [];
  let run = [];
  pts.forEach((pt, i) => {
    if (inside(pt) || (pts[i - 1] && inside(pts[i - 1])) || (pts[i + 1] && inside(pts[i + 1]))) run.push(pt);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length > 1);
}

// ---- Plan ----
const ROAD_STYLE = {
  trunk: { width: 16, opacity: 0.16 },
  road: { width: 9, opacity: 0.13 },
  service: { width: 6, opacity: 0.1 },
  path: { width: 3.5, opacity: 0.08 },
};

const roadPaths = Object.entries(ROAD_STYLE).map(([kind, { width, opacity }]) => {
  const d = map.roads.filter((r) => r.c === kind).flatMap((r) => clip(r.p)).map(line).join('');
  return `<path d="${d}" fill="none" stroke="#0e0f0c" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
});

const footprints = [...map.buildings.map((b) => b.fp), ...Object.values(map.places).map((p) => p.fp)]
  .filter((fp) => fp && fp.some(inside))
  .map(ring)
  .join('');

const campus = map.areas.filter((a) => a.k === 'campus').map((a) => ring(a.p)).join('');

// The shoreline runs north-south east of campus: close it off along the east edge to shade the sea
const east = EXTENT.x + EXTENT.width + MARGIN * 4;
const sea = line(map.coast) + `L${east} ${n(map.coast.at(-1)[1])}L${east} ${n(map.coast[0][1])}Z`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${EXTENT.x} ${EXTENT.y} ${EXTENT.width} ${EXTENT.height}">
<path d="${sea}" fill="#0e0f0c" fill-opacity="0.035"/>
<path d="${campus}" fill="none" stroke="#163300" stroke-opacity="0.22" stroke-width="5" stroke-dasharray="18 14"/>
<path d="${footprints}" fill="#0e0f0c" fill-opacity="0.06"/>
${roadPaths.join('\n')}
</svg>
`;

// ---- Route: shortest drive over the road network (footpaths excluded) ----
const key = ([x, z]) => `${x},${z}`;
const nodes = new Map();
const edges = new Map();
const link = (a, b) => {
  const list = edges.get(key(a)) || [];
  list.push([key(b), Math.hypot(a[0] - b[0], a[1] - b[1])]);
  edges.set(key(a), list);
};
for (const road of map.roads) {
  if (road.c === 'path') continue;
  road.p.forEach((pt, i) => {
    nodes.set(key(pt), pt);
    if (i) {
      link(road.p[i - 1], pt);
      link(pt, road.p[i - 1]);
    }
  });
}

const nearestNode = (target) => {
  let best = null;
  let bestDist = Infinity;
  for (const pt of nodes.values()) {
    const d = Math.hypot(pt[0] - target[0], pt[1] - target[1]);
    if (d < bestDist) [best, bestDist] = [pt, d];
  }
  return key(best);
};

function shortestPath(fromKey, toKey) {
  const dist = new Map([[fromKey, 0]]);
  const prev = new Map();
  const open = new Set([fromKey]);
  while (open.size) {
    let u = null;
    for (const k of open) if (u === null || dist.get(k) < dist.get(u)) u = k;
    open.delete(u);
    if (u === toKey) break;
    for (const [v, w] of edges.get(u) || []) {
      const d = dist.get(u) + w;
      if (d < (dist.get(v) ?? Infinity)) {
        dist.set(v, d);
        prev.set(v, u);
        open.add(v);
      }
    }
  }
  if (!dist.has(toKey)) throw new Error(`No road route from ${ROUTE.from} to ${ROUTE.to}`);
  const path = [];
  for (let k = toKey; k; k = prev.get(k)) path.unshift(nodes.get(k));
  return { path, meters: dist.get(toKey) };
}

const place = (id) => {
  const found = ALL_PU_LOCATIONS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown campus place ${id}`);
  return found;
};

const from = place(ROUTE.from);
const to = place(ROUTE.to);
const trip = shortestPath(nearestNode(toLocal(from)), nearestNode(toLocal(to)));

const data = {
  attribution: map.attribution,
  plan: EXTENT,
  route: {
    from: from.name,
    to: to.name,
    meters: n(trip.meters),
    d: line(trip.path),
    start: trip.path[0].map(n),
    end: trip.path.at(-1).map(n),
  },
};

writeFileSync(join(root, 'src/assets/campus-plan.svg'), svg);
writeFileSync(join(root, 'src/data/heroCampusPlan.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`campus-plan.svg ${(svg.length / 1024).toFixed(0)} kB; route ${from.name} → ${to.name}, ${data.route.meters} m`);
