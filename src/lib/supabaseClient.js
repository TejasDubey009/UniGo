import { createClient } from '@supabase/supabase-js';

// Environment variables for Supabase connection
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-anon-key')
);

// Fallback dummy client if credentials are not yet configured
const dummyClient = {
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => Promise.resolve({ data: null, error: null }),
    delete: () => Promise.resolve({ data: null, error: null }),
    on: () => ({ subscribe: () => {} }),
  }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithOAuth: () => Promise.resolve({ data: null, error: new Error('Supabase credentials not configured in .env') }),
    signOut: () => Promise.resolve({ error: null }),
  },
  channel: () => ({
    on: () => ({ subscribe: () => {} }),
    subscribe: () => {},
  }),
};

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : dummyClient;

// ==========================================
// UNIGO BACKEND SERVICE HELPERS
// ==========================================

export const unigoBackend = {
  // --- User Profiles ---
  async getProfile(userId) {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) console.warn('Supabase getProfile:', error.message);
    return data;
  },

  async upsertProfile(profile) {
    if (!isSupabaseConfigured) return null;
    const { data, error } = await supabase
      .from('profiles')
      .upsert(profile)
      .select()
      .single();
    if (error) console.error('Supabase upsertProfile error:', error.message);
    return data;
  },

  // --- Scooter & Bike Rentals ---
  async getRentals(userId) {
    if (!isSupabaseConfigured) return [];
    const query = supabase.from('scooter_rentals').select('*').order('created_at', { ascending: false });
    if (userId) query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) console.warn('Supabase getRentals:', error.message);
    return data || [];
  },

  async createRental(rental) {
    if (!isSupabaseConfigured) return rental;
    const { data, error } = await supabase
      .from('scooter_rentals')
      .insert(rental)
      .select()
      .single();
    if (error) console.error('Supabase createRental error:', error.message);
    return data || rental;
  },

  // --- Laundry Orders ---
  async getLaundryOrders(userId) {
    if (!isSupabaseConfigured) return [];
    const query = supabase.from('laundry_orders').select('*').order('created_at', { ascending: false });
    if (userId) query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) console.warn('Supabase getLaundryOrders:', error.message);
    return data || [];
  },

  async createLaundryOrder(order) {
    if (!isSupabaseConfigured) return order;
    const { data, error } = await supabase
      .from('laundry_orders')
      .insert(order)
      .select()
      .single();
    if (error) console.error('Supabase createLaundryOrder error:', error.message);
    return data || order;
  },

  // --- Campus Rides ---
  async getRides(userId) {
    if (!isSupabaseConfigured) return [];
    const query = supabase.from('bike_rides').select('*').order('created_at', { ascending: false });
    if (userId) query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) console.warn('Supabase getRides:', error.message);
    return data || [];
  },

  async createRide(ride) {
    if (!isSupabaseConfigured) return ride;
    const { data, error } = await supabase
      .from('bike_rides')
      .insert(ride)
      .select()
      .single();
    if (error) console.error('Supabase createRide error:', error.message);
    return data || ride;
  },
};
