import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabase';
import { celebrate } from '../lib/celebrate';
import { PageHeader, Reveal } from './ui';

const EVENT_TYPES = [
  'Birthday in the hostel',
  'Evening at Kalapet Beach',
  'Farewell or department treat',
  'Something else',
];

const CAKE_OPTIONS = [
  'Belgian chocolate truffle (1 kg)',
  'Red velvet cream cheese (1 kg)',
  'Fresh blueberry cheesecake (1 kg)',
  'Black forest classic (1 kg)',
  'No cake, decor and setup only',
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
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-6 sm:pt-16 pb-16 sm:pb-24">
      <PageHeader
        eyebrow="UniGo Party · coming soon"
        title="Hostel birthdays, planned"
        description="Tell us the occasion, the date and the place. We call you back to plan the cake, the decorations and the setup, and give you a price before anything is booked."
        aside={<span className="badge badge-neutral !h-8 !px-3.5 !text-[13px]">Taking requests now</span>}
      />

      {/* Inquiry planner */}
      <section
        className="mt-12 sm:mt-24 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-16"
        aria-labelledby="party-planner-title"
      >
        <Reveal className="lg:col-span-5">
          <p className="eyebrow mb-4">Plan an event</p>
          <h2 id="party-planner-title" className="heading text-[30px] sm:text-[40px]">
            Tell us what you have in mind
          </h2>
          <p className="mt-4 text-[17px] text-body leading-relaxed max-w-md">
            Send the details and we call or WhatsApp you to plan it.
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
