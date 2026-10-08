-- ==============================================================================
-- PONDICHERRY UNIVERSITY (PU) - UNIGO BACKEND DATABASE SCHEMA (SUPABASE)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USER PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  department TEXT,
  roll_no TEXT,
  hostel_category TEXT CHECK (hostel_category IN ('Boys Hostel', 'Girls Hostel', 'Day Scholar')),
  hostel_name TEXT,
  room_no TEXT,
  coins INTEGER DEFAULT 480,
  verified_student BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SCOOTER & BIKE RENTAL FLEET
CREATE TABLE IF NOT EXISTS public.rental_fleet (
  id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  type TEXT NOT NULL,
  hourly_rate INTEGER NOT NULL,
  daily_rate INTEGER NOT NULL,
  range_or_mileage TEXT,
  speed TEXT,
  fuel_level TEXT,
  available BOOLEAN DEFAULT TRUE,
  pickup_location TEXT NOT NULL,
  image TEXT,
  badge TEXT,
  features TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SCOOTER RENTALS (BOOKINGS)
CREATE TABLE IF NOT EXISTS public.scooter_rentals (
  id TEXT PRIMARY KEY DEFAULT ('rent-' || floor(random() * 9000 + 1000)::text),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  user_phone TEXT,
  user_email TEXT,
  vehicle_id TEXT,
  vehicle_model TEXT NOT NULL,
  pickup_location TEXT NOT NULL,
  dropoff_location TEXT,
  duration_type TEXT CHECK (duration_type IN ('hourly', 'daily')),
  duration_hours INTEGER DEFAULT 2,
  duration_days INTEGER DEFAULT 1,
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'scheduled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. BIKE RIDES (ON-CAMPUS & OUTSIDE RIDES)
CREATE TABLE IF NOT EXISTS public.bike_rides (
  id TEXT PRIMARY KEY DEFAULT ('ride-' || floor(random() * 9000 + 1000)::text),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  pickup_name TEXT NOT NULL,
  pickup_lat NUMERIC(9, 6),
  pickup_lng NUMERIC(9, 6),
  drop_name TEXT NOT NULL,
  drop_lat NUMERIC(9, 6),
  drop_lng NUMERIC(9, 6),
  service_type TEXT DEFAULT 'standard' CHECK (service_type IN ('standard', 'express', 'electric')),
  fare NUMERIC(10, 2) NOT NULL,
  captain_name TEXT,
  captain_phone TEXT,
  captain_bike TEXT,
  status TEXT DEFAULT 'requested' CHECK (status IN ('requested', 'assigned', 'on_way', 'ongoing', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. LAUNDRY ORDERS
CREATE TABLE IF NOT EXISTS public.laundry_orders (
  id TEXT PRIMARY KEY DEFAULT ('LND-' || floor(random() * 9000 + 1000)::text),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  user_phone TEXT,
  hostel_name TEXT NOT NULL,
  room_no TEXT NOT NULL,
  service_type TEXT NOT NULL CHECK (service_type IN ('Wash & Fold', 'Wash & Iron', 'Dry Clean', 'Express 24h Wash')),
  kg_or_bags INTEGER DEFAULT 1,
  clothes_count INTEGER DEFAULT 10,
  pickup_slot TEXT NOT NULL,
  delivery_estimate TIMESTAMPTZ,
  total_price NUMERIC(10, 2) NOT NULL,
  payment_method TEXT DEFAULT 'upi',
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'picked_up', 'washing', 'ready', 'delivered')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. STUDENT DEALS & OFFERS
CREATE TABLE IF NOT EXISTS public.deals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  discount TEXT NOT NULL,
  category TEXT NOT NULL,
  code TEXT NOT NULL,
  valid_until TIMESTAMPTZ,
  image_url TEXT,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scooter_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bike_rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- Allow public read on fleet and deals
CREATE POLICY "Public can view rental fleet" ON public.rental_fleet FOR SELECT USING (true);
CREATE POLICY "Public can view active deals" ON public.deals FOR SELECT USING (active = true);

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Rentals policies
CREATE POLICY "Users can view own rentals" ON public.scooter_rentals FOR SELECT USING (true);
CREATE POLICY "Users can create rentals" ON public.scooter_rentals FOR INSERT WITH CHECK (true);

-- Rides policies
CREATE POLICY "Users can view rides" ON public.bike_rides FOR SELECT USING (true);
CREATE POLICY "Users can request rides" ON public.bike_rides FOR INSERT WITH CHECK (true);

-- Laundry policies
CREATE POLICY "Users can view laundry orders" ON public.laundry_orders FOR SELECT USING (true);
CREATE POLICY "Users can place laundry orders" ON public.laundry_orders FOR INSERT WITH CHECK (true);

-- 9. REALTIME PUBLICATION
ALTER PUBLICATION supabase_realtime ADD TABLE public.scooter_rentals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bike_rides;
ALTER PUBLICATION supabase_realtime ADD TABLE public.laundry_orders;
