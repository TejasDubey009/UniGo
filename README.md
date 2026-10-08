# UniGo 🦄

Campus companion for Pondicherry University students: flat-fare rides across campus, scooter rental with a signed digital lease, hostel laundry pickup, and coming-soon food and party pages. Everything sits around a 3D map of the campus built from OpenStreetMap, with Google satellite and road views alongside.

Accounts are for Pondicherry University only: students sign up with their **@pondiuni.ac.in** email and a password, or continue with their university Google account. Bookings are stored in [Supabase](https://supabase.com).

## Getting started

```bash
npm install
cp .env.example .env.local   # then add your Supabase URL and anon key
npm run dev                  # http://localhost:5173
npm run build                # production build into dist/
npm run lint                 # oxlint
```

Without `.env.local` the app still runs: visitors can browse the map and services, and booking explains that sign-in isn't set up.

## Supabase setup (once per project)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: paste [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates the tables, the @pondiuni.ac.in rule, row level security and live updates, and is safe to run again after changes.
3. **Authentication → Sign In / Providers → Email**: keep it enabled with **Confirm email** on, and set the minimum password length to 8.
4. **Authentication → URL Configuration**: set the Site URL to where UniGo is deployed, and add `http://localhost:5173` and the deployed URL to Redirect URLs. Confirmation, Google and password-reset links return here.
5. **Google sign-in**
   - In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an OAuth client ID of type *Web application*. Add `https://<your-project-ref>.supabase.co/auth/v1/callback` as an authorised redirect URI.
   - If the project lives in the university's Google Workspace, set the OAuth consent screen to **Internal** so only university accounts can use it.
   - Paste the client ID and secret into **Authentication → Sign In / Providers → Google** in Supabase.
6. **Project Settings → API**: copy the Project URL and the anon (publishable) key into `.env.local`, then restart `npm run dev`.

### How the university-only rule is enforced

- The sign-in form only accepts `@pondiuni.ac.in` addresses. Typing just the ID (`asha.r`) adds the domain.
- Google is asked to show university accounts (`hd=pondiuni.ac.in`).
- **The database is the real gate**: a trigger on `auth.users` refuses to create any account, by any method, whose email isn't `@pondiuni.ac.in`, and refuses changing an account's email to one. A student who picks a personal Google account sees "UniGo is only for Pondicherry University accounts".
- The app also signs out any session whose email isn't a university one.

## Prices

| Service | Price |
|---|---|
| Ride on campus | ₹20 for one rider, ₹30 for two |
| Ride off campus | ₹14 per km (₹70 for 5 km), never less than ₹20; two riders pay 1.5× |
| First ride | 20% off, for one or two riders and on or off campus (₹16 / ₹24 on campus). A cancelled ride doesn't use it up. |
| Laundry | ₹49/kg wash only, ₹69/kg wash + iron. Picked up on Wednesdays and Sundays (book by the day before), back two days later. |

The database works out every fare and laundry price itself (`price_ride()` and `price_laundry_order()` in `supabase/schema.sql`), so a booking can't be sent with a made-up price. The app shows the same numbers from `src/lib/pricing.js`; change both together. Off-campus destinations and their distances live in the `ride_destinations` table and `OFF_CAMPUS_DESTINATIONS` in `src/data/campusData.js`.

## Running the service

There is no admin console. Staff work in Supabase's **Table Editor**, and students see each change live:

| Table | What staff do |
|---|---|
| `captains` | Add and suspend captains (see below). Captains run rides themselves from the **Captain** page. |
| `laundry_orders` | Move `status`: `scheduled` → `collected` → `washing` → `ready` → `delivered`. |
| `rental_leases` | Move `status`: `confirmed` → `active` → `returned`. A pre-reservation arrives as `reserved`. |
| `rental_fleet` | A confirmed lease marks its vehicle unavailable automatically. Set `available` back to true when it's returned; `next_available_at` shows the expected return time while it's out. |
| `party_inquiries`, `launch_waitlist`, `dish_votes` | Party requests to call back, the food launch list, and first-menu votes. |

Students can read and create only their own rows, cannot change prices or statuses (apart from cancelling a ride), and can edit only their own contact details.

## Captains

Captains are students with a university account who give rides. A student signs up as usual, then staff make them a captain in the **SQL Editor**:

```sql
insert into public.captains (user_id, display_name, phone, vehicle)
select id, 'Murugan S', '+91 94421 00001', 'Honda Shine · TN 01 AB 1234'
from auth.users where email = 'murugan@pondiuni.ac.in';
```

They then see a **Captain** page (only captains do):

1. Go **on duty**. Open requests appear the moment students book. The first captain to tap **Accept** gets the ride, and it disappears for everyone else.
2. Accepting makes a four-digit **pickup code** that only the rider sees. The captain gets the pickup point on the campus map, a **Navigate** button (Google Maps directions), the rider's name and a **Call** button.
3. At the pickup, the captain taps **I'm at the pickup**, asks for the code and types it in. The ride starts only if it matches. Five wrong tries lock the ride, so the code can't be guessed.
4. **Navigate** now points to the drop. **Complete ride** shows the fare to collect and adds it to today's total.

While the ride is under way, the captain's phone shares its location and the rider sees how far away they are. A captain who can't make it can hand the ride back before pickup. To suspend a captain, set `active` to false.

### Keeping the server and database light

- **No polling.** New requests reach on-duty captains as one realtime broadcast each, sent by a database trigger. The rider's status changes arrive only to the two people involved. Captains refresh the request list once a minute only as a fallback if their connection drops.
- **Live location never touches the database.** The captain's phone sends its position over a private realtime channel for that ride: at most every 5 seconds, only after moving 20 m (or every 30 s when standing still), and only during the ride. Only the rider and that captain can join the channel. A 10-minute ride is about 120 tiny messages and zero rows written.
- **Each step is one call.** Accept, arrive, start and complete are single database functions doing one conditional update. Two captains tapping Accept at once can't both win, and nothing waits on a lock.
- **Small, indexed reads.** The request list returns at most 20 rows from the last 30 minutes, without riders' phone numbers. The hot queries (open requests, a captain's rides, a student's bookings) have indexes.

Realtime authorization (the rules for who can use the private `captains` and `ride:<id>` channels) is set up by `schema.sql`. Leave **Realtime → Settings → Allow public access** at its default (on): the booking-status updates use public channels, and row level security still applies to them.

## Project layout

- `src/context/AppContext.jsx`: `AppProvider` with navigation (URL hash: `#rides`, `#laundry`, …), the Supabase session and profile, the student's bookings (kept live), and fleet availability
- `src/lib/supabase.js`: the Supabase client, the university-email check and friendly error messages
- `src/components/AuthModal.jsx`: sign in, sign up, Google, and password reset
- `src/components/CaptainView.jsx`: the captain console (requests, pickup code, navigation, live location)
- `src/components/`: one component per page, plus the maps:
  - `CampusMap3D.jsx` + `campusMapWorld.js`: the Three.js campus (lazy-loaded through `LazyCampusMap3D.jsx`)
  - `GoogleCampusMap.jsx`: Google satellite and road map of the campus
- `src/data/campusData.js`: campus places, hostels, ride destinations and the rental catalogue
- `supabase/schema.sql`: database tables, rules and triggers

## Campus map data

The 3D map's buildings, roads, sports grounds and coastline come from OpenStreetMap (© OpenStreetMap contributors, ODbL). The names, heights and colours come from the campus spec in `src/data/`. To refresh the geometry:

```bash
node scripts/build-campus-map.mjs                  # fetch from the Overpass API
node scripts/build-campus-map.mjs --osm saved.json # or reuse a saved download
```

See [DESIGN.md](DESIGN.md) for the UI system and the map's placement rules.
