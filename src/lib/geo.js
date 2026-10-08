import { ALL_PU_LOCATIONS } from '../data/campusData';

const PLACE_BY_NAME = Object.fromEntries(ALL_PU_LOCATIONS.map((place) => [place.name, place]));

// Campus places (gates, hostels, landmarks) by the name a ride stores; null for anywhere else
export const placeByName = (name) => PLACE_BY_NAME[name] || null;

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
