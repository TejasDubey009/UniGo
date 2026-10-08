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
--    The vehicle catalogue (models, prices, photos) lives in the app; this table only
--    says which ones are free. Staff flip `available` back on in the Table Editor
--    when a vehicle is returned.
-- -----------------------------------------------------------------------------
create table if not exists public.rental_fleet (
  id text primary key,
  available boolean not null default true,
  next_available_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.rental_fleet (id) values ('scoot-1'), ('scoot-2'), ('scoot-3'), ('scoot-4'), ('scoot-5')
on conflict (id) do nothing;

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
  weight_kg numeric(4, 1) not null check (weight_kg between 2 and 12),
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
  select km into distance from public.ride_destinations where name = new.drop_off;
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
  -- A new request never arrives with a captain already on it
  new.status := 'requested';
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

-- A confirmed lease takes the vehicle out of the bookable fleet; a pre-reservation waits for it
create or replace function public.handle_new_lease()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pre_reserved then
    new.status := 'reserved';
  else
    if not exists (select 1 from public.rental_fleet where id = new.vehicle_id and available) then
      raise exception 'That vehicle was just taken. Pre-reserve it instead.' using errcode = 'check_violation';
    end if;
    update public.rental_fleet set available = false where id = new.vehicle_id;
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

drop trigger if exists on_lease_created on public.rental_leases;
create trigger on_lease_created
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

-- Students may only ever book in their own name
create or replace function public.force_own_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
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
create index if not exists rides_open_idx on public.rides (created_at) where status = 'requested';
create index if not exists rides_captain_idx on public.rides (captain_id, status);
create index if not exists rides_user_idx on public.rides (user_id, created_at desc);
create index if not exists laundry_orders_user_idx on public.laundry_orders (user_id, created_at desc);
create index if not exists rental_leases_user_idx on public.rental_leases (user_id, created_at desc);

-- Staff add captains (a student's university account) in the Table Editor; see README
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

-- A captain sees the full ride (including the rider's phone) only once it is theirs
drop policy if exists "Captains read their rides" on public.rides;
create policy "Captains read their rides" on public.rides
  for select to authenticated using ((select auth.uid()) = captain_id);

create or replace function public.current_captain()
returns public.captains
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.captains where user_id = auth.uid() and active
$$;

-- Open requests for the captain feed: route, riders and fare, but not the rider's phone
create or replace function public.open_ride_requests()
returns table (
  id uuid,
  pickup text,
  drop_off text,
  passengers smallint,
  off_campus boolean,
  fare integer,
  rider_first_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.pickup, r.drop_off, r.passengers, r.off_campus, r.fare, split_part(r.rider_name, ' ', 1), r.created_at
  from public.rides r
  where r.status = 'requested'
    and r.created_at > now() - interval '30 minutes'
    and r.user_id <> auth.uid()
    and exists (select 1 from public.captains c where c.user_id = auth.uid() and c.active)
  order by r.created_at
  limit 20
$$;

create or replace function public.accept_ride(ride uuid)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.captains;
  accepted public.rides;
begin
  select * into me from public.captains where user_id = auth.uid() and active;
  if me is null then
    raise exception 'Only UniGo captains can accept rides.' using errcode = 'check_violation';
  end if;
  if not me.on_duty then
    raise exception 'Go on duty to accept rides.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.rides where captain_id = me.user_id and status in ('assigned', 'arriving', 'in_transit')) then
    raise exception 'Finish your current ride first.' using errcode = 'check_violation';
  end if;

  -- First captain wins: the row only changes if it is still waiting
  update public.rides
     set status = 'assigned', captain_id = me.user_id, captain_name = me.display_name,
         captain_phone = me.phone, captain_vehicle = me.vehicle, accepted_at = now()
   where id = ride and status = 'requested' and user_id <> me.user_id
  returning * into accepted;
  if accepted is null then
    raise exception 'Another captain already took this ride.' using errcode = 'check_violation';
  end if;

  insert into public.ride_otps (ride_id, code)
  values (ride, lpad((floor(random() * 10000))::int::text, 4, '0'))
  on conflict (ride_id) do update set code = excluded.code, attempts = 0, created_at = now();
  return accepted;
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
  pickup_code public.ride_otps;
  max_attempts constant smallint := 5;
begin
  select o.* into pickup_code
    from public.ride_otps o join public.rides r on r.id = o.ride_id
   where o.ride_id = ride and r.captain_id = auth.uid() and r.status in ('assigned', 'arriving');
  if pickup_code is null then
    raise exception 'This ride has changed. Pull to refresh.' using errcode = 'check_violation';
  end if;
  if pickup_code.attempts >= max_attempts then
    raise exception 'Too many wrong codes. Ask the rider to cancel and book again.' using errcode = 'check_violation';
  end if;
  if pickup_code.code <> trim(code) then
    update public.ride_otps set attempts = attempts + 1 where ride_id = ride;
    return jsonb_build_object(
      'ok', false,
      'attempts_left', max_attempts - pickup_code.attempts - 1,
      'message', 'That code doesn''t match. Ask the rider for the code on their screen.'
    );
  end if;
  delete from public.ride_otps where ride_id = ride;
  return jsonb_build_object(
    'ok', true,
    'ride', to_jsonb(public.advance_ride(ride, array['assigned', 'arriving'], 'in_transit', 'picked_up_at'))
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
  update public.rides
     set status = 'requested', captain_id = null, captain_name = null, captain_phone = null,
         captain_vehicle = null, accepted_at = null
   where id = ride and captain_id = auth.uid() and status in ('assigned', 'arriving')
  returning * into released;
  if released is null then
    raise exception 'This ride has changed. Pull to refresh.' using errcode = 'check_violation';
  end if;
  delete from public.ride_otps where ride_id = ride;
  return released;
end;
$$;

-- RPCs are for signed-in users only. advance_ride is internal: called directly it would let a
-- captain skip the pickup code.
revoke execute on function public.current_captain(), public.open_ride_requests(), public.accept_ride(uuid),
  public.advance_ride(uuid, text[], text, text), public.mark_arrived(uuid), public.start_ride(uuid, text),
  public.complete_ride(uuid), public.release_ride(uuid) from public, anon;
revoke execute on function public.advance_ride(uuid, text[], text, text) from authenticated;
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
        'rider_first_name', split_part(new.rider_name, ' ', 1), 'created_at', new.created_at
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
          where 'ride:' || r.id::text = realtime.topic()
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
          where 'ride:' || r.id::text = realtime.topic()
            and r.captain_id = (select auth.uid())
            and r.status in ('assigned', 'arriving', 'in_transit')
        )
      )
  $policy$;
end;
$$;

