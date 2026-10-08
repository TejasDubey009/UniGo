// Where the sun and moon are over Pondicherry University right now, for the map's automatic
// lighting. Low-precision astronomy (the formulas behind SunCalc, by Vladimir Agafonkin): good to
// a minute or two for sunrise and sunset, which is plenty for lighting a map.

export const CAMPUS_LAT = 12.0267;
export const CAMPUS_LNG = 79.8556;

const PI = Math.PI;
const rad = PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = rad * 23.4397;

const toDays = (date) => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
const fromJulian = (j) => new Date((j + 0.5 - J1970) * DAY_MS);

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
// Measured from south, turning west
const azimuthFromSouth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;

const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (M) => {
  const centre = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  return M + centre + rad * 102.9372 + PI;
};
const sunCoords = (d) => {
  const L = eclipticLongitude(solarMeanAnomaly(d));
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
};

const moonCoords = (d) => {
  const L = rad * (218.316 + 13.176396 * d);
  const M = rad * (134.963 + 13.064993 * d);
  const F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M);
  const b = rad * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
};

// Compass bearing in degrees, clockwise from north, and height above the horizon in degrees
const toCompass = (H, phi, dec) => ({
  azimuth: ((azimuthFromSouth(H, phi, dec) / rad + 180) % 360 + 360) % 360,
  altitude: altitude(H, phi, dec) / rad,
});

export function sunPosition(date = new Date(), lat = CAMPUS_LAT, lng = CAMPUS_LNG) {
  const d = toDays(date);
  const c = sunCoords(d);
  return toCompass(siderealTime(d, rad * -lng) - c.ra, rad * lat, c.dec);
}

export function moonPosition(date = new Date(), lat = CAMPUS_LAT, lng = CAMPUS_LNG) {
  const d = toDays(date);
  const c = moonCoords(d);
  return toCompass(siderealTime(d, rad * -lng) - c.ra, rad * lat, c.dec);
}

// How much of the moon is lit, 0 (new) to 1 (full)
export function moonIllumination(date = new Date()) {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sunDistance = 149598000;
  const elongation = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const incidence = Math.atan2(sunDistance * Math.sin(elongation), m.dist - sunDistance * Math.cos(elongation));
  return (1 + Math.cos(incidence)) / 2;
}

// Today's sunrise and sunset (when the sun's upper edge crosses the horizon)
export function sunTimes(date = new Date(), lat = CAMPUS_LAT, lng = CAMPUS_LNG) {
  const J0 = 0.0009;
  const lw = rad * -lng;
  const phi = rad * lat;
  const d = toDays(date);
  const n = Math.round(d - J0 - lw / (2 * PI));
  const transit = (ht) => J0 + (ht + lw) / (2 * PI) + n;
  const ds = transit(0);
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L, 0);
  const solarTransit = (j) => J2000 + j + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
  const noon = solarTransit(ds);
  const w = Math.acos((Math.sin(rad * -0.833) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const set = solarTransit(transit(w));
  return { sunrise: fromJulian(noon - (set - noon)), sunset: fromJulian(set) };
}

// The map style for this moment: night once the sun is a few degrees below the horizon (street
// lights on), sunrise or sunset while it is low, day otherwise
export function skyPhase(date = new Date()) {
  const sun = sunPosition(date);
  if (sun.altitude < -4) return 'night';
  if (sun.altitude < 10) return sun.azimuth < 180 ? 'sunrise' : 'sunset';
  return 'day';
}

// Everything the map's lighting (and its style menu) needs for one moment
export function skyNow(date = new Date()) {
  return {
    phase: skyPhase(date),
    sun: sunPosition(date),
    moon: moonPosition(date),
    moonLit: moonIllumination(date),
    times: sunTimes(date),
  };
}
