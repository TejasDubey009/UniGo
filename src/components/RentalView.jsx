import React, { useState, useRef } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useApp } from '../context/useApp';
import { useCountUp } from '../hooks/useMotion';
import { celebrate } from '../lib/celebrate';
import { shortRef, formatWhen, formatTime } from '../lib/format';
import { PageHeader, Reveal } from './ui';
import { Gauge, HardHat, Check, Clock, IdCard, MapPin, RotateCcw, ArrowRight, X } from 'lucide-react';

// Lease statuses as stored in Supabase; staff move a lease along at the hub
const LEASE_STATUS = {
  reserved: { label: 'Pre-reserved', tone: 'badge-neutral' },
  confirmed: { label: 'Ready for pickup', tone: 'badge-lime' },
  active: { label: 'On a trip', tone: 'badge-forest' },
  returned: { label: 'Returned', tone: 'badge-ghost' },
  cancelled: { label: 'Cancelled', tone: 'badge-neutral' },
};

// One summary row in the lease and receipt panels
function SummaryRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className="text-muted shrink-0">{label}</dt>
      <dd className="text-ink font-medium text-right min-w-0">{children}</dd>
    </div>
  );
}

// "10:30 am" today, "11 Oct, 10:30 am" for a later day
const formatReturn = (iso) => (new Date(iso).toDateString() === new Date().toDateString() ? formatTime(iso) : formatWhen(iso));

export default function RentalView() {
  const { user, fleet, leases, signLease, requireAuth, saveProfileDetails, refreshFleet } = useApp();

  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const leaseDialogRef = useDialog(isAgreementModalOpen && Boolean(selectedVehicle), () => setIsAgreementModalOpen(false));
  const receiptDialogRef = useDialog(Boolean(confirmedBooking), () => setConfirmedBooking(null));

  // Agreement form states
  const [dlNumber, setDlNumber] = useState('');
  const [rentalDuration, setRentalDuration] = useState('4 Hours');
  const [pickupHub, setPickupHub] = useState('Gate 1 UniGo Hub (ECR Entrance)');
  const [hasAgreedTerms, setHasAgreedTerms] = useState(false);
  const [phone, setPhone] = useState(user?.phone || '');
  const [rollNo, setRollNo] = useState(user?.rollNo || '');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fill blank fields from the student's profile once it arrives
  const [filledFor, setFilledFor] = useState(user?.key);
  if (user && user.key !== filledFor) {
    setFilledFor(user.key);
    if (!phone) setPhone(user.phone);
    if (!rollNo) setRollNo(user.rollNo);
  }

  // Digital Signature Pad Canvas
  const canvasRef = useRef(null);
  const [hasSigned, setHasSigned] = useState(false);
  const isDrawing = useRef(false);

  // The canvas has a fixed drawing resolution but is stretched by CSS, so convert CSS pixels to canvas pixels
  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    isDrawing.current = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Pointer already released; drawing still works while it stays over the pad
    }
    const ctx = canvas.getContext('2d');
    const { x, y } = getCanvasPoint(e);
    ctx.strokeStyle = '#0e0f0c';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getCanvasPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasSigned) {
      setHasSigned(true);
      setFormError('');
    }
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSigned(false);
    setTypedSignature('');
  };

  // For anyone who can't draw (keyboard, screen reader): typing your full name signs the pad
  const [typedSignature, setTypedSignature] = useState('');
  const signByTyping = (text) => {
    setTypedSignature(text);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const name = text.trim();
    if (name.length < 3) {
      setHasSigned(false);
      return;
    }
    ctx.fillStyle = '#0e0f0c';
    ctx.font = 'italic 600 44px Georgia, "Times New Roman", serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name, 28, canvas.height * 0.72, canvas.width - 56);
    setHasSigned(true);
    setFormError('');
  };

  // Each vehicle's own hub, as listed in the fleet
  const hubFor = (vehicle) => {
    const where = vehicle?.pickupLocation || '';
    if (/library/i.test(where)) return 'Library Hub & Parking Dock';
    if (/gate 2/i.test(where)) return 'Gate 2 Kalapet Entrance';
    return 'Gate 1 UniGo Hub (ECR Entrance)';
  };

  const handleOpenRental = (bike) => {
    if (!requireAuth('Sign in with your university account to rent a vehicle.')) return;
    setSelectedVehicle(bike);
    setPickupHub(hubFor(bike));
    setIsAgreementModalOpen(true);
    setHasSigned(false);
    setTypedSignature('');
    setHasAgreedTerms(false);
    setFormError('');
  };

  // Booking a vehicle that's out on a trip only pre-reserves it (availability is live, so read the current fleet)
  const liveVehicle = fleet.find((v) => v.id === selectedVehicle?.id);
  const isPreReservation = liveVehicle ? !liveVehicle.available : false;

  const calculateAmount = () => {
    if (!selectedVehicle) return 0;
    if (rentalDuration === '2 Hours') return selectedVehicle.hourlyRate * 2;
    if (rentalDuration === '4 Hours') return selectedVehicle.hourlyRate * 4;
    if (rentalDuration === '8 Hours') return Math.round(selectedVehicle.dailyRate * 0.7);
    if (rentalDuration === 'Full Day (24h)') return selectedVehicle.dailyRate;
    if (rentalDuration === 'Weekend (2 Days)') return selectedVehicle.dailyRate * 2 - 50;
    return selectedVehicle.hourlyRate * 4;
  };

  // Total tweens when the duration changes
  const shownTotal = useCountUp(calculateAmount());
  const freeCount = fleet.filter((v) => v.available).length;
  // Earliest known return among vehicles out on trips
  const nextReturn = fleet
    .filter((v) => !v.available && v.nextAvailableAt)
    .sort((a, b) => new Date(a.nextAvailableAt) - new Date(b.nextAvailableAt))[0];

  const handleCompleteAgreement = async (e) => {
    e.preventDefault();
    if (!hasSigned) {
      setFormError('Draw your signature on the pad to continue.');
      return;
    }
    if (!hasAgreedTerms) {
      setFormError('Confirm that you will bring your original DL and student ID.');
      return;
    }

    if (isSubmitting) return;

    setIsSubmitting(true);
    // The database sets the vehicle name and the price from its own fleet rates
    const { data, error } = await signLease({
      vehicle_id: selectedVehicle.id,
      rider_name: user?.name || user?.email.split('@')[0] || '',
      roll_no: rollNo.trim().toUpperCase() || null,
      phone: phone.trim(),
      dl_number: dlNumber.trim().toUpperCase(),
      duration: rentalDuration,
      pickup_hub: pickupHub,
      signature: canvasRef.current.toDataURL('image/png'),
      pre_reserved: isPreReservation,
    });
    setIsSubmitting(false);
    if (error) {
      setFormError(error);
      // Someone else just took it: re-read the fleet so the form switches to pre-reserving
      if (/just taken/i.test(error)) refreshFleet();
      return;
    }

    setIsAgreementModalOpen(false);
    setConfirmedBooking(data);
    setDlNumber('');
    saveProfileDetails({ phone: phone.trim(), roll_no: rollNo.trim().toUpperCase() });
    celebrate(100);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-6 sm:pt-16 pb-16 sm:pb-24">
      <PageHeader
        eyebrow="Scooter and bike rental"
        title="Self-drive by the hour"
        description="Scooters and bikes by the hour or the day. Sign the lease on your phone, then show your driving licence and student ID at the hub to collect the keys."
        aside={
          <p className="flex items-center gap-2 text-[14px] text-body">
            <MapPin className="w-4 h-4 text-forest shrink-0" aria-hidden="true" />
            Hubs at Gate 1 (ECR) and the Library dock
          </p>
        }
      />

      {/* Live availability from Supabase */}
      {freeCount > 0 ? (
        <div className="mt-6 sm:mt-10 flex flex-col md:flex-row md:items-center justify-between gap-3 py-4 border-y border-hairline">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 min-w-0">
            <span className="badge badge-lime self-start sm:self-auto">
              <span className="live-dot" aria-hidden="true" />
              Open now
            </span>
            <p className="text-[15px] text-body">Collect and return at the Gate 1 and Library hubs.</p>
          </div>
          {nextReturn && (
            <p className="text-[14px] text-muted shrink-0">
              Next return <span className="num text-ink font-semibold">{formatReturn(nextReturn.nextAvailableAt)}</span> ·{' '}
              {nextReturn.model}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-10 surface-ash p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <span className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-forest" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-ink">All vehicles are out on trips</p>
              <p className="text-[15px] text-body mt-0.5">
                {nextReturn
                  ? `Next one back: ${nextReturn.model} at ${formatReturn(nextReturn.nextAvailableAt)}. `
                  : ''}
                You can still sign the lease below to pre-reserve one.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fleet */}
      <div className="mt-10 sm:mt-14 flex flex-wrap items-end justify-between gap-3">
        <h2 className="heading text-[24px] sm:text-[34px]">Choose a vehicle</h2>
        <p className="text-[14px] text-muted num">
          {freeCount} of {fleet.length} free now
        </p>
      </div>

      <ul className="mt-6 space-y-4">
        {fleet.map((vehicle, i) => {
          const isAvailable = vehicle.available;
          const isSelected = selectedVehicle?.id === vehicle.id;
          const statusLabel = isAvailable
            ? 'Available now'
            : vehicle.nextAvailableAt
              ? `Back at ${formatReturn(vehicle.nextAvailableAt)}`
              : 'On lease';

          return (
            <Reveal as="li" key={vehicle.id} delay={i * 60}>
              <article
                aria-labelledby={`vehicle-${vehicle.id}`}
                className={`option ${isSelected ? 'is-selected' : ''} active:transform-none rounded-[28px] p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)_230px] gap-4 sm:gap-x-6`}
              >
                <div className="relative overflow-hidden rounded-[18px] bg-ash aspect-[16/9] sm:aspect-auto sm:min-h-[180px] sm:row-span-2 lg:row-span-1">
                  {/* Absolutely placed so a tall photo can't stretch the row */}
                  <img
                    src={vehicle.image}
                    alt={vehicle.model}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {vehicle.imageCredit && (
                    <a
                      href={vehicle.imageCredit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute left-2 bottom-2 max-w-[calc(100%-16px)] truncate rounded-full bg-canvas/90 px-2 py-0.5 text-[10px] font-medium text-muted hover:text-ink transition-colors duration-150"
                    >
                      Photo: {vehicle.imageCredit.author} · {vehicle.imageCredit.license}
                    </a>
                  )}
                </div>

                <div className="min-w-0 px-1 sm:px-0 sm:py-1">
                  <p className="text-[13px] text-muted">
                    {vehicle.type} · {vehicle.tag}
                  </p>
                  <h3 id={`vehicle-${vehicle.id}`} className="heading text-[22px] sm:text-[26px] mt-1">
                    {vehicle.model}
                  </h3>
                  <p className="mt-2 flex items-center gap-1.5 text-[14px] text-body">
                    <MapPin className="w-4 h-4 text-forest shrink-0" aria-hidden="true" />
                    {vehicle.pickupLocation}
                  </p>

                  <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-ink">
                    <li className="flex items-center gap-1.5">
                      <Gauge className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                      <span className="sr-only">Range: </span>
                      <span className="num">{vehicle.rangeOrMileage}</span>
                    </li>
                    <li className="flex items-center gap-1.5">
                      <HardHat className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                      <span className="num">
                        {vehicle.helmetsIncluded} {vehicle.helmetsIncluded === 1 ? 'helmet' : 'helmets'}
                      </span>
                    </li>
                  </ul>

                  <ul className="mt-4 hidden sm:grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px] text-body">
                    {vehicle.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-forest shrink-0 mt-0.5" strokeWidth={2.5} aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="sm:col-start-2 lg:col-start-3 lg:row-start-1 flex flex-row flex-wrap lg:flex-col lg:flex-nowrap items-end justify-between gap-4 px-1 sm:px-0 pt-4 border-t border-hairline lg:pt-1 lg:pl-6 lg:border-t-0 lg:border-l">
                  <div className="min-w-0 lg:text-right">
                    <span className={`badge ${isAvailable ? 'badge-lime' : 'badge-neutral'}`}>
                      {isAvailable ? (
                        <span className="live-dot" aria-hidden="true" />
                      ) : (
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {statusLabel}
                    </span>
                    <p className="mt-3 flex items-baseline gap-1 lg:justify-end">
                      <span className="font-display font-black text-[32px] leading-none text-ink num [font-stretch:112%]">
                        ₹{vehicle.hourlyRate}
                      </span>
                      <span className="text-[14px] text-muted">/hr</span>
                    </p>
                    <p className="mt-1 text-[14px] text-muted num">₹{vehicle.dailyRate} per day</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenRental(vehicle)}
                    aria-describedby={`vehicle-${vehicle.id}`}
                    className={`btn shrink-0 ${isAvailable ? 'btn-forest' : 'btn-outline'}`}
                  >
                    {isAvailable ? 'Rent now' : 'Pre-reserve'}
                    <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
                  </button>
                </div>
              </article>
            </Reveal>
          );
        })}
      </ul>

      {/* The student's leases, with status kept live from Supabase */}
      {leases.length > 0 && (
        <section className="mt-12 sm:mt-20" aria-labelledby="leases-title">
          <h2 id="leases-title" className="heading text-[28px] sm:text-[34px]">
            Your leases
          </h2>
          <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
            {leases.map((lease) => {
              const status = LEASE_STATUS[lease.status] || { label: lease.status, tone: 'badge-neutral' };
              return (
                <li key={lease.id} className="py-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] text-muted">{shortRef(lease.id)}</p>
                    <p className="text-[17px] font-semibold text-ink">{lease.vehicle_name}</p>
                    <p className="text-[14px] text-body">
                      {lease.duration} · {lease.pickup_hub} · signed {formatWhen(lease.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`badge ${status.tone}`}>{status.label}</span>
                    <span className="text-[17px] font-semibold text-ink num">₹{lease.total_amount}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Lease agreement and signature */}
      {isAgreementModalOpen && selectedVehicle && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm animate-fade-in">
          <div className="min-h-full flex items-end sm:items-center justify-center sm:p-6">
            <div
              ref={leaseDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lease-title"
              className="relative w-full max-w-2xl bg-canvas rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-8 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:pb-8 shadow-[var(--shadow-float)] animate-sheet-up"
            >
              <button
                type="button"
                onClick={() => setIsAgreementModalOpen(false)}
                className="btn-icon !w-9 !h-9 absolute top-5 right-5"
                aria-label="Close agreement"
              >
                <X className="w-4 h-4" />
              </button>

              <p className="eyebrow pr-12">Lease agreement</p>
              <h3 id="lease-title" className="heading text-[28px] sm:text-[32px] mt-3 pr-10">
                Sign your lease
              </h3>
              <p className="text-[15px] text-body mt-2">Required before the hub agent hands over the keys.</p>

              <div className="mt-6 flex items-center gap-4">
                <img
                  src={selectedVehicle.image}
                  alt=""
                  className="w-20 h-16 rounded-[18px] object-cover shrink-0 bg-ash"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{selectedVehicle.model}</p>
                  <p className="text-[14px] text-muted num">
                    {selectedVehicle.type} · ₹{selectedVehicle.hourlyRate}/hr · ₹{selectedVehicle.dailyRate}/day
                  </p>
                </div>
                {isPreReservation && <span className="badge badge-neutral hidden sm:inline-flex">Pre-reservation</span>}
              </div>

              <form onSubmit={handleCompleteAgreement} className="mt-7 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rental-duration" className="label">
                      Duration
                    </label>
                    <select
                      id="rental-duration"
                      value={rentalDuration}
                      onChange={(e) => setRentalDuration(e.target.value)}
                      className="field"
                    >
                      <option>2 Hours</option>
                      <option>4 Hours</option>
                      <option>8 Hours</option>
                      <option>Full Day (24h)</option>
                      <option>Weekend (2 Days)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rental-hub" className="label">
                      Pickup hub
                    </label>
                    <select
                      id="rental-hub"
                      value={pickupHub}
                      onChange={(e) => setPickupHub(e.target.value)}
                      className="field"
                    >
                      <option>Gate 1 UniGo Hub (ECR Entrance)</option>
                      <option>Library Hub & Parking Dock</option>
                      <option>Gate 2 Kalapet Entrance</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rental-phone" className="label">
                      Phone number
                    </label>
                    <input
                      id="rental-phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9XXXX XXXXX"
                      className="field num"
                    />
                  </div>

                  <div>
                    <label htmlFor="rental-roll" className="label">
                      PU roll number <span className="font-normal text-muted">(optional)</span>
                    </label>
                    <input
                      id="rental-roll"
                      type="text"
                      value={rollNo}
                      onChange={(e) => setRollNo(e.target.value)}
                      autoComplete="off"
                      className="field font-mono uppercase"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label htmlFor="rental-dl" className="label">
                      Driving licence number
                    </label>
                    <input
                      id="rental-dl"
                      type="text"
                      required
                      value={dlNumber}
                      onChange={(e) => setDlNumber(e.target.value)}
                      placeholder="TN-01-2022-XXXXXXX"
                      autoComplete="off"
                      className="field font-mono uppercase"
                    />
                  </div>
                </div>

                {/* Documents checked at pickup */}
                <div className="flex gap-3 rounded-[18px] bg-paper p-4 text-[14px] text-body leading-relaxed">
                  <IdCard className="w-5 h-5 text-forest shrink-0 mt-0.5" aria-hidden="true" />
                  <p>
                    Bring your original <strong className="font-semibold text-ink">driving licence</strong> and{' '}
                    <strong className="font-semibold text-ink">PU student ID</strong> to the hub. The agent checks
                    both before handing over the keys. The campus speed limit is{' '}
                    <strong className="font-semibold text-ink">30 km/h</strong>.
                  </p>
                </div>

                {/* Signature pad */}
                <div>
                  <div className="flex items-end justify-between gap-3 mb-2">
                    <div>
                      <p className="label !mb-0">Signature</p>
                      <p className="text-[13px] text-muted">Draw with your finger or mouse</p>
                    </div>
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="btn btn-link !text-[13px] !gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                      Clear
                    </button>
                  </div>

                  <div className="relative rounded-[18px] bg-canvas shadow-[var(--shadow-ring)] overflow-hidden">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-5 right-5 bottom-[22%] flex items-end gap-2 text-subtle"
                    >
                      <span className="text-[15px] leading-none">×</span>
                      <span className="flex-1 border-b border-dashed border-hairline" />
                    </span>
                    {!hasSigned && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] text-subtle"
                      >
                        Sign here
                      </span>
                    )}
                    <canvas
                      ref={canvasRef}
                      width={560}
                      height={140}
                      onPointerDown={(e) => {
                        if (typedSignature) clearSignature();
                        startDrawing(e);
                      }}
                      onPointerMove={draw}
                      onPointerUp={stopDrawing}
                      onPointerCancel={stopDrawing}
                      aria-hidden="true"
                      className="relative block w-full aspect-[4/1] cursor-crosshair touch-none"
                    />
                  </div>
                  <label htmlFor="typed-signature" className="mt-3 block text-[13px] text-muted">
                    Or type your full name to sign
                  </label>
                  <input
                    id="typed-signature"
                    value={typedSignature}
                    onChange={(e) => signByTyping(e.target.value)}
                    autoComplete="name"
                    className="field mt-1.5"
                  />
                </div>

                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={hasAgreedTerms}
                    onChange={(e) => {
                      setHasAgreedTerms(e.target.checked);
                      setFormError('');
                    }}
                    className="mt-0.5 w-[18px] h-[18px] shrink-0 accent-forest cursor-pointer"
                  />
                  <span className="text-[14px] text-body leading-snug">
                    I hold a valid driving licence, I am a registered Pondicherry University student, and I will
                    wear an ISI-marked helmet at all times while riding.
                  </span>
                </label>

                {formError && (
                  <p role="alert" className="rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
                    {formError}
                  </p>
                )}

                {/* Booking summary */}
                <div className="surface p-5 sm:p-6">
                  <dl className="divide-y divide-hairline text-[15px]">
                    <SummaryRow label="Rider">
                      {user?.name || user?.email}
                      {rollNo.trim() && (
                        <span className="block font-mono text-[13px] text-muted font-normal uppercase">{rollNo.trim()}</span>
                      )}
                    </SummaryRow>
                    <SummaryRow label="Helmets">
                      <span className="num">{selectedVehicle.helmetsIncluded}</span>, ISI-marked
                    </SummaryRow>
                    <SummaryRow label="Duration">{rentalDuration}</SummaryRow>
                    <SummaryRow label="Pickup hub">{pickupHub}</SummaryRow>
                  </dl>
                  <div className="mt-4 pt-4 border-t border-hairline flex items-end justify-between gap-4">
                    <span className="text-[15px] font-semibold text-ink">Total</span>
                    <span className="font-display font-black text-[36px] leading-none text-ink num [font-stretch:112%]">
                      ₹{shownTotal}
                    </span>
                  </div>
                </div>

                <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="btn btn-primary btn-lg w-full">
                  {isSubmitting ? 'Saving your lease…' : isPreReservation ? 'Sign and pre-reserve' : 'Sign and confirm rental'}
                  {!isSubmitting && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Confirmed rental receipt */}
      {confirmedBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 backdrop-blur-sm animate-fade-in">
          <div className="min-h-full flex items-end sm:items-center justify-center sm:p-6">
            <div
              ref={receiptDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="receipt-title"
              className="relative w-full max-w-md bg-canvas rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-8 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:pb-8 shadow-[var(--shadow-float)] animate-sheet-up"
            >
              <span className="w-12 h-12 rounded-full bg-lime text-forest flex items-center justify-center animate-pop-in">
                <Check className="w-6 h-6" strokeWidth={3} aria-hidden="true" />
              </span>

              <p className="eyebrow mt-6">Lease signed</p>
              {confirmedBooking.pre_reserved ? (
                <>
                  <h3 id="receipt-title" className="heading text-[28px] mt-2">
                    Pre-reservation confirmed
                  </h3>
                  <p className="text-[15px] text-body mt-2 leading-relaxed">
                    We will hold the <strong className="font-semibold text-ink">{confirmedBooking.vehicle_name}</strong>{' '}
                    for you. Collect it at <strong className="font-semibold text-ink">{confirmedBooking.pickup_hub}</strong>{' '}
                    once it is back; the hub will call you.
                  </p>
                </>
              ) : (
                <>
                  <h3 id="receipt-title" className="heading text-[28px] mt-2">
                    Ready for pickup
                  </h3>
                  <p className="text-[15px] text-body mt-2 leading-relaxed">
                    Your lease for <strong className="font-semibold text-ink">{confirmedBooking.vehicle_name}</strong> is
                    on record. Head to <strong className="font-semibold text-ink">{confirmedBooking.pickup_hub}</strong>.
                  </p>
                </>
              )}

              <dl className="surface p-5 mt-6 divide-y divide-hairline text-[15px]">
                <SummaryRow label="Lease ID">
                  <span className="font-mono text-[14px]">{shortRef(confirmedBooking.id)}</span>
                </SummaryRow>
                <SummaryRow label="Duration">{confirmedBooking.duration}</SummaryRow>
                <SummaryRow label="Pickup hub">{confirmedBooking.pickup_hub}</SummaryRow>
                <SummaryRow label="Total">
                  <span className="num font-semibold">₹{confirmedBooking.total_amount}</span>
                </SummaryRow>
              </dl>

              <p className="mt-5 flex items-start gap-2.5 text-[14px] text-body">
                <IdCard className="w-4 h-4 text-forest shrink-0 mt-0.5" aria-hidden="true" />
                Bring your original driving licence and PU student ID card.
              </p>

              <button type="button" onClick={() => setConfirmedBooking(null)} className="btn btn-forest w-full mt-7">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
