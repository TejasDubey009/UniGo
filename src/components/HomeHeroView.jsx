import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/useApp';
import { useCountUp, useInView } from '../hooks/useMotion';
import { Reveal, Segmented } from './ui';
import CampusMap3D from './LazyCampusMap3D';
import GoogleCampus3DMap from './GoogleCampus3DMap';
import { ArrowRight, Satellite, Map as MapIcon } from 'lucide-react';

const HEADLINE = [['Ride.', 'Rent.'], ['Rinse.', 'Repeat.']];

// Sample trips cycled in the hero to show what a ₹20 hop looks like
const SAMPLE_ROUTES = [
  { from: 'Gate 1', to: 'SJC', fare: 20, mins: 3 },
  { from: 'Central Library', to: 'Bharathiar Hostel', fare: 20, mins: 4 },
  { from: 'Science Complex', to: 'Gate 2', fare: 20, mins: 3 },
  { from: 'Mother Teresa Hostel', to: 'Rock Beach', fare: 68, mins: 18 },
];

const CAPTAINS_ON_DUTY = 8;

const TESTIMONIALS = [
  {
    quote:
      'I book laundry from Mother Teresa hostel on the map, the runner collects it from the common hall, and it is back steam-ironed the next evening.',
    student: 'Priya Nair',
    dept: 'MBA International Business',
    hostel: 'Mother Teresa Hostel',
  },
  {
    quote:
      'Rented the Ather from Gate 1 for a weekend down ECR to Auroville and Rock Beach. The lease took thirty seconds to sign on my phone.',
    student: 'Arjun Sharma',
    dept: 'M.Sc. Computer Science',
    hostel: 'Subramania Bharathiar Hostel',
  },
  {
    quote:
      'Science Complex to Gate 1 in the afternoon sun used to be a trek. Now a captain picks me up in about three minutes for twenty rupees.',
    student: 'Sneha Patel',
    dept: 'Ph.D. Biotechnology',
    hostel: 'Madame Curie Hostel',
  },
];

const PASSES = [
  { name: 'Unlimited campus rides', price: '₹499', per: 'month' },
  { name: 'Semester laundry pass', price: '₹1,299', per: '20 kg' },
  { name: 'Weekend beach scooter', price: '₹799', per: '2 weekends' },
];

function RouteTicker() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % SAMPLE_ROUTES.length), 2800);
    return () => clearInterval(id);
  }, []);

  const route = SAMPLE_ROUTES[index];

  return (
    <div
      className="inline-flex items-center gap-3 px-4 sm:pr-5 py-2.5 sm:py-0 sm:h-11 rounded-[18px] sm:rounded-full bg-canvas shadow-[var(--shadow-ring)] text-[14px] max-w-full"
      aria-live="polite"
    >
      <span className="eyebrow !text-[11px] !text-forest hidden sm:inline">Now</span>
      <span
        key={index}
        className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 animate-pop-in"
      >
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-forest shrink-0" aria-hidden="true" />
          <span className="font-semibold text-ink">{route.from}</span>
          <svg width="36" height="6" className="shrink-0 text-forest" aria-hidden="true">
            <line x1="0" y1="3" x2="36" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="route-draw" />
          </svg>
          <span className="w-2.5 h-2.5 rounded-full bg-lime ring-2 ring-forest shrink-0" aria-hidden="true" />
          <span className="font-semibold text-ink">{route.to}</span>
        </span>
        <span className="text-muted whitespace-nowrap num">
          ₹{route.fare} · {route.mins} min
        </span>
      </span>
    </div>
  );
}

function LiveStat({ value, label, suffix = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const shown = useCountUp(inView ? value : 0, 900);
  return (
    <div ref={ref} className="flex items-baseline gap-2">
      <span className="font-display font-black text-[28px] leading-none text-ink num [font-stretch:112%]">
        {shown}
        {suffix}
      </span>
      <span className="text-[14px] text-muted">{label}</span>
    </div>
  );
}

export default function HomeHeroView() {
  const { setActiveTab, rentalSettings, fleet } = useApp();
  const [mapEngine, setMapEngine] = useState('webgl');

  const freeScooters = fleet.filter((v) => v.available).length;

  const services = [
    {
      id: 'rides',
      title: 'Rides',
      tagline: 'Flat ₹20 anywhere inside campus',
      desc: 'Verified student captains between gates, hostels, SJC and the Science Complex, plus subsidised drops to Auroville and Rock Beach.',
      status: { tone: 'live', text: `${CAPTAINS_ON_DUTY} captains on duty` },
    },
    {
      id: 'rental',
      title: 'Rental',
      tagline: 'Activa, Jupiter, Ather EV & Hunter 350',
      desc: 'Self-drive by the hour or day. Sign the lease on your phone, show your DL and student ID at the Gate 1 hub, ride off.',
      status: rentalSettings.isAvailable
        ? { tone: 'live', text: `${freeScooters} available now` }
        : { tone: 'neutral', text: `Back at ${rentalSettings.nextAvailableTime}` },
    },
    {
      id: 'laundry',
      title: 'Laundry',
      tagline: '24-hour turnaround, wash or wash + iron',
      desc: 'Pin your hostel on the 3D map. A runner collects from your floor, barcodes every bag and brings it back the next day.',
      status: { tone: 'ghost', text: 'Pickup in 45 min' },
    },
    {
      id: 'food',
      title: 'Food',
      tagline: 'Midnight canteen, zero surge fees',
      desc: 'Exam-night Maggi, canteen dosas and Kalapet rolls delivered to your hostel entrance until 3 AM.',
      status: { tone: 'neutral', text: 'Coming soon' },
    },
    {
      id: 'party',
      title: 'Party',
      tagline: 'Birthdays and hostel-night plans',
      desc: 'Cakes, decor and a venue on campus, booked together and split with friends.',
      status: { tone: 'neutral', text: 'Coming soon' },
    },
  ];

  let wordIndex = 0;

  return (
    <div className="pb-24">
      {/* Hero */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-20 text-center">
        <div className="flex justify-center animate-fade-in">
          <span className="badge badge-ghost !h-8 !px-3.5 !text-[13px]">
            <span className="live-dot" aria-hidden="true" />
            Live at Pondicherry University, Kalapet
          </span>
        </div>

        <h1 className="display mt-8 text-[56px] sm:text-[96px] lg:text-[128px]" aria-label="Ride. Rent. Rinse. Repeat.">
          {HEADLINE.map((line, li) => (
            <span key={li} className="block" aria-hidden="true">
              {line.map((word) => {
                const delay = 120 + wordIndex++ * 90;
                return (
                  <span key={word} className="word-mask mx-[0.12em]">
                    <span className="word-rise" style={{ '--word-delay': `${delay}ms` }}>
                      {word}
                    </span>
                  </span>
                );
              })}
            </span>
          ))}
        </h1>

        <Reveal delay={420}>
          <p className="mt-8 text-[17px] sm:text-xl text-body max-w-2xl mx-auto leading-relaxed [text-wrap:pretty]">
            Flat ₹20 bike rides between hostels and departments, self-drive scooters from Gate 1, and
            24-hour laundry collected from your hostel floor. Built for Pondicherry University.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-7">
            <button type="button" onClick={() => setActiveTab('rides')} className="btn btn-primary btn-lg">
              Book a ride · ₹20
              <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setActiveTab('rental')} className="btn btn-link text-[16px]">
              Rent a scooter
            </button>
          </div>

          <div className="mt-10 flex justify-center">
            <RouteTicker />
          </div>
        </Reveal>
      </section>

      {/* Live campus stage: the 3D map is the product's hero image */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 mt-16 sm:mt-20">
        <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-6">
          <div className="text-left">
            <p className="eyebrow mb-2">800-acre campus, live</p>
            <h2 className="heading text-[30px] sm:text-[40px]">Find any gate, block or hostel in 3D</h2>
          </div>
          <Segmented
            ariaLabel="Map engine"
            value={mapEngine}
            onChange={setMapEngine}
            options={[
              { value: 'webgl', label: 'Map', icon: MapIcon },
              { value: 'google3d', label: 'Satellite', icon: Satellite },
            ]}
          />
        </Reveal>

        <Reveal delay={80}>
          <div className="media-frame h-[540px] sm:h-[660px]">
            {mapEngine === 'google3d' ? <GoogleCampus3DMap /> : <CampusMap3D />}
          </div>
        </Reveal>

        <Reveal className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-10 border-t border-hairline pt-8">
          <LiveStat value={CAPTAINS_ON_DUTY} label="captains on duty" />
          <LiveStat value={freeScooters} label={`of ${fleet.length} scooters free`} />
          <LiveStat value={45} suffix="m" label="to your laundry pickup" />
        </Reveal>
      </section>

      {/* Services index */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 mt-28 sm:mt-36">
        <Reveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <p className="eyebrow mb-4">What you can book</p>
            <h2 className="display text-[44px] sm:text-[72px]">One app for<br />campus life</h2>
          </div>
          <p className="text-[17px] text-body max-w-md leading-relaxed">
            Every service runs from the same campus map, the same student ID and the same coin
            balance.
          </p>
        </Reveal>

        <ul className="border-t border-ink">
          {services.map((srv, i) => (
            <Reveal as="li" key={srv.id} delay={i * 60} className="border-b border-hairline">
              <button
                type="button"
                onClick={() => setActiveTab(srv.id)}
                className="group w-full text-left grid grid-cols-[auto_1fr_auto] lg:grid-cols-[72px_1fr_1.3fr_250px] items-center gap-x-5 lg:gap-x-8 gap-y-2 py-7 sm:py-8 px-1 sm:px-3 rounded-2xl transition-colors duration-200 hover:bg-paper"
              >
                <span className="font-display font-black text-[15px] text-subtle num self-start pt-2 lg:pt-0 lg:self-center">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block heading text-[30px] sm:text-[40px] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-1">
                    {srv.title}
                  </span>
                  <span className="block text-[15px] font-semibold text-forest mt-1">{srv.tagline}</span>
                </span>
                <span className="hidden lg:block text-[15px] text-body leading-relaxed max-w-lg">{srv.desc}</span>
                <span className="flex items-center gap-4 justify-self-end">
                  <span
                    className={`badge hidden sm:inline-flex ${
                      srv.status.tone === 'live' ? 'badge-lime' : srv.status.tone === 'ghost' ? 'badge-ghost' : 'badge-neutral'
                    }`}
                  >
                    {srv.status.tone === 'live' && <span className="live-dot" aria-hidden="true" />}
                    {srv.status.text}
                  </span>
                  <span className="w-12 h-12 rounded-full flex items-center justify-center bg-ash text-ink transition-[background-color,transform] duration-200 group-hover:bg-lime group-hover:text-forest group-hover:-rotate-45">
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </span>
                </span>
                <span className="col-span-3 lg:hidden text-[15px] text-body leading-relaxed">{srv.desc}</span>
              </button>
            </Reveal>
          ))}
        </ul>
      </section>

      {/* Campus Pass */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 mt-28 sm:mt-36">
        <Reveal className="surface-feature p-8 sm:p-14 lg:p-16 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center overflow-hidden">
          <div>
            <p className="eyebrow !text-lime mb-5">Campus Pass & gift cards</p>
            <h2 className="display !text-white text-[44px] sm:text-[68px]">Save up to 40% all semester</h2>
            <p className="mt-6 text-[17px] text-white/75 max-w-lg leading-relaxed">
              Load your UniGo card once for automatic laundry pickups, priority scooter holds for
              weekend trips and unlimited campus rides. Passes can also be gifted to a friend's PU email.
            </p>
            <button
              type="button"
              onClick={() => setActiveTab('user-dashboard')}
              className="btn btn-primary btn-lg mt-9"
            >
              Check your coin balance
              <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
            </button>
          </div>

          <ul className="divide-y divide-white/15 border-y border-white/15">
            {PASSES.map((pass) => (
              <li key={pass.name} className="flex items-baseline justify-between gap-6 py-6">
                <span className="text-[17px] font-semibold text-white">{pass.name}</span>
                <span className="text-right shrink-0">
                  <span className="font-display font-black text-[34px] sm:text-[40px] leading-none text-lime num [font-stretch:112%]">
                    {pass.price}
                  </span>
                  <span className="block text-[13px] text-white/60 mt-1">per {pass.per}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Testimonials */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 mt-28 sm:mt-36">
        <Reveal>
          <p className="eyebrow mb-4">Heard on campus</p>
          <h2 className="heading text-[30px] sm:text-[40px] max-w-xl">Students who stopped walking to Gate 1</h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 md:divide-x divide-hairline border-t border-hairline">
          {TESTIMONIALS.map((t, i) => (
            <Reveal
              as="figure"
              key={t.student}
              delay={i * 90}
              className="pt-8 pb-2 md:px-8 first:md:pl-0 last:md:pr-0 flex flex-col justify-between gap-8 border-b border-hairline md:border-b-0 pb-8 md:pb-2"
            >
              <blockquote className="text-[18px] sm:text-[19px] leading-relaxed text-ink [text-wrap:pretty]">
                “{t.quote}”
              </blockquote>
              <figcaption className="text-[14px]">
                <span className="block font-semibold text-ink">{t.student}</span>
                <span className="block text-muted">
                  {t.dept} · {t.hostel}
                </span>
              </figcaption>
            </Reveal>
          ))}
        </div>
      </section>
    </div>
  );
}
