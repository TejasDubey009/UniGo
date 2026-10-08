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
| Rental | From each vehicle's hourly and daily rate: 2 or 4 hours at the hourly rate, 8 hours at 70% of the daily rate, a full day, or a weekend at twice the daily rate less ₹50. |

The database works out every fare, laundry price and lease total itself (`price_ride()`, `price_laundry_order()` and `handle_new_lease()` in `supabase/schema.sql`), so a booking can't be sent with a made-up price. The app shows the same numbers from `src/lib/pricing.js` and `RentalView.jsx`; change both together. Vehicle rates live in the `rental_fleet` table and `RENTAL_FLEET` in `src/data/campusData.js`. Off-campus destinations and their distances live in the `ride_destinations` table and `OFF_CAMPUS_DESTINATIONS`. Campus pickups and drops are checked against `campus_places`, which `node scripts/build-place-index.mjs` keeps in step with the app.

## Accounts

Everyone signs in with a Pondicherry University account. There are three kinds:

| Account | Who | What they get |
|---|---|---|
| Student | Anyone who signs up | Books rides, laundry and rentals, and sees only their own bookings. |
| Captain | A student an admin has approved | The **Captain** page: go on duty, accept rides, check pickup codes, drop riders off. |
| Admin | UniGo staff, added in SQL | The **Admin** page: every booking and captain, live. |

### Making the first admin

Admins can't be created from the app. Sign up with the staff member's university account, then run this once in the **SQL Editor**:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'staff.name@pondiuni.ac.in';
```

### What admins do on the Admin page

| Section | Actions |
|---|---|
| Rides | See requests waiting for a captain, assign one to a free on-duty captain, cancel a ride before pickup, or close a ride stuck on the road as completed. |
| Laundry | Move each order along: collected (record the weighed load; the price follows it at the same per-kg rate), washing, ready, delivered. Cancel before pickup. |
| Rentals | Hand over the keys after checking the licence and student ID, mark the vehicle returned (it becomes bookable again), confirm a pre-reservation once its vehicle is back, or cancel. |
| Captains | Approve or reject students who applied to drive (a rejection note is shown to them), and suspend or reinstate captains. |

Every action is a database function that checks the caller is an admin and allows only the next step, so the rules hold even outside the app. Admins never see pickup codes. Party requests, the food launch list and first-menu votes stay in the **Table Editor** (`party_inquiries`, `launch_waitlist`, `dish_votes`).

### Rules the database enforces

- **Rides.** One open ride per student, and at most six ride requests an hour. A pickup must be a campus place, and a drop a campus place or a listed destination. A request no captain takes within 30 minutes drops off the captains' list (timed by the server's clock), the rider is told, and it closes itself when they book again.
- **Captains.** One ride at a time, and the first to accept a request gets it; everyone else's **Accept** fails and the request disappears from their list. A captain can hand back at most 3 rides a day and can't take a ride they handed back.
- **Pickup codes.** Five wrong codes per ride in total (handing the ride back doesn't reset them) cancel the ride. Each try is spent before the code is compared, so codes can't be tested for free, and codes come from a secure random source.
- **Phone numbers.** A rider's and captain's phones are visible to each other only while the ride is under way; they are cleared when it ends. Captains see only their current ride and the last day's.
- **Rentals.** One open lease per student, so one account can't take the whole fleet. Taking a vehicle is a single conditional update, so two students can't both get it. A returned vehicle is held for a waiting pre-reservation. The drawn signature is stored but never read back by the app.
- **Laundry and party requests.** At most 3 open laundry pickups and 3 open party requests per student; pickups no more than two months ahead.
- **Everything students type** has a length limit, and students can insert only the fields they fill in: ids, times, prices and statuses always come from the database.
- Students read and create only their own rows, cannot change prices or statuses (apart from cancelling a ride before pickup), and can edit only their own contact details.

## Captains

A student opens **Drive with UniGo** from the account menu and applies with their name, phone, vehicle, number plate and driving licence number. An admin approves them on the Admin page, and their **Captain** page opens straight away:

1. Go **on duty**. Open requests appear the moment students book. The first captain to tap **Accept** gets the ride, and it disappears for everyone else.
2. Accepting makes a four-digit **pickup code** that only the rider sees. The captain gets the pickup point on the campus map, a **Navigate** button (Google Maps directions), the rider's name and a **Call** button.
3. At the pickup, the captain taps **I'm at the pickup**, asks for the code and types it in. The ride starts only if it matches. Five wrong codes cancel the ride, so the code can't be guessed.
4. **Navigate** now points to the drop. **Complete ride** shows the fare to collect and adds it to today's total.

While the ride is under way, the captain's phone shares its location and the rider sees how far away they are. A captain who can't make it can hand the ride back before pickup (up to 3 times a day). Signing out takes a captain off duty.

### Keeping the server and database light

- **No polling.** New requests reach on-duty captains as one realtime broadcast each, sent by a database trigger. The rider's status changes arrive only to the two people involved. Captains refresh the request list once a minute only as a fallback if their connection drops.
- **Live location never touches the database.** The captain's phone sends its position over a private realtime channel for that ride: at most every 5 seconds, only after moving 20 m (or every 30 s when standing still), and only during the ride. Only the rider and that captain can join the channel. A 10-minute ride is about 120 tiny messages and zero rows written.
- **Each step is one call.** Accept, arrive, start and complete are single database functions doing one conditional update. Two captains tapping Accept at once can't both win, and nothing waits on a lock.
- **Small, indexed reads.** The request list returns at most 20 rows from the last 30 minutes, without riders' phone numbers. The hot queries (open requests, a captain's rides, a student's bookings) have indexes.

Realtime authorization (the rules for who can use the private `captains` and `ride:<id>` channels) is set up by `schema.sql`. Leave **Realtime → Settings → Allow public access** at its default (on): the booking-status updates use public channels, and row level security still applies to them.

## Security checklist for going live

The database enforces the rules above on its own, but a few settings live outside this repository:

- **Supabase → Authentication**: keep **Confirm email** on (it is what proves a student owns their university mailbox) and the minimum password length at 8 or more.
- **Redirect URLs**: list only the deployed site; use a separate Supabase project for local development rather than adding `http://localhost:5173` to the live one.
- **Hosting headers**: send these with every page (Vercel `vercel.json` headers, Netlify or Cloudflare Pages `_headers`, or your web server). They stop other sites from framing UniGo to trick an admin or captain into clicking:
  ```
  X-Frame-Options: DENY
  Content-Security-Policy: frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  ```
  The production build already includes the rest of the Content-Security-Policy as a `<meta>` tag (`vite.config.js`), and the app refuses to run inside a frame.
- **Old accounts**: the university-only rule stops new outside accounts. To find any created before it existed, run `select id, email from auth.users where email is null or lower(email) not like '%@pondiuni.ac.in';` and delete or ban them.

## Project layout

- `src/context/AppContext.jsx`: `AppProvider` with navigation (URL hash: `#rides`, `#laundry`, …), the Supabase session and profile, roles (captain, application, admin), the student's bookings (kept live), and fleet availability
- `src/lib/supabase.js`: the Supabase client, the university-email check and friendly error messages
- `src/components/AuthModal.jsx`: sign in, sign up, Google, and password reset
- `src/components/CaptainView.jsx`: the captain console (requests, pickup code, navigation, live location) and the application to drive
- `src/components/AdminView.jsx`: the admin page (rides, laundry, rentals, captains), loaded only for admins
- `src/components/ErrorBoundary.jsx`: keeps a failed page or map download from blanking the app; `src/hooks/useDialog.js`: focus, Escape and scroll lock for pop-ups
- `src/components/PlaceSearch.jsx`: the type-to-search pickup and drop fields; `src/lib/geo.js` holds every campus place (`campusPlaceIndex.json`, all 84 places on the map) and the search ranking
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
node scripts/build-hero-plan.mjs                   # then redraw the home hero's campus plan
node scripts/build-place-index.mjs                 # and the searchable list of campus places
```

See [DESIGN.md](DESIGN.md) for the UI system and the map's placement rules.
