// Pondicherry University places and UniGo's service catalogue. Positions are real GPS
// coordinates; the 3D map places buildings from OpenStreetMap (see src/data/puAppleMap.js).

// Old names for places that have since been corrected to the university's own spelling. Saved
// profiles and past rides may still carry them; `null` means the place never existed.
export const FORMER_PLACE_NAMES = {
  'Mother Teresa Hostel': null,
  'Cauveri Hostel': 'Cauvery Hostel',
  'Saraswati Hostel': 'Saraswathy Hostel',
  'Narmatha Hostel': 'Narmadha Hostel',
  'Kabir Das Hostel': 'Kabirdas Hostel',
  'Subramania Bharathiar Hostel': 'Subramania Bharathi Hostel',
  'Maulana Abul Kalam Azad Hostel (MAKA)': 'MAKA Hostel',
  'Sarvepalli Radhakrishnan Hostel (SRK)': 'SRK Hostel',
  'Gate 2 (Kalapet Entrance)': 'Gate 2 (ECR, Science Block side)',
  'Administrative Complex & Clock Tower': 'Dr. B.R. Ambedkar Administrative Building',
  'Ananda Rangapillai Central Library': 'Ananda Rangapillai Library (Central Library)',
  'Student Canteen & Shopping Hub': 'Canteen I',
  'Rajiv Gandhi Sports Stadium & Gym': 'Rajiv Gandhi Cricket Stadium',
};

const gmaps = (query) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

export const PU_LANDMARKS = [
  {
    id: 'gate-1',
    name: 'Gate 1 (Main Entrance - ECR)',
    category: 'gate',
    lat: 12.01942,
    lng: 79.859593,
    color: '#3b82f6',
    desc: 'Main gate on East Coast Road. Visitors show ID here, and the in-campus buses start and end here',
    gmapsUrl: gmaps('Pondicherry University Gate 1'),
  },
  {
    id: 'gate-2',
    name: 'Gate 2 (ECR, Science Block side)',
    category: 'gate',
    lat: 12.015851,
    lng: 79.858551,
    color: '#3b82f6',
    desc: 'Second gate on East Coast Road, south of Gate 1, nearest the Science Blocks and the Convention Centre',
    gmapsUrl: gmaps('Pondicherry University Gate 2'),
  },
  {
    id: 'admin-block',
    name: 'Dr. B.R. Ambedkar Administrative Building',
    category: 'academic',
    lat: 12.022025,
    lng: 79.857315,
    color: '#8b5cf6',
    desc: "Registrar's office, Executive Council Hall and the J.N. Auditorium; the post office is next door",
    gmapsUrl: gmaps('Administrative Building Pondicherry University'),
  },
  {
    id: 'library',
    name: 'Ananda Rangapillai Library (Central Library)',
    category: 'academic',
    lat: 12.020152,
    lng: 79.855872,
    color: '#ec4899',
    desc: 'Main university library. Weekdays 8:30 am to 8:30 pm, weekends 9:30 am to 5:30 pm',
    gmapsUrl: gmaps('Ananda Rangapillai Library Pondicherry University'),
  },
  {
    id: 'sjc-campus',
    name: 'Silver Jubilee Campus (SJC)',
    category: 'academic',
    lat: 12.03266,
    lng: 79.857993,
    color: '#6366f1',
    desc: 'Social Sciences, Humanities, Tamil, Mass Communication and UMISARC',
    gmapsUrl: gmaps('Silver Jubilee Campus Pondicherry University'),
  },
  {
    id: 'science-complex',
    name: 'Science Complex',
    category: 'academic',
    lat: 12.0175,
    lng: 79.855691,
    color: '#10b981',
    desc: 'Science Blocks I and II: Chemistry, Physics, Computer Science, Mathematics, Biotechnology and Earth Sciences',
    gmapsUrl: gmaps('Department of Chemistry Pondicherry University'),
  },
  {
    id: 'canteen-complex',
    name: 'Canteen I',
    category: 'amenity',
    lat: 12.021872,
    lng: 79.856053,
    color: '#f59e0b',
    desc: 'South Indian food, 9 am to 5:30 pm, near the Administrative Building. A Ponlait milk booth is beside it',
    gmapsUrl: gmaps('Pondicherry University Canteen 1'),
  },
  {
    id: 'sports-complex',
    name: 'Rajiv Gandhi Cricket Stadium',
    category: 'amenity',
    lat: 12.026472,
    lng: 79.850852,
    color: '#14b8a6',
    desc: 'Cricket ground with turf wickets and floodlights. Thiruvalluvar Stadium (400 m track) and the courts are beside it',
    gmapsUrl: gmaps('Rajiv Gandhi Stadium Pondicherry University'),
  },
  {
    id: 'health-centre',
    name: 'University Health Centre',
    category: 'amenity',
    lat: 12.019605,
    lng: 79.850688,
    color: '#ef4444',
    desc: 'Open round the clock, with an ambulance. Free medicines at the university counter 9:30 am to 5:30 pm',
    gmapsUrl: gmaps('Health Centre Pondicherry University'),
  },
];

// Hostels carry the same category/desc fields as landmarks so maps and forms can treat every location uniformly
const withHostelMeta = (hostels, category, label, color) =>
  hostels.map((h) => ({
    ...h,
    category,
    color,
    desc: [label, h.rooms, h.mess, 'Laundry pickup point'].filter(Boolean).join(' • '),
    gmapsUrl: gmaps(`${h.name} Pondicherry University`),
  }));

// The 26 hostels, named exactly as on the university's warden lists (4 September 2026). Room counts
// are from the annual reports' hostel tables and messes from the Mess Committee circular
// (25 September 2026); a hostel with no published figure leaves it out. `aliases` are other
// spellings people search by. Ids keep their original spelling so saved data still matches.
export const GIRLS_HOSTELS = withHostelMeta([
  { id: 'gh-yamuna', name: 'Yamuna Hostel', lat: 12.022701, lng: 79.848646, rooms: '40 rooms', mess: 'Madame Curie Mess' },
  { id: 'gh-cauveri', name: 'Cauvery Hostel', lat: 12.020366, lng: 79.850288, rooms: '76 rooms', mess: 'Ganga Mess', aliases: 'Cauveri Kaveri' },
  { id: 'gh-kalpana-chawla', name: 'Kalpana Chawla Hostel', lat: 12.023298, lng: 79.847414, rooms: '73 rooms', mess: 'Madame Curie Mess' },
  { id: 'gh-narmatha', name: 'Narmadha Hostel', lat: 12.022609, lng: 79.84678, rooms: '182 rooms', mess: 'Mother Teresa Mess', aliases: 'Narmatha Narmada' },
  { id: 'gh-saraswati', name: 'Saraswathy Hostel', lat: 12.021525, lng: 79.849757, rooms: '32 rooms', mess: 'Ganga Mess', aliases: 'Saraswati' },
  { id: 'gh-ganga', name: 'Ganga Hostel', lat: 12.02214, lng: 79.849375, rooms: '72 rooms', mess: 'Ganga Mess' },
  // At the MSME Technology Centre south of the campus; the exact building is not published
  { id: 'gh-msme', name: 'MSME Hostel for Girls', lat: 12.011597, lng: 79.856814, mess: 'Ganga Mess', aliases: 'MSME Technology Centre' },
  { id: 'gh-kannagi', name: 'Kannagi Hostel', lat: 12.024615, lng: 79.84628, mess: 'Mother Teresa Mess', aliases: 'Kannaki' },
  { id: 'gh-madame-curie', name: 'Madame Curie Hostel', lat: 12.023188, lng: 79.848237, rooms: '256 rooms', mess: 'Madame Curie Mess', aliases: 'Madam Curie' },
  // The foreign women's section, run with Madame Curie Hostel
  { id: 'gh-foreign', name: 'Foreign Hostel', lat: 12.02327, lng: 79.84847, rooms: '49 air-conditioned rooms', mess: 'Madame Curie Mess', aliases: 'Foreign Students Hostel Girls International' },
  { id: 'gh-savithribai-phule', name: 'Savithribai Phule Hostel', lat: 12.023364, lng: 79.846324, mess: 'Mother Teresa Mess', aliases: 'Savitribai Phule' },
], 'girls-hostel', 'Girls hostel', '#FF2D55');

export const BOYS_HOSTELS = withHostelMeta([
  { id: 'bh-cv-raman', name: 'C.V. Raman Hostel', lat: 12.026794, lng: 79.853096, rooms: '177 rooms', mess: 'Ilango Adigal Mess', aliases: 'CV Raman' },
  { id: 'bh-pavendar', name: 'Pavendar Bharathidasan Hostel', lat: 12.028216, lng: 79.853481, rooms: '62 rooms', aliases: 'Bharathidasan' },
  { id: 'bh-subramania-bharathi', name: 'Subramania Bharathi Hostel', lat: 12.028707, lng: 79.853228, rooms: '62 rooms', aliases: 'Bharathiar Subramanya Bharati' },
  { id: 'foreign-students-hostel', name: 'Foreign Students Hostel', lat: 12.020952, lng: 79.859135, rooms: '41 rooms', aliases: 'International Boys' },
  { id: 'bh-kalidas', name: 'Kalidas Hostel', lat: 12.030283, lng: 79.849501, rooms: '46 rooms', mess: 'Amudham Mess' },
  { id: 'bh-sri-aurobindo', name: 'Sri Aurobindo Hostel', lat: 12.029358, lng: 79.853457, rooms: '182 rooms', mess: 'Annapurna Mess' },
  { id: 'bh-valmiki', name: 'Valmiki Hostel', lat: 12.028967, lng: 79.851404, rooms: '78 rooms' },
  { id: 'bh-maka', name: 'MAKA Hostel', lat: 12.029731, lng: 79.848715, rooms: '80 rooms', mess: 'Amudham Mess', aliases: 'Maulana Abul Kalam Azad MAK Azad' },
  { id: 'bh-birsa-munda', name: 'Birsa Munda Hostel', lat: 12.029958, lng: 79.853502, mess: 'Annapurna Mess' },
  { id: 'bh-ilango-adigal', name: 'Ilango Adigal Hostel', lat: 12.028324, lng: 79.852756, rooms: '77 rooms', mess: 'Ilango Adigal Mess' },
  { id: 'bh-tagore', name: 'Tagore Hostel', lat: 12.030188, lng: 79.850771, rooms: '66 rooms', mess: 'Amudham Mess' },
  { id: 'bh-kabir-das', name: 'Kabirdas Hostel', lat: 12.029236, lng: 79.849187, rooms: '81 rooms', mess: 'Amudham Mess', aliases: 'Kabir Das' },
  { id: 'bh-kamban', name: 'Kamban Hostel', lat: 12.029773, lng: 79.851897, rooms: '66 rooms', mess: 'Amudham Mess' },
  { id: 'bh-kannadasan', name: 'Kannadasan Hostel', lat: 12.02941, lng: 79.850154, rooms: '80 rooms', mess: 'Amudham Mess' },
  { id: 'bh-srk', name: 'SRK Hostel', lat: 12.028761, lng: 79.847858, rooms: '81 rooms', mess: 'Amudham Mess', aliases: 'Sarvepalli Radhakrishnan S Radhakrishnan' },
], 'boys-hostel', 'Boys hostel', '#007AFF');

export const ALL_PU_LOCATIONS = [
  ...PU_LANDMARKS,
  ...GIRLS_HOSTELS,
  ...BOYS_HOSTELS,
];

// Laundry pickup points for people who don't live in a hostel
export const OTHER_LOCATIONS = [
  'Gate 1 (Main Gate)',
  'Faculty Quarters (F1–F40)',
  'Transit Hostel',
  'Ananda Rangapillai Library',
  'Silver Jubilee Campus',
  'Shopping Complex',
];

// Vehicles for hire. Which ones are free right now comes from the rental_fleet table in Supabase.
export const RENTAL_FLEET = [
  {
    id: 'scoot-1',
    model: 'Honda Activa 6G (Smart Key)',
    type: 'Petrol Scooter',
    tag: 'Most Popular',
    hourlyRate: 40,
    dailyRate: 299,
    rangeOrMileage: '55 km/l',
    pickupLocation: 'Gate 1 UniGo Hub',
    helmetsIncluded: 2,
    features: ['Combi Brake System', 'Smart Keyless Start', 'Underseat Storage', 'USB Phone Mount'],
    image: 'https://images.unsplash.com/photo-1716574400004-ba794161f8cd?auto=format&fit=crop&w=800&q=80',
    imageCredit: { author: 'Ratul Pal', license: 'Unsplash', url: 'https://unsplash.com/photos/tp9K1aZdREo' },
  },
  {
    id: 'scoot-2',
    model: 'TVS Jupiter 125 i-Touch',
    type: 'Petrol Scooter',
    tag: 'Smooth Commute',
    hourlyRate: 35,
    dailyRate: 279,
    rangeOrMileage: '50 km/l',
    pickupLocation: 'Library Hub',
    helmetsIncluded: 2,
    features: ['Front Fuel Fill', 'Metal Max Body', 'Spacious Floorboard', 'Digital Display'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/TVS_Jupiter_Scooter.jpg/500px-TVS_Jupiter_Scooter.jpg',
    imageCredit: { author: 'SnapMeUp', license: 'CC BY 4.0', url: 'https://commons.wikimedia.org/wiki/File:TVS_Jupiter_Scooter.jpg' },
  },
  {
    id: 'scoot-3',
    model: 'Ather 450X Gen 3',
    type: 'Smart EV Scooter',
    tag: 'Green Campus Special',
    hourlyRate: 45,
    dailyRate: 349,
    rangeOrMileage: '105 km / charge',
    pickupLocation: 'Gate 1 EV Dock',
    helmetsIncluded: 2,
    features: ['Google Maps Touchscreen', 'Reverse Assist', 'Fast Charging Dock in PU', 'Regenerative Braking'],
    image: 'https://images.unsplash.com/photo-1610267037736-abf3096c88fb?auto=format&fit=crop&w=800&q=80',
    imageCredit: { author: 'Om Kamath', license: 'Unsplash', url: 'https://unsplash.com/photos/j6qObqsw1Wg' },
  },
  {
    id: 'scoot-4',
    model: 'Hero Electric Optima CX',
    type: 'Campus Eco EV',
    tag: 'Budget Friendly',
    hourlyRate: 30,
    dailyRate: 229,
    rangeOrMileage: '80 km / charge',
    pickupLocation: 'Gate 2 Hub',
    helmetsIncluded: 1,
    features: ['Dual Battery', 'Digital Speedometer', 'Silent Ride', 'No License Required under 25 km/h'],
    // Commons has no Optima CX photo; this is the Optima Plus from the same Hero Electric line
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Optima_Plus_%28Hero_Electric%2C_India%29.jpg/500px-Optima_Plus_%28Hero_Electric%2C_India%29.jpg',
    imageCredit: { author: 'Viswaprabha', license: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Optima_Plus_(Hero_Electric,_India).jpg' },
  },
  {
    id: 'scoot-5',
    model: 'Royal Enfield Hunter 350',
    type: 'Weekend Motorcycle',
    tag: 'Pondy Beach Trips',
    hourlyRate: 75,
    dailyRate: 599,
    rangeOrMileage: '36 km/l',
    pickupLocation: 'Gate 1 Hub',
    helmetsIncluded: 2,
    features: ['Dual-Channel ABS', 'Tripper Navigation', 'Signature RE Exhaust', 'Ideal for Auroville & Rock Beach'],
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Hunter_350_side_view_India_Model.png/500px-Hunter_350_side_view_India_Model.png',
    imageCredit: { author: 'Pintu dasaundhi', license: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Hunter_350_side_view_India_Model.png' },
  },
];

// Ride pickup/drop points use the same names as the map so "Ride Here" can prefill the drop
export const CAMPUS_LOCATIONS_LIST = ALL_PU_LOCATIONS.map((loc) => loc.name);

// Off-campus drops and their road distance from campus; the fare is worked out from `km`
// (src/lib/pricing.js). The names must match the ride_destinations table in supabase/schema.sql.
export const OFF_CAMPUS_DESTINATIONS = [
  { name: 'Kalapet Market & Beach', km: 1.2 },
  { name: 'Serenity Beach, Kottakuppam', km: 7 },
  { name: 'Auroville Visitors Centre', km: 8.5 },
  { name: 'White Town / French Quarter', km: 11.5 },
  { name: 'Pondicherry Rock Beach & Promenade', km: 12 },
  { name: 'Puducherry Central Bus Stand', km: 13 },
  { name: 'JIPMER Medical Campus', km: 14 },
];
export const OUTSIDE_LOCATIONS_LIST = OFF_CAMPUS_DESTINATIONS.map((d) => d.name);
