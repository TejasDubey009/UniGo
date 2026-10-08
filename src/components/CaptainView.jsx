import React, { useEffect, useState } from 'react';
import { useApp } from '../context/useApp';
import { supabase, friendlyDbError } from '../lib/supabase';
import { shortRef, formatWhen } from '../lib/format';
import { toDateKey } from '../lib/pricing';
import { placeByName, directionsUrl } from '../lib/geo';
import { celebrate } from '../lib/celebrate';
import CampusMap3D from './LazyCampusMap3D';
import { PageHeader } from './ui';
import { ArrowRight, Check, Navigation, Phone, Users, User, LocateFixed, LocateOff, Bike } from 'lucide-react';

const ACTIVE = new Set(['assigned', 'arriving', 'in_transit']);
const STAGES = [
  { status: 'assigned', label: 'Go to pickup' },
  { status: 'arriving', label: 'Check code' },
  { status: 'in_transit', label: 'Drop off' },
];

// Live location: at most one message every 5 s, only after moving 20 m, and a keep-alive
// every 30 s when standing still. It travels over a private realtime channel, never the database.
const SEND_EVERY_MS = 5000;
const KEEP_ALIVE_MS = 30000;
const MIN_MOVE_M = 20;
// New requests arrive by broadcast; this slow refresh only covers a dropped connection
const REQUEST_REFRESH_MS = 60000;
// A new broadcast request is open for 30 minutes; the feed's seconds_left comes from the server's clock
const REQUEST_OPEN_SECONDS = 1800;
// While a ride is under way, it is re-read this often in case a cancel arrived while the phone slept
const ACTIVE_RIDE_REFRESH_MS = 60000;

// Turns a request (from the feed or a broadcast) into one that expires on this phone's clock
const withExpiry = (request) => ({
  ...request,
  expiresAt: Date.now() + (request.seconds_left ?? REQUEST_OPEN_SECONDS) * 1000,
});

const firstName = (name = '') => name.split(' ')[0] || 'your rider';

const metresBetween = (a, b) => {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371000;
};

// Merge one ride row into the captain's list, newest first
const upsert = (rows, row) => (rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? { ...r, ...row } : r)) : [row, ...rows]);

function DutySwitch({ onDuty, busy, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-label="On duty"
      aria-checked={onDuty}
      onClick={onToggle}
      disabled={busy}
      className={`h-12 pl-2 pr-5 rounded-full flex items-center gap-3 text-[15px] font-semibold transition-colors duration-200 ${
        onDuty ? 'bg-lime text-forest' : 'bg-ash text-ink'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-14 h-8 rounded-full p-1 flex transition-colors duration-200 ${onDuty ? 'bg-forest justify-end' : 'bg-canvas justify-start'}`}
      >
        <span className={`w-6 h-6 rounded-full transition-colors duration-200 ${onDuty ? 'bg-lime' : 'bg-ash'}`} />
      </span>
      {onDuty ? 'On duty' : 'Off duty'}
    </button>
  );
}

function Stop({ label, name, isTarget, mark }) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span aria-hidden="true" className={`mt-1.5 w-3 h-3 rounded-full shrink-0 ${mark}`} />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-muted">{label}</p>
        <p className={`text-[16px] leading-snug ${isTarget ? 'font-semibold text-ink' : 'text-body'}`}>{name}</p>
      </div>
      {isTarget && (
        <a href={directionsUrl(name)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-forest shrink-0">
          <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
          Navigate
        </a>
      )}
    </div>
  );
}

function CaptainConsole({ user, captain, setCaptainOnDuty, ownRides, resyncTick }) {
  const [rides, setRides] = useState([]);
  const [rideTick, setRideTick] = useState(0);
  // Rides this captain handed back: the database won't let them take those again
  const [releasedIds, setReleasedIds] = useState(() => new Set());
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [code, setCode] = useState('');
  const [sharing, setSharing] = useState('starting'); // 'starting' | 'on' | 'denied' | 'unavailable'
  const [now, setNow] = useState(() => new Date().getTime());

  const activeRide = rides.find((r) => ACTIVE.has(r.status)) || null;
  const listening = captain.on_duty && !activeRide;

  useEffect(() => {
    if (!activeRide) return;
    const timer = setInterval(() => setRideTick((tick) => tick + 1), ACTIVE_RIDE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [activeRide]);

  // The captain's own rides, kept live (the rider may cancel at any moment), and read again when the
  // app comes back into view and every minute during a ride, in case an update was missed
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('rides')
      .select('*')
      .eq('captain_id', user.id)
      .order('accepted_at', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (!cancelled && data) setRides(data);
      });
    const channel = supabase
      .channel(`captain-rides:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides', filter: `captain_id=eq.${user.id}` }, ({ new: row }) => {
        if (!row?.id) return;
        setRides((prev) => upsert(prev, row));
        if (row.status === 'cancelled') {
          setNotice(row.cancel_reason === 'rider' ? `${firstName(row.rider_name)} cancelled the ride.` : 'UniGo cancelled this ride.');
        }
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user.id, resyncTick, rideTick]);

  // Open requests while on duty and free: one fetch, then broadcasts as students book
  useEffect(() => {
    if (!listening) return;
    let cancelled = false;
    const load = () =>
      supabase.rpc('open_ride_requests').then(({ data }) => {
        if (!cancelled && data) setRequests(data.map(withExpiry));
      });
    load();
    const timer = setInterval(load, REQUEST_REFRESH_MS);
    const channel = supabase
      .channel('captains', { config: { private: true } })
      .on('broadcast', { event: 'request' }, ({ payload }) =>
        setRequests((prev) => (prev.some((r) => r.id === payload.id) ? prev : [...prev, withExpiry(payload)]))
      )
      .on('broadcast', { event: 'taken' }, ({ payload }) => setRequests((prev) => prev.filter((r) => r.id !== payload.id)))
      .subscribe();
    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [listening, resyncTick]);

  // Share live location with the rider for the length of the ride
  const activeId = activeRide?.id;
  useEffect(() => {
    if (!activeId) return;
    if (!('geolocation' in navigator)) {
      queueMicrotask(() => setSharing('unavailable'));
      return;
    }
    const channel = supabase.channel(`ride:${activeId}`, { config: { private: true } });
    channel.subscribe();
    let last = null;
    const watch = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const spot = { lat: coords.latitude, lng: coords.longitude };
        const at = Date.now();
        const elapsed = last ? at - last.at : Infinity;
        if (elapsed < SEND_EVERY_MS) return;
        if (last && elapsed < KEEP_ALIVE_MS && metresBetween(last, spot) < MIN_MOVE_M) return;
        last = { ...spot, at };
        const payload = { ...spot, accuracy: Math.round(coords.accuracy), at };
        // Over the open websocket once joined; a single HTTP call until then. "Sharing" shows only
        // once a position has actually been delivered.
        const sent =
          channel.state === 'joined'
            ? channel.send({ type: 'broadcast', event: 'location', payload }).then((status) => status === 'ok')
            : channel.httpSend('location', payload).then(() => true);
        sent.then((ok) => setSharing(ok ? 'on' : 'starting')).catch(() => setSharing('starting'));
      },
      (err) => setSharing(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watch);
      supabase.removeChannel(channel);
    };
  }, [activeId]);

  // Keeps "3 min ago" fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date().getTime()), 30000);
    return () => clearInterval(timer);
  }, []);

  const call = async (key, request) => {
    setBusy(key);
    setError('');
    const { data, error: callError } = await request;
    setBusy('');
    if (callError) {
      setError(friendlyDbError(callError));
      return null;
    }
    return data;
  };

  const toggleDuty = async () => {
    setBusy('duty');
    setError('');
    const { error: dutyError } = await setCaptainOnDuty(!captain.on_duty);
    setBusy('');
    if (dutyError) setError(dutyError);
  };

  const accept = async (request) => {
    setNotice('');
    setError('');
    const ride = await call(`accept:${request.id}`, supabase.rpc('accept_ride', { ride: request.id }));
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
    if (ride) {
      setRides((prev) => upsert(prev, ride));
      setSharing('starting');
    }
  };

  const arrive = async () => {
    const ride = await call('arrive', supabase.rpc('mark_arrived', { ride: activeRide.id }));
    if (ride) setRides((prev) => upsert(prev, ride));
  };

  const startTrip = async (e) => {
    e.preventDefault();
    const result = await call('start', supabase.rpc('start_ride', { ride: activeRide.id, code }));
    if (!result) return;
    if (!result.ok) {
      setCode('');
      if (result.cancelled) {
        // Five wrong codes: the database cancelled the ride
        setError('');
        setNotice(result.message);
        setRides((prev) => prev.map((r) => (r.id === activeRide.id ? { ...r, status: 'cancelled', cancel_reason: 'code' } : r)));
        return;
      }
      setError(`${result.message} ${result.attempts_left === 1 ? '1 try' : `${result.attempts_left} tries`} left.`);
      return;
    }
    setCode('');
    setRides((prev) => upsert(prev, result.ride));
  };

  const complete = async () => {
    const ride = await call('complete', supabase.rpc('complete_ride', { ride: activeRide.id }));
    if (!ride) return;
    setRides((prev) => upsert(prev, ride));
    setNotice(`Ride complete. Collect ₹${ride.fare} from ${firstName(ride.rider_name)}.`);
    celebrate(60);
  };

  const release = async () => {
    const ride = await call('release', supabase.rpc('release_ride', { ride: activeRide.id }));
    if (!ride) return;
    setRides((prev) => prev.filter((r) => r.id !== ride.id));
    setReleasedIds((prev) => new Set(prev).add(ride.id));
  };

  const today = toDateKey(new Date(now));
  const doneToday = rides.filter((r) => r.status === 'completed' && r.completed_at && toDateKey(new Date(r.completed_at)) === today);
  const earnedToday = doneToday.reduce((sum, r) => sum + r.fare, 0);
  // Still open, not the captain's own booking, and not one they handed back
  const ownRideIds = new Set(ownRides.map((r) => r.id));
  const freshRequests = requests.filter((r) => now < r.expiresAt && !ownRideIds.has(r.id) && !releasedIds.has(r.id));

  // Where the captain is heading next, for the map and the Navigate button
  const target = activeRide ? (activeRide.status === 'in_transit' ? activeRide.drop_off : activeRide.pickup) : null;
  const targetPlace = target ? placeByName(target) : null;
  const stageIndex = activeRide ? STAGES.findIndex((s) => s.status === activeRide.status) : -1;
  const rider = activeRide ? firstName(activeRide.rider_name) : '';

  const errorBox = error && (
    <p role="alert" className="rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
      {error}
    </p>
  );

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="UniGo captain"
        title={<span className="block truncate">{`Hi, ${firstName(captain.display_name)}`}</span>}
        description="Accept a ride, pick your rider up with the code on their phone, and drop them off. Riders see you coming while you share your location."
        aside={<DutySwitch onDuty={captain.on_duty} busy={busy === 'duty'} onToggle={toggleDuty} />}
      />

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        <div className="lg:col-span-5 min-w-0 flex flex-col gap-6">
          {notice && (
            <p role="status" className="rounded-[18px] bg-paper px-5 py-4 text-[15px] text-ink font-medium animate-pop-in">
              {notice}
            </p>
          )}

          {activeRide ? (
            <section aria-labelledby="active-ride-title" className="surface p-6 sm:p-8 animate-pop-in">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">
                  Ride<span className="font-mono normal-case tracking-normal ml-2">{shortRef(activeRide.id)}</span>
                </p>
                <span className="badge badge-lime num">₹{activeRide.fare}</span>
              </div>

              <ol className="mt-5 grid grid-cols-3 gap-2" aria-label="Ride steps">
                {STAGES.map((stage, i) => (
                  <li
                    key={stage.status}
                    aria-current={i === stageIndex ? 'step' : undefined}
                    className={`h-1.5 rounded-full ${i <= stageIndex ? 'bg-forest' : 'bg-ash'}`}
                  >
                    <span className="sr-only">{stage.label}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-[13px] text-muted">
                Step {stageIndex + 1} of 3 · {STAGES[stageIndex]?.label}
              </p>

              <h2 id="active-ride-title" className="heading text-[26px] sm:text-[30px] mt-4">
                {activeRide.status === 'assigned' && `Pick up ${rider}`}
                {activeRide.status === 'arriving' && `Ask ${rider} for their code`}
                {activeRide.status === 'in_transit' && `Drop ${rider} at ${activeRide.drop_off}`}
              </h2>

              {/* Rider */}
              <div className="mt-5 flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-ash text-forest flex items-center justify-center shrink-0">
                  {activeRide.passengers === 2 ? <Users className="w-5 h-5" aria-hidden="true" /> : <User className="w-5 h-5" aria-hidden="true" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{activeRide.rider_name}</p>
                  <p className="text-[13px] text-muted">{activeRide.passengers === 2 ? 'Two riders' : 'One rider'}</p>
                </div>
                {activeRide.rider_phone && (
                  <a href={`tel:${activeRide.rider_phone}`} className="btn btn-sm btn-quiet shrink-0">
                    <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                    Call
                  </a>
                )}
              </div>

              {/* Route, with navigation to wherever comes next */}
              <div className="mt-5 divide-y divide-hairline border-y border-hairline">
                <Stop
                  label="Pickup"
                  name={activeRide.pickup}
                  isTarget={activeRide.status !== 'in_transit'}
                  mark="border-2 border-forest bg-canvas"
                />
                <Stop label="Drop" name={activeRide.drop_off} isTarget={activeRide.status === 'in_transit'} mark="bg-lime ring-2 ring-forest" />
              </div>

              <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
                {sharing === 'denied' || sharing === 'unavailable' ? (
                  <>
                    <LocateOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                    Location is off, so {rider} can't see you coming. Allow location for this site.
                  </>
                ) : (
                  <>
                    <LocateFixed className="w-4 h-4 shrink-0 text-forest" aria-hidden="true" />
                    {sharing === 'on' ? `Sharing your live location with ${rider}` : 'Finding your location…'}
                  </>
                )}
              </p>

              <div className="mt-6 space-y-3">
                {activeRide.status === 'assigned' && (
                  <button type="button" onClick={arrive} disabled={busy === 'arrive'} className="btn btn-primary btn-lg w-full">
                    {busy === 'arrive' ? 'One moment…' : `I'm at the pickup`}
                    {busy !== 'arrive' && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
                  </button>
                )}

                {activeRide.status !== 'in_transit' && (
                  <form onSubmit={startTrip} className={activeRide.status === 'assigned' ? 'pt-2' : ''}>
                    <label htmlFor="pickup-code" className="label">
                      {rider}'s pickup code
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="pickup-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        required
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="••••"
                        aria-describedby="pickup-code-hint"
                        className="field font-mono text-[22px] tracking-[0.4em] text-center flex-1 min-w-0"
                      />
                      <button
                        type="submit"
                        disabled={code.length !== 4 || busy === 'start'}
                        className={`btn shrink-0 ${activeRide.status === 'arriving' ? 'btn-primary' : 'btn-forest'}`}
                      >
                        {busy === 'start' ? 'Checking…' : 'Start ride'}
                      </button>
                    </div>
                    <p id="pickup-code-hint" className="mt-1.5 text-[13px] text-muted">
                      The four digits on {rider}'s phone. The ride starts only when they match.
                    </p>
                  </form>
                )}

                {activeRide.status === 'in_transit' && (
                  <button type="button" onClick={complete} disabled={busy === 'complete'} className="btn btn-primary btn-lg w-full">
                    {busy === 'complete' ? 'One moment…' : `Complete ride · collect ₹${activeRide.fare}`}
                    {busy !== 'complete' && <Check className="w-4 h-4" strokeWidth={3} aria-hidden="true" />}
                  </button>
                )}

                {errorBox}

                {activeRide.status !== 'in_transit' && (
                  <p className="text-center text-[13px] text-muted">
                    Can't make it?{' '}
                    <button type="button" onClick={release} disabled={busy === 'release'} className="btn btn-link !text-[13px] !inline">
                      Hand the ride back
                    </button>{' '}
                    so another captain can take it.
                  </p>
                )}
              </div>
            </section>
          ) : captain.on_duty ? (
            <section aria-labelledby="requests-title" className="surface p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <h2 id="requests-title" className="heading text-[26px] sm:text-[30px]">
                  Ride requests
                </h2>
                <span className="badge badge-lime num">
                  <span className="live-dot" aria-hidden="true" />
                  {freshRequests.length} waiting
                </span>
              </div>

              {errorBox && <div className="mt-4">{errorBox}</div>}

              {freshRequests.length ? (
                <ul className="mt-6 space-y-3">
                  {freshRequests.map((request) => {
                    const mins = Math.max(0, Math.round((REQUEST_OPEN_SECONDS * 1000 - (request.expiresAt - now)) / 60000));
                    return (
                      <li key={request.id} className="rounded-[18px] bg-canvas shadow-[var(--shadow-ring)] p-4 animate-pop-in">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-ink leading-snug">
                              {request.pickup} <span className="text-muted">→</span> {request.drop_off}
                            </p>
                            <p className="mt-1 text-[13px] text-muted">
                              {request.rider_first_name} · {request.passengers === 2 ? 'two riders' : 'one rider'}
                              {request.off_campus && ' · off campus'} · {mins < 1 ? 'just now' : `${mins} min ago`}
                            </p>
                          </div>
                          <span className="text-[18px] font-semibold text-ink num shrink-0">₹{request.fare}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => accept(request)}
                          disabled={Boolean(busy)}
                          className="btn btn-primary w-full mt-4"
                        >
                          {busy === `accept:${request.id}` ? 'Accepting…' : 'Accept ride'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-6 text-[15px] text-muted">
                  No requests right now. New ones appear here the moment a student books.
                </p>
              )}
            </section>
          ) : (
            <section className="surface p-6 sm:p-8">
              <span className="w-12 h-12 rounded-full bg-canvas text-forest flex items-center justify-center">
                <Bike className="w-6 h-6" aria-hidden="true" />
              </span>
              <h2 className="heading text-[26px] mt-5">You're off duty</h2>
              <p className="mt-2 text-[15px] text-body">Go on duty to start getting ride requests.</p>
              {errorBox && <div className="mt-4">{errorBox}</div>}
              <button type="button" onClick={toggleDuty} disabled={busy === 'duty'} className="btn btn-primary mt-6">
                Go on duty
                <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
              </button>
            </section>
          )}

          <p className="text-[14px] text-muted">
            Today: <span className="font-semibold text-ink num">{doneToday.length}</span>{' '}
            {doneToday.length === 1 ? 'ride' : 'rides'} · <span className="font-semibold text-ink num">₹{earnedToday}</span>
          </p>
        </div>

        {/* The campus, focused on where to go next */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 min-w-0">
          <div className="media-frame h-[420px] sm:h-[540px] lg:h-[640px]">
            <CampusMap3D highlightedId={targetPlace?.id ?? null} />
          </div>
          {target && !targetPlace && (
            <p className="mt-3 text-[13px] text-muted">
              {target} is off campus: use Navigate for directions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Students apply to drive here; an admin approves them
function CaptainApplication({ user, application, applyToDrive }) {
  const rejected = application?.status === 'rejected';
  const [editing, setEditing] = useState(false);
  const source = application || {};
  const [form, setForm] = useState({
    name: source.display_name || user.name || '',
    phone: source.phone || user.phone || '',
    vehicle: source.vehicle_model || '',
    plate: source.vehicle_plate || '',
    licence: source.dl_number || '',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    const { error: applyError } = await applyToDrive({
      name: form.name,
      phone_number: form.phone,
      vehicle: form.vehicle,
      plate: form.plate,
      licence: form.licence,
    });
    setSending(false);
    if (applyError) setError(applyError);
    else setEditing(false);
  };

  if (application?.status === 'pending' && !editing) {
    return (
      <div role="status" className="animate-pop-in">
        <span className="badge badge-ghost">Waiting for review</span>
        <h2 className="heading text-[24px] mt-4">Application sent</h2>
        <p className="mt-2 text-[15px] text-body leading-relaxed">
          Sent {formatWhen(application.updated_at)}. An admin checks your licence and vehicle details. This page
          switches to the captain console as soon as you are approved.
        </p>
        <dl className="mt-5 divide-y divide-hairline border-y border-hairline text-[14px]">
          {[
            ['Vehicle', `${application.vehicle_model} · ${application.vehicle_plate}`],
            ['Phone', application.phone],
            ['Driving licence', application.dl_number],
          ].map(([label, value]) => (
            <div key={label} className="py-2.5 flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="font-semibold text-ink text-right break-all">{value}</dd>
            </div>
          ))}
        </dl>
        <button type="button" onClick={() => setEditing(true)} className="btn btn-quiet mt-6">
          Edit details
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <h2 className="heading text-[24px]">{rejected ? 'Apply again' : 'Apply to drive'}</h2>
      {rejected ? (
        <p role="alert" className="mt-3 rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
          Your last application was not approved{application.review_note ? `: ${application.review_note}` : '.'} Fix the
          details and send it again.
        </p>
      ) : (
        <p className="mt-2 text-[15px] text-body">
          You need your own two-wheeler and a valid driving licence. Riders see your name and vehicle when you accept.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
        <div className="sm:col-span-2">
          <label htmlFor="cap-name" className="label">Name riders will see</label>
          <input id="cap-name" required autoComplete="name" value={form.name} onChange={set('name')} className="field" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cap-phone" className="label">Phone</label>
          <input id="cap-phone" type="tel" required autoComplete="tel" value={form.phone} onChange={set('phone')} placeholder="+91 9XXXX XXXXX" className="field num" />
        </div>
        <div>
          <label htmlFor="cap-vehicle" className="label">Vehicle</label>
          <input id="cap-vehicle" required value={form.vehicle} onChange={set('vehicle')} placeholder="Honda Shine" className="field" />
        </div>
        <div>
          <label htmlFor="cap-plate" className="label">Number plate</label>
          <input id="cap-plate" required value={form.plate} onChange={set('plate')} placeholder="PY 01 AB 1234" className="field uppercase" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cap-licence" className="label">Driving licence number</label>
          <input id="cap-licence" required value={form.licence} onChange={set('licence')} className="field uppercase" />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
          {error}
        </p>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={sending} className="btn btn-primary">
          {sending ? 'Sending…' : application ? 'Send again' : 'Send application'}
          {!sending && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(false)} className="btn btn-link">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// The captain console for approved captains; everyone else can apply here
export default function CaptainView() {
  const {
    authReady,
    user,
    captain,
    captainPaused,
    captainApplication,
    rolesLoaded,
    setCaptainOnDuty,
    applyToDrive,
    openAuth,
    rides,
    resyncTick,
  } = useApp();

  if (user && captain) {
    return <CaptainConsole user={user} captain={captain} setCaptainOnDuty={setCaptainOnDuty} ownRides={rides} resyncTick={resyncTick} />;
  }

  // Paused means a captain record exists but an admin switched it off; an approval that is still
  // being set up shows the application status until the record arrives
  const suspended = captainPaused;

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="UniGo captain"
        title="Drive with UniGo"
        description="Captains are Pondicherry University students who give rides on their own two-wheeler. Apply here, and once an admin approves you, go on duty and accept rides from other students."
      />
      <div className="mt-12 surface p-6 sm:p-8 max-w-xl">
        {!authReady || (user && !rolesLoaded) ? (
          <p className="text-[15px] text-muted">Checking your account…</p>
        ) : !user ? (
          <>
            <h2 className="heading text-[24px]">Sign in to apply</h2>
            <p className="mt-2 text-[15px] text-body">Use your Pondicherry University account. Captains sign in here too.</p>
            <button type="button" onClick={() => openAuth({ reason: 'Sign in with your university account to drive with UniGo.' })} className="btn btn-primary mt-6">
              Sign in
              <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
            </button>
          </>
        ) : captainApplication?.status === 'approved' && !suspended ? (
          <p role="status" className="text-[15px] text-body">
            You're approved. Setting up your captain account…
          </p>
        ) : suspended ? (
          <>
            <h2 className="heading text-[24px]">Your captain account is paused</h2>
            <p className="mt-2 text-[15px] text-body leading-relaxed">
              An admin has paused <span className="font-semibold text-ink break-all">{user.email}</span>. Speak to the
              UniGo team at the Gate 1 hub to get back on the road.
            </p>
          </>
        ) : (
          <CaptainApplication
            key={`${user.id}:${captainApplication?.updated_at ?? 'new'}`}
            user={user}
            application={captainApplication}
            applyToDrive={applyToDrive}
          />
        )}
      </div>
    </div>
  );
}
