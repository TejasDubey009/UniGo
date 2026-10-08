// Render-ready view of the Apple Maps campus spec (APPLE_MAPS_PU_SPEC.md / pu_apple_maps_reference.json).
// World units are metres: +X east, +Z south, origin at 12.026728° N, 79.855588° E.
// Only the lazily loaded 3D map imports this, so the JSON stays out of the main bundle.
import spec from './pu_apple_maps_reference.json';
import geometry from './pu_campus_map.json';

const design = spec.apple_maps_design_system;

export const PALETTE = {
  light: design.color_tokens.light_mode,
  dark: design.color_tokens.dark_mode,
};

export const BUILDINGS = spec.buildings;
export const BUS_STOPS = spec.bus_stops;
// Real outlines, roads, areas and coastline from OpenStreetMap (scripts/build-campus-map.mjs)
export const GEOMETRY = geometry;

// Short names for map badges; the full name shows in the place card
const SHORT_LABELS = {
  'sjc-main-complex': 'Silver Jubilee Campus',
  'dept-mass-comm': 'Mass Communication',
  'school-social-sciences': 'Social Sciences',
  'library-social-sciences': 'Social Sciences Library',
  'school-humanities': 'Humanities',
  'library-humanities': 'Humanities Library',
  'dept-applied-psychology': 'Applied Psychology',
  'dept-food-science': 'Food Science',
  'school-tamil-literature': 'School of Tamil',
  'unesco-south-asia': 'UMISARC',
  'ugc-hrdc-centre': 'HRDC',
  'sjc-canteen-cultural': 'SJC Canteen',
  'kendriya-vidyalaya-2': 'KV 2',
  'central-library': 'Central Library',
  'digital-reading-hall': 'Digital Reading Hall',
  'admin-office-complex': 'Administration',
  'jn-auditorium': 'JN Auditorium',
  'canteen-1-central': 'Central Canteen',
  'shopping-complex-central': 'Shopping Complex',
  'indian-bank-central': 'Indian Bank',
  'coop-credit-society': 'Credit Society',
  'dept-management-studies': 'Management Studies',
  'lecture-hall-complex-2': 'LHC-2',
  'distance-education-block': 'Distance Education',
  'dept-computer-science': 'Computer Science',
  'dept-biotechnology': 'Biotechnology',
  'dept-bioinformatics': 'Bioinformatics',
  'dept-earth-sciences': 'Earth Sciences',
  'ramanujan-math-school': 'Mathematics',
  'umsget-green-energy': 'Green Energy',
  'lecture-hall-complex-1': 'LHC-1',
  'canteen-2-science': 'Science Canteen',
  'performing-arts-complex': 'Performing Arts',
  'bh-maka': 'MAKA Hostel',
  'bh-srk': 'SRK Hostel',
  'bh-subramania-bharathi': 'Bharathiar Hostel',
  'bh-pavendar': 'Pavendar Hostel',
  'vivekananda-hall': 'Vivekananda Hall',
  'mother-teresa-mess': 'Mother Teresa Mess',
  'campus-temple': 'Vinayagar Temple',
  'rajiv-gandhi-stadium': 'Rajiv Gandhi Stadium',
  'central-gymnasium-complex': 'Sports Pavilion',
  'gate-1-main': 'Gate 1',
  'gate-2-kalapet': 'Gate 2',
  'transit-hostel': 'Transit Hostel',
  'new-mega-mess': 'New Mega Mess',
  // Stops carry "stop" so they don't read as a second badge for the building beside them
  'stop-sj': 'SJC stop',
  'stop-unesco': 'UNESCO stop',
  'stop-central-library': 'Library stop',
  'stop-gate-1-ecr': 'Gate 1 stop',
};

// Some catalogue names are in capitals; badges and place cards use title case
export const displayName = (place) =>
  place.name === place.name.toUpperCase() ? place.name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : place.name;

export const shortLabel = (place) =>
  SHORT_LABELS[place.id] ||
  displayName(place)
    .replace(/ (Boys|Ladies) Hostel/, ' Hostel')
    .replace(/ (Bus Stop|Shuttle Stop)$/, ' stop')
    .replace(/^Department of /, '');

// Places that read on the overview, like a city's landmarks on Apple Maps
export const LANDMARK_IDS = new Set([
  'central-library',
  'admin-office-complex',
  'sjc-main-complex',
  'rajiv-gandhi-stadium',
  'gate-1-main',
  'gate-2-kalapet',
  'health-centre',
  'jn-auditorium',
  'shopping-complex-central',
  'new-mega-mess',
  'dept-computer-science',
]);

// Spec presets, plus the label each one gets as a quick-jump chip
export const CAMERA_PRESETS = design.camera_view_presets;

// The rest of the app still uses its own ids for the nine headline landmarks
export const APP_TO_SPEC_ID = {
  'gate-1': 'gate-1-main',
  'gate-2': 'gate-2-kalapet',
  'admin-block': 'admin-office-complex',
  library: 'central-library',
  'sjc-campus': 'sjc-main-complex',
  'science-complex': 'dept-chemistry',
  'canteen-complex': 'canteen-1-central',
  'sports-complex': 'rajiv-gandhi-stadium',
  'health-centre': 'health-centre',
};
export const SPEC_TO_APP_ID = Object.fromEntries(Object.entries(APP_TO_SPEC_ID).map(([app, specId]) => [specId, app]));

// Category -> the app's location category, for hostel picks in the laundry form
export const APP_CATEGORY = { boys_hostel: 'boys-hostel', girls_hostel: 'girls-hostel' };
