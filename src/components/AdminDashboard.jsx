import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { useCountUp } from '../hooks/useMotion';
import { PageHeader, Reveal, Segmented } from './ui';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  MessageSquare,
  MapPin,
  NotebookPen,
} from 'lucide-react';

const LAUNDRY_STATUSES = ['Pickup Scheduled', 'Clothes Collected', 'Washing & Steam Ironing', 'Ready for Delivery', 'Delivered'];

// Short names for the pipeline strip so five stages fit side by side on a phone
const STAGE_SHORT = {
  'Pickup Scheduled': 'Scheduled',
  'Clothes Collected': 'Collected',
  'Washing & Steam Ironing': 'Washing',
  'Ready for Delivery': 'Ready',
  Delivered: 'Delivered',
};

const LAUNDRY_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'Girls Hostel', label: 'Girls' },
  { value: 'Boys Hostel', label: 'Boys' },
  { value: 'Others', label: 'Others' },
];

const laundryBadge = (status) =>
  status === 'Delivered' ? 'badge-lime' : status === 'Pickup Scheduled' ? 'badge-ghost' : 'badge-neutral';

// One KPI in a row of hairline-separated stats; the number tweens when it changes
function Stat({ label, value, format = (v) => v.toLocaleString('en-IN'), prefix, unit, hint, index }) {
  const shown = useCountUp(value);
  const edges = [
    index % 2 === 1 && 'border-l pl-5',
    index >= 2 && 'border-t lg:border-t-0',
    index > 0 && 'lg:border-l lg:pl-8',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`border-hairline py-6 pr-3 min-w-0 ${edges}`}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-2 font-display font-black text-[28px] sm:text-[40px] leading-none text-ink num [font-stretch:112%]">
        {prefix}
        {format(shown)}
        {unit && <span className="ml-1.5 font-sans text-[15px] font-semibold text-muted">{unit}</span>}
      </dd>
      {hint && <dd className="mt-2 text-[13px] text-muted">{hint}</dd>}
    </div>
  );
}

function StageCount({ stage, count }) {
  const shown = useCountUp(count);
  return (
    <li className="min-w-0">
      <span
        aria-hidden="true"
        className={`block h-1 rounded-full transition-colors duration-200 ${count > 0 ? 'bg-forest' : 'bg-ash'}`}
      />
      <span className="mt-3 block font-display font-black text-[24px] sm:text-[28px] leading-none text-ink num [font-stretch:112%]">
        {shown}
      </span>
      <span className="mt-1 block text-[12px] sm:text-[13px] text-muted truncate" title={stage}>
        {STAGE_SHORT[stage]}
      </span>
    </li>
  );
}

export default function AdminDashboard() {
  const {
    rentalSettings,
    updateRentalSettings,
    fleet,
    setVehicleAvailability,
    laundryOrders,
    updateLaundryStatus,
    ridesHistory,
    rentalBookings
  } = useApp();

  // Local state for admin controls
  const [isAvailable, setIsAvailable] = useState(rentalSettings.isAvailable);
  const [nextTime, setNextTime] = useState(rentalSettings.nextAvailableTime);
  const [nextModel, setNextModel] = useState(rentalSettings.nextAvailableModel);
  const [adminNote, setAdminNote] = useState(rentalSettings.adminNote);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveTimerRef = useRef(null);

  // Laundry filter
  const [laundryFilter, setLaundryFilter] = useState('ALL'); // 'ALL' | 'Girls Hostel' | 'Boys Hostel' | 'Others'

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  const handleSaveRentalSettings = (e) => {
    e.preventDefault();
    updateRentalSettings({
      isAvailable,
      nextAvailableTime: nextTime,
      nextAvailableModel: nextModel,
      adminNote,
    });
    setSaveSuccess(true);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaveSuccess(false), 2500);
  };

  const filteredLaundry = laundryOrders.filter((o) => {
    if (laundryFilter === 'ALL') return true;
    return o.category === laundryFilter;
  });

  const totalLaundryKg = laundryOrders.reduce((acc, o) => {
    const kg = parseFloat(o.weightEstimate) || 4;
    return acc + kg;
  }, 0);

  const totalRevenue =
    laundryOrders.reduce((acc, o) => acc + (o.price || 0), 0) +
    rentalBookings.reduce((acc, r) => acc + (r.totalAmount || 0), 0) +
    ridesHistory.reduce((acc, r) => acc + (r.fare || 0), 0);

  const freeScooters = fleet.filter((v) => v.available).length;

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="Admin console"
        title="Campus operations"
        description="Open or pause scooter rentals, set when the next scooter is back, and move hostel laundry through each stage."
        aside={
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-ghost">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
              Campus administrator
            </span>
            <span
              key={String(rentalSettings.isAvailable)}
              className={`badge animate-pop-in ${rentalSettings.isAvailable ? 'badge-lime' : 'badge-neutral'}`}
            >
              {rentalSettings.isAvailable && <span className="live-dot" aria-hidden="true" />}
              {rentalSettings.isAvailable ? 'Rentals open' : 'Rentals paused'}
            </span>
          </div>
        }
      />

      {/* KPIs */}
      <dl className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 border-y border-hairline">
        <Stat index={0} label="Estimated revenue" prefix="₹" value={totalRevenue} hint="Laundry, leases and rides" />
        <Stat
          index={1}
          label="Laundry handled"
          value={Math.round(totalLaundryKg * 10)}
          format={(v) => (v / 10).toFixed(1)}
          unit="kg"
          hint={`${laundryOrders.length} orders`}
        />
        <Stat index={2} label="Leases signed" value={rentalBookings.length} />
        <Stat index={3} label="Scooters free" value={freeScooters} unit={`of ${fleet.length}`} />
      </dl>

      <div className="mt-12 sm:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-start">
        {/* Left: rental availability controls and fleet */}
        <div className="lg:col-span-5 min-w-0 space-y-12">
          <section aria-labelledby="rental-heading" className="surface p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow mb-2">Scooter rental</p>
                <h2 id="rental-heading" className="heading text-[26px] sm:text-[30px]">
                  Availability
                </h2>
              </div>
              <span className="badge badge-ghost shrink-0">
                <span className="live-dot" aria-hidden="true" />
                Live
              </span>
            </div>

            <form onSubmit={handleSaveRentalSettings} className="mt-6 space-y-6">
              {/* Service on/off */}
              <div className="flex items-center justify-between gap-4 py-5 border-y border-hairline">
                <div className="min-w-0">
                  <p id="rental-switch-label" className="text-[15px] font-semibold text-ink">
                    Rental service
                  </p>
                  <p id="rental-switch-desc" className="text-[14px] text-muted">
                    {isAvailable ? 'Scooters are open for booking' : 'Shown as sold out or in transit'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isAvailable}
                  aria-labelledby="rental-switch-label"
                  aria-describedby="rental-switch-desc"
                  onClick={() => setIsAvailable(!isAvailable)}
                  className={`relative inline-flex items-center shrink-0 h-8 w-14 p-1 rounded-full transition-colors duration-200 ${
                    isAvailable ? 'bg-lime' : 'bg-ash shadow-[inset_0_0_0_1px_rgb(14_15_12/0.08)]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`h-6 w-6 rounded-full bg-canvas shadow-[0_1px_3px_rgb(0_0_0/0.18)] transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${
                      isAvailable ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label htmlFor="next-time" className="label flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  Next scooter available at
                </label>
                <input
                  id="next-time"
                  type="text"
                  required
                  value={nextTime}
                  onChange={(e) => setNextTime(e.target.value)}
                  placeholder="e.g. 04:30 PM (returned from town)"
                  className="field"
                />
                <p className="mt-1.5 text-[13px] text-muted">
                  Shown to students in the availability banner on the rental page.
                </p>
              </div>

              <div>
                <label htmlFor="next-model" className="label">
                  Next available model
                </label>
                <select
                  id="next-model"
                  value={nextModel}
                  onChange={(e) => setNextModel(e.target.value)}
                  className="field"
                >
                  {fleet.map((v) => (
                    <option key={v.id}>{v.model}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="admin-note" className="label">
                  Public announcement
                </label>
                <textarea
                  id="admin-note"
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Notice shown to every student on campus"
                  className="field resize-none"
                />
              </div>

              <div className="pt-1 flex flex-wrap items-center justify-between gap-4">
                <p className="text-[13px] min-h-5" aria-live="polite">
                  {saveSuccess ? (
                    <span className="flex items-center gap-1.5 font-semibold text-forest animate-pop-in">
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      Saved. Students see it now.
                    </span>
                  ) : (
                    <span className="text-muted">Changes go live when you save</span>
                  )}
                </p>
                <button type="submit" className="btn btn-primary">
                  Save rental settings
                </button>
              </div>
            </form>
          </section>

          {/* Fleet */}
          <Reveal as="section" aria-labelledby="fleet-heading">
            <div className="flex items-end justify-between gap-4 pb-4">
              <div>
                <p className="eyebrow mb-2">Fleet</p>
                <h2 id="fleet-heading" className="heading text-[24px] sm:text-[28px]">
                  Vehicles <span className="text-subtle num">{fleet.length}</span>
                </h2>
              </div>
            </div>
            <ul className="border-t border-hairline divide-y divide-hairline">
              {fleet.map((bike) => (
                <li key={bike.id} className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <span className="text-[15px] font-semibold text-ink">{bike.model}</span>
                      <span
                        key={String(bike.available)}
                        className={`badge animate-pop-in ${bike.available ? 'badge-lime' : 'badge-neutral'}`}
                      >
                        {bike.available ? 'Available' : 'Rented'}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-muted">
                      <span className="font-mono">{bike.id}</span> · {bike.fuelLevel} · {bike.pickupLocation}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVehicleAvailability(bike.id, !bike.available)}
                    title={bike.available ? 'Mark as rented' : 'Mark as available'}
                    className={`btn btn-sm shrink-0 ${bike.available ? 'btn-quiet' : 'btn-outline'}`}
                  >
                    {bike.available ? 'Mark rented' : 'Mark available'}
                  </button>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* Right: laundry queue */}
        <section aria-labelledby="laundry-heading" className="lg:col-span-7 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6">
            <div>
              <p className="eyebrow mb-2">Hostel laundry</p>
              <h2 id="laundry-heading" className="heading text-[26px] sm:text-[30px]">
                Laundry queue <span className="text-subtle num">{filteredLaundry.length}</span>
              </h2>
              <p className="mt-1.5 text-[14px] text-muted">
                Update the wash stage and message students on WhatsApp.
              </p>
            </div>
            <Segmented
              size="sm"
              ariaLabel="Filter by hostel"
              value={laundryFilter}
              onChange={setLaundryFilter}
              options={LAUNDRY_FILTERS}
              className="self-start sm:self-auto"
            />
          </div>

          {/* Pipeline: how many orders sit in each stage */}
          <ol aria-label="Orders per stage" className="grid grid-cols-5 gap-2 sm:gap-4 pb-6">
            {LAUNDRY_STATUSES.map((stage) => (
              <StageCount
                key={stage}
                stage={stage}
                count={filteredLaundry.filter((o) => o.status === stage).length}
              />
            ))}
          </ol>

          <ul className="border-t border-hairline divide-y divide-hairline lg:max-h-[760px] lg:overflow-y-auto">
            {filteredLaundry.length > 0 ? (
              filteredLaundry.map((order) => (
                <li key={order.id} className="py-5 lg:pr-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[13px] text-muted">
                        <span className="font-mono">{order.id}</span> · {order.category} · {order.date}
                      </p>
                      <p className="mt-1.5 text-[16px] font-semibold text-ink">{order.studentName}</p>
                      <p className="mt-1 flex items-start gap-1.5 text-[14px] text-body">
                        <MapPin className="w-4 h-4 mt-0.5 text-forest shrink-0" aria-hidden="true" />
                        <span>
                          {order.hostelName} · {order.room}
                        </span>
                      </p>
                      {order.slot && (
                        <p className="mt-1 flex items-start gap-1.5 text-[14px] text-muted">
                          <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{order.slot}</span>
                        </p>
                      )}
                      {order.instructions && (
                        <p className="mt-1 flex items-start gap-1.5 text-[14px] text-body">
                          <NotebookPen className="w-4 h-4 mt-0.5 text-muted shrink-0" aria-hidden="true" />
                          <span>{order.instructions}</span>
                        </p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-[17px] font-semibold text-ink num">₹{order.price}</p>
                      <p className="text-[13px] text-muted">
                        {order.weightEstimate} · {order.type}
                      </p>
                    </div>
                  </div>

                  {/* Stage and contact */}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span key={order.status} className={`badge animate-pop-in ${laundryBadge(order.status)}`}>
                      {order.status !== 'Delivered' && order.status !== 'Pickup Scheduled' && (
                        <span className="live-dot" aria-hidden="true" />
                      )}
                      {order.status}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`status-${order.id}`} className="text-[13px] font-semibold text-ink">
                        Stage
                      </label>
                      <select
                        id={`status-${order.id}`}
                        value={order.status}
                        onChange={(e) => updateLaundryStatus(order.id, e.target.value)}
                        className="field w-auto py-2 text-[14px]"
                      >
                        {LAUNDRY_STATUSES.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      <a
                        href={`https://wa.me/${order.phone?.replace(/[^0-9]/g, '')}?text=Hi%20${encodeURIComponent(order.studentName)}%2C%20this%20is%20UniGo%20Campus%20Laundry%20admin%20regarding%20order%20${order.id}.`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm btn-quiet"
                      >
                        <MessageSquare className="w-4 h-4" aria-hidden="true" />
                        WhatsApp
                      </a>
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="py-10 text-center text-[15px] text-muted">
                No orders for this hostel filter.
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
