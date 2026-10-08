// Pondicherry University places and UniGo's service catalogue. Positions are real GPS
// coordinates; the 3D map places buildings from OpenStreetMap (see src/data/puAppleMap.js).

export const PU_LANDMARKS = [
  {
    id: 'gate-1',
    name: 'Gate 1 (Main Entrance - ECR)',
    category: 'gate',
    lat: 12.01942,
    lng: 79.859593,
    color: '#3b82f6',
    desc: 'Main gateway on East Coast Road, with the UniGo rental hub and the security post',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pondicherry+University+Gate+1',
  },
  {
    id: 'gate-2',
    name: 'Gate 2 (Kalapet Entrance)',
    category: 'gate',
    lat: 12.015851,
    lng: 79.858551,
    color: '#3b82f6',
    desc: 'Southern entrance on East Coast Road, towards Kalapet town and the beach',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pondicherry+University+Gate+2',
  },
  {
    id: 'admin-block',
    name: 'Administrative Complex & Clock Tower',
    category: 'academic',
    lat: 12.022025,
    lng: 79.857315,
    color: '#8b5cf6',
    desc: 'University Secretariat, Senate Hall, Finance Branch, and Registrar Office',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Administrative+Office+Pondicherry+University',
  },
  {
    id: 'library',
    name: 'Ananda Rangapillai Central Library',
    category: 'academic',
    lat: 12.020152,
    lng: 79.855872,
    color: '#ec4899',
    desc: 'Iconic 3-tier circular Central Library & 24/7 Digital Reading Room',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ananda+Rangapillai+Library+Pondicherry+University',
  },
  {
    id: 'sjc-campus',
    name: 'Silver Jubilee Campus (SJC)',
    category: 'academic',
    lat: 12.03266,
    lng: 79.857993,
    color: '#6366f1',
    desc: 'Department of Computer Science, Management Studies & Media Sciences',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Silver+Jubilee+Campus+Pondicherry+University',
  },
  {
    id: 'science-complex',
    name: 'Science Complex',
    category: 'academic',
    lat: 12.0175,
    lng: 79.855691,
    color: '#10b981',
    desc: 'Physics, Chemistry, Earth Sciences, and Biotechnology Research Laboratories',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Science+Complex+Pondicherry+University',
  },
  {
    id: 'canteen-complex',
    name: 'Student Canteen & Shopping Hub',
    category: 'amenity',
    lat: 12.021872,
    lng: 79.856053,
    color: '#f59e0b',
    desc: 'Food Court, Co-op Store, Stationery & UniGo Express Laundry Hub',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pondicherry+University+Canteen',
  },
  {
    id: 'sports-complex',
    name: 'Rajiv Gandhi Sports Stadium & Gym',
    category: 'amenity',
    lat: 12.026472,
    lng: 79.850852,
    color: '#14b8a6',
    desc: 'Athletic Track, Basketball Courts, and Fitness Arena',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Rajiv+Gandhi+Stadium+Pondicherry+University',
  },
  {
    id: 'health-centre',
    name: 'University Health Centre',
    category: 'amenity',
    lat: 12.019605,
    lng: 79.850688,
    color: '#ef4444',
    desc: '24/7 Campus Medical Care & Emergency Ambulance Base',
    gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Health+Centre+Pondicherry+University',
  },
];

// Hostels carry the same category/desc fields as landmarks so maps and forms can treat every location uniformly
const withHostelMeta = (hostels, category, label) =>
  hostels.map((h) => ({
    ...h,
    category,
    desc: `${label} • ${h.rooms} • ${h.floor} • Laundry pickup point`,
  }));

// Real hostels and positions from src/data/pu_apple_maps_reference.json (the Apple Maps campus spec)
export const GIRLS_HOSTELS = withHostelMeta([
  { id: 'gh-mother-teresa', name: 'Mother Teresa Hostel', lat: 12.0215, lng: 79.8568, rooms: '180 Rooms', floor: '4 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Mother+Teresa+Hostel+Pondicherry+University' },
  { id: 'gh-madame-curie', name: 'Madame Curie Hostel', lat: 12.023188, lng: 79.848237, rooms: '160 Rooms', floor: '3 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Madame+Curie+Hostel+Pondicherry+University' },
  { id: 'gh-kalpana-chawla', name: 'Kalpana Chawla Hostel', lat: 12.023298, lng: 79.847414, rooms: '150 Rooms', floor: '3 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kalpana+Chawla+Hostel+Pondicherry+University' },
  { id: 'gh-ganga', name: 'Ganga Hostel', lat: 12.02214, lng: 79.849375, rooms: '190 Rooms', floor: '4 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ganga+Hostel+Pondicherry+University' },
  { id: 'gh-yamuna', name: 'Yamuna Hostel', lat: 12.022701, lng: 79.848646, rooms: '190 Rooms', floor: '4 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Yamuna+Hostel+Pondicherry+University' },
  { id: 'gh-cauveri', name: 'Cauveri Hostel', lat: 12.020366, lng: 79.850288, rooms: '200 Rooms', floor: '4 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cauveri+Hostel+Pondicherry+University' },
  { id: 'gh-saraswati', name: 'Saraswati Hostel', lat: 12.021525, lng: 79.849757, rooms: '180 Rooms', floor: '4 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Saraswati+Hostel+Pondicherry+University' },
  { id: 'gh-narmatha', name: 'Narmatha Hostel', lat: 12.022609, lng: 79.84678, rooms: '150 Rooms', floor: '3 Floors', color: '#FF2D55', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Narmatha+Hostel+Pondicherry+University' },
], 'girls-hostel', 'Girls Residence');

export const BOYS_HOSTELS = withHostelMeta([
  { id: 'bh-tagore', name: 'Tagore Hostel', lat: 12.030188, lng: 79.850771, rooms: '230 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Tagore+Hostel+Pondicherry+University' },
  { id: 'bh-kalidas', name: 'Kalidas Hostel', lat: 12.030283, lng: 79.849501, rooms: '200 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kalidas+Hostel+Pondicherry+University' },
  { id: 'bh-kamban', name: 'Kamban Hostel', lat: 12.029773, lng: 79.851897, rooms: '210 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kamban+Hostel+Pondicherry+University' },
  { id: 'bh-maka', name: 'Maulana Abul Kalam Azad Hostel (MAKA)', lat: 12.029731, lng: 79.848715, rooms: '180 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Maulana+Abul+Kalam+Azad+Hostel+MAKA+Pondicherry+University' },
  { id: 'bh-kabir-das', name: 'Kabir Das Hostel', lat: 12.029236, lng: 79.849187, rooms: '190 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kabir+Das+Hostel+Pondicherry+University' },
  { id: 'bh-kannadasan', name: 'Kannadasan Hostel', lat: 12.02941, lng: 79.850154, rooms: '200 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Kannadasan+Hostel+Pondicherry+University' },
  { id: 'bh-valmiki', name: 'Valmiki Hostel', lat: 12.028967, lng: 79.851404, rooms: '210 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Valmiki+Hostel+Pondicherry+University' },
  { id: 'bh-srk', name: 'Sarvepalli Radhakrishnan Hostel (SRK)', lat: 12.028761, lng: 79.847858, rooms: '220 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sarvepalli+Radhakrishnan+Hostel+SRK+Pondicherry+University' },
  { id: 'bh-cv-raman', name: 'C.V. Raman Hostel', lat: 12.026794, lng: 79.853096, rooms: '200 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=CV+Raman+Hostel+Pondicherry+University' },
  { id: 'bh-subramania-bharathi', name: 'Subramania Bharathiar Hostel', lat: 12.028707, lng: 79.853228, rooms: '190 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Subramania+Bharathiar+Hostel+Pondicherry+University' },
  { id: 'bh-ilango-adigal', name: 'Ilango Adigal Hostel', lat: 12.028324, lng: 79.852756, rooms: '180 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Ilango+Adigal+Hostel+Pondicherry+University' },
  { id: 'bh-pavendar', name: 'Pavendar Bharathidasan Hostel', lat: 12.028216, lng: 79.853481, rooms: '190 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pavendar+Bharathidasan+Hostel+Pondicherry+University' },
  { id: 'bh-sri-aurobindo', name: 'Sri Aurobindo Hostel', lat: 12.029358, lng: 79.853457, rooms: '220 Rooms', floor: '4 Floors', color: '#007AFF', gmapsUrl: 'https://www.google.com/maps/search/?api=1&query=Sri+Aurobindo+Hostel+Pondicherry+University' },
], 'boys-hostel', 'Boys Residence');

export const ALL_PU_LOCATIONS = [
  ...PU_LANDMARKS,
  ...GIRLS_HOSTELS,
  ...BOYS_HOSTELS,
];

export const OTHER_LOCATIONS = [
  'Day Scholar Entrance Portico (Gate 1)',
  'Staff Quarters Complex (Type IV / V)',
  'International Guest House (IGH)',
  'Silver Jubilee Campus Portico',
  'Central Library Portico',
  'Science Complex Foyer',
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
