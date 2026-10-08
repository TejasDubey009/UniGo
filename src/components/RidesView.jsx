import React, { useEffect, useState } from 'react';
import { useApp } from '../context/useApp';
import { useCountUp } from '../hooks/useMotion';
import { CAMPUS_LOCATIONS_LIST, OFF_CAMPUS_DESTINATIONS, OUTSIDE_LOCATIONS_LIST } from '../data/campusData';
import { celebrate } from '../lib/celebrate';
import { shortRef, formatWhen } from '../lib/format';
import { baseRideFare, rideFare, CAMPUS_FARE, FIRST_RIDE_DISCOUNT } from '../lib/pricing';
import { supabase } from '../lib/supabase';
import { placeByName, distanceMeters, formatDistance, minutesAway } from '../lib/geo';
import CampusMap3D from './LazyCampusMap3D';
import { PageHeader, Reveal, Segmented } from './ui';
import { Bike, User, Users, ShieldCheck, Clock, ArrowRight, BadgeCheck, IndianRupee, Phone, Check } from 'lucide-react';

// Ride statuses as stored in Supabase (set by staff as the ride moves along), in order
const RIDE_STEPS = ['requested', 'assigned', 'arriving', 'in_transit', 'completed'];
const STEP_LABELS = {
  requested: 'Requested',
  assigned: 'Accepted',
  arriving: 'At pickup',
  in_transit: 'On the way',
  completed: 'Arrived',
  cancelled: 'Cancelled',
};
const ACTIVE_STATUSES = new Set(['requested', 'assigned', 'arriving', 'in_transit']);
const CANCELLABLE = new Set(['requested', 'assigned', 'arriving']);
// Once a captain has the ride: they share their location, and the rider has a pickup code
const WITH_CAPTAIN = new Set(['assigned', 'arriving', 'in_transit']);
const DEFAULT_DROP = 'Silver Jubilee Campus (SJC)';
const DESTINATION_KM = Object.fromEntries(OFF_CAMPUS_DESTINATIONS.map((d) => [d.name, d.km]));
const FIRST_RIDE_PERCENT = Math.round(FIRST_RIDE_DISCOUNT * 100);
const TWO_RIDER_FARE = baseRideFare({ passengers: 2 });

const RIDER_OPTIONS = [
  { value: 1, name: 'Just me', icon: User, desc: 'One rider' },
  { value: 2, name: 'Two of us', icon: Users, desc: 'You and a friend on the same bike' },
];

const RIDE_FACTS = [
  { icon: Clock, title: 'About 3 min pickup', text: 'Captains on duty all over campus' },
  { icon: IndianRupee, title: `Flat ₹${CAMPUS_FARE} inside campus`, text: `₹${TWO_RIDER_FARE} for two · first ride ${FIRST_RIDE_PERCENT}% off` },
  { icon: ShieldCheck, title: 'SOS on every ride', text: 'Campus security, 24/7' },
];

function rideHeadline(ride) {
  const captain = ride.captain_name || 'Your captain';
  switch (ride.status) {
    case 'requested':
      return 'Waiting for a captain to accept';
    case 'assigned':
      return `${captain} is on the way to pick you up`;
    case 'arriving':
      return `${captain} is at ${ride.pickup}`;
    case 'in_transit':
      return 'On the way to your drop';
    default:
      return STEP_LABELS[ride.status] || ride.status;
  }
}

// Vertical route connector between the pickup ring and the drop dot
function RouteLine({ animated = false }) {
  return (
    <svg className="block w-[2px] h-full overflow-visible text-forest" aria-hidden="true">
      <line
        x1="1"
        y1="1"
        x2="1"
        y2="100%"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={animated ? undefined : '0 6'}
        className={animated ? 'route-draw' : undefined}
      />
    </svg>
  );
}

const PICKUP_MARK = 'w-3 h-3 rounded-full border-2 border-forest bg-canvas';
const DROP_MARK = 'w-3 h-3 rounded-full bg-lime ring-2 ring-forest';

export default function RidesView() {
  const { user, rides, bookingsLoaded, requestRide, cancelRide, requireAuth, saveProfileDetails, rideDropTarget, setRideDropTarget } =
    useApp();

  // Drop point may be prefilled from "Ride Here" on the campus map
  const initialDrop = rideDropTarget || DEFAULT_DROP;
  const [dropType, setDropType] = useState(OUTSIDE_LOCATIONS_LIST.includes(initialDrop) ? 'outside' : 'inside'); // 'inside' | 'outside'
  const [pickupLocation, setPickupLocation] = useState(CAMPUS_LOCATIONS_LIST[0]);
  const [dropLocation, setDropLocation] = useState(initialDrop);

  // Any building picked on the campus map can be a drop, even if it isn't in the quick list
  const baseDropOptions = dropType === 'inside' ? CAMPUS_LOCATIONS_LIST : OUTSIDE_LOCATIONS_LIST;
  const dropOptions = baseDropOptions.includes(dropLocation) ? baseDropOptions : [dropLocation, ...baseDropOptions];

  // Picks made on the campus map while this page is open ("Set as drop") update the drop too
  const [seenDropTarget, setSeenDropTarget] = useState(rideDropTarget);
  if (rideDropTarget !== seenDropTarget) {
    setSeenDropTarget(rideDropTarget);
    if (rideDropTarget) {
      setDropType(OUTSIDE_LOCATIONS_LIST.includes(rideDropTarget) ? 'outside' : 'inside');
      setDropLocation(rideDropTarget);
    }
  }
  const [passengers, setPassengers] = useState(1);
  const [phone, setPhone] = useState(user?.phone || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState('');

  // Fill the phone from the student's profile once it arrives (sign-in can happen after the page opens)
  const [filledFor, setFilledFor] = useState(user?.key);
  if (user && user.key !== filledFor) {
    setFilledFor(user.key);
    if (!phone) setPhone(user.phone);
  }

  // Fare: flat on campus, by distance off campus, and 20% off a student's first ride
  // (the database works out the same fare when the ride is booked)
  const isOutside = dropType === 'outside';
  const km = isOutside ? (DESTINATION_KM[dropLocation] ?? null) : null;
  // Known only once a signed-in student's past rides have loaded; a cancelled ride doesn't use it up
  const isFirstRide = Boolean(user) && bookingsLoaded && !rides.some((r) => r.status !== 'cancelled');
  const baseFare = baseRideFare({ km, passengers });
  const finalFare = rideFare({ km, passengers, firstRide: isFirstRide });
  const discount = baseFare - finalFare;

  // Fares tween when the riders or destination change
  const shownFare = useCountUp(finalFare);
  const shownBaseFare = useCountUp(baseFare);

  const isSamePlace = pickupLocation === dropLocation;
  // The newest unfinished ride is the one being tracked; finished ones are history
  const activeRide = rides.find((r) => ACTIVE_STATUSES.has(r.status)) || null;
  const pastRides = rides.filter((r) => r !== activeRide).slice(0, 5);
  const rideStepIndex = activeRide ? RIDE_STEPS.indexOf(activeRide.status) : -1;

  const handleBookRide = async (e) => {
    e.preventDefault();
    if (isSamePlace || activeRide || isSubmitting) return;
    if (!requireAuth('Sign in with your university account to book a ride.')) return;

    setIsSubmitting(true);
    setError('');
    const { error: bookingError } = await requestRide({
      rider_name: user.name || user.email.split('@')[0],
      rider_phone: phone.trim(),
      pickup: pickupLocation,
      drop_off: dropLocation,
      passengers,
    });
    setIsSubmitting(false);
    if (bookingError) {
      setError(bookingError);
      return;
    }
    setRideDropTarget(null);
    saveProfileDetails({ phone: phone.trim() });
    celebrate(70);
  };

  // The pickup code, readable only by this rider, made when a captain accepts
  const activeId = activeRide?.id;
  const needsCode = activeRide ? activeRide.status === 'assigned' || activeRide.status === 'arriving' : false;
  const [pickupCode, setPickupCode] = useState({ rideId: null, code: null });
  useEffect(() => {
    if (!activeId || !needsCode) return;
    let cancelled = false;
    supabase
      .from('ride_otps')
      .select('code')
      .eq('ride_id', activeId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setPickupCode({ rideId: activeId, code: data.code });
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, needsCode]);
  const code = needsCode && pickupCode.rideId === activeId ? pickupCode.code : null;

  // The captain's live location, straight from their phone over a private realtime channel
  const withCaptain = activeRide ? WITH_CAPTAIN.has(activeRide.status) : false;
  const [captainSpot, setCaptainSpot] = useState(null);
  useEffect(() => {
    if (!activeId || !withCaptain) return;
    const channel = supabase
      .channel(`ride:${activeId}`, { config: { private: true } })
      .on('broadcast', { event: 'location' }, ({ payload }) => setCaptainSpot({ rideId: activeId, ...payload }))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeId, withCaptain]);
  // Distance to wherever the captain is heading: the pickup, then the drop
  const heading = activeRide ? placeByName(activeRide.status === 'in_transit' ? activeRide.drop_off : activeRide.pickup) : null;
  const spot = withCaptain && captainSpot?.rideId === activeId ? captainSpot : null;
  const captainDistance = spot && heading ? distanceMeters(spot, heading) : null;

  const handleCancel = async () => {
    setIsCancelling(true);
    setError('');
    const { error: cancelError } = await cancelRide(activeRide.id);
    setIsCancelling(false);
    if (cancelError) setError(cancelError);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="Campus rides"
        title="Campus rides in 3 minutes"
        description={`Book a verified student captain for a flat ₹${CAMPUS_FARE} anywhere inside the 800-acre campus (₹${TWO_RIDER_FARE} for two), or a drop to Auroville, White Town and Rock Beach. Your first ride is ${FIRST_RIDE_PERCENT}% off.`}
      />

      <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
        {/* Booking column (Uber-style panel beside the map) */}
        <div className="lg:col-span-5 min-w-0 flex flex-col gap-6">
          <section aria-labelledby="ride-form-title" className="surface p-6 sm:p-8">
            <h2 id="ride-form-title" className="heading text-[26px] sm:text-[30px]">
              Request a ride
            </h2>
            <p className="text-[15px] text-body mt-1.5">Pickup is inside campus. Drop can be on or off campus.</p>

            <form onSubmit={handleBookRide} className="mt-7">
              {/* Route: pickup ring, dotted connector, drop dot */}
              <div className="grid grid-cols-[14px_minmax(0,1fr)] gap-x-4">
                <span aria-hidden="true" />
                <label htmlFor="ride-pickup" className="label">
                  Pickup
                </label>

                <span aria-hidden="true" className="relative flex items-center justify-center">
                  <span className={PICKUP_MARK} />
                  <span className="absolute left-1/2 -translate-x-1/2 top-[calc(50%_+_9px)] bottom-0">
                    <RouteLine />
                  </span>
                </span>
                <select
                  id="ride-pickup"
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  className="field"
                >
                  {CAMPUS_LOCATIONS_LIST.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>

                <span aria-hidden="true" className="relative">
                  <span className="absolute left-1/2 -translate-x-1/2 inset-y-0">
                    <RouteLine />
                  </span>
                </span>
                <div className="pt-5 pb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                  <label htmlFor="ride-drop" className="label !mb-0">
                    Drop
                  </label>
                  <Segmented
                    size="sm"
                    ariaLabel="Drop area"
                    value={dropType}
                    onChange={(next) => {
                      setDropType(next);
                      setDropLocation(next === 'inside' ? DEFAULT_DROP : OUTSIDE_LOCATIONS_LIST[0]);
                    }}
                    options={[
                      { value: 'inside', label: 'On campus' },
                      { value: 'outside', label: 'Off campus' },
                    ]}
                  />
                </div>

                <span aria-hidden="true" className="relative flex items-center justify-center">
                  <span className="absolute left-1/2 -translate-x-1/2 top-0 bottom-[calc(50%_+_10px)]">
                    <RouteLine />
                  </span>
                  <span className={DROP_MARK} />
                </span>
                <select
                  id="ride-drop"
                  value={dropLocation}
                  onChange={(e) => setDropLocation(e.target.value)}
                  className="field"
                >
                  {dropOptions.map((loc) => (
                    <option key={loc} value={loc}>
                      {DESTINATION_KM[loc] ? `${loc} (${DESTINATION_KM[loc]} km)` : loc}
                    </option>
                  ))}
                </select>

                {isSamePlace && (
                  <p className="field-error col-start-2">Pickup and drop are the same place. Choose a different drop.</p>
                )}
              </div>

              <div className="mt-6">
                <label htmlFor="ride-phone" className="label">
                  Phone for your captain
                </label>
                <input
                  id="ride-phone"
                  type="tel"
                  required
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9XXXX XXXXX"
                  className="field num"
                />
              </div>

              {/* Riders */}
              <div className="mt-7">
                <p id="ride-riders-label" className="label !mb-2.5">
                  Riders
                </p>
                <div role="group" aria-labelledby="ride-riders-label" className="grid grid-cols-2 gap-3">
                  {RIDER_OPTIONS.map((v) => {
                    const Icon = v.icon;
                    const isSelected = passengers === v.value;
                    return (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => setPassengers(v.value)}
                        aria-pressed={isSelected}
                        className="option p-4 flex flex-col gap-3 min-w-0"
                      >
                        <span className="flex items-center justify-between gap-2 w-full">
                          <span
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
                              isSelected ? 'bg-lime text-forest' : 'bg-ash text-ink'
                            }`}
                          >
                            <Icon className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <span className="text-[15px] font-semibold text-ink num">
                            ₹{rideFare({ km, passengers: v.value, firstRide: isFirstRide })}
                          </span>
                        </span>
                        <span>
                          <span className="block text-[15px] font-semibold text-ink">{v.name}</span>
                          <span className="block text-[13px] text-muted leading-snug mt-0.5">{v.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* First-ride discount, when it applies (or a heads-up before sign-in) */}
              {(isFirstRide || !user) && (
                <div className="mt-7 flex items-center justify-between gap-4 py-3.5 border-y border-hairline text-[15px]">
                  <span className="flex items-center gap-2 text-body min-w-0">
                    <BadgeCheck className="w-4 h-4 text-forest shrink-0" aria-hidden="true" />
                    {isFirstRide ? `First ride: ${FIRST_RIDE_PERCENT}% off` : `New to UniGo? Your first ride is ${FIRST_RIDE_PERCENT}% off`}
                  </span>
                  {isFirstRide && <span className="font-semibold text-forest num whitespace-nowrap">−₹{discount}</span>}
                </div>
              )}

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[13px] text-muted">Fare</p>
                  <p className="flex items-baseline gap-2 mt-1">
                    <span className="font-display font-black text-[40px] leading-none text-ink num [font-stretch:112%]">
                      ₹{shownFare}
                    </span>
                    {discount > 0 && <span className="text-[15px] text-muted line-through num">₹{shownBaseFare}</span>}
                  </p>
                </div>
                <p className="text-[13px] text-muted text-right">
                  {isOutside ? `Off-campus drop${km ? ` · ${km} km` : ''}` : 'Inside campus'}
                  {passengers === 2 && <span className="block">Two riders</span>}
                </p>
              </div>

              {error && (
                <p role="alert" className="mt-5 rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isSamePlace || Boolean(activeRide) || isSubmitting}
                aria-busy={isSubmitting}
                className="btn btn-primary btn-lg w-full mt-6"
              >
                {activeRide ? 'You have a ride on the way' : isSubmitting ? 'Sending your request…' : 'Request a captain'}
                {!activeRide && !isSubmitting && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
              </button>
            </form>
          </section>

          {/* Live ride tracker: follows the ride's status in Supabase as it changes */}
          {activeRide && (
            <section aria-label="Your ride" className="surface-line p-6 sm:p-8 animate-pop-in">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">
                  Your ride<span className="font-mono normal-case tracking-normal ml-2">{shortRef(activeRide.id)}</span>
                </p>
                <span className="badge badge-lime">
                  <span className="live-dot" aria-hidden="true" />
                  Live
                </span>
              </div>

              <div aria-live="polite">
                <h3 key={activeRide.status} className="heading text-[24px] sm:text-[28px] mt-3 animate-pop-in">
                  {rideHeadline(activeRide)}
                </h3>
              </div>

              {/* Route */}
              <div className="mt-5 grid grid-cols-[12px_minmax(0,1fr)] gap-x-3 text-[15px]">
                <span aria-hidden="true" className="relative flex justify-center">
                  <span className={`relative mt-[3px] ${PICKUP_MARK}`} />
                  <span className="absolute left-1/2 -translate-x-1/2 top-[19px] bottom-[2px]">
                    <RouteLine animated={activeRide.status === 'in_transit'} />
                  </span>
                </span>
                <div className="pb-4 min-w-0">
                  <p className="text-[12px] text-muted leading-[18px]">Pickup</p>
                  <p className="font-semibold text-ink leading-snug">{activeRide.pickup}</p>
                </div>
                <span aria-hidden="true" className="flex justify-center">
                  <span className={`mt-[3px] ${DROP_MARK}`} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] text-muted leading-[18px]">Drop</p>
                  <p className="font-semibold text-ink leading-snug">{activeRide.drop_off}</p>
                </div>
              </div>

              {/* Captain and OTP */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-11 h-11 rounded-full bg-ash flex items-center justify-center shrink-0">
                    <Bike className="w-5 h-5 text-forest" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    {activeRide.captain_name ? (
                      <>
                        <p className="font-semibold text-ink truncate">{activeRide.captain_name}</p>
                        {activeRide.captain_vehicle && (
                          <p className="text-[13px] text-muted truncate">{activeRide.captain_vehicle}</p>
                        )}
                        {captainDistance != null && (
                          <p key={Math.round(captainDistance / 50)} className="text-[13px] font-semibold text-forest animate-pop-in">
                            {captainDistance < 60
                              ? activeRide.status === 'in_transit'
                                ? 'Almost there'
                                : 'Right at the pickup'
                              : `${formatDistance(captainDistance)} away · about ${minutesAway(captainDistance)} min`}
                          </p>
                        )}
                        {activeRide.captain_phone && (
                          <a href={`tel:${activeRide.captain_phone}`} className="btn btn-link !text-[13px] !gap-1">
                            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                            Call captain
                          </a>
                        )}
                      </>
                    ) : (
                      <p className="text-[15px] text-muted">No captain yet. You'll see their name here.</p>
                    )}
                  </div>
                </div>

                {activeRide.status !== 'in_transit' && (
                  <div className="rounded-[18px] bg-paper px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink">Pickup code</p>
                      <p className="text-[12px] text-muted leading-snug">
                        {code ? 'Tell your captain at pickup' : 'Appears when a captain accepts'}
                      </p>
                    </div>
                    <span
                      key={code || 'pending'}
                      className={`font-mono text-[28px] font-bold tracking-[0.18em] leading-none num animate-pop-in ${
                        code ? 'text-ink' : 'text-subtle'
                      }`}
                    >
                      {code || '••••'}
                    </span>
                  </div>
                )}
              </div>

              {/* Progress */}
              <ol className="mt-7 grid grid-cols-5">
                {RIDE_STEPS.map((st, i) => {
                  const isCurrent = i === rideStepIndex;
                  const isDone = i < rideStepIndex;

                  return (
                    <li
                      key={st}
                      aria-current={isCurrent ? 'step' : undefined}
                      className="relative flex flex-col items-center text-center"
                    >
                      {i < RIDE_STEPS.length - 1 && (
                        <span
                          aria-hidden="true"
                          className={`absolute top-[13px] left-1/2 w-full h-0.5 transition-colors duration-300 ${
                            isDone ? 'bg-forest' : 'bg-ash'
                          }`}
                        />
                      )}
                      <span
                        className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold num transition-colors duration-200 ${
                          isDone ? 'bg-forest text-white' : isCurrent ? 'bg-lime text-forest ring-2 ring-forest' : 'bg-ash text-muted'
                        }`}
                      >
                        {isDone ? (
                          <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
                        ) : isCurrent ? (
                          <span className="live-dot" aria-hidden="true" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      <span
                        className={`mt-2 px-1 text-[12px] leading-tight ${
                          isDone || isCurrent ? 'font-semibold text-ink' : 'text-muted'
                        }`}
                      >
                        {STEP_LABELS[st]}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {CANCELLABLE.has(activeRide.status) && (
                <div className="mt-7 pt-5 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[13px] text-muted">Plans changed? Cancel before your captain picks you up.</p>
                  <button type="button" onClick={handleCancel} disabled={isCancelling} className="btn btn-sm btn-danger">
                    {isCancelling ? 'Cancelling…' : 'Cancel ride'}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Recent rides */}
          {pastRides.length > 0 && (
            <section aria-labelledby="past-rides-title">
              <h2 id="past-rides-title" className="eyebrow mb-3">
                Recent rides
              </h2>
              <ul className="divide-y divide-hairline border-y border-hairline">
                {pastRides.map((ride) => (
                  <li key={ride.id} className="py-3.5 flex items-start justify-between gap-4 text-[14px]">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">
                        {ride.pickup} → {ride.drop_off}
                      </p>
                      <p className="text-muted">
                        {formatWhen(ride.created_at)} · {STEP_LABELS[ride.status]}
                        {ride.passengers === 2 && ' · two riders'}
                      </p>
                    </div>
                    <span className="font-semibold text-ink num shrink-0">₹{ride.fare}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Map column */}
        <div className="lg:col-span-7 lg:sticky lg:top-24 min-w-0">
          <div className="media-frame h-[420px] sm:h-[540px] lg:h-[640px]">
            <CampusMap3D />
          </div>
        </div>
      </div>

      {/* Facts */}
      <Reveal className="mt-16 sm:mt-20 grid grid-cols-1 sm:grid-cols-3 sm:divide-x divide-hairline border-t border-hairline">
        {RIDE_FACTS.map((fact) => {
          const Icon = fact.icon;
          return (
            <div
              key={fact.title}
              className="flex items-start gap-3 py-6 sm:py-8 sm:px-8 first:sm:pl-0 last:sm:pr-0 border-b border-hairline sm:border-b-0"
            >
              <Icon className="w-5 h-5 text-forest shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-[16px] font-semibold text-ink">{fact.title}</p>
                <p className="text-[14px] text-muted mt-0.5">{fact.text}</p>
              </div>
            </div>
          );
        })}
      </Reveal>
    </div>
  );
}
