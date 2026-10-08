import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { useCountUp } from '../hooks/useMotion';
import { CAMPUS_LOCATIONS_LIST, OUTSIDE_LOCATIONS_LIST } from '../data/campusData';
import CampusMap3D from './LazyCampusMap3D';
import { PageHeader, Reveal, Segmented } from './ui';
import {
  Bike,
  Zap,
  ShieldCheck,
  Clock,
  ArrowRight,
  BadgeCheck,
  IndianRupee,
  Check,
  Star,
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Status values come from the ride context; labels are what students read
const RIDE_STEPS = ['Searching Captain', 'Captain Arriving', 'In Transit', 'Completed'];
const STEP_LABELS = {
  'Searching Captain': 'Finding captain',
  'Captain Arriving': 'Captain arriving',
  'In Transit': 'On the way',
  Completed: 'Arrived',
};
const STUDENT_DISCOUNT = 0.2;
const BASE_FARES = {
  'UniGo Solo Bike': { inside: 20, outside: 85 },
  'UniGo EV Glide': { inside: 25, outside: 95 },
};
const DEFAULT_DROP = 'Silver Jubilee Campus (SJC)';
const CAPTAINS_ON_DUTY = 8;

const VEHICLES = [
  { id: 'UniGo Solo Bike', name: 'Solo bike', icon: Bike, desc: 'Quickest for one rider with a backpack' },
  { id: 'UniGo EV Glide', name: 'EV Glide', icon: Zap, desc: 'Quiet electric ride, more floor space' },
];

const RIDE_FACTS = [
  { icon: Clock, title: 'About 3 min pickup', text: 'Captains on duty all over campus' },
  { icon: IndianRupee, title: 'Flat ₹20 inside campus', text: 'Any hostel to any department' },
  { icon: ShieldCheck, title: 'SOS on every ride', text: 'Campus security, 24/7' },
];

function rideHeadline(ride) {
  switch (ride.status) {
    case 'Searching Captain':
      return 'Finding a captain near you';
    case 'Captain Arriving':
      return `${ride.captainName || 'Your captain'} is on the way`;
    case 'In Transit':
      return 'On the way to your drop';
    case 'Completed':
      return 'You have arrived';
    default:
      return ride.status;
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
  const { user, activeRide, startRide, updateActiveRideStatus, dismissActiveRide, rideDropTarget, setRideDropTarget } = useApp();

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
  const [rideType, setRideType] = useState('UniGo Solo Bike'); // 'UniGo Solo Bike' | 'UniGo EV Glide'

  // Fare estimation logic
  const isOutside = dropType === 'outside';
  const fareZone = isOutside ? 'outside' : 'inside';
  const baseFare = BASE_FARES[rideType][fareZone];
  const studentDiscount = Math.round(baseFare * STUDENT_DISCOUNT);
  const finalFare = baseFare - studentDiscount;

  // Fares tween when the vehicle or destination changes
  const shownFare = useCountUp(finalFare);
  const shownBaseFare = useCountUp(baseFare);

  const isSamePlace = pickupLocation === dropLocation;
  const isRideInProgress = Boolean(activeRide) && activeRide.status !== 'Completed';
  const rideStepIndex = activeRide ? RIDE_STEPS.indexOf(activeRide.status) : -1;

  const handleBookRide = (e) => {
    e.preventDefault();
    if (isSamePlace || isRideInProgress) return;
    startRide({
      passenger: user.name,
      passengerPhone: user.phone,
      userEmail: user.email,
      pickup: pickupLocation,
      drop: dropLocation,
      vehicle: rideType,
      fare: finalFare,
    });
    setRideDropTarget(null);

    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.6 },
      colors: ['#9fe870', '#163300', '#ffd300'],
    });
  };

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="Campus rides"
        title="Campus rides in 3 minutes"
        description="Book a verified student captain for a flat ₹20 anywhere inside the 800-acre campus, or a subsidised drop to Auroville, White Town and Rock Beach."
        aside={
          <span className="badge badge-lime !h-9 !px-4 !text-[14px]">
            <span className="live-dot" aria-hidden="true" />
            {CAPTAINS_ON_DUTY} captains on duty
          </span>
        }
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
                      {loc}
                    </option>
                  ))}
                </select>

                {isSamePlace && (
                  <p className="field-error col-start-2">Pickup and drop are the same place. Choose a different drop.</p>
                )}
              </div>

              {/* Vehicle */}
              <div className="mt-7">
                <p id="ride-vehicle-label" className="label !mb-2.5">
                  Vehicle
                </p>
                <div role="group" aria-labelledby="ride-vehicle-label" className="grid grid-cols-2 gap-3">
                  {VEHICLES.map((v) => {
                    const Icon = v.icon;
                    const isSelected = rideType === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setRideType(v.id)}
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
                          <span className="text-[15px] font-semibold text-ink num">₹{BASE_FARES[v.id][fareZone]}</span>
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

              {/* Discount line and fare */}
              <div className="mt-7 flex items-center justify-between gap-4 py-3.5 border-y border-hairline text-[15px]">
                <span className="flex items-center gap-2 text-body min-w-0">
                  <BadgeCheck className="w-4 h-4 text-forest shrink-0" aria-hidden="true" />
                  PU student discount (20%)
                </span>
                <span className="font-semibold text-forest num whitespace-nowrap">−₹{studentDiscount}</span>
              </div>

              <div className="mt-5 flex items-end justify-between gap-4">
                <div>
                  <p className="text-[13px] text-muted">Estimated fare</p>
                  <p className="flex items-baseline gap-2 mt-1">
                    <span className="font-display font-black text-[40px] leading-none text-ink num [font-stretch:112%]">
                      ₹{shownFare}
                    </span>
                    <span className="text-[15px] text-muted line-through num">₹{shownBaseFare}</span>
                  </p>
                </div>
                <p className="text-[13px] text-muted text-right">{isOutside ? 'Off-campus drop' : 'Inside campus'}</p>
              </div>

              <button
                type="submit"
                disabled={isSamePlace || isRideInProgress}
                className="btn btn-primary btn-lg w-full mt-6"
              >
                {isRideInProgress ? 'Ride in progress' : 'Book captain'}
                <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
              </button>
            </form>
          </section>

          {/* Live ride tracker */}
          {activeRide && (
            <section aria-label="Your ride" className="surface-line p-6 sm:p-8 animate-pop-in">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">
                  Your ride{activeRide.id && <span className="font-mono normal-case tracking-normal ml-2">{activeRide.id}</span>}
                </p>
                {isRideInProgress ? (
                  <span className="badge badge-lime">
                    <span className="live-dot" aria-hidden="true" />
                    Live
                  </span>
                ) : (
                  <span className="badge badge-forest">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
                    Done
                  </span>
                )}
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
                    <RouteLine animated={activeRide.status === 'In Transit'} />
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
                  <p className="font-semibold text-ink leading-snug">{activeRide.drop}</p>
                </div>
              </div>

              {/* Captain and OTP */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-11 h-11 rounded-full bg-ash flex items-center justify-center shrink-0">
                    <Bike className="w-5 h-5 text-forest" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    {activeRide.captainName ? (
                      <p className="flex items-center gap-1.5 font-semibold text-ink">
                        <span className="truncate">{activeRide.captainName}</span>
                        {activeRide.rating && (
                          <span className="flex items-center gap-0.5 text-[13px] font-semibold text-forest num shrink-0">
                            <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                            {activeRide.rating}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-[15px] text-muted">Locating the nearest captain…</p>
                    )}
                    {activeRide.captainBike && (
                      <p className="text-[13px] text-muted truncate">{activeRide.captainBike}</p>
                    )}
                  </div>
                </div>

                <div className="rounded-[18px] bg-paper px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-ink">Ride OTP</p>
                    <p className="text-[12px] text-muted leading-snug">Share at pickup</p>
                  </div>
                  <span
                    key={activeRide.otp || 'pending'}
                    className={`font-mono text-[28px] font-bold tracking-[0.18em] leading-none num animate-pop-in ${
                      activeRide.otp ? 'text-ink' : 'text-subtle'
                    }`}
                  >
                    {activeRide.otp || '••••'}
                  </span>
                </div>
              </div>

              {/* Progress */}
              <ol className="mt-7 grid grid-cols-4">
                {RIDE_STEPS.map((st, i) => {
                  const isComplete = activeRide.status === 'Completed';
                  const isCurrent = i === rideStepIndex && !isComplete;
                  const isDone = i < rideStepIndex || isComplete;

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
                            i < rideStepIndex || isComplete ? 'bg-forest' : 'bg-ash'
                          }`}
                        />
                      )}
                      <span
                        className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold num transition-colors duration-200 ${
                          isDone
                            ? 'bg-forest text-white'
                            : isCurrent
                            ? 'bg-lime text-forest ring-2 ring-forest'
                            : 'bg-ash text-muted'
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

              {/* Captain simulator for demo testing */}
              <div className="mt-7 pt-5 border-t border-hairline flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted">Demo: move the ride along</p>
                <div className="flex flex-wrap items-center gap-2">
                  {isRideInProgress ? (
                    <>
                      <button
                        type="button"
                        onClick={() => updateActiveRideStatus('In Transit')}
                        disabled={activeRide.status !== 'Captain Arriving'}
                        className={`btn btn-sm ${activeRide.status === 'Captain Arriving' ? 'btn-forest' : 'btn-quiet'}`}
                      >
                        Start ride
                      </button>
                      <button
                        type="button"
                        onClick={() => updateActiveRideStatus('Completed')}
                        disabled={activeRide.status !== 'In Transit'}
                        className={`btn btn-sm ${activeRide.status === 'In Transit' ? 'btn-forest' : 'btn-quiet'}`}
                      >
                        Complete ride
                      </button>
                      <button type="button" onClick={dismissActiveRide} className="btn btn-sm btn-danger">
                        Cancel ride
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={dismissActiveRide} className="btn btn-sm btn-quiet">
                      Close tracker
                    </button>
                  )}
                </div>
              </div>
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
