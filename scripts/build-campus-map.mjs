// Builds src/data/pu_campus_map.json: real campus geometry from OpenStreetMap, matched to the
// places in the Apple Maps campus spec (src/data/pu_apple_maps_reference.json).
//
//   node scripts/build-campus-map.mjs                 # fetch fresh data from the Overpass API
//   node scripts/build-campus-map.mjs --osm file.json # reuse a saved Overpass response
//
// The spec stays the catalogue (names, categories, heights, colours, descriptions). OSM supplies
// where things really are: building outlines, the road network, campus boundaries, sports
// grounds, parks and the coastline. Map data © OpenStreetMap contributors, ODbL.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(root, 'src/data/pu_apple_maps_reference.json'), 'utf8'));

// Same local frame as the spec: metres from its origin, +X east, +Z south
const { origin_gps: ORIGIN, constants } = spec.metadata.coordinate_reference_system.local_cartesian_projection;
const toLocal = (lat, lng) => [
  round((lng - ORIGIN.lng) * constants.lng_to_meters),
  round(-(lat - ORIGIN.lat) * constants.lat_to_meters),
];
const round = (v) => Math.round(v * 10) / 10;

const BBOX = '12.010,79.842,12.038,79.868';
const QUERY = `[out:json][timeout:90];(
  way["building"](${BBOX});
  way["highway"](${BBOX});
  way["amenity"="university"](12.000,79.835,12.045,79.875);
  way["leisure"](${BBOX});
  way["natural"="coastline"](12.000,79.840,12.045,79.880);
);out geom tags;`;

async function loadOsm() {
  const fileFlag = process.argv.indexOf('--osm');
  if (fileFlag !== -1) return JSON.parse(readFileSync(process.argv[fileFlag + 1], 'utf8')).elements;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'UniGo campus map builder' },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  if (!res.ok) throw new Error(`Overpass request failed: ${res.status}`);
  return (await res.json()).elements;
}

const elements = (await loadOsm()).filter((e) => e.type === 'way' && e.geometry?.length > 1);
const pointsOf = (e) => e.geometry.map((p) => toLocal(p.lat, p.lon));
const centroid = (pts) => {
  const ring = pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1] ? pts.slice(0, -1) : pts;
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
};
const areaOf = (pts) => Math.abs(pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + p[0] * q[1] - q[0] * p[1];
}, 0)) / 2;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---- Buildings ----
const buildings = elements
  .filter((e) => e.tags?.building)
  .map((e) => {
    const pts = pointsOf(e);
    return { id: e.id, name: e.tags.name || '', tags: e.tags, pts, c: centroid(pts), area: areaOf(pts) };
  })
  .filter((b) => b.area > 12);

// Spec places whose OSM names differ from the spec's wording
const ALIASES = {
  'central-library': 'Anandha Rangapillai Library',
  'admin-office-complex': 'Administrative Office Complex',
  'jn-auditorium': 'Jawaharlal Nehru Auditorium',
  'lecture-hall-complex-1': 'Lecture Hall Complex - I (LHC - I)',
  'lecture-hall-complex-2': 'Lecture Hall Complex - 2',
  'dept-biotechnology': 'Department of Bio-Technology',
  'dept-bioinformatics': 'Department of Bio-Informatics',
  'transit-hostel': 'Transit Hostel',
  'kendriya-vidyalaya-2': 'kendra vidyalaya 2',
  'health-centre': 'University Health Center',
  'gh-kalpana-chawla': 'Kalapana Chawla Ladies Hostel',
  'gh-narmatha': 'narmatha  ladies hostel',
  'bh-subramania-bharathi': 'Subhramania Bharathiar Boys Hostel',
  'bh-sri-aurobindo': 'Sri Aurobindo Hostel - Boys',
  'campus-temple': 'Shree Valampuri Vidyalaya Vinayagar Temple',
  'canteen-1-central': 'Pondicherry University Canteen-1',
  'canteen-2-science': 'Canteen 2',
  'shopping-complex-central': 'Shopping Complex',
  'indian-bank-central': 'Indian Bank',
  'performing-arts-complex': 'Department of Performing Arts',
  'distance-education-block': 'Distance Education Directorate',
  'digital-reading-hall': 'Reading Hall',
  'sjc-canteen-cultural': 'Canteen (Ground Floor) & Cultural Centre (First Floor), Pondicherry University, India',
  'school-tamil-literature': 'Subramania Bharathiar School Of Tamil Language And Literature, Pondicherry University, Kalapet',
  'unesco-south-asia': 'UNESCO Madanjeet Singh Institute Of South Asia Regional Co-operation, Pondicherry University, India',
  'umsget-green-energy': 'UNESCO Madanjeet Singh School of Green Energy Technology (UMSGET)',
  'ramanujan-math-school': 'Ramanujan School of Mathematical Sciences (Dept of Maths and Statistics)',
};
// Not buildings in OSM: drawn from OSM areas (stadium) or as arches across their road (gates)
const NOT_BUILDINGS = new Set(['rajiv-gandhi-stadium', 'central-gymnasium-complex', 'gate-1-main', 'gate-2-kalapet', 'gender-gate']);

const STOP = new Set('of the and department dept pondicherry university india kalapet floor ground first second both boys ladies hostel centre center school complex building for'.split(' '));
const tokens = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((t) => t.length > 1 && !STOP.has(t)));
const similarity = (a, b) => {
  const ta = tokens(a);
  const tb = tokens(b);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return shared / (new Set([...ta, ...tb]).size || 1);
};

// Driveable streets, densified so an outline test catches a road passing straight through
const densify = (pts, step = 4) =>
  pts.flatMap((p, i) => {
    if (i === pts.length - 1) return [p];
    const q = pts[i + 1];
    const n = Math.max(1, Math.ceil(dist(p, q) / step));
    return Array.from({ length: n }, (_, k) => [p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  });
const streets = elements
  .filter((e) => e.tags?.highway && !['path', 'footway', 'track', 'steps', 'cycleway'].includes(e.tags.highway))
  .map((e) => densify(pointsOf(e)));

const claimed = new Map(); // osm id -> spec id
const places = {};
const report = [];
const specPos = (b) => [b.local_position_m.x, b.local_position_m.z];

const claim = (sb, osm, how) => {
  claimed.set(osm.id, sb.id);
  places[sb.id] = { fp: osm.pts, osm: osm.id };
  report.push([sb.id, how, osm.name || '(unnamed)', Math.round(dist(osm.c, specPos(sb)))]);
};

// 1. Exact names, 2. close name match nearby, 3. nearest unclaimed building of similar size
for (const sb of spec.buildings) {
  if (NOT_BUILDINGS.has(sb.id)) continue;
  const alias = ALIASES[sb.id];
  const exact = alias && buildings.find((b) => b.name === alias && !claimed.has(b.id));
  if (exact) {
    claim(sb, exact, 'name');
    continue;
  }
  const byName = buildings
    .filter((b) => b.name && !claimed.has(b.id) && dist(b.c, specPos(sb)) < 150)
    .map((b) => ({ b, s: similarity(sb.name, b.name) }))
    .filter(({ s }) => s >= 0.5)
    .sort((x, y) => y.s - x.s || dist(x.b.c, specPos(sb)) - dist(y.b.c, specPos(sb)))[0];
  if (byName) claim(sb, byName.b, 'name');
}
for (const sb of spec.buildings) {
  if (NOT_BUILDINGS.has(sb.id) || places[sb.id]) continue;
  const specArea = sb.dimensions_m.width * sb.dimensions_m.depth;
  const nearest = buildings
    .filter((b) => !claimed.has(b.id) && dist(b.c, specPos(sb)) < 75 && b.area > specArea * 0.15)
    .sort((x, y) => dist(x.c, specPos(sb)) - dist(y.c, specPos(sb)))[0];
  if (nearest) {
    claim(sb, nearest, 'nearest');
    continue;
  }
  // No real outline: keep the spec rectangle only if it sits on open ground, clear of real
  // buildings and roads; otherwise the place is a badge without a building
  const [cx, cz] = specPos(sb);
  const { width: w, depth: d } = sb.dimensions_m;
  const overlapsBox = (pts) => {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    return Math.min(...xs) < cx + w / 2 && Math.max(...xs) > cx - w / 2 && Math.min(...zs) < cz + d / 2 && Math.max(...zs) > cz - d / 2;
  };
  const inBox = ([x, z]) => Math.abs(x - cx) < w / 2 && Math.abs(z - cz) < d / 2;
  const hits = buildings.filter((b) => overlapsBox(b.pts));
  const roadHits = streets.filter((r) => r.some(inBox));
  if (hits.length || roadHits.length) {
    places[sb.id] = { fp: null };
    const why = hits.length ? `${hits.length} real building(s)` : `${roadHits.length} road(s)`;
    report.push([sb.id, 'marker only', `spec outline overlaps ${why}`, 0]);
  } else {
    report.push([sb.id, 'spec outline', '', 0]);
  }
}

// Context buildings: everything OSM has that the spec doesn't name
const levelsHeight = (tags) => (tags['building:levels'] ? Math.min(30, Number.parseFloat(tags['building:levels']) * 3.4) : null);
const contextBuildings = buildings
  .filter((b) => !claimed.has(b.id))
  .map((b) => ({
    fp: b.pts,
    h: round(levelsHeight(b.tags) ?? (b.area < 120 ? 4 : b.area < 450 ? 7 : b.area < 1500 ? 10 : 13)),
  }));
for (const [osmId, specId] of claimed) {
  const lv = levelsHeight(buildings.find((b) => b.id === osmId).tags);
  if (lv) places[specId].levelsHeight = round(lv);
}

// ---- Roads ----
const ROAD_CLASS = {
  trunk: ['trunk', 14],
  trunk_link: ['trunk', 9],
  secondary: ['road', 10],
  tertiary: ['road', 9],
  unclassified: ['road', 7.5],
  residential: ['road', 7],
  road: ['road', 7],
  living_street: ['service', 5.5],
  service: ['service', 5.5],
  construction: ['service', 5.5],
  track: ['path', 3],
  path: ['path', 2.5],
  footway: ['path', 2.5],
};
const roads = elements
  .filter((e) => ROAD_CLASS[e.tags?.highway])
  .map((e) => {
    const [cls, width] = ROAD_CLASS[e.tags.highway];
    const road = { c: cls, w: width, p: pointsOf(e) };
    if (e.tags.name) road.n = e.tags.name;
    const limit = Number.parseFloat(e.tags.maxspeed);
    if (limit) road.v = limit;
    return road;
  });

// ---- Areas ----
const areas = [];
for (const e of elements) {
  const t = e.tags || {};
  const pts = pointsOf(e);
  let kind = null;
  if (t.amenity === 'university') kind = 'campus';
  else if (t.leisure === 'park' || t.leisure === 'garden') kind = 'park';
  else if (t.leisure === 'pitch') kind = t.sport === 'tennis' || t.sport === 'basketball' ? 'court' : 'pitch';
  else if (t.leisure === 'track') kind = 'track';
  else if (t.leisure === 'sports_centre' && !t.building) kind = 'sports';
  else if (t.leisure === 'swimming_pool') kind = 'pool';
  if (!kind) continue;
  const area = { k: kind, p: pts };
  if (t.name) area.n = t.name;
  areas.push(area);
}

// ---- Gates: where each gate road crosses the university boundary ----
const GATE_ROADS = {
  'gate-1-main': 'Pondicherry University Road Gate Number 1',
  'gate-2-kalapet': 'Pondicherry University Road Gate Number 2',
};
const crossing = (p, q, a, b) => {
  const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d;
  const u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [round(p[0] + t * (q[0] - p[0])), round(p[1] + t * (q[1] - p[1]))] : null;
};
const boundary = areas.find((a) => a.k === 'campus' && a.n === 'Pondicherry University')?.p || [];
for (const [gateId, roadName] of Object.entries(GATE_ROADS)) {
  const sb = spec.buildings.find((b) => b.id === gateId);
  const hits = roads
    .filter((r) => r.n === roadName)
    .flatMap((r) => r.p.slice(1).flatMap((q, i) => boundary.slice(1).map((b, j) => crossing(r.p[i], q, boundary[j], b))))
    .filter(Boolean)
    .sort((x, y) => dist(x, specPos(sb)) - dist(y, specPos(sb)));
  if (hits.length) {
    places[gateId] = { fp: null, at: hits[0] };
    report.push([gateId, 'gate on boundary', roadName, Math.round(dist(hits[0], specPos(sb)))]);
  }
}

// ---- Coastline: stitch the ways into one line running north to south ----
const coastWays = elements.filter((e) => e.tags?.natural === 'coastline').map(pointsOf);
let coast = coastWays.shift() || [];
while (coastWays.length) {
  const i = coastWays.findIndex((w) => dist(w[0], coast.at(-1)) < 1 || dist(w.at(-1), coast[0]) < 1);
  if (i === -1) break;
  const [way] = coastWays.splice(i, 1);
  coast = dist(way[0], coast.at(-1)) < 1 ? [...coast, ...way.slice(1)] : [...way, ...coast.slice(1)];
}
coast = coast.filter(([x, z]) => z > -4200 && z < 5200 && x > -2500 && x < 5000);
if (coast.length && coast[0][1] > coast.at(-1)[1]) coast.reverse();

const out = {
  attribution: 'Map data © OpenStreetMap contributors (ODbL); place catalogue from APPLE_MAPS_PU_SPEC',
  generated: new Date().toISOString().slice(0, 10),
  places,
  buildings: contextBuildings,
  roads,
  areas,
  coast,
};
writeFileSync(join(root, 'src/data/pu_campus_map.json'), JSON.stringify(out));

console.log(`buildings matched to OSM outlines: ${Object.values(places).filter((p) => p.fp).length} / ${spec.buildings.length - NOT_BUILDINGS.size}`);
console.log(`context buildings ${contextBuildings.length}, roads ${roads.length}, areas ${areas.length}, coast points ${coast.length}`);
report.sort((a, b) => b[3] - a[3]).forEach(([id, how, name, off]) => console.log(`  ${id.padEnd(28)} ${how.padEnd(18)} ${String(off).padStart(4)} m  ${name.slice(0, 60)}`));
