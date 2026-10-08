import { ALL_PU_LOCATIONS, OFF_CAMPUS_DESTINATIONS } from '../data/campusData';
import PLACE_INDEX from '../data/campusPlaceIndex.json';

const APP_IDS = new Set(ALL_PU_LOCATIONS.map((place) => place.id));
// What the map calls the app's places, so searching "chemistry" still finds the Science Complex
const MAP_NAMES_BY_APP_ID = PLACE_INDEX.filter((place) => place.appId).reduce((names, place) => {
  names[place.appId] = [place.name, place.label].filter(Boolean).join(' ');
  return names;
}, {});

// Every campus place a ride can start or end at: the app's own list first (gates, landmarks and
// hostels, as stored on rides), then every other building and stop on the 3D map
// (src/data/campusPlaceIndex.json, built by scripts/build-place-index.mjs)
export const CAMPUS_PLACES = [
  ...ALL_PU_LOCATIONS.map(({ id, name, lat, lng }) => ({ id, name, lat, lng, popular: true, aliases: MAP_NAMES_BY_APP_ID[id] })),
  ...PLACE_INDEX.filter((place) => !place.appId && !APP_IDS.has(place.id)).map(({ id, name, label, lat, lng }) => ({
    id,
    name,
    label,
    lat,
    lng,
  })),
];

export const OFF_CAMPUS_PLACES = OFF_CAMPUS_DESTINATIONS.map(({ name, km }) => ({ id: `off:${name}`, name, km, offCampus: true }));

const PLACE_BY_NAME = Object.fromEntries(CAMPUS_PLACES.map((place) => [place.name, place]));

// Campus places by the name a ride stores; null for anywhere else
export const placeByName = (name) => PLACE_BY_NAME[name] || null;

// ---- Search ----
const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SEARCH_TEXT = new Map();
const searchTextOf = (place) => {
  if (!SEARCH_TEXT.has(place)) SEARCH_TEXT.set(place, normalize(`${place.name} ${place.label || ''} ${place.aliases || ''}`));
  return SEARCH_TEXT.get(place);
};

// Places matching what someone typed, best first: a whole-name match, then names starting with it,
// then every typed word starting a word in the name ("mother hostel"), then anywhere in the name
export function searchPlaces(query, places) {
  const q = normalize(query);
  if (!q) return places;
  const tokens = q.split(' ');
  return places
    .map((place) => {
      const text = searchTextOf(place);
      const words = text.split(' ');
      let score = 0;
      if (normalize(place.name) === q) score = 6;
      else if (text.startsWith(q)) score = 5;
      else if (tokens.every((token) => words.some((word) => word.startsWith(token)))) score = 4;
      // Matching mid-word only once there's enough to go on, so one letter doesn't pick a random place
      else if (q.length >= 3 && text.includes(q)) score = 2;
      if (!score) return null;
      return { place, score: score + (place.popular ? 0.5 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.place.name.length - b.place.name.length)
    .map(({ place }) => place);
}

// ---- Distances and directions ----

// Straight-line distance in metres
export function distanceMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export const formatDistance = (meters) =>
  meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;

// Minutes at a campus pace of about 20 km/h
export const minutesAway = (meters) => Math.max(1, Math.round(meters / 333));

// Turn-by-turn in Google Maps: exact coordinates for campus places, a place search otherwise
export function directionsUrl(name) {
  const place = placeByName(name);
  const destination = place ? `${place.lat},${place.lng}` : `${name}, Puducherry`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
