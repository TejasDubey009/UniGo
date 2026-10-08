-- =============================================================================
-- UniGo · Supabase schema
-- Run once in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
-- Safe to re-run: every object is created or replaced in place.
--
-- If you ran the older demo version of this file, drop its tables first:
--   drop table if exists public.deals, public.scooter_rentals, public.bike_rides,
--     public.laundry_orders, public.rental_fleet, public.profiles cascade;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Only Pondicherry University accounts
--    Every sign-up path (email + password, Google, magic links, invites) creates a
--    row in auth.users, so the domain is enforced here, on the server.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_university_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) not like '%@pondiuni.ac.in' then
    raise exception 'UniGo is only for Pondicherry University accounts (@pondiuni.ac.in)'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_university_email on auth.users;
create trigger enforce_university_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_university_email();

-- -----------------------------------------------------------------------------
-- 2. Student profiles, created automatically on sign-up
--    Booking forms prefill from here and save the latest hostel, room and phone back.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  phone text,
  roll_no text,
  department text,
  hostel_category text check (hostel_category in ('Girls Hostel', 'Boys Hostel', 'Others')),
  hostel_name text,
  room text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. Rental fleet availability
--    Photos and features live in the app (RENTAL_FLEET in src/data/campusData.js); the model
--    and rates live here as well, because the database prices every lease. Change both together.
--    A confirmed lease takes its vehicle out; an admin marking the lease returned (or
--    cancelling it) puts it back, unless a pre-reservation is waiting for it (section 8).
-- -----------------------------------------------------------------------------
create table if not exists public.rental_fleet (
  id text primary key,
  model text,
  hourly_rate integer check (hourly_rate > 0),
  daily_rate integer check (daily_rate > 0),
  available boolean not null default true,
  next_available_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.rental_fleet add column if not exists model text;
alter table public.rental_fleet add column if not exists hourly_rate integer check (hourly_rate > 0);
alter table public.rental_fleet add column if not exists daily_rate integer check (daily_rate > 0);

insert into public.rental_fleet (id, model, hourly_rate, daily_rate) values
  ('scoot-1', 'Honda Activa 6G (Smart Key)', 40, 299),
  ('scoot-2', 'TVS Jupiter 125 i-Touch', 35, 279),
  ('scoot-3', 'Ather 450X Gen 3', 45, 349),
  ('scoot-4', 'Hero Electric Optima CX', 30, 229),
  ('scoot-5', 'Royal Enfield Hunter 350', 75, 599)
on conflict (id) do update
  set model = excluded.model, hourly_rate = excluded.hourly_rate, daily_rate = excluded.daily_rate;

drop trigger if exists rental_fleet_touch on public.rental_fleet;
create trigger rental_fleet_touch
  before update on public.rental_fleet
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Bookings
-- -----------------------------------------------------------------------------
create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  rider_name text not null,
  rider_phone text,
  pickup text not null,
  drop_off text not null,
  passengers smallint not null default 1 check (passengers in (1, 2)),
  -- Set by price_ride() below, whatever the app sends
  off_campus boolean not null default false,
  first_ride boolean not null default false,
  fare integer not null check (fare > 0),
  -- requested → assigned (a captain accepted) → arriving (captain at pickup) → in_transit
  -- (pickup code checked) → completed, or cancelled. Section 7 moves rides along.
  status text not null default 'requested'
    check (status in ('requested', 'assigned', 'arriving', 'in_transit', 'completed', 'cancelled')),
  -- Copied from the captain's record when they accept, so the rider sees who is coming
  captain_id uuid references auth.users (id) on delete set null,
  captain_name text,
  captain_phone text,
  captain_vehicle text,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pickup <> drop_off)
);

create table if not exists public.laundry_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  student_name text not null,
  phone text not null,
  pickup_category text not null check (pickup_category in ('Girls Hostel', 'Boys Hostel', 'Others')),
  pickup_point text not null,
  room text not null,
  service text not null check (service in ('Wash Only', 'Wash + Iron')),
  -- Students book 2–12 kg; an admin records the weighed load at collection (0.5–30 kg)
  weight_kg numeric(4, 1) not null check (weight_kg between 0.5 and 30),
  -- Set by price_laundry_order() below, whatever the app sends
  price integer not null check (price > 0),
  -- Runners collect on Wednesdays and Sundays and bring it back two days later
  pickup_date date not null,
  delivery_date date generated always as (pickup_date + 2) stored,
  instructions text,
  -- scheduled → collected → washing → ready → delivered, or cancelled
  status text not null default 'scheduled'
    check (status in ('scheduled', 'collected', 'washing', 'ready', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rental_leases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vehicle_id text not null references public.rental_fleet (id),
  vehicle_name text not null,
  rider_name text not null,
  roll_no text,
  phone text not null,
  dl_number text not null,
  duration text not null,
  pickup_hub text not null,
  total_amount integer not null check (total_amount > 0),
  signature text not null,
  pre_reserved boolean not null default false,
  -- reserved (waiting for the vehicle) / confirmed → active → returned, or cancelled
  status text not null default 'confirmed'
    check (status in ('reserved', 'confirmed', 'active', 'returned', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrading from the first version of this file (vehicle choice, laundry time slots)
alter table public.rides add column if not exists passengers smallint not null default 1 check (passengers in (1, 2));
alter table public.rides add column if not exists first_ride boolean not null default false;
alter table public.rides drop column if exists vehicle;
alter table public.laundry_orders add column if not exists pickup_date date;
alter table public.laundry_orders add column if not exists delivery_date date generated always as (pickup_date + 2) stored;
alter table public.laundry_orders drop column if exists pickup_slot;
-- When a request (re)joined the captains' queue: set on booking and when a captain hands it back
alter table public.rides add column if not exists requested_at timestamptz not null default now();
-- 'rider', 'unigo' (an admin), 'expired' (no captain in 30 minutes) or 'code' (five wrong pickup codes)
alter table public.rides add column if not exists cancel_reason text
  check (cancel_reason in ('rider', 'unigo', 'expired', 'code'));
-- Wrong pickup codes so far; survives a captain handing the ride back, so the limit can't be reset
alter table public.rides add column if not exists code_attempts smallint not null default 0;
alter table public.laundry_orders drop constraint if exists laundry_orders_weight_kg_check;
alter table public.laundry_orders add constraint laundry_orders_weight_kg_check check (weight_kg between 0.5 and 30);

-- -----------------------------------------------------------------------------
-- 4a. Prices, worked out here so nobody can book at a price of their own choosing.
--     The app shows the same numbers from src/lib/pricing.js; change both together.
--
--     Rides: ₹20 anywhere on campus; off campus ₹14 per km (₹70 for 5 km), never below
--     ₹20; two riders pay 1.5× (₹30 on campus); a student's first ride is 20% off.
--     Laundry: ₹49/kg wash only, ₹69/kg wash + iron.
-- -----------------------------------------------------------------------------
create table if not exists public.ride_destinations (
  name text primary key,
  km numeric(4, 1) not null check (km > 0)
);

insert into public.ride_destinations (name, km) values
  ('Kalapet Market & Beach', 1.2),
  ('Serenity Beach, Kottakuppam', 7),
  ('Auroville Visitors Centre', 8.5),
  ('White Town / French Quarter', 11.5),
  ('Pondicherry Rock Beach & Promenade', 12),
  ('Puducherry Central Bus Stand', 13),
  ('JIPMER Medical Campus', 14)
on conflict (name) do update set km = excluded.km;

-- Every place on campus a ride can start or end at: the app's own list plus every building on
-- the 3D map. Kept in step with src/lib/geo.js by scripts/build-place-index.mjs (block below).
create table if not exists public.campus_places (
  name text primary key
);
alter table public.campus_places enable row level security;
revoke all on public.campus_places from anon, authenticated;

-- BEGIN campus places (generated by scripts/build-place-index.mjs; do not edit by hand)
with incoming (name) as (values
  ('Gate 1 (Main Entrance - ECR)'),
  ('Gate 2 (Kalapet Entrance)'),
  ('Administrative Complex & Clock Tower'),
  ('Ananda Rangapillai Central Library'),
  ('Silver Jubilee Campus (SJC)'),
  ('Science Complex'),
  ('Student Canteen & Shopping Hub'),
  ('Rajiv Gandhi Sports Stadium & Gym'),
  ('University Health Centre'),
  ('Mother Teresa Hostel'),
  ('Madame Curie Hostel'),
  ('Kalpana Chawla Hostel'),
  ('Ganga Hostel'),
  ('Yamuna Hostel'),
  ('Cauveri Hostel'),
  ('Saraswati Hostel'),
  ('Narmatha Hostel'),
  ('Tagore Hostel'),
  ('Kalidas Hostel'),
  ('Kamban Hostel'),
  ('Maulana Abul Kalam Azad Hostel (MAKA)'),
  ('Kabir Das Hostel'),
  ('Kannadasan Hostel'),
  ('Valmiki Hostel'),
  ('Sarvepalli Radhakrishnan Hostel (SRK)'),
  ('C.V. Raman Hostel'),
  ('Subramania Bharathiar Hostel'),
  ('Ilango Adigal Hostel'),
  ('Pavendar Bharathidasan Hostel'),
  ('Sri Aurobindo Hostel'),
  ('24/7 Digital Reading Hall'),
  ('Amudham Mess Bus Stop'),
  ('Amudham Mess for Boys'),
  ('Boys Tea Time Bus Stop'),
  ('Campus Shopping Complex & Post Office'),
  ('Canteen 2 (Science Complex)'),
  ('Central Library Shuttle Stop'),
  ('Department of Applied Psychology'),
  ('Department of Bioinformatics'),
  ('Department of Biotechnology'),
  ('Department of Computer Science'),
  ('Department of Earth Sciences'),
  ('Department of Electronic Media & Mass Communication'),
  ('Department of Food Science & Technology'),
  ('Department of Management Studies (DMS)'),
  ('Department of Performing Arts & Studio Theatres'),
  ('Department of Physics'),
  ('Directorate of Distance Education'),
  ('Examination Building'),
  ('Food Science Bus Stop'),
  ('Foreign Students Hostel'),
  ('Gate 1 Main Gate Bus Shelter'),
  ('Gender Gate Checkpoint'),
  ('Gents Central Gym'),
  ('HRTEM Centre'),
  ('Indian Bank Campus Branch & ATMs'),
  ('Jawaharlal Nehru Auditorium'),
  ('Kendriya Vidyalaya No. 2 (KV 2)'),
  ('Ladies Central Gym'),
  ('Lecture Hall Complex - 2 (LHC-2)'),
  ('Lecture Hall Complex - I (LHC-I)'),
  ('Library, School of Humanities'),
  ('Library, School of Social Sciences'),
  ('Mass Media Bus Stop'),
  ('MBA Canteen III'),
  ('Mega Mess Bus Stop'),
  ('Mother Teresa Mess (Girls Dining)'),
  ('New Mega Mess'),
  ('PU Co-operative Credit Society'),
  ('Ramanujan School of Mathematical Sciences'),
  ('School of Green Energy Technology (UMSGET)'),
  ('School of Humanities Complex'),
  ('School of Social Sciences & International Studies'),
  ('Shree Valampuri Vinayagar Temple'),
  ('SJ (Silver Jubilee) Bus Stop'),
  ('SJC Canteen & Cultural Centre'),
  ('Students Welfare Centre'),
  ('Subramania Bharathiar School of Tamil'),
  ('Swami Vivekananda Multi Purpose Hall'),
  ('Transit Hostel & Guest Annex'),
  ('UGC - Human Resource Development Centre (HRDC)'),
  ('UNESCO Complex Bus Stop'),
  ('UNESCO Madanjeet Singh Institute (UMISARC)'),
  ('University Sports Pavilion & Courts')
), added as (
  insert into public.campus_places (name) select name from incoming on conflict (name) do nothing
)
delete from public.campus_places where name not in (select name from incoming);
-- END campus places

create or replace function public.price_ride()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  distance numeric;
  base numeric;
begin
  -- Only campus places can be picked up from; drops are campus places or listed destinations
  if not exists (select 1 from public.campus_places where name = new.pickup) then
    raise exception 'Choose a pickup on campus.' using errcode = 'check_violation';
  end if;
  select km into distance from public.ride_destinations where name = new.drop_off;
  if distance is null and not exists (select 1 from public.campus_places where name = new.drop_off) then
    raise exception 'Choose a drop on campus or one of the listed destinations.' using errcode = 'check_violation';
  end if;

  -- A request no captain took within 30 minutes is closed when the student books again
  update public.rides set status = 'cancelled', cancel_reason = 'expired'
   where user_id = new.user_id and status = 'requested' and requested_at < now() - interval '30 minutes';
  if exists (
    select 1 from public.rides
    where user_id = new.user_id and status in ('requested', 'assigned', 'arriving', 'in_transit')
  ) then
    raise exception 'You already have a ride booked. Cancel it before booking another.' using errcode = 'check_violation';
  end if;
  -- Book-and-cancel loops would flood every captain's feed
  if (select count(*) from public.rides where user_id = new.user_id and created_at > now() - interval '1 hour') >= 6 then
    raise exception 'That''s a lot of ride requests in an hour. Try again a little later.' using errcode = 'check_violation';
  end if;

  new.off_campus := distance is not null;
  base := case when distance is null then 20 else greatest(20, round(14 * distance)) end;
  if new.passengers = 2 then
    base := round(base * 1.5);
  end if;
  -- A cancelled ride doesn't use up the first-ride discount
  new.first_ride := not exists (
    select 1 from public.rides where user_id = new.user_id and status <> 'cancelled'
  );
  new.fare := case when new.first_ride then round(base * 0.8) else base end;
  -- A new request never arrives with a captain already on it, or with times of its own choosing
  new.status := 'requested';
  new.created_at := now();
  new.updated_at := now();
  new.requested_at := now();
  new.cancel_reason := null;
  new.code_attempts := 0;
  new.captain_id := null;
  new.captain_name := null;
  new.captain_phone := null;
  new.captain_vehicle := null;
  new.accepted_at := null;
  new.picked_up_at := null;
  new.completed_at := null;
  return new;
end;
$$;

-- Fires after rides_owner (triggers run in name order), so user_id is already the caller
drop trigger if exists rides_price on public.rides;
create trigger rides_price before insert on public.rides
  for each row execute function public.price_ride();

create or replace function public.price_laundry_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.pickup_date is null or extract(isodow from new.pickup_date) not in (3, 7) then
    raise exception 'Laundry is picked up on Wednesdays and Sundays only.' using errcode = 'check_violation';
  end if;
  if new.pickup_date <= (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Book by the day before pickup: choose a later Wednesday or Sunday.' using errcode = 'check_violation';
  end if;
  if new.pickup_date > (now() at time zone 'Asia/Kolkata')::date + 60 then
    raise exception 'Choose a pickup day in the next two months.' using errcode = 'check_violation';
  end if;
  if new.weight_kg is null or new.weight_kg not between 2 and 12 then
    raise exception 'Book between 2 and 12 kg. We weigh it again at pickup.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.laundry_orders where user_id = new.user_id and status = 'scheduled') >= 3 then
    raise exception 'You already have 3 laundry pickups booked.' using errcode = 'check_violation';
  end if;
  new.status := 'scheduled';
  new.created_at := now();
  new.updated_at := now();
  new.price := round(new.weight_kg * case new.service when 'Wash + Iron' then 69 else 49 end);
  return new;
end;
$$;

drop trigger if exists laundry_orders_price on public.laundry_orders;
create trigger laundry_orders_price before insert on public.laundry_orders
  for each row execute function public.price_laundry_order();

drop trigger if exists rides_touch on public.rides;
create trigger rides_touch before update on public.rides
  for each row execute function public.touch_updated_at();
drop trigger if exists laundry_orders_touch on public.laundry_orders;
create trigger laundry_orders_touch before update on public.laundry_orders
  for each row execute function public.touch_updated_at();
drop trigger if exists rental_leases_touch on public.rental_leases;
create trigger rental_leases_touch before update on public.rental_leases
  for each row execute function public.touch_updated_at();

-- Leases are priced here from the fleet's rates, like rides and laundry: the app shows the same
-- numbers (calculateAmount in src/components/RentalView.jsx); change both together.
-- A confirmed lease takes the vehicle out of the bookable fleet; a pre-reservation waits for it.
create or replace function public.lease_total(vehicle public.rental_fleet, duration text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case duration
    when '2 Hours' then vehicle.hourly_rate * 2
    when '4 Hours' then vehicle.hourly_rate * 4
    when '8 Hours' then round(vehicle.daily_rate * 0.7)::integer
    when 'Full Day (24h)' then vehicle.daily_rate
    when 'Weekend (2 Days)' then vehicle.daily_rate * 2 - 50
  end
$$;

-- How long a lease runs, for the vehicle's expected return time
create or replace function public.lease_length(duration text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select case duration
    when '2 Hours' then interval '2 hours'
    when '4 Hours' then interval '4 hours'
    when '8 Hours' then interval '8 hours'
    when 'Full Day (24h)' then interval '24 hours'
    when 'Weekend (2 Days)' then interval '48 hours'
  end
$$;

create or replace function public.handle_new_lease()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vehicle public.rental_fleet;
begin
  select * into vehicle from public.rental_fleet where id = new.vehicle_id;
  if vehicle is null then
    raise exception 'Choose a vehicle from the fleet.' using errcode = 'check_violation';
  end if;
  new.vehicle_name := vehicle.model;
  new.total_amount := public.lease_total(vehicle, new.duration);
  if new.total_amount is null then
    raise exception 'Choose a rental duration.' using errcode = 'check_violation';
  end if;
  if new.pickup_hub is null or new.pickup_hub not in
     ('Gate 1 UniGo Hub (ECR Entrance)', 'Library Hub & Parking Dock', 'Gate 2 Kalapet Entrance') then
    raise exception 'Choose a pickup hub.' using errcode = 'check_violation';
  end if;
  if new.signature is null or new.signature not like 'data:image/png;base64,%' or length(new.signature) > 150000 then
    raise exception 'Sign the lease on the pad.' using errcode = 'check_violation';
  end if;
  new.dl_number := upper(trim(new.dl_number));
  if length(new.dl_number) not between 6 and 20 then
    raise exception 'Enter your driving licence number.' using errcode = 'check_violation';
  end if;
  -- One vehicle at a time per student, so one account can't take the whole fleet
  if exists (
    select 1 from public.rental_leases
    where user_id = new.user_id and status in ('reserved', 'confirmed', 'active')
  ) then
    raise exception 'You already have a vehicle booked. Return or cancel it before booking another.'
      using errcode = 'check_violation';
  end if;
  new.created_at := now();
  new.updated_at := now();

  if new.pre_reserved then
    new.status := 'reserved';
  else
    -- Taking the vehicle is one conditional update, so two students can't both get it
    update public.rental_fleet set available = false where id = new.vehicle_id and available;
    if not found then
      raise exception 'That vehicle was just taken. Pre-reserve it instead.' using errcode = 'check_violation';
    end if;
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

revoke execute on function public.lease_total(public.rental_fleet, text), public.lease_length(text)
  from public, anon, authenticated;

-- Runs after rental_leases_owner (triggers fire in name order), so user_id is already the caller
drop trigger if exists on_lease_created on public.rental_leases;
drop trigger if exists rental_leases_price on public.rental_leases;
create trigger rental_leases_price
  before insert on public.rental_leases
  for each row execute function public.handle_new_lease();

-- -----------------------------------------------------------------------------
-- 4b. Coming-soon services: launch list, first-menu votes, party requests
-- -----------------------------------------------------------------------------
create table if not exists public.launch_waitlist (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  service text not null check (service in ('food', 'party')),
  created_at timestamptz not null default now(),
  primary key (user_id, service)
);

create table if not exists public.dish_votes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  dish_id text not null check (length(dish_id) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (user_id, dish_id)
);

-- Vote totals are public; who voted for what is not
create or replace function public.dish_vote_counts()
returns table (dish_id text, votes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select dish_id, count(*) from public.dish_votes group by dish_id
$$;

create table if not exists public.party_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  contact_name text not null,
  phone text not null,
  occasion text not null,
  event_when text not null,
  venue text not null,
  cake text not null,
  notes text,
  -- new → contacted → booked, or closed
  status text not null default 'new' check (status in ('new', 'contacted', 'booked', 'closed')),
  created_at timestamptz not null default now()
);

-- Students may only ever book in their own name, and never backdate (or postdate) a booking
create or replace function public.force_own_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists rides_owner on public.rides;
create trigger rides_owner before insert on public.rides
  for each row execute function public.force_own_booking();
drop trigger if exists laundry_orders_owner on public.laundry_orders;
create trigger laundry_orders_owner before insert on public.laundry_orders
  for each row execute function public.force_own_booking();
drop trigger if exists rental_leases_owner on public.rental_leases;
create trigger rental_leases_owner before insert on public.rental_leases
  for each row execute function public.force_own_booking();
drop trigger if exists launch_waitlist_owner on public.launch_waitlist;
create trigger launch_waitlist_owner before insert on public.launch_waitlist
  for each row execute function public.force_own_booking();
drop trigger if exists dish_votes_owner on public.dish_votes;
create trigger dish_votes_owner before insert on public.dish_votes
  for each row execute function public.force_own_booking();
drop trigger if exists party_inquiries_owner on public.party_inquiries;
create trigger party_inquiries_owner before insert on public.party_inquiries
  for each row execute function public.force_own_booking();

-- A handful of open party requests per student is plenty
create or replace function public.limit_party_inquiries()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.party_inquiries where user_id = new.user_id and status = 'new') >= 3 then
    raise exception 'You already have 3 party requests waiting. We''ll call you about those first.'
      using errcode = 'check_violation';
  end if;
  new.status := 'new';
  return new;
end;
$$;

-- Runs after party_inquiries_owner (name order)
drop trigger if exists party_inquiries_quota on public.party_inquiries;
create trigger party_inquiries_quota before insert on public.party_inquiries
  for each row execute function public.limit_party_inquiries();

-- -----------------------------------------------------------------------------
-- 4c. Size limits on everything students type, so the API can't be used to store junk.
--     Added NOT VALID: new and updated rows are checked, existing rows are left alone.
-- -----------------------------------------------------------------------------
do $$
declare
  limits text[][] := array[
    ['profiles', 'profiles_text_size', 'length(coalesce(full_name, '''')) <= 120 and length(coalesce(phone, '''')) <= 20
      and length(coalesce(roll_no, '''')) <= 20 and length(coalesce(department, '''')) <= 120
      and length(coalesce(hostel_name, '''')) <= 120 and length(coalesce(room, '''')) <= 20
      and length(coalesce(avatar_url, '''')) <= 500'],
    ['rides', 'rides_text_size', 'length(rider_name) <= 80 and length(coalesce(rider_phone, '''')) <= 20
      and length(pickup) <= 120 and length(drop_off) <= 120'],
    ['laundry_orders', 'laundry_orders_text_size', 'length(student_name) <= 80 and length(phone) <= 20
      and length(pickup_point) <= 120 and length(room) <= 20 and length(coalesce(instructions, '''')) <= 500'],
    ['rental_leases', 'rental_leases_text_size', 'length(rider_name) <= 80 and length(phone) <= 20
      and length(coalesce(roll_no, '''')) <= 20 and length(dl_number) <= 20 and length(signature) <= 150000'],
    ['party_inquiries', 'party_inquiries_text_size', 'length(contact_name) <= 80 and length(phone) <= 20
      and length(occasion) <= 80 and length(event_when) <= 80 and length(venue) <= 120 and length(cake) <= 80
      and length(coalesce(notes, '''')) <= 1000'],
    -- Only the dishes on the Food page can be voted for
    ['dish_votes', 'dish_votes_known_dish', 'dish_id in (''maggi'', ''dosa'', ''shawarma'', ''biryani'', ''coffee'')']
  ];
  item text[];
begin
  foreach item slice 1 in array limits loop
    execute format('alter table public.%I drop constraint if exists %I', item[1], item[2]);
    execute format('alter table public.%I add constraint %I check (%s) not valid', item[1], item[2], item[3]);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Row level security: each student sees and creates only their own rows
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.rental_fleet enable row level security;
alter table public.ride_destinations enable row level security;
alter table public.rides enable row level security;
alter table public.laundry_orders enable row level security;
alter table public.rental_leases enable row level security;
alter table public.launch_waitlist enable row level security;
alter table public.dish_votes enable row level security;
alter table public.party_inquiries enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Anyone can see ride destinations" on public.ride_destinations;
create policy "Anyone can see ride destinations" on public.ride_destinations
  for select to anon, authenticated using (true);

drop policy if exists "Anyone can see fleet availability" on public.rental_fleet;
create policy "Anyone can see fleet availability" on public.rental_fleet
  for select to anon, authenticated using (true);

drop policy if exists "Read own rides" on public.rides;
create policy "Read own rides" on public.rides
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Request rides" on public.rides;
create policy "Request rides" on public.rides
  for insert to authenticated with check ((select auth.uid()) = user_id and status = 'requested');
-- The only change a student can make to a ride is cancelling it before pickup
drop policy if exists "Cancel own ride" on public.rides;
create policy "Cancel own ride" on public.rides
  for update to authenticated
  using ((select auth.uid()) = user_id and status in ('requested', 'assigned', 'arriving'))
  with check ((select auth.uid()) = user_id and status = 'cancelled');

drop policy if exists "Read own laundry orders" on public.laundry_orders;
create policy "Read own laundry orders" on public.laundry_orders
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Place laundry orders" on public.laundry_orders;
create policy "Place laundry orders" on public.laundry_orders
  for insert to authenticated with check ((select auth.uid()) = user_id and status = 'scheduled');

drop policy if exists "Read own leases" on public.rental_leases;
create policy "Read own leases" on public.rental_leases
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Sign leases" on public.rental_leases;
create policy "Sign leases" on public.rental_leases
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Read own waitlist entries" on public.launch_waitlist;
create policy "Read own waitlist entries" on public.launch_waitlist
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Join the waitlist" on public.launch_waitlist;
create policy "Join the waitlist" on public.launch_waitlist
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Read own votes" on public.dish_votes;
create policy "Read own votes" on public.dish_votes
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Vote" on public.dish_votes;
create policy "Vote" on public.dish_votes
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Take back a vote" on public.dish_votes;
create policy "Take back a vote" on public.dish_votes
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Read own party requests" on public.party_inquiries;
create policy "Read own party requests" on public.party_inquiries
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Send party requests" on public.party_inquiries;
create policy "Send party requests" on public.party_inquiries
  for insert to authenticated with check ((select auth.uid()) = user_id and status = 'new');

-- Column-level limits on top of the policies: students can edit their contact details and
-- cancel a ride, nothing else
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone, roll_no, department, hostel_category, hostel_name, room) on public.profiles to authenticated;
revoke update on public.rides from anon, authenticated;
grant update (status) on public.rides to authenticated;
revoke update, delete on public.laundry_orders, public.rental_leases, public.rental_fleet from anon, authenticated;
revoke insert, update, delete on public.ride_destinations from anon, authenticated;
revoke update on public.launch_waitlist, public.dish_votes, public.party_inquiries from anon, authenticated;
revoke delete on public.launch_waitlist, public.party_inquiries from anon, authenticated;
revoke execute on function public.dish_vote_counts() from public;
grant execute on function public.dish_vote_counts() to anon, authenticated;

-- Students insert only the fields they fill in; ids, times, prices and statuses come from the database
revoke insert on public.rides, public.laundry_orders, public.rental_leases, public.party_inquiries,
  public.dish_votes, public.launch_waitlist from anon, authenticated;
grant insert (rider_name, rider_phone, pickup, drop_off, passengers) on public.rides to authenticated;
grant insert (student_name, phone, pickup_category, pickup_point, room, service, weight_kg, pickup_date, instructions)
  on public.laundry_orders to authenticated;
grant insert (vehicle_id, rider_name, roll_no, phone, dl_number, duration, pickup_hub, signature, pre_reserved)
  on public.rental_leases to authenticated;
grant insert (contact_name, phone, occasion, event_when, venue, cake, notes) on public.party_inquiries to authenticated;
grant insert (dish_id) on public.dish_votes to authenticated;
grant insert (service) on public.launch_waitlist to authenticated;

-- A lease's drawn signature is kept on record but never read back by the app (nor sent over realtime)
revoke select on public.rental_leases from anon, authenticated;
grant select (id, user_id, vehicle_id, vehicle_name, rider_name, roll_no, phone, dl_number, duration, pickup_hub,
  total_amount, pre_reserved, status, created_at, updated_at) on public.rental_leases to authenticated;

-- -----------------------------------------------------------------------------
-- 6. Live status updates in the app
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['rides', 'laundry_orders', 'rental_leases', 'rental_fleet'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Captains: accept a request, go to the pickup, check the rider's code, drop them off
--
--    Built to keep the database quiet:
--    • Every step is one function call doing one conditional UPDATE, so two captains
--      tapping Accept at once can't both win, and nothing is held locked.
--    • New requests reach on-duty captains as one realtime broadcast each (no polling).
--    • The captain's live location goes rider-to-captain over a private broadcast
--      channel and is never written to a table.
--    • The pickup code lives in its own table that only the rider can read, and is
--      checked here, with a limit on wrong tries.
-- -----------------------------------------------------------------------------

-- Upgrading from earlier versions of this file
alter table public.rides drop column if exists otp;
alter table public.rides add column if not exists captain_id uuid references auth.users (id) on delete set null;
alter table public.rides add column if not exists accepted_at timestamptz;
alter table public.rides add column if not exists picked_up_at timestamptz;
alter table public.rides add column if not exists completed_at timestamptz;

-- Indexes for the queries that run all day
drop index if exists public.rides_open_idx;
create index if not exists rides_waiting_idx on public.rides (requested_at) where status = 'requested';
create index if not exists rides_captain_idx on public.rides (captain_id, status);
create index if not exists rides_user_idx on public.rides (user_id, created_at desc);
create index if not exists laundry_orders_user_idx on public.laundry_orders (user_id, created_at desc);
create index if not exists rental_leases_user_idx on public.rental_leases (user_id, created_at desc);

-- One open ride per student and one ride at a time per captain, even when two taps race.
-- (Upgrading: older duplicate requests from the same student are closed first.)
update public.rides r set status = 'cancelled'
 where r.status = 'requested'
   and exists (
     select 1 from public.rides n
     where n.user_id = r.user_id and n.id <> r.id
       and n.status in ('requested', 'assigned', 'arriving', 'in_transit') and n.created_at > r.created_at
   );
create unique index if not exists rides_one_open_per_student on public.rides (user_id)
  where status in ('requested', 'assigned', 'arriving', 'in_transit');
create unique index if not exists rides_one_per_captain on public.rides (captain_id)
  where status in ('assigned', 'arriving', 'in_transit');

-- One open lease per student, and a vehicle out on at most one lease. If older data breaks either
-- rule, the index is skipped with a notice: cancel the duplicate leases and run this file again.
do $$
begin
  create unique index if not exists rental_leases_one_open_per_student on public.rental_leases (user_id)
    where status in ('reserved', 'confirmed', 'active');
exception when unique_violation then
  raise notice 'Some students hold more than one open lease; one-lease-per-student is not enforced yet.';
end;
$$;
do $$
begin
  create unique index if not exists rental_leases_one_out_per_vehicle on public.rental_leases (vehicle_id)
    where status in ('confirmed', 'active');
exception when unique_violation then
  raise notice 'A vehicle is on more than one confirmed or active lease; one-lease-per-vehicle is not enforced yet.';
end;
$$;

-- Rides a captain handed back. A captain can't take the same ride again, and can only hand back
-- a few rides a day, so accept-and-release can't be used to collect riders' phone numbers or to
-- reset the pickup-code limit.
create table if not exists public.ride_releases (
  ride_id uuid not null references public.rides (id) on delete cascade,
  captain_id uuid not null references auth.users (id) on delete cascade,
  released_at timestamptz not null default now(),
  primary key (ride_id, captain_id)
);
alter table public.ride_releases enable row level security;
revoke all on public.ride_releases from anon, authenticated;

-- When a ride ends: record who cancelled it, and drop both phone numbers, which were only needed
-- while the rider and captain had to reach each other
create or replace function public.ride_status_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' and new.cancel_reason is null then
    new.cancel_reason := case when new.user_id = auth.uid() then 'rider' else 'unigo' end;
  end if;
  if new.status in ('completed', 'cancelled') then
    new.rider_phone := null;
    new.captain_phone := null;
  end if;
  return new;
end;
$$;

drop trigger if exists rides_status_changed on public.rides;
create trigger rides_status_changed before update of status on public.rides
  for each row execute function public.ride_status_changed();

-- Students apply to drive and an admin approves them (section 8)
create table if not exists public.captains (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  phone text not null,
  vehicle text not null, -- shown to riders, e.g. 'Honda Shine · TN 01 AB 1234'
  on_duty boolean not null default false,
  active boolean not null default true, -- staff switch this off to suspend a captain
  created_at timestamptz not null default now()
);

-- The four-digit pickup code: made when a captain accepts, readable only by the rider
create table if not exists public.ride_otps (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{4}$'),
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.captains enable row level security;
alter table public.ride_otps enable row level security;

drop policy if exists "Captains read their own record" on public.captains;
create policy "Captains read their own record" on public.captains
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Captains go on and off duty" on public.captains;
create policy "Captains go on and off duty" on public.captains
  for update to authenticated using ((select auth.uid()) = user_id and active) with check ((select auth.uid()) = user_id);
revoke insert, update, delete on public.captains from anon, authenticated;
grant update (on_duty) on public.captains to authenticated;

drop policy if exists "Riders read their pickup code" on public.ride_otps;
create policy "Riders read their pickup code" on public.ride_otps
  for select to authenticated
  using (exists (select 1 from public.rides r where r.id = ride_id and r.user_id = (select auth.uid())));
revoke insert, update, delete on public.ride_otps from anon, authenticated;

-- A captain sees the full ride (including the rider's phone) only once it is theirs, and only
-- their current ride and the last day's (for today's earnings); phones are cleared when a ride ends
drop policy if exists "Captains read their rides" on public.rides;
create policy "Captains read their rides" on public.rides
  for select to authenticated using (
    (select auth.uid()) = captain_id
    and (status in ('assigned', 'arriving', 'in_transit') or updated_at > now() - interval '24 hours')
  );

create or replace function public.current_captain()
returns public.captains
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.captains where user_id = auth.uid() and active
$$;

-- Open requests for the captain feed: route, riders and fare, but not the rider's phone.
-- seconds_left comes from the server's clock, so a phone with the wrong time still expires them right.
drop function if exists public.open_ride_requests();
create or replace function public.open_ride_requests()
returns table (
  id uuid,
  pickup text,
  drop_off text,
  passengers smallint,
  off_campus boolean,
  fare integer,
  rider_first_name text,
  requested_at timestamptz,
  seconds_left integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.pickup, r.drop_off, r.passengers, r.off_campus, r.fare, split_part(r.rider_name, ' ', 1),
         r.requested_at, greatest(0, extract(epoch from r.requested_at + interval '30 minutes' - now()))::integer
  from public.rides r
  where r.status = 'requested'
    and r.requested_at > now() - interval '30 minutes'
    and r.user_id <> auth.uid()
    and not exists (select 1 from public.ride_releases rr where rr.ride_id = r.id and rr.captain_id = auth.uid())
    and exists (select 1 from public.captains c where c.user_id = auth.uid() and c.active)
  order by r.requested_at
  limit 20
$$;

-- Hands a waiting ride to a captain and makes the pickup code. Internal: accept_ride (the
-- captain) and admin_assign_ride (an admin dispatching) check who may call it first.
create or replace function public.give_ride_to(ride uuid, driver public.captains)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted public.rides;
begin
  -- First one wins: the row only changes if it is still waiting
  update public.rides
     set status = 'assigned', captain_id = driver.user_id, captain_name = driver.display_name,
         captain_phone = driver.phone, captain_vehicle = driver.vehicle, accepted_at = now()
   where id = ride and status = 'requested' and user_id <> driver.user_id
  returning * into accepted;
  if accepted is null then
    raise exception 'Another captain already took this ride.' using errcode = 'check_violation';
  end if;

  -- A fresh code from a secure random source (gen_random_uuid). Wrong tries so far stay on the
  -- ride (rides.code_attempts), so a new code never means a new set of guesses.
  insert into public.ride_otps (ride_id, code)
  values (ride, lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 7))::bit(28)::int) % 10000)::text, 4, '0'))
  on conflict (ride_id) do update set code = excluded.code, created_at = now();
  return accepted;
end;
$$;

create or replace function public.accept_ride(ride uuid)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.captains;
begin
  -- Locks the captain's row, so a suspension can't land between these checks and the hand-over
  select * into me from public.captains where user_id = auth.uid() and active for update;
  if me is null then
    raise exception 'Only UniGo captains can accept rides.' using errcode = 'check_violation';
  end if;
  if not me.on_duty then
    raise exception 'Go on duty to accept rides.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.rides where captain_id = me.user_id and status in ('assigned', 'arriving', 'in_transit')) then
    raise exception 'Finish your current ride first.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.ride_releases where ride_id = ride and captain_id = me.user_id) then
    raise exception 'You handed this ride back, so another captain will take it.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.rides r
    where r.id = ride and r.status = 'requested' and r.requested_at < now() - interval '30 minutes'
  ) then
    raise exception 'This request has expired.' using errcode = 'check_violation';
  end if;
  return public.give_ride_to(ride, me);
end;
$$;

-- Captain moves their own ride from one status to the next
create or replace function public.advance_ride(ride uuid, from_status text[], to_status text, stamp text default null)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.rides;
begin
  update public.rides
     set status = to_status,
         picked_up_at = case when stamp = 'picked_up_at' then now() else picked_up_at end,
         completed_at = case when stamp = 'completed_at' then now() else completed_at end
   where id = ride and captain_id = auth.uid() and status = any (from_status)
  returning * into updated;
  if updated is null then
    raise exception 'This ride has changed. Pull to refresh.' using errcode = 'check_violation';
  end if;
  return updated;
end;
$$;

create or replace function public.mark_arrived(ride uuid)
returns public.rides
language sql
security definer
set search_path = ''
as $$
  select public.advance_ride(ride, array['assigned'], 'arriving')
$$;

-- The rider reads their code aloud; it must match before the trip can start.
-- A wrong code returns { ok: false } rather than raising an error: an error would roll back
-- the attempt counter along with everything else, and the limit would never bite.
create or replace function public.start_ride(ride uuid, code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_attempts constant smallint := 5;
  tries smallint;
  expected text;
begin
  -- Spend a try first, under the row lock, before comparing anything. A read-only call (a GET)
  -- fails right here whatever the code, so it can't be used to test codes for free, and parallel
  -- calls queue on the lock instead of all slipping under the limit.
  update public.rides r
     set code_attempts = r.code_attempts + 1
   where r.id = ride and r.captain_id = auth.uid() and r.status in ('assigned', 'arriving')
     and r.code_attempts < max_attempts
  returning r.code_attempts into tries;
  if tries is null then
    raise exception 'This ride has changed. Pull to refresh.' using errcode = 'check_violation';
  end if;

  select o.code into expected from public.ride_otps o where o.ride_id = ride;
  if expected is not null and code is not null and expected = trim(code) then
    delete from public.ride_otps where ride_id = ride;
    return jsonb_build_object(
      'ok', true,
      'ride', to_jsonb(public.advance_ride(ride, array['assigned', 'arriving'], 'in_transit', 'picked_up_at'))
    );
  end if;

  -- A wrong code returns { ok: false } rather than raising: an error would roll back the try
  if tries >= max_attempts then
    -- Five wrong codes: cancel the ride so it can never be guessed into starting; the rider books again
    update public.rides set status = 'cancelled', cancel_reason = 'code' where id = ride;
    delete from public.ride_otps where ride_id = ride;
    return jsonb_build_object(
      'ok', false, 'attempts_left', 0, 'cancelled', true,
      'message', 'Five wrong codes, so the ride was cancelled. The rider can book again.'
    );
  end if;
  return jsonb_build_object(
    'ok', false,
    'attempts_left', max_attempts - tries,
    'message', 'That code doesn''t match. Ask the rider for the code on their screen.'
  );
end;
$$;

create or replace function public.complete_ride(ride uuid)
returns public.rides
language sql
security definer
set search_path = ''
as $$
  select public.advance_ride(ride, array['in_transit'], 'completed', 'completed_at')
$$;

-- A captain who can't make it hands the ride back to the queue (before pickup only)
create or replace function public.release_ride(ride uuid)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  released public.rides;
begin
  if (
    select count(*) from public.ride_releases
    where captain_id = auth.uid() and released_at > now() - interval '1 day'
  ) >= 3 then
    raise exception 'You''ve handed back 3 rides today. Finish this one, or ask the rider to cancel.'
      using errcode = 'check_violation';
  end if;
  -- Back in the queue with a fresh 30-minute window
  update public.rides
     set status = 'requested', captain_id = null, captain_name = null, captain_phone = null,
         captain_vehicle = null, accepted_at = null, requested_at = now()
   where id = ride and captain_id = auth.uid() and status in ('assigned', 'arriving')
  returning * into released;
  if released is null then
    raise exception 'This ride has changed. Pull to refresh.' using errcode = 'check_violation';
  end if;
  insert into public.ride_releases (ride_id, captain_id) values (ride, auth.uid()) on conflict do nothing;
  delete from public.ride_otps where ride_id = ride;
  -- The ride is no longer theirs, so the rider's phone doesn't go back with it
  released.rider_phone := null;
  return released;
end;
$$;

-- RPCs are for signed-in users only. advance_ride is internal: called directly it would let a
-- captain skip the pickup code.
revoke execute on function public.current_captain(), public.open_ride_requests(), public.accept_ride(uuid),
  public.advance_ride(uuid, text[], text, text), public.give_ride_to(uuid, public.captains), public.mark_arrived(uuid),
  public.start_ride(uuid, text), public.complete_ride(uuid), public.release_ride(uuid) from public, anon;
revoke execute on function public.advance_ride(uuid, text[], text, text), public.give_ride_to(uuid, public.captains)
  from authenticated;
grant execute on function public.current_captain(), public.open_ride_requests(), public.accept_ride(uuid),
  public.mark_arrived(uuid), public.start_ride(uuid, text), public.complete_ride(uuid), public.release_ride(uuid)
  to authenticated;

-- Tell on-duty captains about new requests, and when one is taken, with one broadcast each.
-- (realtime.send is Supabase's "broadcast from database"; skipped quietly where it doesn't exist.)
create or replace function public.announce_ride_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if to_regprocedure('realtime.send(jsonb, text, text, boolean)') is null then
    return null;
  end if;
  if new.status = 'requested' and (tg_op = 'INSERT' or old.status <> 'requested') then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id, 'pickup', new.pickup, 'drop_off', new.drop_off, 'passengers', new.passengers,
        'off_campus', new.off_campus, 'fare', new.fare,
        'rider_first_name', split_part(new.rider_name, ' ', 1), 'requested_at', new.requested_at,
        'seconds_left', 1800
      ),
      'request', 'captains', true
    );
  elsif tg_op = 'UPDATE' and old.status = 'requested' and new.status <> 'requested' then
    perform realtime.send(jsonb_build_object('id', new.id), 'taken', 'captains', true);
  end if;
  return null;
end;
$$;

drop trigger if exists rides_announce on public.rides;
create trigger rides_announce after insert or update of status on public.rides
  for each row execute function public.announce_ride_request();

-- Who may use which private realtime channel:
--   'captains'       active captains receive request announcements
--   'ride:<ride id>' the rider and their captain share the captain's live location;
--                    only the captain can send, and only while the ride is under way
do $$
begin
  if to_regclass('realtime.messages') is null then
    raise notice 'Realtime authorization is not available on this project; live location stays off.';
    return;
  end if;

  execute 'drop policy if exists "Captains hear new requests" on realtime.messages';
  execute $policy$
    create policy "Captains hear new requests" on realtime.messages
      for select to authenticated
      using (
        realtime.topic() = 'captains'
        and exists (select 1 from public.captains c where c.user_id = (select auth.uid()) and c.active)
      )
  $policy$;

  execute 'drop policy if exists "Rider and captain follow the ride" on realtime.messages';
  execute $policy$
    create policy "Rider and captain follow the ride" on realtime.messages
      for select to authenticated
      using (
        realtime.topic() like 'ride:%'
        and exists (
          select 1 from public.rides r
          where r.id = (substring(realtime.topic() from '^ride:([0-9a-f-]{36})$'))::uuid
            and (r.user_id = (select auth.uid()) or r.captain_id = (select auth.uid()))
            and r.status in ('assigned', 'arriving', 'in_transit')
        )
      )
  $policy$;

  execute 'drop policy if exists "Captain shares their location" on realtime.messages';
  execute $policy$
    create policy "Captain shares their location" on realtime.messages
      for insert to authenticated
      with check (
        realtime.topic() like 'ride:%'
        and exists (
          select 1 from public.rides r
          where r.id = (substring(realtime.topic() from '^ride:([0-9a-f-]{36})$'))::uuid
            and r.captain_id = (select auth.uid())
            and r.status in ('assigned', 'arriving', 'in_transit')
        )
      )
  $policy$;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Admins, and students who apply to drive
--
--    Admins see every ride, laundry order, lease and captain application, and move them
--    along only through the functions below. Each one checks is_admin() and allows only the
--    next sensible step, as one conditional UPDATE. Admins never see pickup codes.
--    The first admin is added in SQL (see README); there is no way to make yourself one.
-- -----------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- A student's request to become a captain. Approving it creates their captain record.
create table if not exists public.captain_applications (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null, -- the applicant's university account, so the admin knows who it is
  display_name text not null,
  phone text not null,
  vehicle_model text not null,
  vehicle_plate text not null,
  dl_number text not null,
  -- pending → approved or rejected; a rejected student can correct it and apply again
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.captain_applications add column if not exists email text;

alter table public.captain_applications drop constraint if exists captain_applications_text_size;
alter table public.captain_applications add constraint captain_applications_text_size check (
  length(display_name) <= 60 and length(phone) <= 20 and length(vehicle_model) <= 60
  and length(vehicle_plate) <= 16 and length(dl_number) <= 20 and length(coalesce(review_note, '')) <= 500
) not valid;

drop trigger if exists captain_applications_touch on public.captain_applications;
create trigger captain_applications_touch before update on public.captain_applications
  for each row execute function public.touch_updated_at();

create index if not exists captain_applications_pending_idx on public.captain_applications (created_at)
  where status = 'pending';

alter table public.admins enable row level security;
alter table public.captain_applications enable row level security;

drop policy if exists "Admins read their own record" on public.admins;
create policy "Admins read their own record" on public.admins
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Read own captain application" on public.captain_applications;
create policy "Read own captain application" on public.captain_applications
  for select to authenticated using ((select auth.uid()) = user_id);

-- Admins read everything they manage (ride_otps stays rider-only)
do $$
declare
  t text;
begin
  foreach t in array array['rides', 'laundry_orders', 'rental_leases', 'captains', 'captain_applications', 'party_inquiries'] loop
    execute format('drop policy if exists "Admins read all" on public.%I', t);
    execute format(
      'create policy "Admins read all" on public.%I for select to authenticated using ((select public.is_admin()))', t
    );
  end loop;
end;
$$;

revoke insert, update, delete on public.admins, public.captain_applications from anon, authenticated;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only UniGo admins can do that.' using errcode = 'check_violation';
  end if;
end;
$$;

-- ---- Captain sign-up ----

-- Apply (or correct a rejected application and apply again)
create or replace function public.apply_to_drive(name text, phone_number text, vehicle text, plate text, licence text)
returns public.captain_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  saved public.captain_applications;
begin
  if me is null then
    raise exception 'Sign in to apply.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.captains where user_id = me) then
    raise exception 'You are already a UniGo captain.' using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(name, ''))) > 60 or length(trim(coalesce(phone_number, ''))) > 20
     or length(trim(coalesce(vehicle, ''))) > 60 or length(trim(coalesce(plate, ''))) > 16
     or length(trim(coalesce(licence, ''))) > 20 then
    raise exception 'One of those details is too long. Check your name, phone, vehicle, plate and licence.'
      using errcode = 'check_violation';
  end if;
  if length(trim(coalesce(name, ''))) < 2 or length(regexp_replace(coalesce(phone_number, ''), '\D', '', 'g')) < 10
     or length(trim(coalesce(vehicle, ''))) < 2 or length(trim(coalesce(plate, ''))) < 4
     or length(trim(coalesce(licence, ''))) < 6 then
    raise exception 'Fill in your name, phone, vehicle, number plate and driving licence number.'
      using errcode = 'check_violation';
  end if;

  insert into public.captain_applications (user_id, email, display_name, phone, vehicle_model, vehicle_plate, dl_number)
  values (
    me, (select u.email from auth.users u where u.id = me),
    trim(name), trim(phone_number), trim(vehicle), upper(trim(plate)), upper(trim(licence))
  )
  on conflict (user_id) do update
     set email = excluded.email, display_name = excluded.display_name, phone = excluded.phone, vehicle_model = excluded.vehicle_model,
         vehicle_plate = excluded.vehicle_plate, dl_number = excluded.dl_number,
         status = 'pending', review_note = null, reviewed_at = null
   where public.captain_applications.status <> 'approved'
  returning * into saved;
  if saved is null then
    raise exception 'You are already a UniGo captain.' using errcode = 'check_violation';
  end if;
  return saved;
end;
$$;

drop function if exists public.review_captain_application(uuid, boolean, text);
create or replace function public.review_captain_application(
  applicant uuid, approve boolean, note text default null, seen_updated_at timestamptz default null
)
returns public.captain_applications
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed public.captain_applications;
begin
  perform public.require_admin();
  -- seen_updated_at: the version the admin looked at; an application edited since then isn't approved blind
  update public.captain_applications
     set status = case when approve then 'approved' else 'rejected' end,
         review_note = nullif(trim(note), ''),
         reviewed_at = now()
   where user_id = applicant and status = 'pending'
     and (seen_updated_at is null or updated_at = seen_updated_at)
  returning * into reviewed;
  if reviewed is null then
    raise exception 'This application was changed or already reviewed. Refresh and look again.'
      using errcode = 'check_violation';
  end if;
  if approve then
    insert into public.captains (user_id, display_name, phone, vehicle)
    values (reviewed.user_id, reviewed.display_name, reviewed.phone, reviewed.vehicle_model || ' · ' || reviewed.vehicle_plate)
    on conflict (user_id) do update
       set display_name = excluded.display_name, phone = excluded.phone, vehicle = excluded.vehicle, active = true;
  end if;
  return reviewed;
end;
$$;

-- Suspend or reinstate a captain (never in the middle of a ride)
create or replace function public.set_captain_active(captain uuid, make_active boolean)
returns public.captains
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated public.captains;
begin
  perform public.require_admin();
  -- Lock the captain first, so they can't accept a ride between this check and the suspension
  perform 1 from public.captains c where c.user_id = captain for update;
  if not make_active and exists (
    select 1 from public.rides where captain_id = captain and status in ('assigned', 'arriving', 'in_transit')
  ) then
    raise exception 'This captain is on a ride. Suspend them once it ends, or cancel the ride first.'
      using errcode = 'check_violation';
  end if;
  update public.captains c
     set active = make_active, on_duty = c.on_duty and make_active
   where c.user_id = captain
  returning * into updated;
  if updated is null then
    raise exception 'Captain not found.' using errcode = 'check_violation';
  end if;
  return updated;
end;
$$;

-- ---- Rides ----

-- Dispatch a waiting ride to an on-duty captain who is free
create or replace function public.admin_assign_ride(ride uuid, captain uuid)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  driver public.captains;
begin
  perform public.require_admin();
  select * into driver from public.captains c where c.user_id = captain and c.active;
  if driver is null then
    raise exception 'That captain is suspended or no longer a captain.' using errcode = 'check_violation';
  end if;
  if not driver.on_duty then
    raise exception 'That captain is off duty.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.rides where captain_id = driver.user_id and status in ('assigned', 'arriving', 'in_transit')) then
    raise exception 'That captain is already on a ride.' using errcode = 'check_violation';
  end if;
  return public.give_ride_to(ride, driver);
end;
$$;

-- Cancel a ride before pickup, or close one stuck on the road as completed
create or replace function public.admin_close_ride(ride uuid, outcome text)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed public.rides;
begin
  perform public.require_admin();
  if outcome not in ('cancelled', 'completed') then
    raise exception 'A ride can only be cancelled or completed.' using errcode = 'check_violation';
  end if;
  update public.rides
     set status = outcome,
         cancel_reason = case when outcome = 'cancelled' then 'unigo' else cancel_reason end,
         completed_at = case when outcome = 'completed' then now() else completed_at end
   where id = ride
     and status = any (case when outcome = 'cancelled' then array['requested', 'assigned', 'arriving'] else array['in_transit'] end)
  returning * into closed;
  if closed is null then
    raise exception 'This ride has changed. Refresh and try again.' using errcode = 'check_violation';
  end if;
  delete from public.ride_otps where ride_id = ride;
  return closed;
end;
$$;

-- ---- Laundry: scheduled → collected (weighed) → washing → ready → delivered ----
create or replace function public.admin_update_laundry(laundry_order uuid, next_status text, weighed_kg numeric default null)
returns public.laundry_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_status text;
  kg numeric := round(weighed_kg, 1);
  updated public.laundry_orders;
begin
  perform public.require_admin();
  from_status := case next_status
    when 'collected' then 'scheduled'
    when 'washing' then 'collected'
    when 'ready' then 'washing'
    when 'delivered' then 'ready'
    when 'cancelled' then 'scheduled'
  end;
  if from_status is null then
    raise exception 'Unknown laundry status.' using errcode = 'check_violation';
  end if;
  if kg is not null and next_status <> 'collected' then
    raise exception 'Record the weight when you collect the laundry.' using errcode = 'check_violation';
  end if;
  if kg is not null and kg not between 0.5 and 30 then
    raise exception 'Enter a weight between 0.5 and 30 kg.' using errcode = 'check_violation';
  end if;

  -- The price follows the weighed load, at the same per-kg rate
  update public.laundry_orders
     set status = next_status,
         weight_kg = coalesce(kg, weight_kg),
         price = case when kg is null then price else round(kg * case service when 'Wash + Iron' then 69 else 49 end) end
   where id = laundry_order and status = from_status
  returning * into updated;
  if updated is null then
    raise exception 'This order has changed. Refresh and try again.' using errcode = 'check_violation';
  end if;
  return updated;
end;
$$;

-- ---- Rentals: reserved → confirmed → active (keys handed over) → returned, or cancelled ----
create or replace function public.admin_update_lease(lease uuid, next_status text)
returns public.rental_leases
language plpgsql
security definer
set search_path = ''
as $$
declare
  from_statuses text[];
  before public.rental_leases;
  updated public.rental_leases;
begin
  perform public.require_admin();
  from_statuses := case next_status
    when 'confirmed' then array['reserved']
    when 'active' then array['confirmed']
    when 'returned' then array['active']
    when 'cancelled' then array['reserved', 'confirmed']
  end;
  if from_statuses is null then
    raise exception 'Unknown lease status.' using errcode = 'check_violation';
  end if;

  -- Lock the lease, so two admins acting at once see the same starting status
  select * into before from public.rental_leases where id = lease for update;
  if before is null or not (before.status = any (from_statuses)) then
    raise exception 'This lease has changed. Refresh and try again.' using errcode = 'check_violation';
  end if;

  if next_status = 'confirmed' then
    -- A pre-reservation becomes a lease once no other lease has the vehicle out
    if exists (
      select 1 from public.rental_leases
      where vehicle_id = before.vehicle_id and status in ('confirmed', 'active') and id <> lease
    ) then
      raise exception 'That vehicle is still out. Confirm this once it is returned.' using errcode = 'check_violation';
    end if;
    update public.rental_fleet set available = false where id = before.vehicle_id;
  end if;

  update public.rental_leases set status = next_status where id = lease returning * into updated;

  if next_status = 'active' then
    -- Keys handed over: students see when the vehicle should be back
    update public.rental_fleet
       set next_available_at = now() + public.lease_length(updated.duration)
     where id = updated.vehicle_id;
  elsif next_status = 'returned' or (next_status = 'cancelled' and before.status = 'confirmed') then
    -- Back in the fleet, unless a pre-reservation is waiting: then it's held for that student
    update public.rental_fleet
       set available = not exists (
             select 1 from public.rental_leases where vehicle_id = updated.vehicle_id and status = 'reserved'
           ),
           next_available_at = null
     where id = updated.vehicle_id;
  end if;
  -- The signature stays in the table; it isn't sent back to the app
  updated.signature := null;
  return updated;
end;
$$;

revoke execute on function public.is_admin(), public.require_admin(), public.apply_to_drive(text, text, text, text, text),
  public.review_captain_application(uuid, boolean, text, timestamptz), public.set_captain_active(uuid, boolean),
  public.admin_assign_ride(uuid, uuid), public.admin_close_ride(uuid, text),
  public.admin_update_laundry(uuid, text, numeric), public.admin_update_lease(uuid, text) from public, anon;
revoke execute on function public.require_admin() from authenticated;
grant execute on function public.is_admin(), public.apply_to_drive(text, text, text, text, text),
  public.review_captain_application(uuid, boolean, text, timestamptz), public.set_captain_active(uuid, boolean),
  public.admin_assign_ride(uuid, uuid), public.admin_close_ride(uuid, text),
  public.admin_update_laundry(uuid, text, numeric), public.admin_update_lease(uuid, text) to authenticated;

-- Admin screens and the captain sign-up status update live too
do $$
declare
  t text;
begin
  foreach t in array array['captains', 'captain_applications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
