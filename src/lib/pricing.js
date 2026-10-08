// UniGo prices and pickup days. The database computes the real fare and laundry price on
// every booking (price_ride() and price_laundry_order() in supabase/schema.sql), so change
// both places together.

// ---- Rides ----
export const CAMPUS_FARE = 20; // one rider, anywhere inside campus
export const OFF_CAMPUS_PER_KM = 14; // ₹70 for a 5 km drop
export const TWO_RIDER_FACTOR = 1.5; // two riders: ₹30 instead of ₹20
export const FIRST_RIDE_DISCOUNT = 0.2;

// Fare before any first-ride discount. `km` is the distance of an off-campus drop, or null on campus.
export const baseRideFare = ({ km = null, passengers = 1 }) => {
  const oneRider = km == null ? CAMPUS_FARE : Math.max(CAMPUS_FARE, Math.round(OFF_CAMPUS_PER_KM * km));
  return passengers === 2 ? Math.round(oneRider * TWO_RIDER_FACTOR) : oneRider;
};

export const rideFare = ({ km = null, passengers = 1, firstRide = false }) => {
  const base = baseRideFare({ km, passengers });
  return firstRide ? Math.round(base * (1 - FIRST_RIDE_DISCOUNT)) : base;
};

// ---- Laundry ----
export const LAUNDRY_RATES = { 'Wash Only': 49, 'Wash + Iron': 69 }; // ₹ per kg
export const LAUNDRY_PICKUP_DAYS = [3, 0]; // Wednesday and Sunday (Date#getDay)
export const LAUNDRY_TURNAROUND_DAYS = 2;

export const laundryPrice = (service, weightKg) => Math.round(weightKg * LAUNDRY_RATES[service]);

// Calendar date as stored in the database (YYYY-MM-DD), in the student's local time
export const toDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const fromDateKey = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// The next pickup days after today (orders close the day before pickup)
export const nextPickupDays = (count = 4, from = new Date()) => {
  const days = [];
  for (let offset = 1; days.length < count && offset < 60; offset++) {
    const day = addDays(from, offset);
    if (LAUNDRY_PICKUP_DAYS.includes(day.getDay())) days.push(day);
  }
  return days;
};

export const formatDay = (date) => date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
