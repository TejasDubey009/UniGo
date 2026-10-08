import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { useCountUp } from '../hooks/useMotion';
import { PageHeader, Reveal, Segmented, CoinIcon } from './ui';
import { ShieldCheck, MapPin, ArrowRight, PenLine } from 'lucide-react';

const BADGE_TONE = {
  done: 'badge-lime',
  live: 'badge-neutral',
  scheduled: 'badge-ghost',
  alert: 'badge-alert',
  neutral: 'badge-neutral',
};

// Status pill; callers key it on the status so a change pops in instead of swapping silently
function StatusBadge({ tone, children }) {
  return (
    <span className={`badge ${BADGE_TONE[tone] || BADGE_TONE.neutral} animate-pop-in`}>
      {tone === 'live' && <span className="live-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

const laundryTone = (status) =>
  status === 'Delivered' ? 'done' : status === 'Pickup Scheduled' ? 'scheduled' : 'live';

const rideTone = (status) =>
  status === 'Completed' ? 'done' : /cancel/i.test(status || '') ? 'alert' : 'live';

// Lease statuses read like "Confirmed - Bring DL & ID at Pickup": badge the first part, show the rest as a note
const splitLeaseStatus = (status) => {
  if (!status) return { label: 'Signed', note: '', tone: 'done' };
  const [label, ...rest] = status.split(' - ');
  const tone = /^active/i.test(label) ? 'live' : /^pre-reserved/i.test(label) ? 'scheduled' : 'done';
  return { label, note: rest.join(' - '), tone };
};

// One KPI in a row of hairline-separated stats; the number tweens when it changes
function Stat({ label, value, hint, icon, index }) {
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
      <dd className="mt-2 flex items-center gap-2 font-display font-black text-[28px] sm:text-[40px] leading-none text-ink num [font-stretch:112%]">
        {icon}
        {shown.toLocaleString('en-IN')}
      </dd>
      {hint && <dd className="mt-2 text-[13px] text-muted">{hint}</dd>}
    </div>
  );
}

function SectionHead({ id, eyebrow, title, count, action, onAction }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-5">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h2 id={id} className="heading text-[26px] sm:text-[32px]">
          {title} <span className="text-subtle num">{count}</span>
        </h2>
      </div>
      <button type="button" onClick={onAction} className="btn btn-sm btn-quiet">
        {action}
        <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
      </button>
    </div>
  );
}

function EmptyRow({ children }) {
  return <p className="border-t border-hairline py-8 text-[15px] text-muted">{children}</p>;
}

export default function UserDashboard() {
  const { user, laundryOrders, rentalBookings, ridesHistory, setActiveTab } = useApp();
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'laundry' | 'rentals' | 'rides'

  // Filter student-specific orders: new records carry the student's email, older/seed ones match by name or roll no.
  const isMine = (record, legacyMatch) => (record.userEmail ? record.userEmail === user.email : legacyMatch);
  const myLaundry = laundryOrders.filter((o) => isMine(o, o.studentName === user.name));
  const myRentals = rentalBookings.filter((r) => isMine(r, Boolean(user.rollNo) && r.rollNo === user.rollNo));
  const myRides = ridesHistory.filter((r) => isMine(r, r.passenger === user.name));

  const sections = [];

  if (activeSubTab === 'overview' || activeSubTab === 'laundry') {
    sections.push(
      <section key="laundry" aria-labelledby="laundry-heading">
        <SectionHead
          eyebrow="Hostel laundry"
          id="laundry-heading"
          title="Laundry pickups"
          count={myLaundry.length}
          action="New laundry request"
          onAction={() => setActiveTab('laundry')}
        />
        {myLaundry.length > 0 ? (
          <ul className="border-t border-hairline divide-y divide-hairline">
            {myLaundry.map((order) => (
              <li key={order.id} className="py-5 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-8">
                <div className="min-w-0 lg:flex-[1.2]">
                  <p className="text-[13px] text-muted">
                    <span className="font-mono">{order.id}</span> · {order.date}
                  </p>
                  <p className="mt-1 text-[16px] font-semibold text-ink">{order.hostelName}</p>
                  <p className="text-[14px] text-body">{order.room}</p>
                </div>
                <div className="min-w-0 lg:flex-1 text-[14px]">
                  <p className="text-body">{order.type}</p>
                  <p className="text-muted">{order.eta || 'Pickup in progress'}</p>
                </div>
                <div className="flex items-center justify-between lg:justify-end gap-5 shrink-0">
                  <StatusBadge key={order.status} tone={laundryTone(order.status)}>
                    {order.status}
                  </StatusBadge>
                  <span className="text-[16px] font-semibold text-ink num lg:min-w-[64px] lg:text-right">
                    ₹{order.price}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow>No laundry orders placed yet.</EmptyRow>
        )}
      </section>
    );
  }

  if (activeSubTab === 'overview' || activeSubTab === 'rentals') {
    sections.push(
      <section key="rentals" aria-labelledby="rentals-heading">
        <SectionHead
          eyebrow="Scooter rental"
          id="rentals-heading"
          title="Signed leases"
          count={myRentals.length}
          action="Browse scooters"
          onAction={() => setActiveTab('rental')}
        />
        {myRentals.length > 0 ? (
          <ul className="border-t border-hairline divide-y divide-hairline">
            {myRentals.map((rental) => {
              const lease = splitLeaseStatus(rental.status);
              return (
                <li key={rental.id} className="py-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-x-10 gap-y-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="font-mono text-[13px] text-muted">{rental.id}</span>
                      <StatusBadge key={rental.status} tone={lease.tone}>
                        {lease.label}
                      </StatusBadge>
                    </div>
                    <p className="mt-2 text-[18px] font-semibold text-ink">{rental.vehicleName}</p>
                    <p className="mt-0.5 text-[14px] text-body">
                      Pickup at {rental.pickupHub}
                      {lease.note && <span className="text-muted"> · {lease.note}</span>}
                    </p>

                    <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4 text-[15px]">
                      <div>
                        <dt className="text-[13px] text-muted">Duration</dt>
                        <dd className="mt-0.5 font-semibold text-ink">{rental.duration}</dd>
                      </div>
                      <div>
                        <dt className="text-[13px] text-muted">Amount</dt>
                        <dd className="mt-0.5 font-semibold text-ink num">₹{rental.totalAmount}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[13px] text-muted">Driving licence</dt>
                        <dd className="mt-0.5 font-mono text-[14px] text-ink break-all">{rental.dlNumber}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-col items-start md:items-end gap-3">
                    {rental.signatureUrl && (
                      <figure className="rounded-[18px] bg-canvas shadow-[var(--shadow-ring)] px-4 py-3">
                        <img
                          src={rental.signatureUrl}
                          alt="Student signature"
                          className="h-10 max-w-[160px] object-contain"
                        />
                        <figcaption className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                          <PenLine className="w-3.5 h-3.5" aria-hidden="true" />
                          Signature on record
                        </figcaption>
                      </figure>
                    )}
                    {rental.signedAt && <p className="text-[13px] text-muted">Signed {rental.signedAt}</p>}
                    <span className="badge badge-info">Show your DL and student ID at the hub</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyRow>No scooter leases signed yet.</EmptyRow>
        )}
      </section>
    );
  }

  if (activeSubTab === 'overview' || activeSubTab === 'rides') {
    sections.push(
      <section key="rides" aria-labelledby="rides-heading">
        <SectionHead
          eyebrow="Campus rides"
          id="rides-heading"
          title="Ride history"
          count={myRides.length}
          action="Book a ride"
          onAction={() => setActiveTab('rides')}
        />
        {myRides.length > 0 ? (
          <ul className="border-t border-hairline divide-y divide-hairline">
            {myRides.map((ride) => (
              <li key={ride.id} className="py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[13px] text-muted">{ride.id}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[16px] font-semibold text-ink">
                    <span>{ride.pickup}</span>
                    <ArrowRight className="w-4 h-4 text-forest shrink-0" aria-hidden="true" />
                    <span className="sr-only">to</span>
                    <span>{ride.drop}</span>
                  </p>
                  {ride.captainName && (
                    <p className="mt-0.5 text-[14px] text-muted">
                      Captain {ride.captainName}
                      {ride.captainBike && ` · ${ride.captainBike}`}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-5 shrink-0">
                  <StatusBadge key={ride.status} tone={rideTone(ride.status)}>
                    {ride.status}
                  </StatusBadge>
                  <span className="text-[16px] font-semibold text-ink num">₹{ride.fare}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyRow>No rides yet.</EmptyRow>
        )}
      </section>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="Student dashboard"
        title="My UniGo"
        description="Scooter leases, hostel laundry and campus rides booked on your account, plus the coins you can spend on them."
      />

      {/* Profile */}
      <section aria-label="Profile" className="mt-12 sm:mt-14">
        <div className="flex items-center gap-4 sm:gap-5 min-w-0">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="heading text-[26px] sm:text-[32px]">{user.name}</h2>
              {user.verifiedStudent ? (
                <span className="badge badge-lime">
                  <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                  PU verified student
                </span>
              ) : (
                <span className="badge badge-neutral">Guest account</span>
              )}
            </div>
            <p className="mt-1.5 text-[14px] text-muted break-all">
              {user.email}
              {user.rollNo && (
                <>
                  {' · Roll '}
                  <span className="font-mono">{user.rollNo}</span>
                </>
              )}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-body">
              <MapPin className="w-4 h-4 text-forest shrink-0" aria-hidden="true" />
              <span>
                {user.hostelName}
                {user.room && ` (${user.room})`}
              </span>
              {user.department && (
                <>
                  <span className="text-subtle" aria-hidden="true">·</span>
                  <span>{user.department}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <dl className="mt-8 grid grid-cols-2 lg:grid-cols-4 border-y border-hairline">
          <Stat
            index={0}
            label="UniGo coins"
            value={user.coins ?? 0}
            hint="Redeemable on rides and laundry"
            icon={<CoinIcon className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />}
          />
          <Stat index={1} label="Laundry orders" value={myLaundry.length} />
          <Stat index={2} label="Scooter leases" value={myRentals.length} />
          <Stat index={3} label="Campus rides" value={myRides.length} />
        </dl>
      </section>

      {/* Bookings */}
      <div className="mt-12 sm:mt-14">
        <Segmented
          ariaLabel="Show bookings"
          value={activeSubTab}
          onChange={setActiveSubTab}
          options={[
            { value: 'overview', label: 'All' },
            { value: 'laundry', label: 'Laundry' },
            { value: 'rentals', label: 'Leases' },
            { value: 'rides', label: 'Rides' },
          ]}
        />
      </div>

      <div className="mt-10 space-y-16 sm:space-y-20">
        {sections.map((section, i) => (
          <Reveal key={section.key} delay={i * 60}>
            {section}
          </Reveal>
        ))}
      </div>
    </div>
  );
}
