// Scene construction for the campus map. Real geometry comes from OpenStreetMap
// (src/data/pu_campus_map.json, built by scripts/build-campus-map.mjs); names, categories, heights
// and colours come from the Apple Maps campus spec. World units are metres: +X east, +Z south.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, BUILDINGS, BUS_STOPS, GEOMETRY, LANDMARK_IDS, shortLabel, displayName } from '../data/puAppleMap';

// Flat ground layers stack in this order; roads sit above every ground fill
const LAYER = {
  water: 0.1, sand: 0.18, campus: 0.22, grove: 0.3, park: 0.36, sports: 0.4, pitch: 0.46, track: 0.5, court: 0.54,
  casing: { service: 0.7, road: 0.74, trunk: 0.78 },
  fill: { path: 0.86, service: 0.9, road: 0.95, trunk: 1.0 },
};
const ROAD_SCALE = 1.4; // Roads read wider than life, as on any map

// ---------------------------------------------------------------------------
// Geometry helpers on plain [x, z] rings
// ---------------------------------------------------------------------------

const openRing = (pts) => {
  const last = pts[pts.length - 1];
  return pts.length > 2 && pts[0][0] === last[0] && pts[0][1] === last[1] ? pts.slice(0, -1) : pts;
};

const signedArea = (ring) =>
  ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + p[0] * q[1] - q[0] * p[1];
  }, 0) / 2;

const centroidOf = (ring) => {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-6) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  let cx = 0;
  let cz = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cz += (p[1] + q[1]) * f;
  });
  return [cx / (6 * a), cz / (6 * a)];
};

const bboxOf = (ring) => {
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
};

const insidePolygon = (x, z, ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

const distanceToSegment = (px, pz, a, b) => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
};

// Oriented box along the longest edge: used to align roofs and arches with the real footprint
const orientedBox = (ring) => {
  let best = { len: -1, angle: 0 };
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len > best.len) best = { len, angle: Math.atan2(q[1] - p[1], q[0] - p[0]) };
  });
  const ux = Math.cos(best.angle);
  const uz = Math.sin(best.angle);
  const along = ring.map((p) => p[0] * ux + p[1] * uz);
  const across = ring.map((p) => -p[0] * uz + p[1] * ux);
  const [a0, a1, c0, c1] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
  const ca = (a0 + a1) / 2;
  const cc = (c0 + c1) / 2;
  return { cx: ca * ux - cc * uz, cz: ca * uz + cc * ux, length: a1 - a0, span: c1 - c0, angle: best.angle };
};

// Box along a shape's principal axis: steadier than the longest edge for rounded outlines
const principalBox = (ring) => {
  const mx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const mz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  let sxx = 0;
  let szz = 0;
  let sxz = 0;
  ring.forEach(([x, z]) => {
    sxx += (x - mx) ** 2;
    szz += (z - mz) ** 2;
    sxz += (x - mx) * (z - mz);
  });
  const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const along = ring.map(([x, z]) => (x - mx) * ux + (z - mz) * uz);
  const across = ring.map(([x, z]) => -(x - mx) * uz + (z - mz) * ux);
  const ca = (Math.min(...along) + Math.max(...along)) / 2;
  const cc = (Math.min(...across) + Math.max(...across)) / 2;
  return {
    cx: mx + ca * ux - cc * uz,
    cz: mz + ca * uz + cc * ux,
    length: Math.max(...along) - Math.min(...along),
    span: Math.max(...across) - Math.min(...across),
    angle,
  };
};

// A running track's outline: two straights joined by semicircles
const stadiumRing = ({ cx, cz, length, span, angle }, steps = 16) => {
  const r = Math.min(span, length) / 2;
  const straight = Math.max(0, length / 2 - r);
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const pts = [];
  [1, -1].forEach((side) => {
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / steps;
      const along = side * (straight + r * Math.cos(a));
      const across = side * r * Math.sin(a);
      pts.push([cx + along * ux - across * uz, cz + along * uz + across * ux]);
    }
  });
  return pts;
};

const scaleRing = (ring, [cx, cz], factor) => ring.map(([x, z]) => [cx + (x - cx) * factor, cz + (z - cz) * factor]);
const rectRing = (cx, cz, w, d) => [
  [cx - w / 2, cz - d / 2],
  [cx + w / 2, cz - d / 2],
  [cx + w / 2, cz + d / 2],
  [cx - w / 2, cz + d / 2],
];

// ---------------------------------------------------------------------------
// Places: the spec catalogue placed on real outlines
// ---------------------------------------------------------------------------

const PLACE_GEOMETRY = GEOMETRY.places;
const ROADS = GEOMETRY.roads;
const DRIVABLE = ROADS.filter((r) => r.c !== 'path');

const nearestRoad = (x, z, roads = DRIVABLE) => {
  let best = null;
  roads.forEach((road) => {
    for (let i = 0; i < road.p.length - 1; i++) {
      const d = distanceToSegment(x, z, road.p[i], road.p[i + 1]);
      if (!best || d < best.d) best = { d, road, a: road.p[i], b: road.p[i + 1] };
    }
  });
  return best;
};

// How long a place keeps its badge as you zoom out (camera distance in metres) and who wins collisions
const rangesFor = (kind, isLandmark) => {
  if (isLandmark) return { labelRange: 4200, dotRange: 9000, priority: 4 };
  if (kind === 'boys_hostel' || kind === 'girls_hostel' || kind === 'dining') return { labelRange: 1400, dotRange: 3000, priority: 3 };
  if (kind === 'bus') return { labelRange: 650, dotRange: 1300, priority: 1 };
  if (kind === 'bank_service' || kind === 'amenity') return { labelRange: 850, dotRange: 1900, priority: 1.5 };
  return { labelRange: 1150, dotRange: 2600, priority: 2 };
};

const GATE_IDS = new Set(['gate-1-main', 'gate-2-kalapet', 'gender-gate']);
// Places that are open ground (the stadium, the sports pavilion) rather than one building
const GROUND_PLACES = new Set(['rajiv-gandhi-stadium', 'central-gymnasium-complex']);

const buildingPlaces = BUILDINGS.map((b) => {
  const geometry = PLACE_GEOMETRY[b.id];
  const specRing = openRing(b.footprint_polygon_local_m);
  let footprint = null;
  if (geometry?.fp) footprint = openRing(geometry.fp);
  else if (!geometry && !GATE_IDS.has(b.id) && !GROUND_PLACES.has(b.id)) footprint = specRing;

  // Gates sit where their road crosses the campus boundary; everything else on its real outline
  const [x, z] = geometry?.at || (footprint ? centroidOf(footprint) : [b.local_position_m.x, b.local_position_m.z]);
  const box = bboxOf(footprint || specRing);
  const height = geometry?.levelsHeight ?? b.dimensions_m.height;
  let top = height + 3;
  if (b.id === 'central-library') top = 28;
  if (b.id === 'admin-office-complex') top = 44;
  // Open ground, or a place with no outline of its own: the badge stands just above the ground
  if (GROUND_PLACES.has(b.id) || (!footprint && !GATE_IDS.has(b.id))) top = 6;

  return {
    id: b.id,
    name: displayName(b),
    label: shortLabel(b),
    kind: b.category,
    color: b.apple_maps_visuals.pin_color,
    badge: b.apple_maps_visuals.badge_background,
    x,
    z,
    top,
    height,
    footprint,
    size: Math.max(box.maxX - box.minX, box.maxZ - box.minZ),
    data: b,
    ...rangesFor(b.category, LANDMARK_IDS.has(b.id)),
  };
});

// OSM maps some departments as rooms inside a larger building (the SJC libraries, for one).
// Those keep their own badge but share the host's walls instead of drawing a building within a building.
const CONTEXT_RINGS = GEOMETRY.buildings.map(({ fp, h }) => ({ ring: openRing(fp), h }));
buildingPlaces.forEach((place) => {
  if (!place.footprint) {
    // A badge-only place inside a building stands on that building's roof
    if (GATE_IDS.has(place.id) || GROUND_PLACES.has(place.id)) return;
    const host = buildingPlaces.find((other) => other.footprint && insidePolygon(place.x, place.z, other.footprint));
    const shell = !host && CONTEXT_RINGS.find(({ ring }) => insidePolygon(place.x, place.z, ring));
    if (host) {
      place.hostId = host.id;
      place.top = host.top;
    } else if (shell) {
      place.top = shell.h + 3;
    }
    return;
  }
  const host = buildingPlaces.find(
    (other) =>
      other !== place &&
      other.footprint &&
      Math.abs(signedArea(other.footprint)) > Math.abs(signedArea(place.footprint)) &&
      place.footprint.every(([x, z]) => insidePolygon(x, z, other.footprint) || other.footprint.some((a, i) => distanceToSegment(x, z, a, other.footprint[(i + 1) % other.footprint.length]) < 0.5))
  );
  if (!host) return;
  place.hostId = host.id;
  place.top = Math.max(place.top, host.top);
});

// Bus stops sit at the kerb of the nearest road, on the side the spec puts them
// A stop named for a gate waits just inside that gate, whatever the spec sketch says
const STOP_AT_GATE = { 'stop-gate-1-ecr': 'gate-1-main' };
const GATE_SHELTER_SETBACK = 40;
const stopPlaces = BUS_STOPS.map((s) => {
  let sx = s.local_position_m.x;
  let sz = s.local_position_m.z;
  const gate = buildingPlaces.find((p) => p.id === STOP_AT_GATE[s.id]);
  if (gate) {
    const inward = Math.hypot(sx - gate.x, sz - gate.z) || 1;
    sx = gate.x + ((sx - gate.x) / inward) * GATE_SHELTER_SETBACK;
    sz = gate.z + ((sz - gate.z) / inward) * GATE_SHELTER_SETBACK;
  }
  const near = nearestRoad(sx, sz);
  let x = sx;
  let z = sz;
  if (near) {
    const [ax, az] = near.a;
    const [bx, bz] = near.b;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const t = Math.max(0, Math.min(1, ((sx - ax) * (bx - ax) + (sz - az) * (bz - az)) / (len * len)));
    const px = ax + t * (bx - ax);
    const pz = az + t * (bz - az);
    let nx = -(bz - az) / len;
    let nz = (bx - ax) / len;
    if ((sx - px) * nx + (sz - pz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    const offset = (near.road.w * ROAD_SCALE) / 2 + 5;
    x = px + nx * offset;
    z = pz + nz * offset;
  }
  return {
    id: s.id,
    name: displayName(s),
    label: shortLabel(s),
    kind: 'bus',
    color: s.apple_maps_pin.color,
    badge: '#FFF5E6',
    x,
    z,
    top: 4,
    height: 0,
    footprint: null,
    size: 20,
    data: s,
    ...rangesFor('bus', false),
  };
});

export const PLACES = [...buildingPlaces, ...stopPlaces];

// Campus outline (both university polygons) for fitting the overview
const CAMPUS_RINGS = GEOMETRY.areas.filter((a) => a.k === 'campus').map((a) => openRing(a.p));
export const CAMPUS_POINTS = CAMPUS_RINGS.flat();
export const CAMPUS_BOUNDS = bboxOf(CAMPUS_POINTS);
const onCampus = (x, z) => CAMPUS_RINGS.some((ring) => insidePolygon(x, z, ring));

// Area text: sea, the highway and the campus districts (centred on their buildings)
export const AREA_LABELS = (() => {
  const trunk = ROADS.filter((r) => r.c === 'trunk').flatMap((r) => r.p);
  const ecrPoint = trunk.reduce((best, p) => (Math.abs(p[1] - 120) < Math.abs(best[1] - 120) ? p : best), trunk[0]);
  const coastPoint = GEOMETRY.coast.reduce((best, p) => (Math.abs(p[1] - 200) < Math.abs(best[1] - 200) ? p : best), GEOMETRY.coast[0]);
  const sectorCentre = (sector) => {
    const members = buildingPlaces.filter((p) => p.data.sector === sector && p.footprint);
    return [members.reduce((s, p) => s + p.x, 0) / members.length, members.reduce((s, p) => s + p.z, 0) / members.length];
  };
  const sectors = [
    ['silver_jubilee_campus', 'Silver Jubilee Campus'],
    ['central_academic_core', 'Academic Core'],
    ['science_research_complex', 'Science Complex'],
    ['north_boys_hostel_village', 'Boys Hostel Village'],
    ['girls_hostel_sanctuary', 'Girls Hostels'],
  ].map(([sector, text]) => {
    const [x, z] = sectorCentre(sector);
    return { id: sector, text, x, z: z + 75, kind: 'area', showFrom: 750, hideFrom: 3000 };
  });
  return [
    { id: 'sea', text: 'Bay of Bengal', x: coastPoint[0] + 420, z: coastPoint[1], kind: 'water', lead: true },
    { id: 'ecr', text: 'East Coast Road', x: ecrPoint[0], z: ecrPoint[1], kind: 'road' },
    // Open ground between the stadium and the girls hostels, clear of the landmark badges
    { id: 'campus', text: 'Pondicherry University', x: -420, z: 380, kind: 'area', showFrom: 2100, lead: true },
    ...sectors,
  ];
})();

// ---------------------------------------------------------------------------
// Map styles: colours and lights
// ---------------------------------------------------------------------------

// three's lights are physical, so these are tuned for flat ground to render at its token colour
// At night the "sun" light is the moon: cool, dimmer, and from wherever the moon is
const LIGHT_RIGS = {
  // Dawn: a fresh, cool sky with a pale peach sun low in the east
  sunrise: { ambient: ['#EEF2FA', 1.3], hemi: ['#E2EBFF', '#D2D5D0', 0.9], sun: ['#FFD9BC', 1.3], azimuth: 100, elevation: 22 },
  day: { ambient: ['#E6EEF8', 1.25], hemi: ['#DCEEFF', '#D6DCD4', 0.9], sun: ['#FFF8EE', 1.35], azimuth: 220, elevation: 45 },
  sunset: { ambient: ['#F6F0EC', 1.3], hemi: ['#FFEDE0', '#D9CEC3', 0.85], sun: ['#FFC69A', 1.35], azimuth: 250, elevation: 24 },
  night: { ambient: ['#B9C4DC', 1.6], hemi: ['#A9B4D0', '#202125', 0.9], sun: ['#C8D5FF', 0.8], azimuth: 140, elevation: 55 },
};

// Low sun washes the light palette with its colour: rose-gold at dawn, amber at dusk
const STYLE_TINT = { sunrise: [new THREE.Color('#ffe0d6'), 0.05], sunset: [new THREE.Color('#ffc9a0'), 0.08] };
const colourForStyle = (lightHex, darkHex, style) => {
  if (style === 'night') return darkHex;
  const tint = STYLE_TINT[style];
  if (tint) return `#${new THREE.Color(lightHex).lerp(tint[0], tint[1]).getHexString()}`;
  return lightHex;
};

// Where the light comes from. With the real sky (automatic style) the sun's shadows follow its
// actual bearing over campus, kept high enough to read; at night the moon lights the map if it is
// up, brighter when fuller, and otherwise a faint starlight from overhead does.
function lightFor(style, rig, sky) {
  if (!sky) return { azimuth: rig.azimuth, elevation: rig.elevation, intensity: rig.sun[1] };
  if (style !== 'night') {
    return { azimuth: sky.sun.azimuth, elevation: THREE.MathUtils.clamp(sky.sun.altitude, 20, 75), intensity: rig.sun[1] };
  }
  if (sky.moon.altitude > 3) {
    return { azimuth: sky.moon.azimuth, elevation: THREE.MathUtils.clamp(sky.moon.altitude, 18, 75), intensity: rig.sun[1] * (0.55 + 0.45 * sky.moonLit) };
  }
  return { azimuth: rig.azimuth, elevation: 70, intensity: rig.sun[1] * 0.45 };
}

// ---------------------------------------------------------------------------
// Facades: a window per bay on every floor, drawn once into a small texture. At night a matching
// mask lights a few of them: about one in nine on hostels (late-night study), one in twenty elsewhere.
// ---------------------------------------------------------------------------

const FLOOR_HEIGHT = 3.4;
const BAY_WIDTH = 3.6;
const FACADE_CELLS = 4; // the texture holds 4 × 4 bays so neighbouring windows vary
const FACADE_PX = 256;

let facadeTextures;
function getFacadeTextures() {
  if (facadeTextures !== undefined) return facadeTextures;
  if (typeof document === 'undefined') return (facadeTextures = null);
  const random = seededRandom(31);
  const cell = FACADE_PX / FACADE_CELLS;
  const bays = [];
  for (let row = 0; row < FACADE_CELLS; row++) {
    for (let col = 0; col < FACADE_CELLS; col++) bays.push({ x: col * cell, y: row * cell, glass: 150 + random() * 26, chance: random() });
  }
  const pane = (ctx, { x, y }) => ctx.fillRect(x + cell * 0.2, y + cell * 0.2, cell * 0.6, cell * 0.46);
  const paint = (draw) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FACADE_PX;
    draw(canvas.getContext('2d'));
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  facadeTextures = {
    // White wall (tinted by each building's colour), cool glass, a sill and the slab line between floors
    map: paint((ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, FACADE_PX, FACADE_PX);
      bays.forEach((bay) => {
        ctx.fillStyle = '#e4e1da';
        ctx.fillRect(bay.x, bay.y + cell - 4, cell, 4);
        const g = Math.round(bay.glass);
        ctx.fillStyle = `rgb(${g - 22}, ${g - 6}, ${g + 18})`;
        pane(ctx, bay);
        ctx.fillStyle = '#f6f4ee';
        ctx.fillRect(bay.x + cell * 0.16, bay.y + cell * 0.66, cell * 0.68, 3);
      });
    }),
  };
  const lights = (share) =>
    paint((ctx) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, FACADE_PX, FACADE_PX);
      ctx.fillStyle = '#ffffff';
      bays.filter((bay) => bay.chance < share).forEach((bay) => pane(ctx, bay));
    });
  facadeTextures.lights = { hostel: lights(0.11), few: lights(0.05) };
  return facadeTextures;
}

export function createMaterialRegistry() {
  const entries = [];
  const cache = new Map();
  const remember = (key, create, light, dark, flags = {}) => {
    if (cache.has(key)) return cache.get(key);
    const mat = create();
    entries.push({ mat, light, dark, ...flags });
    cache.set(key, mat);
    return mat;
  };
  const lambert = (light, dark, side = THREE.FrontSide) =>
    remember(`mesh|${light}|${dark}|${side}`, () => new THREE.MeshLambertMaterial({ side }), light, dark);
  const line = (light, dark) => remember(`line|${light}|${dark}`, () => new THREE.LineBasicMaterial(), light, dark);
  const token = (name, side) => lambert(PALETTE.light[name], PALETTE.dark[name], side);
  // Walls with windows (needs UVs from wallsGeometry); falls back to plain walls without a DOM.
  // `glow` picks how many windows light up at night: 'hostel' or 'few'.
  const facade = (light, dark, glow = 'few') => {
    const textures = getFacadeTextures();
    if (!textures) return lambert(light, dark);
    return remember(
      `facade|${light}|${dark}|${glow}`,
      () => new THREE.MeshLambertMaterial({ map: textures.map, emissiveMap: textures.lights[glow] }),
      light,
      dark,
      { lit: true }
    );
  };
  return { entries, lambert, line, token, facade };
}

// Recolours the whole scene for a style ('sunrise' | 'day' | 'sunset' | 'night'), then lights it
export function applyStyle(state, style, sky = null) {
  const { scene, registry, world } = state;
  const background = colourForStyle(PALETTE.light.canvas_background, PALETTE.dark.canvas_background, style);
  scene.background.set(background);
  scene.fog.color.set(background);
  registry.entries.forEach(({ mat, light, dark, lit }) => {
    mat.color.set(colourForStyle(light, dark, style));
    // Some windows glow warm after dark
    if (lit) {
      mat.emissive.set(style === 'night' ? '#ffcf8a' : '#000000');
      mat.emissiveIntensity = style === 'night' ? 0.5 : 0;
    }
  });

  world.trees.groups.forEach(({ mesh, palette, variants }) => {
    const shades = palette.map(([light, dark]) => new THREE.Color(colourForStyle(light, dark, style)));
    variants.forEach((variant, i) => mesh.setColorAt(i, shades[variant]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Street lights come on after dark
  world.streetLights?.setOn(style === 'night');
  applyLighting(state, style, sky);
}

// Just the lights: cheap enough to run every minute as the real sun and moon move
export function applyLighting({ ambient, hemi, sun, sunDirection, world }, style, sky = null) {
  const rig = LIGHT_RIGS[style] || LIGHT_RIGS.day;
  ambient.color.set(rig.ambient[0]);
  ambient.intensity = rig.ambient[1];
  hemi.color.set(rig.hemi[0]);
  hemi.groundColor.set(rig.hemi[1]);
  hemi.intensity = rig.hemi[2];
  sun.color.set(rig.sun[0]);
  const light = lightFor(style, rig, sky);
  sun.intensity = light.intensity;
  // Azimuth is clockwise from north (-Z); elevation is above the horizon
  const az = THREE.MathUtils.degToRad(light.azimuth);
  const el = THREE.MathUtils.degToRad(light.elevation);
  sunDirection.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

  // Moonlight on the sea while the moon is up (a fixed style assumes a bright moon in the south-east)
  const moonUp = style === 'night' && (!sky || sky.moon.altitude > 3);
  world?.moonSheen?.set(moonUp, sky ? sky.moon.azimuth : rig.azimuth, sky ? sky.moonLit : 0.8);
}

// ---------------------------------------------------------------------------
// Batching: static geometry is merged per material, so ~800 buildings and ~300 roads
// cost a handful of draw calls
// ---------------------------------------------------------------------------

function createBatcher() {
  const buckets = new Map();
  // Every geometry in a bucket must carry the same attributes; textured materials keep UVs
  const prepare = (geometry, keepUv) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    Object.keys(g.attributes).forEach((name) => {
      if (name !== 'position' && name !== 'normal' && !(keepUv && name === 'uv')) g.deleteAttribute(name);
    });
    g.clearGroups();
    return g;
  };
  const add = (geometry, material, { cast = false, kind = 'mesh' } = {}) => {
    const key = `${material.uuid}|${cast}|${kind}`;
    if (!buckets.has(key)) buckets.set(key, { material, cast, kind, geometries: [] });
    buckets.get(key).geometries.push(kind === 'line' ? geometry : prepare(geometry, Boolean(material.map)));
  };
  const flush = (parent) => {
    buckets.forEach(({ material, cast, kind, geometries }) => {
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!merged) return;
      const object = kind === 'line' ? new THREE.LineSegments(merged, material) : new THREE.Mesh(merged, material);
      if (kind === 'line') object.raycast = () => {};
      object.castShadow = cast;
      object.receiveShadow = kind !== 'line';
      object.matrixAutoUpdate = false;
      parent.add(object);
    });
  };
  return { add, flush };
}


const flatPolygon = (ring, y) => {
  const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);
  return geometry;
};

const flatDisc = (x, z, r, y, segments = 12) => {
  const geometry = new THREE.CircleGeometry(r, segments).rotateX(-Math.PI / 2);
  geometry.translate(x, y, z);
  return geometry;
};

// A road: one quad per segment plus a round join at every vertex, which keeps bends clean
function roadGeometry(points, width, y) {
  const half = width / 2;
  const positions = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const nx = (-(bz - az) / len) * half;
    const nz = ((bx - ax) / len) * half;
    const a1 = [ax + nx, y, az + nz];
    const a2 = [ax - nx, y, az - nz];
    const b1 = [bx + nx, y, bz + nz];
    const b2 = [bx - nx, y, bz - nz];
    positions.push(...a1, ...b1, ...a2, ...a2, ...b1, ...b2);
  }
  const strip = new THREE.BufferGeometry();
  strip.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  strip.setAttribute('normal', new THREE.Float32BufferAttribute(positions.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const joins = points.map(([x, z]) => flatDisc(x, z, half, y, width > 12 ? 16 : 10));
  return [strip, ...joins];
}

// Walls of a footprint ring, facing outward. UVs run in metres along and up the wall,
// scaled so one texture cell is one window bay by one floor.
function wallsGeometry(ring, base, top) {
  const outer = signedArea(ring) > 0 ? ring : [...ring].reverse();
  const positions = [];
  const normals = [];
  const uvs = [];
  const uSpan = BAY_WIDTH * FACADE_CELLS;
  const vSpan = FLOOR_HEIGHT * FACADE_CELLS;
  let along = 0;
  outer.forEach((a, i) => {
    const b = outer[(i + 1) % outer.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const n = [dz / len, 0, -dx / len];
    const a0 = [a[0], base, a[1]];
    const a1 = [a[0], top, a[1]];
    const b0 = [b[0], base, b[1]];
    const b1 = [b[0], top, b[1]];
    positions.push(...a0, ...a1, ...b0, ...b0, ...a1, ...b1);
    for (let k = 0; k < 6; k++) normals.push(...n);
    const [u0, u1, v0, v1] = [along / uSpan, (along + len) / uSpan, base / vSpan, top / vSpan];
    uvs.push(u0, v0, u0, v1, u1, v0, u1, v0, u0, v1, u1, v1);
    along += len;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

// Roof outline plus the vertical corners that turn sharply: Apple's crisp building edges
function outlineGeometry(ring, base, top) {
  const positions = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    positions.push(a[0], top, a[1], b[0], top, b[1]);
    const prev = ring[(i - 1 + ring.length) % ring.length];
    const v1 = [a[0] - prev[0], a[1] - prev[1]];
    const v2 = [b[0] - a[0], b[1] - a[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / ((Math.hypot(...v1) * Math.hypot(...v2)) || 1);
    if (cos < 0.9) positions.push(a[0], base, a[1], a[0], top, a[1]);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

// ---------------------------------------------------------------------------
// Occupancy grid: keeps trees off buildings, roads and sports grounds
// ---------------------------------------------------------------------------

function createGrid(bounds, cell) {
  const cols = Math.ceil((bounds.maxX - bounds.minX) / cell);
  const rows = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
  const cells = new Uint8Array(cols * rows);
  const index = (x, z) => {
    const c = Math.floor((x - bounds.minX) / cell);
    const r = Math.floor((z - bounds.minZ) / cell);
    return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
  };
  const forCells = (box, margin, test) => {
    for (let x = box.minX - margin; x <= box.maxX + margin; x += cell) {
      for (let z = box.minZ - margin; z <= box.maxZ + margin; z += cell) {
        const i = index(x, z);
        if (i >= 0 && !cells[i] && test(x + cell / 2, z + cell / 2)) cells[i] = 1;
      }
    }
  };
  return {
    blockPolygon: (ring, margin) =>
      forCells(bboxOf(ring), margin, (x, z) =>
        insidePolygon(x, z, ring) || ring.some((p, i) => distanceToSegment(x, z, p, ring[(i + 1) % ring.length]) < margin)
      ),
    blockSegment: (a, b, radius) =>
      forCells(
        { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[1], b[1]), maxZ: Math.max(a[1], b[1]) },
        radius,
        (x, z) => distanceToSegment(x, z, a, b) < radius
      ),
    isFree: (x, z) => {
      const i = index(x, z);
      return i >= 0 && !cells[i];
    },
  };
}

// Seeded random so trees land in the same places on every visit
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Trees: three species, each an instanced crown over a shared instanced trunk. Crowns are
// shaded darker underneath (vertex colour × each tree's colour) so they read as round masses.
// ---------------------------------------------------------------------------

const shadeByHeight = (geometry, low) => {
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const v = low + (1 - low) * ((pos.getY(i) - min.y) / (max.y - min.y || 1)) ** 0.8;
    colors.set([v, v, v], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
};

// Neem, rain tree, mango: a lumpy rounded crown of three overlapping lobes, about 2 units across
function broadleafCrown() {
  const random = seededRandom(5);
  const nudges = new Map();
  const lobe = (r, x, y, z, detail) => {
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    // Push each vertex in or out a little so the outline isn't a perfect ball (shared corners move together)
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const key = `${r}:${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!nudges.has(key)) nudges.set(key, 0.9 + random() * 0.2);
      const k = nudges.get(key);
      pos.setXYZ(i, pos.getX(i) * k + x, pos.getY(i) * k * 0.82 + y, pos.getZ(i) * k + z);
    }
    return g;
  };
  // The main lobe carries the silhouette; the smaller side lobes can be coarser (120 triangles in all)
  const crown = mergeVertices(
    mergeGeometries([lobe(1, 0, 0.12, 0, 1), lobe(0.74, 0.62, -0.16, 0.24, 0), lobe(0.7, -0.52, -0.1, -0.32, 0)])
  );
  crown.computeVertexNormals();
  return shadeByHeight(crown, 0.66);
}

// Casuarina, the feathery spire planted all along the Coromandel coast: two stacked cones, 1 unit tall
function casuarinaCrown() {
  const lower = new THREE.ConeGeometry(1, 2.4, 9).translate(0, 1.2, 0);
  const upper = new THREE.ConeGeometry(0.7, 2, 9).translate(0, 2.4, 0);
  [lower, upper].forEach((g) => g.deleteAttribute('uv'));
  return shadeByHeight(mergeGeometries([lower, upper]).scale(1, 1 / 3.4, 1), 0.7);
}

// Coconut palm: eight arching fronds from the crown, 1 unit long
function palmCrown() {
  const positions = [];
  const fronds = 8;
  for (let k = 0; k < fronds; k++) {
    const a = (k / fronds) * Math.PI * 2 + (k % 2) * 0.25;
    const [dx, dz] = [Math.cos(a), Math.sin(a)];
    const droop = 0.42 + (k % 3) * 0.1;
    // Spine: up from the crown, then curving down to the tip; widest in the middle
    const spine = [
      [0, 0.05, 0.03],
      [0.55, 0.24, 0.2],
      [1, -droop, 0.02],
    ];
    for (let i = 0; i < 2; i++) {
      const [d0, y0, w0] = spine[i];
      const [d1, y1, w1] = spine[i + 1];
      const l0 = [dx * d0 - dz * w0, y0, dz * d0 + dx * w0];
      const r0 = [dx * d0 + dz * w0, y0, dz * d0 - dx * w0];
      const l1 = [dx * d1 - dz * w1, y1, dz * d1 + dx * w1];
      const r1 = [dx * d1 + dz * w1, y1, dz * d1 - dx * w1];
      positions.push(...l0, ...l1, ...r0, ...r0, ...l1, ...r1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return shadeByHeight(g, 0.78);
}

// ---------------------------------------------------------------------------
// Roofs: a parapet around flat roofs, and the stair cabin and black water tanks found on
// almost every flat roof on campus
// ---------------------------------------------------------------------------

const PARAPET = 0.9;
const PARAPET_MIN_HEIGHT = 6; // sheds and kiosks don't get one

function roofFurniture(ring, roofY, random) {
  const items = { cabins: [], tanks: [] };
  const area = Math.abs(signedArea(ring));
  if (area < 140) return items;
  const box = bboxOf(ring);
  const { angle } = orientedBox(ring);
  // A spot whose whole footprint (plus a margin from the parapet) is on the roof
  const spot = (radius) => {
    for (let tries = 0; tries < 14; tries++) {
      const x = box.minX + random() * (box.maxX - box.minX);
      const z = box.minZ + random() * (box.maxZ - box.minZ);
      const clear = [0, 1, 2, 3, 4, 5, 6, 7].every((k) => {
        const a = (k * Math.PI) / 4;
        return insidePolygon(x + Math.cos(a) * (radius + 1), z + Math.sin(a) * (radius + 1), ring);
      });
      if (clear && insidePolygon(x, z, ring)) return [x, z];
    }
    return null;
  };
  const cabin = spot(2.4);
  if (cabin) items.cabins.push(new THREE.BoxGeometry(3.6, 2.6, 3.2).rotateY(-angle).translate(cabin[0], roofY + 1.3, cabin[1]));
  const tanks = area > 900 ? 3 : area > 350 ? 2 : 1;
  for (let i = 0; i < tanks; i++) {
    const at = spot(1);
    if (at) items.tanks.push(new THREE.CylinderGeometry(0.85, 0.85, 1.5, 10).translate(at[0], roofY + 0.75, at[1]));
  }
  return items;
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const AREA_STYLE = {
  campus: ['campus_lawn', LAYER.campus],
  park: ['park_green', LAYER.park],
  sports: ['park_green', LAYER.sports],
  pitch: ['stadium_turf_grass', LAYER.pitch],
  court: ['tennis_court_blue', LAYER.court],
  pool: ['ocean_water', LAYER.court],
};

const ROAD_STYLE = {
  trunk: ['highway_fill', 'highway_casing'],
  road: ['arterial_road_fill', 'arterial_road_casing'],
  service: ['service_road_fill', 'service_road_casing'],
  path: ['pedestrian_walkway', null],
};

// ---------------------------------------------------------------------------
// Street lights: a few lamps along the university's own main roads, lit after dark. Night should
// read from the moonlight and a scatter of warm pools, not from floodlit streets. Each lamp's light
// is faked (a soft pool on the road and a small glow at the head, drawn additively), so the lamps
// cost four draw calls and no real lights.
// ---------------------------------------------------------------------------

// Inside the university almost every road is mapped as a service road; footpaths, the highway and
// the village outside stay dark
const LAMP_SPACING = { road: 110, service: 120 };
const LAMP_HEIGHT = 8;
const LAMP_REACH = 2.2; // the arm holds the lamp this far out over the road
const LAMP_POOL = 24; // diameter of the pool of light on the road
const LAMP_GAP = 60; // no two lamps closer than this, so junctions don't bunch up

function lampPositions() {
  // Lamps keep off buildings and off the carriageway of every road (junctions, crossings). Exact
  // tests against nearby shapes only, found through a coarse bucket grid.
  const BUCKET = 60;
  const bucketKey = (bx, bz) => `${bx},${bz}`;
  const buckets = new Map();
  const file = (box, item) => {
    for (let bx = Math.floor(box.minX / BUCKET); bx <= Math.floor(box.maxX / BUCKET); bx++) {
      for (let bz = Math.floor(box.minZ / BUCKET); bz <= Math.floor(box.maxZ / BUCKET); bz++) {
        const key = bucketKey(bx, bz);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(item);
      }
    }
  };
  [...GEOMETRY.buildings.map(({ fp }) => openRing(fp)), ...PLACES.filter((p) => p.footprint).map((p) => p.footprint)].forEach((ring) => {
    if (ring.length >= 3) file(bboxOf(ring), { ring, box: bboxOf(ring) });
  });
  ROADS.forEach((road) => {
    const half = (road.w * ROAD_SCALE) / 2;
    for (let i = 0; i < road.p.length - 1; i++) {
      const [a, b] = [road.p[i], road.p[i + 1]];
      file({ minX: Math.min(a[0], b[0]) - half, maxX: Math.max(a[0], b[0]) + half, minZ: Math.min(a[1], b[1]) - half, maxZ: Math.max(a[1], b[1]) + half }, { a, b, half });
    }
  });
  const isClear = (x, z) =>
    !(buckets.get(bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET))) || []).some((item) => {
      if (item.ring) {
        const { box, ring } = item;
        if (x < box.minX - 1 || x > box.maxX + 1 || z < box.minZ - 1 || z > box.maxZ + 1) return false;
        return insidePolygon(x, z, ring) || ring.some((p, i) => distanceToSegment(x, z, p, ring[(i + 1) % ring.length]) < 1);
      }
      return distanceToSegment(x, z, item.a, item.b) < item.half + 0.4;
    });

  const lamps = [];
  const nearby = new Map();
  const tooClose = (x, z) => {
    const cx = Math.floor(x / LAMP_GAP);
    const cz = Math.floor(z / LAMP_GAP);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (nearby.get(bucketKey(cx + i, cz + j))?.some(([a, b]) => (a - x) ** 2 + (b - z) ** 2 < LAMP_GAP ** 2)) return true;
      }
    }
    return false;
  };

  ROADS.forEach((road) => {
    const spacing = LAMP_SPACING[road.c];
    if (!spacing) return;
    const offset = (road.w * ROAD_SCALE) / 2 + 1.8;
    let toNext = spacing / 2;
    let side = 1;
    for (let i = 0; i < road.p.length - 1; i++) {
      const [ax, az] = road.p[i];
      const [bx, bz] = road.p[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 0.01) continue;
      const ux = (bx - ax) / length;
      const uz = (bz - az) / length;
      let t = toNext;
      for (; t < length; t += spacing) {
        // Out from the centre line to the kerb; the arm then points back over the road. If that
        // side is blocked (a building, another road), try the other side before giving up.
        for (const s of [side, -side]) {
          const nx = -uz * s;
          const nz = ux * s;
          const x = ax + ux * t + nx * offset;
          const z = az + uz * t + nz * offset;
          if (!onCampus(x, z) || !isClear(x, z) || tooClose(x, z)) continue;
          lamps.push({ x, z, dx: -nx, dz: -nz });
          const key = bucketKey(Math.floor(x / LAMP_GAP), Math.floor(z / LAMP_GAP));
          nearby.set(key, [...(nearby.get(key) || []), [x, z]]);
          break;
        }
        // Service lanes are lit from one side; streets alternate sides
        if (road.c !== 'service') side = -side;
      }
      toNext = t - length;
    }
  });
  return lamps;
}

// A soft round spot, white in the middle; tinted by each material's colour
let glowTexture;
function getGlowTexture() {
  if (glowTexture !== undefined) return glowTexture;
  if (typeof document === 'undefined') return (glowTexture = null);
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.62)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

// Moonlight on the Bay of Bengal: a path of glitter on the water running out from the shore towards
// the moon. Two glitter layers cross-fade slowly so the water seems to shimmer.
const SHEEN_LENGTH = 1500;
const SHEEN_WIDTH = 520;

function glitterTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const random = seededRandom(seed);
  for (let i = 0; i < 1800; i++) {
    const v = random(); // 0 at the shore, 1 far out
    const spread = 8 + v * 80; // the path widens with distance
    const x = 128 + (random() + random() + random() - 1.5) * spread;
    const w = 2 + random() * 7;
    ctx.fillStyle = `rgba(255,255,255,${(0.12 + random() * 0.5) * (1 - v * 0.65)})`;
    ctx.fillRect(x - w / 2, (1 - v) * 1024, w, 1 + random());
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildMoonSheen(scene) {
  const coast = GEOMETRY.coast;
  if (coast.length < 2 || typeof document === 'undefined') return { set() {}, tick() {} };
  // The shore opposite the middle of campus
  const midZ = (CAMPUS_BOUNDS.minZ + CAMPUS_BOUNDS.maxZ) / 2;
  const shore = coast.reduce((best, p) => (Math.abs(p[1] - midZ) < Math.abs(best[1] - midZ) ? p : best), coast[0]);
  const layer = (seed) => {
    const material = new THREE.MeshBasicMaterial({
      map: glitterTexture(seed),
      color: '#dfe8ff',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    // Lies on the water; its texture runs from the shore (bottom) out to sea (top)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SHEEN_WIDTH, SHEEN_LENGTH).rotateX(-Math.PI / 2), material);
    mesh.renderOrder = 1;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  };
  const layers = [layer(5), layer(17)];
  // A soft silver wash under the glitter
  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(SHEEN_WIDTH, SHEEN_LENGTH).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: '#b8c8ee', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  wash.visible = false;
  scene.add(wash);
  let strength = 0;
  return {
    // Point the path at the moon; the sea is east of campus, so a moon over the land leaves it dark
    set(visible, azimuth, lit) {
      const facesSea = azimuth > 25 && azimuth < 165;
      const az = THREE.MathUtils.degToRad(azimuth);
      const dx = Math.sin(az);
      const dz = -Math.cos(az);
      strength = visible && facesSea ? 0.22 + 0.33 * lit : 0;
      wash.material.opacity = strength * 0.35;
      [...layers, wash].forEach((mesh) => {
        mesh.visible = strength > 0;
        mesh.rotation.y = -az;
        mesh.position.set(shore[0] + dx * (SHEEN_LENGTH / 2 + 30), LAYER.water + 0.04, shore[1] + dz * (SHEEN_LENGTH / 2 + 30));
      });
    },
    tick(seconds) {
      if (!strength) return;
      const swing = 0.5 + 0.5 * Math.sin(seconds * 0.9);
      layers[0].material.opacity = strength * (0.3 + 0.7 * swing);
      layers[1].material.opacity = strength * (1 - 0.7 * swing);
    },
  };
}

function buildStreetLights(scene, registry) {
  const lamps = lampPositions();
  const count = Math.max(1, lamps.length);

  // Post and arm in one mesh, recoloured with the map style like everything else
  const post = mergeGeometries([
    new THREE.CylinderGeometry(0.1, 0.15, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0),
    new THREE.BoxGeometry(LAMP_REACH + 0.3, 0.12, 0.12).translate(LAMP_REACH / 2, LAMP_HEIGHT - 0.2, 0),
  ]);
  const posts = new THREE.InstancedMesh(post, registry.lambert('#8d9196', '#3b3f45'), count);
  posts.castShadow = true;
  // The lamp head: grey by day, glowing warm white at night
  const headMaterial = new THREE.MeshBasicMaterial({ color: '#c3c6ca' });
  const heads = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.1, 0.24, 0.48).translate(LAMP_REACH, LAMP_HEIGHT - 0.38, 0),
    headMaterial,
    count
  );
  // Warm pools on the road under each lamp
  const texture = getGlowTexture();
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: texture,
    color: '#ffa94d',
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMaterial, count);
  pools.renderOrder = 2;

  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const flat = new THREE.Quaternion();
  const halo = new Float32Array(lamps.length * 3);
  lamps.forEach(({ x, z, dx, dz }, i) => {
    // Turn the post so its arm (+X) reaches over the road
    turn.setFromAxisAngle(up, Math.atan2(-dz, dx));
    matrix.compose(new THREE.Vector3(x, 0, z), turn, one);
    posts.setMatrixAt(i, matrix);
    heads.setMatrixAt(i, matrix);
    const hx = x + dx * LAMP_REACH;
    const hz = z + dz * LAMP_REACH;
    matrix.compose(new THREE.Vector3(hx + dx * 1.5, LAYER.fill.trunk + 0.16, hz + dz * 1.5), flat, new THREE.Vector3(LAMP_POOL, 1, LAMP_POOL));
    pools.setMatrixAt(i, matrix);
    halo.set([hx, LAMP_HEIGHT - 0.5, hz], i * 3);
  });
  posts.count = heads.count = pools.count = lamps.length;

  // Glow round each lamp head: camera-facing points, never smaller than a few pixels, so the lit
  // streets still read as strings of lights when the whole campus is in view
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.BufferAttribute(halo, 3));
  const haloMaterial = new THREE.PointsMaterial({
    map: texture,
    color: '#ffd29a',
    size: 6,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  haloMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <logdepthbuf_vertex>',
      'gl_PointSize = clamp(gl_PointSize, 2.0, 28.0);\n#include <logdepthbuf_vertex>'
    );
  };
  const halos = new THREE.Points(haloGeometry, haloMaterial);
  halos.renderOrder = 3;

  scene.add(posts, heads, pools, halos);
  const setOn = (on) => {
    headMaterial.color.set(on ? '#fff3d6' : '#c3c6ca');
    pools.visible = on && Boolean(texture);
    halos.visible = on && Boolean(texture);
  };
  setOn(false);
  // Posts are hidden with the trees when the whole campus is in view
  return { count: lamps.length, posts: [posts, heads], setOn };
}

export function buildWorld(scene, registry) {
  const batch = createBatcher();
  const random = seededRandom(1957);

  // ---- Ground, sea and beach along the real coastline ----
  batch.add(new THREE.PlaneGeometry(24000, 24000).rotateX(-Math.PI / 2), registry.token('terrain_fill'));
  const coast = GEOMETRY.coast;
  if (coast.length > 1) {
    const north = coast[0];
    const south = coast[coast.length - 1];
    const sea = [...coast, [south[0] + 12000, south[1] + 6000], [north[0] + 12000, north[1] - 6000]];
    batch.add(flatPolygon(sea, LAYER.water), registry.token('ocean_water'));
    const beachInland = coast.map(([x, z]) => [x - 55, z]);
    batch.add(flatPolygon([...coast, ...[...beachInland].reverse()], LAYER.sand), registry.token('coastal_beach_sand'));
    roadGeometry(coast, 8, LAYER.water + 0.02).forEach((g) => batch.add(g, registry.token('ocean_shoreline')));
  }

  // ---- University grounds, parks and sports areas ----
  GEOMETRY.areas.forEach((area) => {
    if (area.k === 'track') {
      // A running track is a lane ring round a grass infield; OSM's rough outline becomes a true oval
      const oval = stadiumRing(principalBox(openRing(area.p)));
      batch.add(flatPolygon(oval, LAYER.pitch), registry.token('stadium_turf_grass'));
      roadGeometry([...oval, oval[0]], 8, LAYER.track).forEach((g) => batch.add(g, registry.token('stadium_synthetic_track')));
      return;
    }
    const [token, y] = AREA_STYLE[area.k] || AREA_STYLE.park;
    try {
      batch.add(flatPolygon(openRing(area.p), y), registry.token(token));
    } catch {
      // A self-intersecting OSM outline can't be triangulated; leaving it out is better than a broken shape
    }
  });

  // ---- Roads: casings under fills, narrower classes first ----
  ROADS.forEach((road) => {
    const [fill, casing] = ROAD_STYLE[road.c];
    const width = road.w * ROAD_SCALE;
    if (casing) roadGeometry(road.p, width + (road.c === 'trunk' ? 4 : 2.6), LAYER.casing[road.c]).forEach((g) => batch.add(g, registry.token(casing)));
    roadGeometry(road.p, width, LAYER.fill[road.c]).forEach((g) => batch.add(g, registry.token(fill)));
  });

  // ---- Buildings without a place in the spec: merged context ----
  const contextWall = registry.facade(PALETTE.light.building_wall, PALETTE.dark.building_wall);
  const contextRoof = registry.token('building_roof');
  const plainWall = registry.token('building_wall');
  const parapetWall = registry.token('building_wall', THREE.DoubleSide);
  const tankMaterial = registry.lambert('#3d4148', '#151619');
  const edge = registry.line(PALETTE.light.building_edge, PALETTE.dark.building_edge);
  const roofRandom = seededRandom(77);
  GEOMETRY.buildings.forEach(({ fp, h }) => {
    const ring = openRing(fp);
    if (ring.length < 3) return;
    const hasParapet = h >= PARAPET_MIN_HEIGHT;
    const top = hasParapet ? h + PARAPET : h;
    batch.add(wallsGeometry(ring, 0, h), contextWall, { cast: true });
    if (hasParapet) batch.add(wallsGeometry(ring, h, top), parapetWall, { cast: true });
    try {
      batch.add(flatPolygon(ring, h), contextRoof, { cast: true });
    } catch {
      // Skip a roof that can't be triangulated; the walls still show the building
    }
    batch.add(outlineGeometry(ring, 0, top), edge, { kind: 'line' });
    if (hasParapet) {
      const { cabins, tanks } = roofFurniture(ring, h, roofRandom);
      cabins.forEach((g) => batch.add(g, plainWall, { cast: true }));
      tanks.forEach((g) => batch.add(g, tankMaterial, { cast: true }));
    }
  });

  // ---- Spec places: real outlines, landmark shapes, one group each for picking ----
  const placeRandom = seededRandom(91);
  const places = PLACES.filter((p) => p.kind !== 'bus').map((place) => buildPlace(scene, registry, place, edge, placeRandom));

  batch.flush(scene);

  // ---- Trees on open campus ground ----
  const grid = createGrid({ minX: -1600, maxX: 1600, minZ: -1400, maxZ: 2000 }, 5);
  GEOMETRY.buildings.forEach(({ fp }) => grid.blockPolygon(openRing(fp), 5));
  PLACES.forEach((p) => p.footprint && grid.blockPolygon(p.footprint, 6));
  ROADS.forEach((road) => {
    for (let i = 0; i < road.p.length - 1; i++) grid.blockSegment(road.p[i], road.p[i + 1], (road.w * ROAD_SCALE) / 2 + 4);
  });
  GEOMETRY.areas.filter((a) => ['pitch', 'track', 'court', 'pool', 'sports'].includes(a.k)).forEach((a) => grid.blockPolygon(openRing(a.p), 4));
  stopPlaces.forEach((s) => grid.blockSegment([s.x, s.z], [s.x, s.z], 6));

  const parkRings = GEOMETRY.areas.filter((a) => a.k === 'park').map((a) => openRing(a.p));
  const spots = [];
  const plant = (x, z, scale) => {
    if (!grid.isFree(x, z)) return;
    spots.push([x, z, scale]);
    grid.blockSegment([x, z], [x, z], 4.5);
  };
  // Groves: clustered stands of trees like the wooded parts of the campus
  for (let g = 0; g < 70; g++) {
    const cx = CAMPUS_BOUNDS.minX + random() * (CAMPUS_BOUNDS.maxX - CAMPUS_BOUNDS.minX);
    const cz = CAMPUS_BOUNDS.minZ + random() * (CAMPUS_BOUNDS.maxZ - CAMPUS_BOUNDS.minZ);
    if (!onCampus(cx, cz)) continue;
    const radius = 30 + random() * 60;
    for (let i = 0; i < radius * 1.6; i++) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * radius;
      plant(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.85 + random() * 0.5);
    }
  }
  // Parks get their own trees; the rest of the grounds a light scatter
  parkRings.forEach((ring) => {
    const box = bboxOf(ring);
    for (let i = 0; i < 40; i++) {
      const x = box.minX + random() * (box.maxX - box.minX);
      const z = box.minZ + random() * (box.maxZ - box.minZ);
      if (insidePolygon(x, z, ring)) plant(x, z, 0.75 + random() * 0.4);
    }
  });
  for (let i = 0; i < 2600; i++) {
    const x = CAMPUS_BOUNDS.minX + random() * (CAMPUS_BOUNDS.maxX - CAMPUS_BOUNDS.minX);
    const z = CAMPUS_BOUNDS.minZ + random() * (CAMPUS_BOUNDS.maxZ - CAMPUS_BOUNDS.minZ);
    if (onCampus(x, z)) plant(x, z, 0.7 + random() * 0.45);
  }

  // Species by setting: casuarinas along the coast road, palms lining streets, broadleaf elsewhere
  const roadside = createGrid({ minX: -1600, maxX: 1600, minZ: -1400, maxZ: 2000 }, 5);
  DRIVABLE.forEach((road) => {
    for (let i = 0; i < road.p.length - 1; i++) roadside.blockSegment(road.p[i], road.p[i + 1], (road.w * ROAD_SCALE) / 2 + 12);
  });
  const coastal = createGrid({ minX: -1600, maxX: 1600, minZ: -1400, maxZ: 2000 }, 10);
  ROADS.filter((r) => r.c === 'trunk').forEach((road) => {
    for (let i = 0; i < road.p.length - 1; i++) coastal.blockSegment(road.p[i], road.p[i + 1], 260);
  });
  const pickSpecies = (x, z) => {
    const r = random();
    if (!coastal.isFree(x, z)) return r < 0.55 ? 'casuarina' : r < 0.7 ? 'palm' : 'broadleaf';
    if (!roadside.isFree(x, z)) return r < 0.2 ? 'palm' : r < 0.24 ? 'casuarina' : 'broadleaf';
    return r < 0.06 ? 'casuarina' : r < 0.1 ? 'palm' : 'broadleaf';
  };

  const SPECIES = {
    broadleaf: {
      geometry: broadleafCrown(),
      palette: [
        ['#A9D99B', '#28452E'],
        ['#93CD84', '#213B27'],
        ['#B7DFA4', '#2E4B31'],
      ],
    },
    casuarina: { geometry: casuarinaCrown(), palette: [['#86BE8F', '#1F3B28'], ['#7AB386', '#1C3524']] },
    palm: { geometry: palmCrown(), palette: [['#9DCC7C', '#2B4727']], side: THREE.DoubleSide },
  };
  const planted = { broadleaf: [], casuarina: [], palm: [] };
  spots.forEach(([x, z, s]) => planted[pickSpecies(x, z)].push([x, z, s]));

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const up = new THREE.Vector3();

  const trunkMesh = new THREE.InstancedMesh(
    // Open-ended: the base is in the ground and the top inside the crown
    new THREE.CylinderGeometry(0.5, 0.75, 1, 6, 1, true).translate(0, 0.5, 0),
    registry.lambert('#8F7259', '#3A3029'),
    spots.length
  );
  let trunkIndex = 0;

  const groups = Object.entries(SPECIES).map(([name, species]) => {
    const list = planted[name];
    const mesh = new THREE.InstancedMesh(
      species.geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, side: species.side ?? THREE.FrontSide }),
      Math.max(1, list.length)
    );
    mesh.count = list.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const variants = list.map(([x, z, s], i) => {
      // Trunk height, trunk thickness, crown size (x/z, y), and how far the crown sinks onto the trunk
      const shape =
        name === 'palm'
          ? { trunk: 8 + 3 * s, girth: 0.34, crown: [3.4 * s, 3.4 * s], sink: 0.2 }
          : name === 'casuarina'
            ? { trunk: 1.6 + 1.2 * s, girth: 0.32, crown: [2.3 * s, 9 * s], sink: 0.6 }
            : { trunk: 2 + 1.4 * s, girth: 0.42 * s + 0.12, crown: [4.2 * s, 4.2 * s], sink: 0 };
      const spin = random() * Math.PI * 2;
      // Palms lean a little; other trees stand straight
      euler.set(name === 'palm' ? (random() - 0.5) * 0.18 : 0, spin, name === 'palm' ? (random() - 0.5) * 0.18 : 0);
      tilt.setFromEuler(euler);

      matrix.compose(position.set(x, 0, z), tilt, scale.set(shape.girth, shape.trunk, shape.girth));
      trunkMesh.setMatrixAt(trunkIndex++, matrix);

      up.set(0, shape.trunk - shape.sink, 0).applyQuaternion(tilt);
      // A broadleaf crown is centred a little above the trunk top (about 2 m of bare trunk shows);
      // casuarina and palm crowns grow up and out from it
      const crownY = name === 'broadleaf' ? up.y + shape.crown[1] * 0.55 : up.y;
      matrix.compose(position.set(x + up.x, crownY, z + up.z), tilt, scale.set(shape.crown[0], shape.crown[1], shape.crown[0]));
      mesh.setMatrixAt(i, matrix);
      mesh.setColorAt(i, new THREE.Color());
      return Math.floor(random() * species.palette.length);
    });
    scene.add(mesh);
    return { mesh, palette: species.palette, variants };
  });
  scene.add(trunkMesh);

  const trees = { groups, meshes: [...groups.map((g) => g.mesh), trunkMesh] };
  const streetLights = buildStreetLights(scene, registry);
  const moonSheen = buildMoonSheen(scene);

  return { places, trees, streetLights, moonSheen };
}

// ---------------------------------------------------------------------------
// One spec place: real footprint, with the spec's landmark shapes and roof styles
// ---------------------------------------------------------------------------

const CURVED_ROOFS = new Set(['curved_roof', 'curved_barrel_vault', 'curved_metal_truss', 'curved_theatre_barrel']);

function buildPlace(scene, registry, place, edge, random) {
  const group = new THREE.Group();
  const b = place.data;
  const wallColor = b.apple_maps_visuals.wall_color;
  // Gate pillars are solid; everything else gets windows
  const wall = GATE_IDS.has(place.id)
    ? registry.lambert(wallColor, PALETTE.dark.building_wall)
    : registry.facade(wallColor, PALETTE.dark.building_wall, /hostel/.test(place.kind) ? 'hostel' : 'few');
  const parapetWall = registry.lambert(wallColor, PALETTE.dark.building_wall, THREE.DoubleSide);
  const plainWall = registry.lambert(wallColor, PALETTE.dark.building_wall);
  const tankMaterial = registry.lambert('#3d4148', '#151619');
  const roof = registry.lambert(b.apple_maps_visuals.roof_color, PALETTE.dark.building_roof);
  const roofStyle = b.architectural_attributes?.roof_style || 'flat';
  const feature = b.architectural_attributes?.special_feature || '';
  const h = place.height;

  const add = (geometry, material, { cast = true } = {}) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  // A storey block; flat-roofed ones get a parapet and, optionally, roof furniture
  const prism = (ring, base, top, { parapet = false, furniture = false } = {}) => {
    add(wallsGeometry(ring, base, top), wall);
    const edgeTop = parapet ? top + PARAPET : top;
    if (parapet) add(wallsGeometry(ring, top, edgeTop), parapetWall);
    try {
      add(flatPolygon(ring, top), roof);
    } catch {
      // Untriangulable roof outline: walls alone still read as the building
    }
    const lines = new THREE.LineSegments(outlineGeometry(ring, base, edgeTop), edge);
    lines.raycast = () => {};
    group.add(lines);
    if (furniture) {
      const { cabins, tanks } = roofFurniture(ring, top, random);
      cabins.forEach((g) => add(g, plainWall));
      tanks.forEach((g) => add(g, tankMaterial));
    }
  };

  if (GATE_IDS.has(place.id)) {
    // An arch straddling the road it guards
    const near = nearestRoad(place.x, place.z);
    const angle = near ? Math.atan2(near.b[1] - near.a[1], near.b[0] - near.a[0]) : 0;
    const roadWidth = near ? near.road.w * ROAD_SCALE : 10;
    const across = [-Math.sin(angle), Math.cos(angle)];
    const along = [Math.cos(angle), Math.sin(angle)];
    const pillarOffset = roadWidth / 2 + 2.5;
    const gateHeight = Math.min(h, 9);
    const pillar = (side) => {
      const cx = place.x + across[0] * pillarOffset * side;
      const cz = place.z + across[1] * pillarOffset * side;
      const ring = [
        [cx - along[0] * 2 - across[0] * 1.5, cz - along[1] * 2 - across[1] * 1.5],
        [cx + along[0] * 2 - across[0] * 1.5, cz + along[1] * 2 - across[1] * 1.5],
        [cx + along[0] * 2 + across[0] * 1.5, cz + along[1] * 2 + across[1] * 1.5],
        [cx - along[0] * 2 + across[0] * 1.5, cz - along[1] * 2 + across[1] * 1.5],
      ];
      prism(ring, 0, gateHeight);
    };
    pillar(1);
    pillar(-1);
    const span = pillarOffset + 1.5;
    const beam = [
      [place.x - along[0] * 1.6 - across[0] * span, place.z - along[1] * 1.6 - across[1] * span],
      [place.x + along[0] * 1.6 - across[0] * span, place.z + along[1] * 1.6 - across[1] * span],
      [place.x + along[0] * 1.6 + across[0] * span, place.z + along[1] * 1.6 + across[1] * span],
      [place.x - along[0] * 1.6 + across[0] * span, place.z - along[1] * 1.6 + across[1] * span],
    ];
    prism(beam, gateHeight - 1.6, gateHeight + 0.4);
    place.top = gateHeight + 3;
  } else if (place.footprint && !place.hostId) {
    const ring = place.footprint;
    const center = [place.x, place.z];
    const obb = orientedBox(ring);
    const rectangular = Math.abs(signedArea(ring)) / (obb.length * obb.span || 1) > 0.85;

    if (place.id === 'central-library') {
      // Three concentric tiers of the real rotunda outline under a shallow dome
      prism(ring, 0, 9);
      prism(scaleRing(ring, center, 0.76), 9, 16);
      prism(scaleRing(ring, center, 0.52), 16, 22);
      const dome = add(new THREE.SphereGeometry(place.size * 0.14, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), roof);
      dome.position.set(place.x, 22, place.z);
    } else {
      const curved = rectangular && CURVED_ROOFS.has(roofStyle);
      const pitched = rectangular && (roofStyle.startsWith('pitched') || roofStyle === 'sloped_tin_tiles');
      const body = curved || pitched ? h * 0.76 : h;
      const flat = !curved && !pitched && !['curved_acoustical_dome', 'traditional_dravidian_gopuram'].includes(roofStyle);
      const tall = h >= PARAPET_MIN_HEIGHT;
      prism(ring, 0, body, {
        parapet: flat && tall,
        furniture: flat && tall && roofStyle !== 'solar_panel_array_roof' && feature !== 'university_clock_tower',
      });

      if (curved) {
        const r = obb.span / 2;
        const vault = add(new THREE.CylinderGeometry(r, r, obb.length, 28, 1), roof);
        vault.position.set(obb.cx, body, obb.cz);
        vault.rotation.set(0, -obb.angle, Math.PI / 2, 'YXZ');
        vault.scale.set((h - body) / r, 1, 1);
      } else if (pitched) {
        const gable = new THREE.Shape([
          new THREE.Vector2(-obb.span / 2, 0),
          new THREE.Vector2(obb.span / 2, 0),
          new THREE.Vector2(0, h - body),
        ]);
        const mesh = add(new THREE.ExtrudeGeometry(gable, { depth: obb.length, bevelEnabled: false }), roof);
        mesh.position.set(obb.cx - Math.cos(obb.angle) * (obb.length / 2), body, obb.cz - Math.sin(obb.angle) * (obb.length / 2));
        mesh.rotation.y = Math.PI / 2 - obb.angle;
      } else if (roofStyle === 'solar_panel_array_roof') {
        const panels = add(new THREE.BoxGeometry(obb.length * 0.78, 0.6, obb.span * 0.74), registry.lambert('#4C6E98', '#2C3F57'), { cast: false });
        panels.position.set(obb.cx, h + 0.3, obb.cz);
        panels.rotation.y = -obb.angle;
      } else if (roofStyle === 'curved_acoustical_dome') {
        const dome = add(new THREE.SphereGeometry(Math.min(obb.length, obb.span) * 0.36, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), roof);
        dome.position.set(place.x, h, place.z);
        dome.scale.y = 0.45;
      } else if (roofStyle === 'traditional_dravidian_gopuram') {
        const tower = add(new THREE.ConeGeometry(Math.min(obb.length, obb.span) * 0.42, 12, 4), roof);
        tower.position.set(place.x, h + 6, place.z);
        tower.rotation.y = Math.PI / 4 - obb.angle;
        place.top = h + 14;
      }

      if (feature === 'university_clock_tower') {
        // Clock tower rising from the centre of the real outline
        prism(rectRing(place.x, place.z, 8, 8), body, 34);
        const cap = add(new THREE.ConeGeometry(6.2, 7, 4), roof);
        cap.position.set(place.x, 37.5, place.z);
        cap.rotation.y = Math.PI / 4;
      }
    }
  }

  group.userData = { isCampusNode: true, id: place.id };
  scene.add(group);
  return group;
}

// Camera distance that fits a set of ground points on screen for a given heading, pitch and aspect
// ---------------------------------------------------------------------------
// Driving routes over the real road network, for the ride preview
// ---------------------------------------------------------------------------

let roadGraph = null;
const nodeKey = ([x, z]) => `${x},${z}`;

// OSM roads that meet share a vertex, so joining vertices with the same coordinates gives the network.
// A few short roads in the data don't connect to the rest; places snap only to the main network, so
// every pair of places has a route.
function getRoadGraph() {
  if (roadGraph) return roadGraph;
  const nodes = new Map();
  const nodeFor = (pt) => {
    const key = nodeKey(pt);
    if (!nodes.has(key)) nodes.set(key, { pt, edges: [] });
    return key;
  };
  DRIVABLE.forEach((road) => {
    for (let i = 1; i < road.p.length; i++) {
      const a = nodeFor(road.p[i - 1]);
      const b = nodeFor(road.p[i]);
      const metres = Math.hypot(road.p[i][0] - road.p[i - 1][0], road.p[i][1] - road.p[i - 1][1]);
      nodes.get(a).edges.push([b, metres]);
      nodes.get(b).edges.push([a, metres]);
    }
  });

  // Label connected pieces and keep the roads of the largest one for snapping
  const piece = new Map();
  const sizes = [];
  for (const start of nodes.keys()) {
    if (piece.has(start)) continue;
    const id = sizes.length;
    const stack = [start];
    piece.set(start, id);
    let size = 0;
    while (stack.length) {
      const key = stack.pop();
      size += 1;
      nodes.get(key).edges.forEach(([next]) => {
        if (!piece.has(next)) {
          piece.set(next, id);
          stack.push(next);
        }
      });
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const mainRoads = DRIVABLE.filter((road) => piece.get(nodeKey(road.p[0])) === main);

  roadGraph = { nodes, mainRoads };
  return roadGraph;
}

// Where a place meets its nearest drivable road, and the two road vertices either side of that point
function snapToRoad(place, roads) {
  const near = nearestRoad(place.x, place.z, roads);
  if (!near) return null;
  const [ax, az] = near.a;
  const [bx, bz] = near.b;
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((place.x - ax) * dx + (place.z - az) * dz) / (dx * dx + dz * dz || 1)));
  const point = [ax + t * dx, az + t * dz];
  return {
    point,
    ends: [
      [nodeKey(near.a), Math.hypot(point[0] - ax, point[1] - az)],
      [nodeKey(near.b), Math.hypot(point[0] - bx, point[1] - bz)],
    ],
  };
}

// Dijkstra from several weighted starts to several weighted goals, with a small binary heap
function shortestPath(graph, starts, goals) {
  const heap = [];
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };

  const dist = new Map();
  const prev = new Map();
  starts.forEach(([key, cost]) => {
    if (cost < (dist.get(key) ?? Infinity)) {
      dist.set(key, cost);
      push([cost, key]);
    }
  });
  const goalCost = new Map(goals);
  let best = null;
  while (heap.length) {
    const [d, key] = pop();
    if (d > (dist.get(key) ?? Infinity)) continue;
    if (best && d >= best.total) break;
    if (goalCost.has(key) && (!best || d + goalCost.get(key) < best.total)) best = { key, total: d + goalCost.get(key) };
    graph.get(key)?.edges.forEach(([next, metres]) => {
      const nd = d + metres;
      if (nd < (dist.get(next) ?? Infinity)) {
        dist.set(next, nd);
        prev.set(next, key);
        push([nd, next]);
      }
    });
  }
  if (!best) return null;
  const keys = [];
  for (let key = best.key; key; key = prev.get(key)) keys.unshift(key);
  return { points: keys.map((key) => graph.get(key).pt), metres: best.total };
}

const PLACE_BY_ID = new Map(PLACES.map((place) => [place.id, place]));

// The drive from one campus place to another along real roads: [x, z] points from the first place's
// door to the second's, and the distance in metres. Null if either place is unknown or unreachable.
export function drivingRoute(fromId, toId) {
  const from = PLACE_BY_ID.get(fromId);
  const to = PLACE_BY_ID.get(toId);
  if (!from || !to || from === to) return null;
  const { nodes, mainRoads } = getRoadGraph();
  const start = snapToRoad(from, mainRoads);
  const end = snapToRoad(to, mainRoads);
  if (!start || !end) return null;
  const path = shortestPath(nodes, start.ends, end.ends);
  if (!path) return null;
  const points = [[from.x, from.z], start.point, ...path.points, end.point, [to.x, to.z]];
  const metres = points.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - points[i][0], z - points[i][1]), 0);
  return { points, metres };
}

export function fitRadius(points, lookAt, theta, phi, fovDeg, aspect, margin = 0.9) {
  const camera = new THREE.PerspectiveCamera(fovDeg, aspect, 1, 50000);
  const corners = points.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const fits = (radius) => {
    camera.position.set(
      lookAt.x + radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
      lookAt.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
    return corners.every((c) => {
      const p = c.clone().project(camera);
      return p.z < 1 && Math.abs(p.x) <= margin && Math.abs(p.y) <= margin;
    });
  };
  let lo = 200;
  let hi = 20000;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}
