import React, { useState, useEffect, useRef } from 'react';
import { AppContext } from './useApp';
import {
  RENTAL_FLEET,
  INITIAL_LAUNDRY_ORDERS,
  INITIAL_ACTIVE_RIDES,
  INITIAL_RENTAL_BOOKINGS,
  DEFAULT_RENTAL_SETTINGS,
  PU_LANDMARKS,
  GIRLS_HOSTELS,
  BOYS_HOSTELS,
} from '../data/campusData';

const STORAGE_KEYS = {
  USER: 'unigo_user_v1',
  RENTAL_SETTINGS: 'unigo_rental_settings_v1',
  FLEET: 'unigo_fleet_v1',
  LAUNDRY: 'unigo_laundry_orders_v1',
  RIDES: 'unigo_rides_v1',
  RENTALS: 'unigo_rental_bookings_v1',
};

const TABS = ['home', 'rides', 'rental', 'laundry', 'food', 'party', 'user-dashboard', 'admin-dashboard', 'dev-dashboard'];

const DEFAULT_USER = {
  id: 'usr_arjun_01',
  name: 'Arjun Sharma',
  email: 'arjun.sharma@pondiuni.ac.in',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  department: 'M.Sc. Computer Science',
  hostelCategory: 'Boys Hostel',
  hostelName: 'Subramania Bharathiar Hostel',
  room: 'Room 214',
  phone: '+91 98765 43210',
  coins: 480,
  verifiedStudent: true,
  rollNo: '24CS089',
};

const loadStored = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
};

// Earlier builds could save the same record twice; drop repeats so list keys stay unique
const loadStoredList = (key, fallback) => {
  const list = loadStored(key, fallback);
  if (!Array.isArray(list)) return fallback;
  const seen = new Set();
  return list.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

// Vehicle photos and their credits are catalog data, so a fleet saved by an older build still gets the current ones
const withCatalogPhotos = (fleet) =>
  fleet.map((vehicle) => {
    const catalog = RENTAL_FLEET.find((v) => v.id === vehicle.id);
    return catalog ? { ...vehicle, image: catalog.image, imageCredit: catalog.imageCredit } : vehicle;
  });

const usePersisted = (key, value) => {
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked (e.g. private mode): keep working in memory for this session
    }
  }, [key, value]);
};

const tabFromHash = () => {
  const tab = window.location.hash.slice(1);
  return TABS.includes(tab) ? tab : 'home';
};

const makeId = (prefix, existing) => {
  let id;
  do {
    id = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (existing.some((item) => item.id === id));
  return id;
};

const formatNow = () =>
  new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

let logSeq = 0;
const makeLog = (type, text) => ({ id: ++logSeq, time: new Date().toLocaleTimeString(), type, text });

export const AppProvider = ({ children }) => {
  // Navigation & View state (mirrored in the URL hash so refresh and Back/Forward work)
  const [activeTab, setActiveTab] = useState(tabFromHash);

  // Selected 3D Campus Target (for flying camera to landmark/hostel and prefilling laundry pickup)
  const [selected3DTarget, setSelected3DTarget] = useState(null);
  // Drop point chosen via "Ride Here" on the campus map
  const [rideDropTarget, setRideDropTarget] = useState(null);
  const [mapDayNightMode, setMapDayNightMode] = useState('day'); // 'day' | 'sunset' | 'night'

  // Auth state
  const [user, setUser] = useState(() => loadStored(STORAGE_KEYS.USER, DEFAULT_USER));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Admin Rental Availability Settings
  const [rentalSettings, setRentalSettings] = useState(() =>
    loadStored(STORAGE_KEYS.RENTAL_SETTINGS, DEFAULT_RENTAL_SETTINGS)
  );

  // Rental Fleet State
  const [fleet, setFleet] = useState(() => withCatalogPhotos(loadStoredList(STORAGE_KEYS.FLEET, RENTAL_FLEET)));

  // Rental Bookings with signed digital agreements
  const [rentalBookings, setRentalBookings] = useState(() =>
    loadStoredList(STORAGE_KEYS.RENTALS, INITIAL_RENTAL_BOOKINGS)
  );

  // Laundry Orders State
  const [laundryOrders, setLaundryOrders] = useState(() =>
    loadStoredList(STORAGE_KEYS.LAUNDRY, INITIAL_LAUNDRY_ORDERS)
  );

  // Rides State
  const [activeRide, setActiveRide] = useState(null);
  const [ridesHistory, setRidesHistory] = useState(() => loadStoredList(STORAGE_KEYS.RIDES, INITIAL_ACTIVE_RIDES));

  // Mirror of activeRide for the delayed captain-match callback, which would otherwise read stale state
  const activeRideRef = useRef(null);
  useEffect(() => {
    activeRideRef.current = activeRide;
  }, [activeRide]);

  // Developer Logs & Telemetry
  const [devLogs, setDevLogs] = useState(() => [
    makeLog('SYS', 'WebGL 3D Campus Engine initialized (Three.js WebGLRenderer)'),
    makeLog('GEO', `Loaded ${PU_LANDMARKS.length} PU Landmarks, ${GIRLS_HOSTELS.length} Girls Hostels, ${BOYS_HOSTELS.length} Boys Hostels`),
    makeLog('AUTH', `Verified session for ${user.email}`),
  ]);

  const addDevLog = (type, text) => {
    const entry = makeLog(type, text);
    setDevLogs((prev) => [entry, ...prev.slice(0, 49)]);
  };

  // Sync to local storage
  usePersisted(STORAGE_KEYS.USER, user);
  usePersisted(STORAGE_KEYS.RENTAL_SETTINGS, rentalSettings);
  usePersisted(STORAGE_KEYS.FLEET, fleet);
  usePersisted(STORAGE_KEYS.LAUNDRY, laundryOrders);
  usePersisted(STORAGE_KEYS.RENTALS, rentalBookings);
  usePersisted(STORAGE_KEYS.RIDES, ridesHistory);

  useEffect(() => {
    if (tabFromHash() === activeTab) return;
    const { pathname, search } = window.location;
    window.history.pushState(null, '', activeTab === 'home' ? pathname + search : `#${activeTab}`);
  }, [activeTab]);

  useEffect(() => {
    const onPopState = () => setActiveTab(tabFromHash());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Actions
  const addLaundryOrder = (orderData) => {
    const newOrder = {
      id: makeId('ORD-PU', laundryOrders),
      date: formatNow(),
      status: 'Pickup Scheduled',
      eta: 'Pickup within 45 mins',
      ...orderData,
    };
    setLaundryOrders((prev) => [newOrder, ...prev]);
    addDevLog('LAUNDRY', `New order ${newOrder.id} placed for ${newOrder.hostelName} (${newOrder.type})`);
    return newOrder;
  };

  const updateLaundryStatus = (orderId, newStatus) => {
    setLaundryOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
    );
    addDevLog('ADMIN', `Order ${orderId} status changed to "${newStatus}"`);
  };

  const addRentalAgreement = (agreementData) => {
    const newAgreement = {
      id: makeId('AGR-PU', rentalBookings),
      signedAt: new Date().toLocaleString(),
      status: agreementData.preReserved
        ? 'Pre-Reserved - Pickup when vehicle is back'
        : 'Confirmed - Bring DL & ID at Pickup',
      ...agreementData,
    };
    setRentalBookings((prev) => [newAgreement, ...prev]);
    // A confirmed lease takes the vehicle out of the bookable fleet until an admin marks it available again
    if (!agreementData.preReserved) {
      setFleet((prev) =>
        prev.map((v) => (v.id === agreementData.vehicleId ? { ...v, available: false, nextAvailableTime: undefined } : v))
      );
    }
    addDevLog('RENTAL', `Agreement ${newAgreement.id} signed by ${newAgreement.studentName} for ${newAgreement.vehicleName}`);
    return newAgreement;
  };

  const setVehicleAvailability = (vehicleId, available) => {
    setFleet((prev) =>
      prev.map((v) =>
        v.id === vehicleId
          ? { ...v, available, ...(available && { nextAvailable: undefined, nextAvailableTime: undefined }) }
          : v
      )
    );
    addDevLog('ADMIN', `Vehicle ${vehicleId} marked as ${available ? 'available' : 'rented'}`);
  };

  const updateRentalSettings = (newSettings) => {
    setRentalSettings((prev) => ({ ...prev, ...newSettings }));
    addDevLog('ADMIN', `Rental settings updated: Available=${newSettings.isAvailable ?? rentalSettings.isAvailable}, Next=${newSettings.nextAvailableTime || rentalSettings.nextAvailableTime}`);
  };

  const startRide = (rideData) => {
    const ride = {
      id: makeId('RIDE-PU', ridesHistory),
      ...rideData,
      status: 'Searching Captain',
      startedAt: Date.now(),
    };
    activeRideRef.current = ride;
    setActiveRide(ride);
    addDevLog('RIDES', `Ride requested: ${ride.pickup} -> ${ride.drop}`);

    // Simulate match; ignore it if the ride was cancelled, replaced or already moved on
    setTimeout(() => {
      const current = activeRideRef.current;
      if (!current || current.id !== ride.id || current.status !== 'Searching Captain') return;
      const matched = {
        ...current,
        status: 'Captain Arriving',
        captainName: 'Murugan S.',
        captainBike: 'Honda Shine (TN-32-BF-1092)',
        captainPhone: '+91 94421 88921',
        rating: 4.9,
        otp: Math.floor(1000 + Math.random() * 9000),
        eta: '3 mins',
      };
      activeRideRef.current = matched;
      setActiveRide(matched);
      addDevLog('RIDES', `Ride ${ride.id} matched with Captain Murugan S.`);
    }, 2500);
  };

  const updateActiveRideStatus = (status) => {
    const current = activeRideRef.current;
    if (!current || current.status === status || current.status === 'Completed') return;
    const updated = { ...current, status };
    activeRideRef.current = updated;
    setActiveRide(updated);
    addDevLog('RIDES', `Ride ${current.id} status changed to: ${status}`);
    if (status === 'Completed') {
      setRidesHistory((h) => [{ ...updated, completedAt: new Date().toLocaleTimeString() }, ...h]);
    }
  };

  // Cancels an in-progress ride, or clears the tracker once a ride is completed
  const dismissActiveRide = () => {
    const current = activeRideRef.current;
    if (!current) return;
    activeRideRef.current = null;
    setActiveRide(null);
    if (current.status !== 'Completed') {
      addDevLog('RIDES', `Ride ${current.id} cancelled by passenger`);
    }
  };

  const resetAllToDefaults = () => {
    setFleet(RENTAL_FLEET);
    setLaundryOrders(INITIAL_LAUNDRY_ORDERS);
    setRidesHistory(INITIAL_ACTIVE_RIDES);
    setRentalBookings(INITIAL_RENTAL_BOOKINGS);
    setRentalSettings(DEFAULT_RENTAL_SETTINGS);
    activeRideRef.current = null;
    setActiveRide(null);
    addDevLog('RESET', 'Reset all state stores to default Pondicherry University demo state.');
  };

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        selected3DTarget,
        setSelected3DTarget,
        rideDropTarget,
        setRideDropTarget,
        mapDayNightMode,
        setMapDayNightMode,
        user,
        setUser,
        isAuthModalOpen,
        setIsAuthModalOpen,
        rentalSettings,
        updateRentalSettings,
        fleet,
        setVehicleAvailability,
        rentalBookings,
        addRentalAgreement,
        laundryOrders,
        addLaundryOrder,
        updateLaundryStatus,
        activeRide,
        startRide,
        updateActiveRideStatus,
        dismissActiveRide,
        ridesHistory,
        devLogs,
        addDevLog,
        resetAllToDefaults,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
