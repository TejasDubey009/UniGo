import React, { useState, useEffect, useMemo } from 'react';
import { AppContext } from './useApp';
import { RENTAL_FLEET } from '../data/campusData';
import { supabase, isUniversityEmail, friendlyAuthError, friendlyDbError, urlAuthError, RETURN_TAB_KEY } from '../lib/supabase';

const TABS = ['home', 'rides', 'rental', 'laundry', 'food', 'party', 'captain', 'admin'];
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
  const code = query.get('error_code') || hash.get('error_code') || query.get('error') || hash.get('error');
  if (!description && !code) return null;
  ['error', 'error_code', 'error_description'].forEach((key) => query.delete(key));
  const search = query.toString();
  const tabHash = TABS.includes(window.location.hash.slice(1)) ? window.location.hash : '';
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${tabHash}`);
  return urlAuthError(description || '', code || '');
})();

// The page to return to is only for a Google sign-in coming back now (the URL carries ?code=).
// A leftover from an abandoned attempt would otherwise move a later sign-in to some other page.
if (!new URLSearchParams(window.location.search).has('code')) {
  try {
    sessionStorage.removeItem(RETURN_TAB_KEY);
  } catch {
    // Storage blocked: nothing was saved either
  }
}

const EMPTY_BOOKINGS = { userId: null, rides: [], laundry: [], leases: [], hasCompletedRide: false, loaded: false, failed: false };
const EMPTY_ROLES = { userId: null, captainRecord: null, application: null, isAdmin: false, loaded: false };

// Merge one realtime change into a list of rows, newest first
const applyChange = (rows, { eventType, new: row, old }) => {
  if (eventType === 'DELETE') return rows.filter((r) => r.id !== old.id);
  return rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [row, ...rows];
};

export const AppProvider = ({ children }) => {
  // Navigation (mirrored in the URL hash so refresh and Back/Forward work)
  const [activeTab, setActiveTab] = useState(tabFromHash);

  // Map picks shared between pages: fly the map / prefill laundry pickup, and a ride pickup or drop.
  // A ride pick is { field: 'pickup' | 'drop', name, seq }; seq makes picking the same place again count.
  const [selected3DTarget, setSelected3DTarget] = useState(null);
  const [rideTarget, setRideTarget] = useState(null);
  const pickForRide = (field, name) => setRideTarget((prev) => ({ field, name, seq: (prev?.seq ?? 0) + 1 }));
  const clearRideTarget = () => setRideTarget(null);
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

  // Changes whenever the signed-in account changes to another one or signs out, so every page starts
  // fresh instead of carrying the last student's details into the next account. Signing in from a
  // signed-out page keeps what was typed.
  const [account, setAccount] = useState({ owner: null, epoch: 0 });
  if (userId !== account.owner) {
    setAccount({ owner: userId, epoch: account.epoch + (account.owner !== null ? 1 : 0) });
  }

  // Live updates don't replay what was missed while a phone slept or lost signal, so everything is
  // fetched again when the app comes back into view or back online
  const [resyncTick, setResyncTick] = useState(0);
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === 'visible') setResyncTick((tick) => tick + 1);
    };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('online', resync);
    };
  }, []);

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

  // Roles: a student can apply to drive; once an admin approves it they are a captain and get the
  // Captain page. Admins (added in SQL) get the Admin page. Approval and suspension show up live.
  const [roleState, setRoleState] = useState(EMPTY_ROLES);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      supabase.from('captains').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('captain_applications').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([captainRow, application, admin]) => {
      if (cancelled) return;
      setRoleState({
        userId,
        captainRecord: captainRow.data,
        application: application.data,
        isAdmin: Boolean(admin.data),
        loaded: true,
      });
    });

    const update = (key, value) => setRoleState((prev) => (prev.userId === userId ? { ...prev, [key]: value } : prev));
    const mine = { schema: 'public', filter: `user_id=eq.${userId}` };
    const channel = supabase
      .channel(`roles:${userId}`)
      .on('postgres_changes', { event: '*', table: 'captains', ...mine }, ({ new: row }) => {
        if (row?.user_id) update('captainRecord', row);
      })
      .on('postgres_changes', { event: '*', table: 'captain_applications', ...mine }, ({ new: row }) => {
        if (!row?.user_id) return;
        update('application', row);
        // Approval creates the captain record a moment later; fetch it rather than rely on a second event
        if (row.status === 'approved') {
          supabase
            .from('captains')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle()
            .then(({ data }) => data && update('captainRecord', data));
        }
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId, resyncTick]);

  const roles = roleState.userId === userId ? roleState : EMPTY_ROLES;
  const captain = roles.captainRecord?.active ? roles.captainRecord : null;
  const captainPaused = Boolean(roles.captainRecord && !roles.captainRecord.active);

  const setCaptainOnDuty = async (onDuty) => {
    const { data, error } = await supabase.from('captains').update({ on_duty: onDuty }).eq('user_id', userId).select().maybeSingle();
    if (data) setRoleState((prev) => (prev.userId === userId ? { ...prev, captainRecord: data } : prev));
    return { error: error || !data ? friendlyDbError(error) : null };
  };

  // Apply to drive, or correct a rejected application and send it again
  const applyToDrive = async (details) => {
    const { data, error } = await supabase.rpc('apply_to_drive', details);
    if (error) return { error: friendlyDbError(error) };
    setRoleState((prev) => (prev.userId === userId ? { ...prev, application: data } : prev));
    return { data };
  };

  const openAuth = (prompt = {}) => setAuthPrompt({ mode: 'signin', ...prompt });
  const closeAuth = () => setAuthPrompt(null);

  // Booking needs an account: true when signed in, otherwise asks the student to sign in first
  // (not while a saved session is still being restored)
  const requireAuth = (reason) => {
    if (user) return true;
    if (authReady) openAuth({ reason });
    return false;
  };

  // A captain who signs out goes off duty, so nobody dispatches rides to an empty phone
  const signOut = async () => {
    if (!supabase) return;
    if (captain?.on_duty) await supabase.from('captains').update({ on_duty: false }).eq('user_id', userId);
    await supabase.auth.signOut();
  };

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
  const [fleetTick, setFleetTick] = useState(0);
  const refreshFleet = () => setFleetTick((tick) => tick + 1);

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
  }, [resyncTick, fleetTick]);

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
  // Filtered to their own rows: captains can also read rides they drive, and admins read everything
  const [bookingState, setBookingState] = useState(EMPTY_BOOKINGS);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const newest = { ascending: false };
    Promise.all([
      supabase.from('rides').select('*').eq('user_id', userId).order('created_at', newest).limit(20),
      supabase.from('laundry_orders').select('*').eq('user_id', userId).order('created_at', newest).limit(20),
      supabase.from('rental_leases').select(LEASE_COLUMNS).eq('user_id', userId).order('created_at', newest).limit(20),
      // Any completed ride at all (not just the 20 newest), for the first-ride discount
      supabase.from('rides').select('id').eq('user_id', userId).eq('status', 'completed').limit(1),
    ]).then(([rides, laundry, leases, completed]) => {
      if (cancelled) return;
      const failed = Boolean(rides.error || laundry.error || leases.error || completed.error);
      setBookingState((prev) => ({
        userId,
        // A failed reload keeps what was already on screen rather than emptying it
        rides: rides.data || (prev.userId === userId ? prev.rides : []),
        laundry: laundry.data || (prev.userId === userId ? prev.laundry : []),
        leases: leases.data || (prev.userId === userId ? prev.leases : []),
        hasCompletedRide: completed.data ? completed.data.length > 0 : prev.userId === userId && prev.hasCompletedRide,
        loaded: !failed,
        failed,
      }));
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
  }, [userId, resyncTick]);

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
        rideTarget,
        pickForRide,
        clearRideTarget,
        mapDayNightMode,
        setMapDayNightMode,
        authReady,
        user,
        accountEpoch: account.epoch,
        resyncTick,
        captain,
        captainPaused,
        captainApplication: roles.application,
        isAdmin: roles.isAdmin,
        rolesLoaded: roles.loaded,
        setCaptainOnDuty,
        applyToDrive,
        authPrompt,
        openAuth,
        closeAuth,
        requireAuth,
        signOut,
        saveProfileDetails,
        fleet,
        refreshFleet,
        rides: bookings.rides,
        laundryOrders: bookings.laundry,
        leases: bookings.leases,
        bookingsLoaded: bookings.loaded,
        bookingsFailed: bookings.failed,
        hasCompletedRide: bookings.hasCompletedRide,
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
