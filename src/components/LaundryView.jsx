import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { useCountUp } from '../hooks/useMotion';
import { GIRLS_HOSTELS, BOYS_HOSTELS, OTHER_LOCATIONS, UNIGO_HELPLINE } from '../data/campusData';
import { PageHeader, Reveal, Segmented } from './ui';
import CampusMap3D from './LazyCampusMap3D';
import GoogleCampus3DMap from './GoogleCampus3DMap';
import confetti from 'canvas-confetti';
import {
  ArrowRight,
  Map as MapIcon,
  Check,
  Clock,
  MessageSquare,
  PackageCheck,
  Satellite,
  Shirt,
  ShieldCheck,
} from 'lucide-react';

const HOSTELS_BY_CATEGORY = { 'Girls Hostel': GIRLS_HOSTELS, 'Boys Hostel': BOYS_HOSTELS };
const CATEGORY_BY_NODE = { 'girls-hostel': 'Girls Hostel', 'boys-hostel': 'Boys Hostel' };
const WASH_RATES = { 'Wash Only': 49, 'Wash + Iron': 79 };

// Values are what gets stored on the order; labels are what students read
const SERVICES = [
  { value: 'Wash Only', label: 'Wash only', desc: 'Eco detergent, tumble dry and a neat fold.' },
  { value: 'Wash + Iron', label: 'Wash + iron', desc: 'Deep wash, steam pressed and packed on hangers.', tag: 'Most booked' },
];
const SERVICE_LABEL = Object.fromEntries(SERVICES.map((s) => [s.value, s.label]));

const PICKUP_SLOTS = [
  { value: 'Today Evening (05:00 PM - 07:30 PM)', label: 'Today evening, 5:00–7:30 PM' },
  { value: 'Tonight Night-Owl (08:30 PM - 10:30 PM)', label: 'Tonight, 8:30–10:30 PM' },
  { value: 'Tomorrow Morning (07:30 AM - 09:30 AM)', label: 'Tomorrow morning, 7:30–9:30 AM' },
  { value: 'Tomorrow Noon (12:30 PM - 02:30 PM)', label: 'Tomorrow noon, 12:30–2:30 PM' },
];
const slotLabel = (value) => PICKUP_SLOTS.find((s) => s.value === value)?.label ?? value;

const CATEGORY_OPTIONS = [
  {
    value: 'Girls Hostel',
    label: (
      <>
        Girls<span className="hidden sm:inline">&nbsp;hostel</span>
      </>
    ),
  },
  {
    value: 'Boys Hostel',
    label: (
      <>
        Boys<span className="hidden sm:inline">&nbsp;hostel</span>
      </>
    ),
  },
  { value: 'Others', label: 'Other' },
];

const MAP_OPTIONS = [
  { value: 'webgl', label: 'Map', icon: MapIcon },
  { value: 'google3d', label: 'Satellite', icon: Satellite },
];

const GUARANTEES = [
  { icon: ShieldCheck, title: 'Barcoded bags', desc: 'Every bag is tagged at pickup' },
  { icon: Shirt, title: 'Steam ironed', desc: 'Packed on hangers' },
  { icon: Clock, title: 'Back in 24 hours', desc: 'Returned to your hostel' },
];

// Order statuses as set from the admin console, in the order they happen
const ORDER_STEPS = [
  { status: 'Pickup Scheduled', step: 'Booked', badge: 'Pickup scheduled' },
  { status: 'Clothes Collected', step: 'Collected', badge: 'Collected' },
  { status: 'Washing & Steam Ironing', step: 'Washing', badge: 'Washing' },
  { status: 'Ready for Delivery', step: 'Ready', badge: 'Ready for delivery' },
  { status: 'Delivered', step: 'Delivered', badge: 'Delivered' },
];

// Index of the step in progress; a delivered order has every step done
const currentStepIndex = (status) => {
  if (status === 'Delivered') return ORDER_STEPS.length;
  return Math.max(0, ORDER_STEPS.findIndex((s) => s.status === status));
};

// Strip the "Hostel" suffix so quick-pick chips stay short
const shortHostelName = (name) => name.replace(/ Hostel$/, '');

// Maps a campus location (hostel or landmark) to the form's pickup fields
const pickupFromLocation = (loc) => {
  const category = CATEGORY_BY_NODE[loc.category];
  return category
    ? { mainCategory: category, hostelName: loc.name, otherLocation: '' }
    : { mainCategory: 'Others', hostelName: '', otherLocation: loc.name };
};

const pickupFromUser = (user) => {
  const hostels = HOSTELS_BY_CATEGORY[user?.hostelCategory];
  if (hostels) {
    // Older profiles may store a short name ("Bharathiar Hostel"), so fall back to a partial match
    const shortName = (user.hostelName || '').replace(/ Hostel$/, '');
    const hostel =
      hostels.find((h) => h.name === user.hostelName) ||
      (shortName && hostels.find((h) => h.name.includes(shortName))) ||
      hostels[0];
    return { mainCategory: user.hostelCategory, hostelName: hostel.name, otherLocation: '' };
  }
  return { mainCategory: 'Others', hostelName: '', otherLocation: user?.hostelName || OTHER_LOCATIONS[0] };
};

function OrderStatusBadge({ status }) {
  const step = ORDER_STEPS.find((s) => s.status === status);
  const text = step?.badge ?? status;
  if (status === 'Delivered') {
    return (
      <span className="badge badge-lime">
        <Check className="w-3.5 h-3.5" strokeWidth={3} aria-hidden="true" />
        {text}
      </span>
    );
  }
  if (status === 'Pickup Scheduled') return <span className="badge badge-ghost">{text}</span>;
  return (
    <span className="badge badge-forest">
      {/* The dot's forest core would vanish on a forest badge, so it goes lime here */}
      <span className="live-dot !bg-lime" aria-hidden="true" />
      {text}
    </span>
  );
}

function OrderTimeline({ status }) {
  const current = currentStepIndex(status);
  return (
    <ol className="mt-6 grid grid-cols-5" aria-label="Order progress">
      {ORDER_STEPS.map((s, idx) => {
        const state = idx < current ? 'done' : idx === current ? 'current' : 'upcoming';
        return (
          <li key={s.status} aria-current={state === 'current' ? 'step' : undefined} className="min-w-0">
            <div className="flex items-center h-4">
              <span
                aria-hidden="true"
                className={`w-3 h-3 rounded-full shrink-0 transition-colors duration-200 ${
                  state === 'done' ? 'bg-forest' : state === 'current' ? 'bg-lime ring-2 ring-forest' : 'bg-ash'
                }`}
              />
              {idx < ORDER_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-0.5 flex-1 mx-1 rounded-full transition-colors duration-200 ${
                    idx < current ? 'bg-forest' : 'bg-ash'
                  }`}
                />
              )}
            </div>
            <span
              className={`mt-2 block text-[11px] sm:text-[12px] leading-tight truncate ${
                state === 'current' ? 'font-semibold text-ink' : state === 'done' ? 'text-body' : 'text-subtle'
              }`}
            >
              {s.step}
              {state === 'done' && <span className="sr-only"> (done)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function LaundryView() {
  const { user, laundryOrders, addLaundryOrder, selected3DTarget, setSelected3DTarget } = useApp();
  const [laundryMapMode, setLaundryMapMode] = useState('webgl'); // 'webgl' | 'google3d'

  // Pickup location: starts from a location picked on the campus map ("Book Laundry"), else the student's hostel
  const [pickup, setPickup] = useState(() =>
    selected3DTarget ? pickupFromLocation(selected3DTarget) : pickupFromUser(user)
  );
  const { mainCategory, hostelName, otherLocation } = pickup;

  // Follow later map picks too (e.g. "Book Laundry" pressed on the map embedded in this page)
  const [appliedTarget, setAppliedTarget] = useState(selected3DTarget);
  if (selected3DTarget !== appliedTarget) {
    setAppliedTarget(selected3DTarget);
    if (selected3DTarget) setPickup(pickupFromLocation(selected3DTarget));
  }

  // Form states
  const [studentName, setStudentName] = useState(user?.name || '');
  const [roomNumber, setRoomNumber] = useState(user?.room || '');
  const [whatsappNumber, setWhatsappNumber] = useState(user?.phone || '');
  const [washType, setWashType] = useState('Wash + Iron'); // 'Wash Only' | 'Wash + Iron'
  const [weightKg, setWeightKg] = useState(4.5);
  const [pickupSlot, setPickupSlot] = useState('Today Evening (05:00 PM - 07:30 PM)');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedOrder, setSubmittedOrder] = useState(null);

  // Selecting a hostel also flies both 3D maps to it
  const handleSelectHostel = (hostel) => {
    setPickup(pickupFromLocation(hostel));
    setSelected3DTarget(hostel);
  };

  const handleMapLocationSelect = (loc) => {
    if (CATEGORY_BY_NODE[loc.category]) handleSelectHostel(loc);
  };

  const handleCategoryChange = (cat) => {
    if (cat === mainCategory) return;
    const hostels = HOSTELS_BY_CATEGORY[cat];
    if (hostels) {
      handleSelectHostel(hostels[0]);
    } else {
      setPickup((prev) => ({ ...prev, mainCategory: 'Others', otherLocation: prev.otherLocation || OTHER_LOCATIONS[0] }));
    }
  };

  const setOtherLocation = (value) => setPickup((prev) => ({ ...prev, otherLocation: value }));

  // Find currently active hostel object to focus 3D map
  const activeHostelObject = HOSTELS_BY_CATEGORY[mainCategory]?.find((h) => h.name === hostelName);
  const pickupLabel = mainCategory === 'Others' ? otherLocation || 'Custom pickup point' : hostelName;

  // Rate calculation
  const ratePerKg = WASH_RATES[washType];
  const totalPrice = Math.round(weightKg * ratePerKg);
  const shownTotal = useCountUp(totalPrice);

  // This student's orders: new records carry their email, older/seed ones match by name
  const myOrders = laundryOrders.filter((o) => (o.userEmail ? o.userEmail === user.email : o.studentName === user.name));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    const effectiveHostel = mainCategory === 'Others' ? otherLocation.trim() : hostelName;

    setTimeout(() => {
      const created = addLaundryOrder({
        studentName,
        userEmail: user.email,
        phone: whatsappNumber,
        category: mainCategory,
        hostelName: effectiveHostel,
        room: roomNumber,
        type: washType,
        weightEstimate: `${weightKg} kg`,
        price: totalPrice,
        slot: pickupSlot,
        instructions: specialInstructions.trim(),
      });

      setSubmittedOrder(created);
      setIsSubmitting(false);
      setSpecialInstructions('');

      // Confetti burst
      confetti({
        particleCount: 90,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#9fe870', '#163300', '#ffd300'],
      });
    }, 700);
  };

  const whatsappConfirmUrl = submittedOrder
    ? `https://wa.me/${UNIGO_HELPLINE.replace(/\D/g, '')}?text=${encodeURIComponent(
        `Hi UniGo PU, I have booked laundry order ${submittedOrder.id} from ${submittedOrder.hostelName} ${submittedOrder.room}. Please confirm pickup!`
      )}`
    : '';

  const quickPicks = HOSTELS_BY_CATEGORY[mainCategory];

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="Hostel laundry · 24-hour turnaround"
        title="Laundry by tomorrow"
        description="Pick your hostel on the map, choose wash or wash + iron, and a runner collects from your floor. Every bag is barcoded and back at your hostel within 24 hours."
        aside={
          <span className="badge badge-lime !h-8 !px-3.5 !text-[13px]">
            <span className="live-dot" aria-hidden="true" />4 runners on duty
          </span>
        }
      />

      <div className="mt-12 sm:mt-14 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-start">
        {/* Booking form */}
        <div className="lg:col-span-5 surface p-5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-7">
            <div>
              <h2 className="heading text-[26px] sm:text-[30px]">Book a pickup</h2>
              <p className="text-[15px] text-body mt-1.5">A runner collects from your door.</p>
            </div>
            <span className="badge badge-ghost">PU students only</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="laundry-name" className="label">
                Your name
              </label>
              <input
                id="laundry-name"
                type="text"
                required
                autoComplete="name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Arjun Sharma"
                className="field"
              />
            </div>

            <div>
              <span className="label">Pickup from</span>
              <Segmented
                ariaLabel="Pickup from"
                value={mainCategory}
                onChange={handleCategoryChange}
                options={CATEGORY_OPTIONS}
                className="w-full [&>button]:flex-1 [&>button]:justify-center"
              />
            </div>

            {mainCategory !== 'Others' ? (
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <label htmlFor="laundry-hostel" className="label">
                    Hostel
                  </label>
                  <span className="text-[12px] text-muted mb-1.5">Shown on the map</span>
                </div>
                <select
                  id="laundry-hostel"
                  value={hostelName}
                  onChange={(e) => {
                    const selected = HOSTELS_BY_CATEGORY[mainCategory].find((h) => h.name === e.target.value);
                    if (selected) handleSelectHostel(selected);
                  }}
                  className="field"
                >
                  {HOSTELS_BY_CATEGORY[mainCategory].map((h) => (
                    <option key={h.id} value={h.name}>
                      {h.name} ({h.rooms})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="laundry-other" className="label">
                  Pickup point or department
                </label>
                <input
                  id="laundry-other"
                  type="text"
                  required
                  value={otherLocation}
                  onChange={(e) => setOtherLocation(e.target.value)}
                  placeholder="e.g. Science Complex foyer, Staff Quarters B-12, SJC"
                  className="field"
                />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="laundry-room" className="label">
                  Room and floor
                </label>
                <input
                  id="laundry-room"
                  type="text"
                  required
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. Room 214, 2nd floor"
                  className="field"
                />
              </div>
              <div>
                <label htmlFor="laundry-whatsapp" className="label">
                  WhatsApp number
                </label>
                <input
                  id="laundry-whatsapp"
                  type="tel"
                  required
                  autoComplete="tel"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="field num"
                />
              </div>
            </div>

            <div>
              <span id="laundry-service-label" className="label">
                Service
              </span>
              <div role="group" aria-labelledby="laundry-service-label" className="grid grid-cols-2 gap-3">
                {SERVICES.map((service) => {
                  const selected = washType === service.value;
                  return (
                    <button
                      type="button"
                      key={service.value}
                      onClick={() => setWashType(service.value)}
                      aria-pressed={selected}
                      className="option p-4 flex flex-col items-start"
                    >
                      <span className="flex w-full items-start justify-between gap-2">
                        <span className="text-[15px] font-semibold text-ink leading-tight">{service.label}</span>
                        <span
                          aria-hidden="true"
                          className={`w-5 h-5 rounded-full shrink-0 flex items-center justify-center transition-colors duration-150 ${
                            selected ? 'bg-forest text-lime' : 'shadow-[var(--shadow-ring)]'
                          }`}
                        >
                          {selected && <Check className="w-3 h-3" strokeWidth={3.5} />}
                        </span>
                      </span>
                      <span className="mt-1 text-[14px] font-semibold text-forest num">
                        ₹{WASH_RATES[service.value]} / kg
                      </span>
                      <span className="mt-2 text-[13px] text-muted leading-snug">{service.desc}</span>
                      {service.tag && <span className="badge badge-neutral !h-5 !text-[11px] mt-3">{service.tag}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="laundry-weight" className="label">
                  Estimated weight
                </label>
                <span className="text-[14px] text-ink num mb-1.5">
                  <span className="font-semibold">{weightKg.toFixed(1)} kg</span>
                  <span className="text-muted"> · about {Math.round(weightKg * 4)} items</span>
                </span>
              </div>
              <input
                id="laundry-weight"
                type="range"
                min="2"
                max="12"
                step="0.5"
                value={weightKg}
                onChange={(e) => setWeightKg(parseFloat(e.target.value))}
                className="w-full accent-forest cursor-pointer"
              />
              <div className="flex justify-between text-[12px] text-muted mt-1 num">
                <span>
                  2 kg<span className="hidden sm:inline"> · small bag</span>
                </span>
                <span>
                  6 kg<span className="hidden sm:inline"> · standard</span>
                </span>
                <span>
                  12 kg<span className="hidden sm:inline"> · bedsheets</span>
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="laundry-slot" className="label">
                Pickup slot
              </label>
              <select
                id="laundry-slot"
                value={pickupSlot}
                onChange={(e) => setPickupSlot(e.target.value)}
                className="field"
              >
                {PICKUP_SLOTS.map((slot) => (
                  <option key={slot.value} value={slot.value}>
                    {slot.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="laundry-notes" className="label">
                Instructions <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id="laundry-notes"
                rows={2}
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="e.g. Separate whites, no starch on kurtas, collect from the common room"
                className="field resize-none"
              />
            </div>

            {/* Live cost summary */}
            <div className="border-t border-hairline pt-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Estimated total</p>
                  <p className="mt-2 font-display font-black text-[40px] leading-none text-ink num [font-stretch:112%]">
                    ₹{shownTotal}
                  </p>
                </div>
                <p className="text-right text-[13px] text-muted leading-snug num">
                  {weightKg.toFixed(1)} kg × ₹{ratePerKg}/kg
                  <br />
                  PU student rate
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="btn btn-primary btn-lg w-full mt-6"
              >
                {isSubmitting ? (
                  'Booking your pickup…'
                ) : (
                  <>
                    Confirm pickup
                    <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Map for picking the hostel */}
        <div className="lg:col-span-7 flex flex-col gap-5 min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="eyebrow mb-1">Pickup point</p>
              <p key={pickupLabel} className="text-[18px] font-semibold text-ink truncate animate-pop-in">
                {pickupLabel}
              </p>
            </div>
            <Segmented
              ariaLabel="Map view"
              value={laundryMapMode}
              onChange={setLaundryMapMode}
              options={MAP_OPTIONS}
              size="sm"
            />
          </div>

          <div className="media-frame h-[420px] sm:h-[520px] lg:h-[600px]">
            {laundryMapMode === 'google3d' ? (
              <GoogleCampus3DMap highlightedId={activeHostelObject?.id} onLocationSelect={handleMapLocationSelect} />
            ) : (
              <CampusMap3D highlightedId={activeHostelObject?.id} onHostelSelect={handleMapLocationSelect} />
            )}
          </div>

          {/* Quick picks: fly the map to a hostel, or choose a common pickup point */}
          <div>
            <p className="label">{quickPicks ? 'Jump to a hostel' : 'Common pickup points'}</p>
            <div className="flex flex-wrap gap-2">
              {quickPicks
                ? quickPicks.map((h) => (
                    <button
                      type="button"
                      key={h.id}
                      onClick={() => handleSelectHostel(h)}
                      aria-pressed={hostelName === h.name}
                      className="option !rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-ink"
                    >
                      {shortHostelName(h.name)}
                    </button>
                  ))
                : OTHER_LOCATIONS.map((loc) => (
                    <button
                      type="button"
                      key={loc}
                      onClick={() => setOtherLocation(loc)}
                      aria-pressed={otherLocation === loc}
                      className="option !rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-ink"
                    >
                      {loc}
                    </button>
                  ))}
            </div>
          </div>

          <Reveal as="ul" className="grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-hairline pt-6 mt-1">
            {GUARANTEES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-full bg-ash text-forest flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{title}</span>
                  <span className="block text-[13px] text-muted">{desc}</span>
                </span>
              </li>
            ))}
          </Reveal>
        </div>
      </div>

      {/* Order tracking */}
      <section className="mt-24 sm:mt-32" aria-labelledby="laundry-orders-title">
        <Reveal className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <p className="eyebrow mb-3">Tracking</p>
            <h2 id="laundry-orders-title" className="heading text-[30px] sm:text-[40px]">
              Your laundry orders
            </h2>
          </div>
          {myOrders.length > 0 && (
            <span className="badge badge-neutral num">
              {myOrders.length} {myOrders.length === 1 ? 'order' : 'orders'}
            </span>
          )}
        </Reveal>

        {myOrders.length > 0 ? (
          <ul className="space-y-3">
            {myOrders.map((order, i) => (
              <Reveal as="li" key={order.id} delay={Math.min(i, 5) * 60}>
                <div className="surface-line p-5 sm:p-6 animate-pop-in">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[13px] text-muted">{order.id}</p>
                      <h3 className="mt-1 text-[18px] font-semibold text-ink leading-snug">{order.hostelName}</h3>
                      <p className="text-[14px] text-body">
                        {order.room} · {SERVICE_LABEL[order.type] ?? order.type} · {order.weightEstimate}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span key={order.status} className="animate-pop-in">
                        <OrderStatusBadge status={order.status} />
                      </span>
                      <span className="text-[18px] font-semibold text-ink num">₹{order.price}</span>
                    </div>
                  </div>

                  <OrderTimeline status={order.status} />

                  <p className="mt-4 text-[13px] text-muted">
                    {order.date}
                    {order.eta && ` · ${order.eta}`}
                  </p>
                </div>
              </Reveal>
            ))}
          </ul>
        ) : (
          <Reveal className="border-t border-hairline pt-8">
            <p className="text-[15px] text-muted max-w-md">
              No laundry orders yet. Book a pickup above and it shows up here with its status, from pickup to
              delivery.
            </p>
          </Reveal>
        )}
      </section>

      {/* Booking confirmation */}
      {submittedOrder && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm overflow-y-auto animate-fade-in">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="laundry-confirm-title"
            className="bg-canvas rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-8 max-w-lg w-full shadow-[var(--shadow-float)] relative sm:my-auto animate-sheet-up"
          >
            <span className="w-12 h-12 rounded-full bg-lime text-forest flex items-center justify-center animate-pop-in">
              <PackageCheck className="w-6 h-6" aria-hidden="true" />
            </span>

            <p className="eyebrow mt-6">Pickup booked</p>
            <h3 id="laundry-confirm-title" className="heading text-[30px] mt-2">
              A runner is scheduled
            </h3>
            <p className="text-[15px] text-body mt-2 leading-relaxed">
              Your runner will collect from <span className="font-semibold text-ink">{submittedOrder.hostelName}</span>,{' '}
              {submittedOrder.room}.
            </p>

            <dl className="my-6 divide-y divide-hairline border-y border-hairline text-[14px]">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">Order ID</dt>
                <dd className="font-mono text-ink">{submittedOrder.id}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">Service</dt>
                <dd className="text-ink font-medium">{SERVICE_LABEL[submittedOrder.type] ?? submittedOrder.type}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">Weight and estimate</dt>
                <dd className="text-ink font-medium num text-right">
                  {submittedOrder.weightEstimate} · ₹{submittedOrder.price}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted shrink-0">Pickup slot</dt>
                <dd className="text-ink font-medium text-right">{slotLabel(submittedOrder.slot)}</dd>
              </div>
              {submittedOrder.instructions && (
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted shrink-0">Instructions</dt>
                  <dd className="text-ink text-right">{submittedOrder.instructions}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">WhatsApp updates to</dt>
                <dd className="text-ink font-medium num text-right">{submittedOrder.phone}</dd>
              </div>
            </dl>

            <div className="flex flex-col sm:flex-row gap-3">
              <a href={whatsappConfirmUrl} target="_blank" rel="noreferrer" className="btn btn-forest flex-1">
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                Confirm on WhatsApp
              </a>
              <button type="button" onClick={() => setSubmittedOrder(null)} className="btn btn-quiet">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
