import React, { useState, useRef } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabase';
import { celebrate } from '../lib/celebrate';
import { PageHeader, Reveal } from './ui';

const EVENT_TYPES = [
  'Midnight hostel room surprise',
  'Kalapet beach sunset jam',
  'Polaroid and film memories',
  'Farewell or department treat',
];

const CAKE_OPTIONS = [
  'Belgian chocolate truffle (1 kg)',
  'Red velvet cream cheese (1 kg)',
  'Fresh blueberry cheesecake (1 kg)',
  'Black forest classic (1 kg)',
  'No cake, decor and setup only',
];

const PACKAGES = [
  {
    title: 'Midnight hostel surprise',
    eventType: EVENT_TYPES[0],
    price: '₹1,199',
    tag: 'Hostel',
    perks: [
      'Fresh 1 kg bakery cake delivered at 11:55 PM',
      'Fairy lights and 15 helium balloons',
      'Celebration banner for the room door',
      'Candles, party popper and matches',
      'Hostel gate clearance arranged in advance',
    ],
  },
  {
    title: 'Kalapet beach sunset jam',
    eventType: EVENT_TYPES[1],
    price: '₹2,999',
    tag: 'Beach',
    perks: [
      'Beach tent and floor seating at Kalapet Beach',
      'Portable JBL speaker',
      'Permitted bonfire setup',
      'Drinks cooler and pizza delivered to the beach',
      'UniGo scooter pickup and drop included',
    ],
  },
  {
    title: 'Polaroid and film memories',
    eventType: EVENT_TYPES[2],
    price: '₹899',
    tag: 'Rental',
    perks: [
      'Fujifilm Instax Mini camera for 24 hours',
      '20 instant colour prints included',
      'Mini album with college stickers',
      'Return at the Gate 1 hub the next morning',
    ],
  },
];

export default function PartyPlanningView() {
  const { user, requireAuth, saveProfileDetails } = useApp();
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [date, setDate] = useState('');
  const [venue, setVenue] = useState('');
  const [cakeFlavor, setCakeFlavor] = useState(CAKE_OPTIONS[0]);
  const [phone, setPhone] = useState(user?.phone || '');
  const [notes, setNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [inquirySent, setInquirySent] = useState(false);
  const plannerRef = useRef(null);

  // Fill the phone from the student's profile once it arrives
  const [filledFor, setFilledFor] = useState(user?.key);
  if (user && user.key !== filledFor) {
    setFilledFor(user.key);
    if (!phone) setPhone(user.phone);
  }

  const handleSendInquiry = async (e) => {
    e.preventDefault();
    if (isSending) return;
    if (!requireAuth('Sign in with your university account to send a party request.')) return;

    setIsSending(true);
    setError('');
    const { error: sendError } = await supabase.from('party_inquiries').insert({
      contact_name: user.name || user.email.split('@')[0],
      phone: phone.trim(),
      occasion: eventType,
      event_when: date.trim(),
      venue: venue.trim(),
      cake: cakeFlavor,
      notes: notes.trim() || null,
    });
    setIsSending(false);
    if (sendError) {
      setError("Couldn't send your request. Please try again.");
      return;
    }
    setInquirySent(true);
    saveProfileDetails({ phone: phone.trim() });
    celebrate(120);
  };

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="UniGo Party · coming soon"
        title="Hostel birthdays, planned"
        description="Surprise a friend at midnight without getting caught, or take the group to Kalapet Beach for sunset. We bring the cake, the fairy lights and the Instax, and sort out the hostel gate."
        aside={<span className="badge badge-neutral !h-8 !px-3.5 !text-[13px]">Taking requests now</span>}
      />

      {/* Packages */}
      <section className="mt-16 sm:mt-24" aria-labelledby="party-packages-title">
        <Reveal className="mb-8">
          <p className="eyebrow mb-3">Packages</p>
          <h2 id="party-packages-title" className="heading text-[30px] sm:text-[40px]">
            Three ways to celebrate
          </h2>
        </Reveal>

        <ul className="border-t border-ink">
          {PACKAGES.map((pkg, i) => (
            <Reveal
              as="li"
              key={pkg.title}
              delay={i * 60}
              className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-6 lg:gap-12 py-8 sm:py-10 border-b border-hairline"
            >
              <div>
                <span className="badge badge-neutral">{pkg.tag}</span>
                <h3 className="heading text-[26px] sm:text-[32px] mt-4">{pkg.title}</h3>
                <p className="mt-3 font-display font-black text-[30px] leading-none text-ink num [font-stretch:112%]">
                  {pkg.price}
                </p>
              </div>

              <ul className="space-y-2.5 lg:pt-1">
                {pkg.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2.5 text-[15px] text-body leading-relaxed">
                    <Check className="w-4 h-4 text-forest shrink-0 mt-1" strokeWidth={2.5} aria-hidden="true" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>

              <div className="lg:pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEventType(pkg.eventType);
                    setInquirySent(false);
                    plannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="btn btn-outline w-full sm:w-auto"
                >
                  Plan this
                  <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
                </button>
              </div>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Inquiry planner */}
      <section
        ref={plannerRef}
        className="mt-24 sm:mt-32 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 scroll-mt-28"
        aria-labelledby="party-planner-title"
      >
        <Reveal className="lg:col-span-5">
          <p className="eyebrow mb-4">Plan an event</p>
          <h2 id="party-planner-title" className="heading text-[30px] sm:text-[40px]">
            Tell us what you have in mind
          </h2>
          <p className="mt-4 text-[17px] text-body leading-relaxed max-w-md">
            Send the details and a student event planner calls or WhatsApps you with cake photos and decorator
            slots.
          </p>
        </Reveal>

        <div className="lg:col-span-7">
          {!inquirySent ? (
            <form onSubmit={handleSendInquiry} className="surface p-5 sm:p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="party-occasion" className="label">
                    Occasion
                  </label>
                  <select
                    id="party-occasion"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="field"
                  >
                    {EVENT_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="party-date" className="label">
                    Date and time
                  </label>
                  <input
                    id="party-date"
                    type="text"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    placeholder="e.g. 12 Oct, 11:50 PM"
                    className="field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="party-location" className="label">
                    Hostel or venue
                  </label>
                  <input
                    id="party-location"
                    type="text"
                    required
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="e.g. Mother Teresa Hostel, 3rd floor"
                    className="field"
                  />
                </div>

                <div>
                  <label htmlFor="party-cake" className="label">
                    Cake
                  </label>
                  <select
                    id="party-cake"
                    value={cakeFlavor}
                    onChange={(e) => setCakeFlavor(e.target.value)}
                    className="field"
                  >
                    {CAKE_OPTIONS.map((cake) => (
                      <option key={cake}>{cake}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="party-phone" className="label">
                    Phone for the planner
                  </label>
                  <input
                    id="party-phone"
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
                  <label htmlFor="party-notes" className="label">
                    Anything else <span className="font-normal text-muted">(optional)</span>
                  </label>
                  <input
                    id="party-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. 8 friends, it's a surprise"
                    className="field"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
                  {error}
                </p>
              )}

              <button type="submit" disabled={isSending} aria-busy={isSending} className="btn btn-primary btn-lg w-full !mt-7">
                {isSending ? 'Sending…' : 'Send inquiry'}
                {!isSending && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
              </button>
            </form>
          ) : (
            <div role="status" className="surface p-6 sm:p-8 animate-pop-in">
              <span className="w-12 h-12 rounded-full bg-lime text-forest flex items-center justify-center">
                <Check className="w-6 h-6" strokeWidth={3} aria-hidden="true" />
              </span>
              <h3 className="heading text-[26px] sm:text-[30px] mt-5">Inquiry sent</h3>
              <p className="mt-2 text-[15px] text-body leading-relaxed max-w-md">
                A planner will call or WhatsApp you at <span className="font-semibold text-ink num">{phone}</span> with cake
                photos and decorator slots for <span className="font-semibold text-ink">{venue}</span>.
              </p>
              <button type="button" onClick={() => setInquirySent(false)} className="btn btn-quiet mt-6">
                Plan another event
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
