import React, { useState, useEffect, useMemo } from 'react';
import { AppContext } from './useApp';
import { RENTAL_FLEET } from '../data/campusData';
import { supabase, isUniversityEmail, friendlyAuthError, friendlyDbError, RETURN_TAB_KEY } from '../lib/supabase';

const TABS = ['home', 'rides', 'rental', 'laundry', 'food', 'party', 'captain'];
// Profile columns a student may update (matches the column grants in supabase/schema.sql)
const PROFILE_FIELDS = ['full_name', 'phone', 'roll_no', 'department', 'hostel_category', 'hostel_name', 'room'];
// Lease list rows leave out the drawn signature, which is only needed on paper
const LEASE_COLUMNS = 'id, vehicle_id, vehicle_name, duration, pickup_hub, total_amount, pre_reserved, status, created_at, updated_at';

const tabFromHash = () => {
  const tab = window.location.hash.slice(1);
  return TABS.includes(tab) ? tab : 'home';
};

const readSession = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const takeSession = (key) => {
  const value = readSession(key);
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing was saved either
  }
  return value;
};

// A sign-in error handed back in the URL (e.g. a Google account outside pondiuni.ac.in).
// Read once when the app loads, then removed so a refresh doesn't show it again.
const URL_AUTH_ERROR = (() => {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const description = query.get('error_description') || hash.get('error_description');
  if (!description) return null;
  ['error', 'error_code', 'error_description'].forEach((key) => query.delete(key));
  const search = query.toString();
  const tabHash = TABS.includes(window.location.hash.slice(1)) ? window.location.hash : '';
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${tabHash}`);
  return friendlyAuthError(description);
})();

const EMPTY_BOOKINGS = { userId: null, rides: [], laundry: [], leases: [], loaded: false };

// Merge one realtime change into a list of rows, newest first
const applyChange = (rows, { eventType, new: row, old }) => {
  if (eventType === 'DELETE') return rows.filter((r) => r.id !== old.id);
  return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [row, ...rows];
};

export const AppProvider = ({ children }) => {
  // Navigation (mirrored in the URL hash so refresh and Back/Forward work)
  const [activeTab, setActiveTab] = useState(tabFromHash);

  // Map picks shared between pages: fly the map / prefill laundry pickup, and the ride drop
  const [selected3DTarget, setSelected3DTarget] = useState(null);
  const [rideDropTarget, setRideDropTarget] = useState(null);
  const [mapDayNightMode, setMapDayNightMode] = useState('day'); // 'day' | 'sunset' | 'night'

  // ---- Accounts ----
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [profile, setProfile] = useState(null);
  // null when closed, else { mode: 'signin' | 'signup' | 'forgot' | 'reset', reason?, error? }
  const [authPrompt, setAuthPrompt] = useState(() => (URL_AUTH_ERROR ? { mode: 'signin', error: URL_AUTH_ERROR } : null));

  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      // The database only creates @pondiuni.ac.in accounts; this also turns away any older outside account
      if (next && !isUniversityEmail(next.user.email)) {
        setSession(null);
        setAuthReady(true);
        setAuthPrompt({ mode: 'signin', error: friendlyAuthError('only for pondicherry') });
        setTimeout(() => supabase.auth.signOut());
        return;
      }
      setSession(next);
      setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') setAuthPrompt({ mode: 'reset' });
      if (event === 'SIGNED_IN') {
        const tab = takeSession(RETURN_TAB_KEY);
        if (TABS.includes(tab)) setActiveTab(tab);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // What the pages need to know about the signed-in student; `key` changes once their profile arrives
  const user = useMemo(() => {
    if (!session) return null;
    const meta = session.user.user_metadata || {};
    const p = profile?.id === session.user.id ? profile : null;
    return {
      id: session.user.id,
      key: `${session.user.id}:${p ? 'profile' : 'session'}`,
      email: session.user.email,
      name: p?.full_name || meta.full_name || meta.name || '',
      avatar: p?.avatar_url || meta.avatar_url || meta.picture || '',
      phone: p?.phone || '',
      rollNo: p?.roll_no || '',
      hostelCategory: p?.hostel_category || '',
      hostelName: p?.hostel_name || '',
      room: p?.room || '',
    };
  }, [session, profile]);

  // UniGo captains (added by staff in Supabase) get the Captain page
  const [captainState, setCaptainState] = useState({ userId: null, captain: null });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('captains')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCaptainState({ userId, captain: data?.active ? data : null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const captain = captainState.userId === userId ? captainState.captain : null;

  const setCaptainOnDuty = async (onDuty) => {
    const { data, error } = await supabase.from('captains').update({ on_duty: onDuty }).eq('user_id', userId).select().maybeSingle();
    if (data) setCaptainState({ userId, captain: data });
    return { error: error || !data ? friendlyDbError(error) : null };
  };

  const openAuth = (prompt = {}) => setAuthPrompt({ mode: 'signin', ...prompt });
  const closeAuth = () => setAuthPrompt(null);

  // Booking needs an account: true when signed in, otherwise asks the student to sign in first
  const requireAuth = (reason) => {
    if (user) return true;
    openAuth({ reason });
    return false;
  };

  const signOut = () => supabase?.auth.signOut();

  // Booking forms save the hostel, room and phone they used, so the next booking is prefilled
  const saveProfileDetails = async (details) => {
    if (!userId) return;
    const changes = Object.fromEntries(
      Object.entries(details).filter(([key, value]) => PROFILE_FIELDS.includes(key) && value && value !== profile?.[key])
    );
    if (!Object.keys(changes).length) return;
    const { data } = await supabase.from('profiles').update(changes).eq('id', userId).select().maybeSingle();
    if (data) setProfile(data);
  };

  // ---- Fleet availability (public) ----
  const [availability, setAvailability] = useState({});

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase
      .from('rental_fleet')
      .select('id, available, next_available_at')
      .then(({ data }) => {
        if (!cancelled && data) setAvailability(Object.fromEntries(data.map((row) => [row.id, row])));
      });
    const channel = supabase
      .channel('rental-fleet')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rental_fleet' }, ({ new: row }) => {
        if (row?.id) setAvailability((prev) => ({ ...prev, [row.id]: row }));
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const fleet = useMemo(
    () =>
      RENTAL_FLEET.map((vehicle) => ({
        ...vehicle,
        available: availability[vehicle.id]?.available ?? true,
        nextAvailableAt: availability[vehicle.id]?.next_available_at ?? null,
      })),
    [availability]
  );

  // ---- The student's bookings, kept live ----
  const [bookingState, setBookingState] = useState(EMPTY_BOOKINGS);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const newest = { ascending: false };
    Promise.all([
      supabase.from('rides').select('*').order('created_at', newest).limit(20),
      supabase.from('laundry_orders').select('*').order('created_at', newest).limit(20),
      supabase.from('rental_leases').select(LEASE_COLUMNS).order('created_at', newest).limit(20),
    ]).then(([rides, laundry, leases]) => {
      if (cancelled) return;
      setBookingState({ userId, rides: rides.data || [], laundry: laundry.data || [], leases: leases.data || [], loaded: true });
    });

    const follow = (key) => (change) =>
      setBookingState((prev) => (prev.userId === userId ? { ...prev, [key]: applyChange(prev[key], change) } : prev));
    const mine = { schema: 'public', filter: `user_id=eq.${userId}` };
    const channel = supabase
      .channel(`bookings:${userId}`)
      .on('postgres_changes', { event: '*', table: 'rides', ...mine }, follow('rides'))
      .on('postgres_changes', { event: '*', table: 'laundry_orders', ...mine }, follow('laundry'))
      .on('postgres_changes', { event: '*', table: 'rental_leases', ...mine }, follow('leases'))
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const bookings = bookingState.userId === userId ? bookingState : EMPTY_BOOKINGS;

  // Insert a booking and show it straight away (the realtime echo then merges into the same row)
  const createBooking = async (table, key, values) => {
    if (!userId) return { error: 'Sign in to book.' };
    const { data, error } = await supabase.from(table).insert(values).select(key === 'leases' ? LEASE_COLUMNS : '*').single();
    if (error) return { error: friendlyDbError(error) };
    setBookingState((prev) =>
      prev.userId === userId ? { ...prev, [key]: applyChange(prev[key], { eventType: 'INSERT', new: data }) } : prev
    );
    return { data };
  };

  const requestRide = (ride) => createBooking('rides', 'rides', ride);
  const placeLaundryOrder = (order) => createBooking('laundry_orders', 'laundry', order);

  const signLease = async (lease) => {
    const result = await createBooking('rental_leases', 'leases', lease);
    // The database takes a leased vehicle off the fleet; show that without waiting for the realtime echo
    if (result.data && !lease.pre_reserved) {
      setAvailability((prev) => ({ ...prev, [lease.vehicle_id]: { ...prev[lease.vehicle_id], available: false } }));
    }
    return result;
  };

  const cancelRide = async (rideId) => {
    const { data, error } = await supabase.from('rides').update({ status: 'cancelled' }).eq('id', rideId).select().maybeSingle();
    if (error || !data) return { error: error ? friendlyDbError(error) : 'This ride can no longer be cancelled.' };
    setBookingState((prev) => ({ ...prev, rides: applyChange(prev.rides, { eventType: 'UPDATE', new: data }) }));
    return { data };
  };

  // ---- Routing ----
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
        authReady,
        user,
        captain,
        setCaptainOnDuty,
        authPrompt,
        openAuth,
        closeAuth,
        requireAuth,
        signOut,
        saveProfileDetails,
        fleet,
        rides: bookings.rides,
        laundryOrders: bookings.laundry,
        leases: bookings.leases,
        bookingsLoaded: bookings.loaded,
        requestRide,
        cancelRide,
        placeLaundryOrder,
        signLease,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
