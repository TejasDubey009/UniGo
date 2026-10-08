import React, { useEffect, useState } from 'react';
import { useApp } from '../context/useApp';
import { supabase, friendlyDbError } from '../lib/supabase';
import { shortRef, formatWhen } from '../lib/format';
import { formatDay, fromDateKey } from '../lib/pricing';
import { PageHeader, Segmented } from './ui';
import { Phone } from 'lucide-react';

// What an admin can see and do. Every change goes through a database function that checks the
// caller is an admin and allows only the next step (supabase/schema.sql, section 8).

const OPEN_RIDE = new Set(['requested', 'assigned', 'arriving', 'in_transit']);
const RIDE_STATUS = {
  requested: 'Waiting for a captain',
  assigned: 'Captain on the way',
  arriving: 'Captain at pickup',
  in_transit: 'On the road',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
// Matches the captain feed: older requests are no longer offered to captains
const REQUEST_MAX_AGE_MIN = 30;

const LAUNDRY_NEXT = {
  scheduled: { status: 'collected', label: 'Collected' },
  collected: { status: 'washing', label: 'Washing' },
  washing: { status: 'ready', label: 'Ready' },
  ready: { status: 'delivered', label: 'Delivered' },
};
const LAUNDRY_STATUS = {
  scheduled: 'Pickup booked',
  collected: 'Collected',
  washing: 'Washing',
  ready: 'Ready to deliver',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const LEASE_ACTIONS = {
  reserved: [
    { status: 'confirmed', label: 'Vehicle is back: confirm', tone: 'btn-primary' },
    { status: 'cancelled', label: 'Cancel', tone: 'btn-quiet' },
  ],
  confirmed: [
    { status: 'active', label: 'Keys handed over', tone: 'btn-primary' },
    { status: 'cancelled', label: 'Cancel', tone: 'btn-quiet' },
  ],
  active: [{ status: 'returned', label: 'Returned', tone: 'btn-primary' }],
};
const LEASE_STATUS = {
  reserved: 'Pre-reserved',
  confirmed: 'Ready for pickup',
  active: 'On a trip',
  returned: 'Returned',
  cancelled: 'Cancelled',
};
// The drawn signature stays out of list views
const LEASE_COLUMNS =
  'id, user_id, vehicle_id, vehicle_name, rider_name, roll_no, phone, dl_number, duration, pickup_hub, total_amount, pre_reserved, status, created_at, updated_at';

// Everything still open is loaded in full, however old, so nothing waiting can fall off the page;
// finished items only load the most recent few for the Recent lists
const TABLES = [
  { key: 'rides', table: 'rides', columns: '*', id: 'id', open: ['requested', 'assigned', 'arriving', 'in_transit'], recent: 40 },
  { key: 'laundry', table: 'laundry_orders', columns: '*', id: 'id', open: ['scheduled', 'collected', 'washing', 'ready'], recent: 40 },
  { key: 'leases', table: 'rental_leases', columns: LEASE_COLUMNS, id: 'id', open: ['reserved', 'confirmed', 'active'], recent: 40 },
  { key: 'captains', table: 'captains', columns: '*', id: 'user_id', open: null, recent: 1000 },
  { key: 'applications', table: 'captain_applications', columns: '*', id: 'user_id', open: ['pending'], recent: 40 },
];

const loadTable = async ({ table, columns, open, recent }) => {
  const newest = { ascending: false };
  if (!open) return supabase.from(table).select(columns).order('created_at', newest).limit(recent);
  const [waiting, done] = await Promise.all([
    supabase.from(table).select(columns).in('status', open).order('created_at', newest).limit(1000),
    supabase.from(table).select(columns).not('status', 'in', `(${open.join(',')})`).order('created_at', newest).limit(recent),
  ]);
  return { data: waiting.data && done.data ? [...waiting.data, ...done.data] : null, error: waiting.error || done.error };
};
const ID_OF = Object.fromEntries(TABLES.map((t) => [t.key, t.id]));

const upsert = (rows, row, id) =>
  rows.some((r) => r[id] === row[id]) ? rows.map((r) => (r[id] === row[id] ? { ...r, ...row } : r)) : [row, ...rows];

const minutesSince = (iso, now) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
const ago = (iso, now) => {
  const mins = minutesSince(iso, now);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return formatWhen(iso);
};

function Section({ title, count, children, empty }) {
  return (
    <section className="surface-line p-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <h2 className="heading text-[22px] sm:text-[26px]">{title}</h2>
        {count !== undefined && <span className="badge badge-neutral num">{count}</span>}
      </div>
      {count === 0 ? <p className="mt-4 text-[15px] text-muted">{empty}</p> : <ul className="mt-4 divide-y divide-hairline">{children}</ul>}
    </section>
  );
}

function Row({ children }) {
  return <li className="py-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 animate-pop-in">{children}</li>;
}

function PhoneLink({ phone }) {
  if (!phone) return null;
  return (
    <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-forest font-semibold num hover:underline">
      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
      {phone}
    </a>
  );
}

// ---- Rides ----
function RidesPanel({ rides, captains, act, busy, now }) {
  const [choice, setChoice] = useState({});
  const waiting = rides.filter((r) => r.status === 'requested');
  const onRoad = rides.filter((r) => OPEN_RIDE.has(r.status) && r.status !== 'requested');
  const recent = rides.filter((r) => !OPEN_RIDE.has(r.status)).slice(0, 15);
  const busyCaptains = new Set(onRoad.map((r) => r.captain_id));
  const free = captains.filter((c) => c.active && c.on_duty && !busyCaptains.has(c.user_id));
  const onDuty = captains.filter((c) => c.active && c.on_duty).length;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-body">
        <span className="font-semibold text-ink num">{onDuty}</span> {onDuty === 1 ? 'captain' : 'captains'} on duty,{' '}
        <span className="font-semibold text-ink num">{free.length}</span> free.
      </p>

      <Section title="Waiting for a captain" count={waiting.length} empty="No one is waiting. New requests appear here as students book.">
        {waiting.map((ride) => {
          const expired = minutesSince(ride.requested_at || ride.created_at, now) >= REQUEST_MAX_AGE_MIN;
          // A chosen captain who has since taken another ride is no longer offered (or sent)
          const chosen = choice[ride.id];
          const picked = (free.some((c) => c.user_id === chosen) ? chosen : free[0]?.user_id) ?? '';
          return (
            <Row key={ride.id}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink leading-snug">
                  {ride.pickup} <span className="text-muted">→</span> {ride.drop_off}
                </p>
                <p className="mt-1 text-[13px] text-muted flex flex-wrap gap-x-2">
                  <span>{ride.rider_name}</span>
                  <PhoneLink phone={ride.rider_phone} />
                  <span>· {ride.passengers === 2 ? 'two riders' : 'one rider'}</span>
                  <span className="num">· ₹{ride.fare}</span>
                  <span>· {ago(ride.created_at, now)}</span>
                </p>
                {expired && <p className="mt-1 text-[13px] text-alert">Captains no longer see this request. Assign it or cancel it.</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`assign-${ride.id}`}>
                  Captain for this ride
                </label>
                <select
                  id={`assign-${ride.id}`}
                  value={picked}
                  onChange={(e) => setChoice((prev) => ({ ...prev, [ride.id]: e.target.value }))}
                  disabled={!free.length}
                  className="field !py-2 !text-[14px] w-auto min-w-[180px]"
                >
                  {free.length ? (
                    free.map((c) => (
                      <option key={c.user_id} value={c.user_id}>
                        {c.display_name}
                      </option>
                    ))
                  ) : (
                    <option value="">No free captain on duty</option>
                  )}
                </select>
                <button
                  type="button"
                  disabled={!picked || Boolean(busy)}
                  onClick={() => act(`assign:${ride.id}`, 'rides', supabase.rpc('admin_assign_ride', { ride: ride.id, captain: picked }))}
                  className="btn btn-sm btn-primary"
                >
                  {busy === `assign:${ride.id}` ? 'Assigning…' : 'Assign'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act(`cancel:${ride.id}`, 'rides', supabase.rpc('admin_close_ride', { ride: ride.id, outcome: 'cancelled' }))}
                  className="btn btn-sm btn-quiet"
                >
                  Cancel
                </button>
              </div>
            </Row>
          );
        })}
      </Section>

      <Section title="On the road" count={onRoad.length} empty="No rides in progress.">
        {onRoad.map((ride) => (
          <Row key={ride.id}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink leading-snug">
                {ride.pickup} <span className="text-muted">→</span> {ride.drop_off}
              </p>
              <p className="mt-1 text-[13px] text-muted flex flex-wrap gap-x-2">
                <span>
                  {ride.rider_name} with {ride.captain_name}
                </span>
                <PhoneLink phone={ride.captain_phone} />
                <span className="num">· ₹{ride.fare}</span>
                <span>· accepted {ago(ride.accepted_at, now)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-lime">{RIDE_STATUS[ride.status]}</span>
              {ride.status === 'in_transit' ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act(`close:${ride.id}`, 'rides', supabase.rpc('admin_close_ride', { ride: ride.id, outcome: 'completed' }))}
                  className="btn btn-sm btn-quiet"
                >
                  Mark completed
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => act(`close:${ride.id}`, 'rides', supabase.rpc('admin_close_ride', { ride: ride.id, outcome: 'cancelled' }))}
                  className="btn btn-sm btn-quiet"
                >
                  Cancel ride
                </button>
              )}
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Recent" count={recent.length} empty="Finished rides show up here.">
        {recent.map((ride) => (
          <li key={ride.id} className="py-3 flex items-center justify-between gap-4 text-[14px]">
            <span className="min-w-0 truncate">
              <span className="font-mono text-[12px] text-subtle mr-2">{shortRef(ride.id)}</span>
              {ride.pickup} → {ride.drop_off} · {ride.rider_name}
              {ride.captain_name && ` with ${ride.captain_name}`}
            </span>
            <span className="shrink-0 text-muted">
              {RIDE_STATUS[ride.status]} · <span className="num">₹{ride.fare}</span>
            </span>
          </li>
        ))}
      </Section>
    </div>
  );
}

// ---- Laundry ----
function LaundryPanel({ orders, act, busy }) {
  const [weights, setWeights] = useState({});
  const open = orders
    .filter((o) => LAUNDRY_NEXT[o.status])
    .sort((a, b) => a.pickup_date.localeCompare(b.pickup_date) || a.pickup_point.localeCompare(b.pickup_point));
  const done = orders.filter((o) => !LAUNDRY_NEXT[o.status]).slice(0, 15);

  return (
    <div className="flex flex-col gap-6">
      <Section title="Open orders" count={open.length} empty="No laundry to collect or deliver.">
        {open.map((order) => {
          const next = LAUNDRY_NEXT[order.status];
          const weight = weights[order.id] ?? String(order.weight_kg);
          return (
            <Row key={order.id}>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink leading-snug">
                  {order.pickup_point} · room {order.room}
                </p>
                <p className="mt-1 text-[13px] text-muted flex flex-wrap gap-x-2">
                  <span>{order.student_name}</span>
                  <PhoneLink phone={order.phone} />
                  <span>
                    · {order.service}, <span className="num">{order.weight_kg} kg · ₹{order.price}</span>
                  </span>
                  <span>
                    · pickup {formatDay(fromDateKey(order.pickup_date))}, back {formatDay(fromDateKey(order.delivery_date))}
                  </span>
                </p>
                {order.instructions && <p className="mt-1 text-[13px] text-body">“{order.instructions}”</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-ghost">{LAUNDRY_STATUS[order.status]}</span>
                {order.status === 'scheduled' && (
                  <span className="flex items-center gap-1.5">
                    <label htmlFor={`kg-${order.id}`} className="text-[13px] text-muted">
                      Weighed
                    </label>
                    <input
                      id={`kg-${order.id}`}
                      type="number"
                      inputMode="decimal"
                      min="0.5"
                      max="30"
                      step="0.1"
                      value={weight}
                      onChange={(e) => setWeights((prev) => ({ ...prev, [order.id]: e.target.value }))}
                      className="field !py-2 !text-[14px] w-[84px] num"
                    />
                    <span className="text-[13px] text-muted">kg</span>
                  </span>
                )}
                <button
                  type="button"
                  disabled={Boolean(busy) || (order.status === 'scheduled' && !(Number(weight) > 0))}
                  onClick={() =>
                    act(
                      `laundry:${order.id}`,
                      'laundry',
                      supabase.rpc('admin_update_laundry', {
                        laundry_order: order.id,
                        next_status: next.status,
                        weighed_kg: order.status === 'scheduled' ? Number(weight) : null,
                      })
                    )
                  }
                  className="btn btn-sm btn-primary"
                >
                  {busy === `laundry:${order.id}` ? 'Saving…' : `Mark ${next.label.toLowerCase()}`}
                </button>
                {order.status === 'scheduled' && (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      act(`laundry:${order.id}`, 'laundry', supabase.rpc('admin_update_laundry', { laundry_order: order.id, next_status: 'cancelled' }))
                    }
                    className="btn btn-sm btn-quiet"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </Row>
          );
        })}
      </Section>

      <Section title="Recent" count={done.length} empty="Delivered and cancelled orders show up here.">
        {done.map((order) => (
          <li key={order.id} className="py-3 flex items-center justify-between gap-4 text-[14px]">
            <span className="min-w-0 truncate">
              {order.student_name} · {order.pickup_point} · {order.service}
            </span>
            <span className="shrink-0 text-muted">
              {LAUNDRY_STATUS[order.status]} · <span className="num">₹{order.price}</span>
            </span>
          </li>
        ))}
      </Section>
    </div>
  );
}

// ---- Rentals ----
function RentalsPanel({ leases, act, busy }) {
  const open = leases.filter((l) => LEASE_ACTIONS[l.status]);
  const done = leases.filter((l) => !LEASE_ACTIONS[l.status]).slice(0, 15);

  return (
    <div className="flex flex-col gap-6">
      <Section title="Open leases" count={open.length} empty="No vehicles waiting for pickup or out on a trip.">
        {open.map((lease) => (
          <Row key={lease.id}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink leading-snug">
                {lease.vehicle_name} · {lease.duration}
              </p>
              <p className="mt-1 text-[13px] text-muted flex flex-wrap gap-x-2">
                <span>{lease.rider_name}</span>
                {lease.roll_no && <span>({lease.roll_no})</span>}
                <PhoneLink phone={lease.phone} />
                <span>
                  · DL <span className="font-mono">{lease.dl_number}</span>
                </span>
                <span>· {lease.pickup_hub}</span>
                <span className="num">· ₹{lease.total_amount}</span>
                <span>· signed {formatWhen(lease.created_at)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-ghost">{LEASE_STATUS[lease.status]}</span>
              {LEASE_ACTIONS[lease.status].map((action) => (
                <button
                  key={action.status}
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    act(`lease:${lease.id}:${action.status}`, 'leases', supabase.rpc('admin_update_lease', { lease: lease.id, next_status: action.status }))
                  }
                  className={`btn btn-sm ${action.tone}`}
                >
                  {busy === `lease:${lease.id}:${action.status}` ? 'Saving…' : action.label}
                </button>
              ))}
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Recent" count={done.length} empty="Returned and cancelled leases show up here.">
        {done.map((lease) => (
          <li key={lease.id} className="py-3 flex items-center justify-between gap-4 text-[14px]">
            <span className="min-w-0 truncate">
              {lease.vehicle_name} · {lease.rider_name} · {lease.duration}
            </span>
            <span className="shrink-0 text-muted">
              {LEASE_STATUS[lease.status]} · <span className="num">₹{lease.total_amount}</span>
            </span>
          </li>
        ))}
      </Section>
    </div>
  );
}

// ---- Captains ----
function CaptainsPanel({ applications, captains, rides, act, busy }) {
  const [notes, setNotes] = useState({});
  const pending = applications.filter((a) => a.status === 'pending');
  const onRide = new Set(rides.filter((r) => OPEN_RIDE.has(r.status) && r.captain_id).map((r) => r.captain_id));
  const roster = [...captains].sort((a, b) => Number(b.active) - Number(a.active) || a.display_name.localeCompare(b.display_name));

  return (
    <div className="flex flex-col gap-6">
      <Section title="Applications" count={pending.length} empty="No one is waiting for approval.">
        {pending.map((app) => (
          <Row key={app.user_id}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink leading-snug">{app.display_name}</p>
              <p className="mt-1 text-[13px] text-muted flex flex-wrap gap-x-2">
                <span className="break-all">{app.email}</span>
                <PhoneLink phone={app.phone} />
                <span>
                  · {app.vehicle_model} · {app.vehicle_plate}
                </span>
                <span>
                  · DL <span className="font-mono">{app.dl_number}</span>
                </span>
                <span>· applied {formatWhen(app.updated_at)}</span>
              </p>
              <label htmlFor={`note-${app.user_id}`} className="sr-only">
                Note for {app.display_name} if you reject
              </label>
              <input
                id={`note-${app.user_id}`}
                value={notes[app.user_id] || ''}
                onChange={(e) => setNotes((prev) => ({ ...prev, [app.user_id]: e.target.value }))}
                placeholder="Reason, if you reject (they will see it)"
                className="field !py-2 !text-[14px] mt-3 max-w-md"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  act(
                    `app:${app.user_id}`,
                    'applications',
                    // The version on screen: an application edited since is refused rather than approved blind
                    supabase.rpc('review_captain_application', { applicant: app.user_id, approve: true, seen_updated_at: app.updated_at })
                  )
                }
                className="btn btn-sm btn-primary"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  act(
                    `app:${app.user_id}`,
                    'applications',
                    supabase.rpc('review_captain_application', {
                      applicant: app.user_id,
                      approve: false,
                      note: notes[app.user_id] || null,
                      seen_updated_at: app.updated_at,
                    })
                  )
                }
                className="btn btn-sm btn-quiet"
              >
                Reject
              </button>
            </div>
          </Row>
        ))}
      </Section>

      <Section title="Captains" count={roster.length} empty="Approved captains appear here.">
        {roster.map((captain) => (
          <Row key={captain.user_id}>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink leading-snug">{captain.display_name}</p>
              <p className="mt-1 text-[13px] text-muted flex flex-wrap gap-x-2">
                <PhoneLink phone={captain.phone} />
                <span>· {captain.vehicle}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!captain.active ? (
                <span className="badge badge-neutral">Suspended</span>
              ) : onRide.has(captain.user_id) ? (
                <span className="badge badge-lime">On a ride</span>
              ) : captain.on_duty ? (
                <span className="badge badge-lime">
                  <span className="live-dot" aria-hidden="true" />
                  On duty
                </span>
              ) : (
                <span className="badge badge-ghost">Off duty</span>
              )}
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() =>
                  act(
                    `captain:${captain.user_id}`,
                    'captains',
                    supabase.rpc('set_captain_active', { captain: captain.user_id, make_active: !captain.active })
                  )
                }
                className="btn btn-sm btn-quiet"
              >
                {captain.active ? 'Suspend' : 'Reinstate'}
              </button>
            </div>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function AdminConsole({ resyncTick }) {
  const [data, setData] = useState({ rides: [], laundry: [], leases: [], captains: [], applications: [], loaded: false });
  const [section, setSection] = useState('rides');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => new Date().getTime());

  // Everything at once, then kept live: admins can read every row of these tables
  useEffect(() => {
    let cancelled = false;
    Promise.all(TABLES.map(loadTable)).then((results) => {
      if (cancelled) return;
      if (results.some((r) => r.error)) {
        setError("Couldn't load everything. Check your connection; the page reloads its data when you come back to it.");
      }
      setData((prev) => {
        const next = { loaded: true };
        // A failed reload keeps what was already on screen
        TABLES.forEach(({ key }, i) => (next[key] = results[i].data || prev[key] || []));
        return next;
      });
    });

    let channel = supabase.channel('admin');
    TABLES.forEach(({ key, table, id }) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, ({ new: row }) => {
        if (row?.[id]) setData((prev) => ({ ...prev, [key]: upsert(prev[key], row, id) }));
      });
    });
    channel.subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [resyncTick]);

  // Keeps "5 min ago" and the request expiry fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().getTime()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Run one admin action and show the row it returns straight away (the realtime echo merges in)
  const act = async (key, listKey, request) => {
    setBusy(key);
    setError('');
    const { data: row, error: actionError } = await request;
    setBusy('');
    if (actionError) {
      setError(friendlyDbError(actionError));
      return;
    }
    if (row) setData((prev) => ({ ...prev, [listKey]: upsert(prev[listKey], row, ID_OF[listKey]) }));
    // Approving an application creates a captain; reload the roster so they appear at once
    if (listKey === 'applications' && row?.status === 'approved') {
      const { data: captains } = await supabase.from('captains').select('*').order('created_at', { ascending: false });
      if (captains) setData((prev) => ({ ...prev, captains }));
    }
  };

  const counts = {
    rides: data.rides.filter((r) => r.status === 'requested').length,
    laundry: data.laundry.filter((o) => LAUNDRY_NEXT[o.status]).length,
    leases: data.leases.filter((l) => LEASE_ACTIONS[l.status]).length,
    captains: data.applications.filter((a) => a.status === 'pending').length,
  };
  const label = (name, count) => (count ? `${name} · ${count}` : name);

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-6 sm:pt-16 pb-16 sm:pb-24">
      <PageHeader
        eyebrow="UniGo admin"
        title="Operations"
        description="Every ride, laundry order, lease and captain application, live. Dispatch rides, move laundry and rentals along, and approve captains."
      />

      {/* Tighter segments on phones so all four sections fit without scrolling */}
      <div className="mt-6 sm:mt-10 overflow-x-auto -mx-5 px-5 [scrollbar-width:none] max-sm:[&_.segmented-item]:!px-3 max-sm:[&_.segmented-item]:!text-[13px]">
        <Segmented
          ariaLabel="Admin section"
          value={section}
          onChange={setSection}
          options={[
            { value: 'rides', label: label('Rides', counts.rides) },
            { value: 'laundry', label: label('Laundry', counts.laundry) },
            { value: 'leases', label: label('Rentals', counts.leases) },
            { value: 'captains', label: label('Captains', counts.captains) },
          ]}
        />
      </div>

      {error && (
        <p role="alert" className="mt-6 rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
          {error}
        </p>
      )}

      <div className="mt-8">
        {!data.loaded ? (
          <p className="text-[15px] text-muted">Loading…</p>
        ) : section === 'rides' ? (
          <RidesPanel rides={data.rides} captains={data.captains} act={act} busy={busy} now={now} />
        ) : section === 'laundry' ? (
          <LaundryPanel orders={data.laundry} act={act} busy={busy} />
        ) : section === 'leases' ? (
          <RentalsPanel leases={data.leases} act={act} busy={busy} />
        ) : (
          <CaptainsPanel applications={data.applications} captains={data.captains} rides={data.rides} act={act} busy={busy} />
        )}
      </div>
    </div>
  );
}

// Only for accounts in public.admins (added in SQL; see README)
export default function AdminView() {
  const { authReady, user, isAdmin, rolesLoaded, openAuth, resyncTick } = useApp();

  if (user && isAdmin) return <AdminConsole resyncTick={resyncTick} />;

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-6 sm:pt-16 pb-16 sm:pb-24">
      <PageHeader eyebrow="UniGo admin" title="Operations" />
      <div className="mt-12 surface p-6 sm:p-8 max-w-xl">
        {!authReady || (user && !rolesLoaded) ? (
          <p className="text-[15px] text-muted">Checking your account…</p>
        ) : !user ? (
          <>
            <h2 className="heading text-[24px]">Admins sign in here</h2>
            <button type="button" onClick={() => openAuth({ reason: 'Sign in with your admin account.' })} className="btn btn-primary mt-6">
              Sign in
            </button>
          </>
        ) : (
          <>
            <h2 className="heading text-[24px]">This account is not an admin</h2>
            <p className="mt-2 text-[15px] text-body leading-relaxed">
              <span className="font-semibold text-ink break-all">{user.email}</span> can book and drive, but the admin page
              is only for UniGo staff.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
