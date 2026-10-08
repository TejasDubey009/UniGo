import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { Reveal, Segmented } from './ui';
import CampusMap3D from './LazyCampusMap3D';
import GoogleCampusMap from './GoogleCampusMap';
import { RENTAL_FLEET } from '../data/campusData';
import HERO_PLAN from '../data/heroCampusPlan.json';
import campusPlanUrl from '../assets/campus-plan.svg';
import { CAMPUS_FARE, FIRST_RIDE_DISCOUNT, LAUNDRY_RATES, baseRideFare, rideFare } from '../lib/pricing';
import { ArrowRight, Satellite, Map as MapIcon } from 'lucide-react';

const HEADLINE = [['Ride.', 'Rent.'], ['Rinse.', 'Repeat.']];

const PRICE_LIST = [
  {
    label: 'Rides',
    price: `₹${CAMPUS_FARE}`,
    detail: `Anywhere on campus. ₹${baseRideFare({ passengers: 2 })} for two, first ride ${FIRST_RIDE_DISCOUNT * 100}% off`,
  },
  {
    label: 'Scooters',
    from: true,
    price: `₹${Math.min(...RENTAL_FLEET.map((v) => v.hourlyRate))}/hr`,
    detail: 'Self-drive from the Gate 1 and Library hubs',
  },
  {
    label: 'Laundry',
    from: true,
    price: `₹${LAUNDRY_RATES['Wash Only']}/kg`,
    detail: 'Picked up Wednesday and Sunday, back in two days',
  },
];

// The plan is drawn at a fixed scale per layout (px per map metre), pinned so that map point `at`
// lands `left` px from the hero's centre line and `top` px below its top edge. That keeps the
// route in the margin beside the copy at every width, which a stretch-to-fill crop can't do.
const PLAN_VIEWS = [
  { id: 'phone', className: 'sm:hidden', scale: 0.3, at: [-250, 450], left: 0, top: 520 },
  { id: 'tablet', className: 'hidden sm:block xl:hidden', scale: 0.42, at: [-250, 520], left: 0, top: 460 },
  // Wide screens: the route's last stop (Health Centre) sits 380px left of centre, level with the buttons
  { id: 'wide', className: 'hidden xl:block', scale: 0.5, at: [-574, 809], left: -380, top: 600, route: true },
];

const planBox = ({ scale, at, left, top }, plan) => ({
  width: plan.width * scale,
  height: plan.height * scale,
  left: `calc(50% + ${left - (at[0] - plan.x) * scale}px)`,
  top: top - (at[1] - plan.y) * scale,
});

// A zero-length round-capped stroke: a dot that stays the same size at any scale
const Stop = ({ at, fill }) => (
  <g className="hero-route-stop">
    <path d={`M${at[0]} ${at[1]}h0`} stroke="var(--color-forest)" strokeWidth="15" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    <path d={`M${at[0]} ${at[1]}h0`} stroke={fill} strokeWidth="8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </g>
);

// The real campus in hairlines (from OpenStreetMap). Wide screens also draw one real trip across
// it: Narmatha Hostel to the Health Centre by road. Built by scripts/build-hero-plan.mjs.
function CampusPlanBackdrop() {
  const { plan, route } = HERO_PLAN;
  const viewBox = `${plan.x} ${plan.y} ${plan.width} ${plan.height}`;

  return (
    <div aria-hidden="true" className="absolute inset-0 pointer-events-none select-none">
      {PLAN_VIEWS.map((view) => {
        const box = planBox(view, plan);
        return (
          <div key={view.id} className={`absolute inset-0 ${view.className}`}>
            <div className="hero-plan absolute inset-0 overflow-hidden">
              <svg className="absolute max-w-none" style={box} viewBox={viewBox}>
                <image href={campusPlanUrl} x={plan.x} y={plan.y} width={plan.width} height={plan.height} />
              </svg>
            </div>

            {view.route && (
              <svg className="absolute max-w-none overflow-visible" style={box} viewBox={viewBox}>
                <path
                  d={route.d}
                  pathLength="1"
                  className="hero-route-line"
                  fill="none"
                  stroke="var(--color-forest)"
                  strokeWidth={4 / view.scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <Stop at={route.start} fill="var(--color-canvas)" />
                <Stop at={route.end} fill="var(--color-lime)" />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

// What things cost, as plain rows: three columns on wide screens, stacked on phones
function PriceList() {
  return (
    <dl className="mt-12 sm:mt-14 max-w-[880px] mx-auto grid grid-cols-1 sm:grid-cols-3 text-left border-t sm:border-b border-hairline bg-canvas/80">
      {PRICE_LIST.map((item) => (
        <div
          key={item.label}
          className="grid grid-cols-[88px_1fr] items-baseline gap-x-3 sm:block py-4 sm:py-5 px-0.5 sm:px-6 border-b sm:border-b-0 sm:border-l sm:first:border-l-0 border-hairline"
        >
          <dt className="eyebrow">{item.label}</dt>
          <dd className="sm:mt-2">
            <span className="font-display font-black text-[26px] sm:text-[32px] leading-none text-ink num [font-stretch:112%]">
              {item.from && <span className="mr-1.5 font-sans font-semibold text-[13px] text-muted [font-stretch:100%]">from</span>}
              {item.price}
            </span>
            <span className="block mt-1.5 text-[14px] leading-snug text-muted [text-wrap:pretty]">{item.detail}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function HomeHeroView() {
  const { setActiveTab, fleet } = useApp();
  const [mapEngine, setMapEngine] = useState('webgl');

  const freeVehicles = fleet.filter((v) => v.available).length;

  const services = [
    {
      id: 'rides',
      title: 'Rides',
      tagline: `₹${CAMPUS_FARE} inside campus, ₹${baseRideFare({ passengers: 2 })} for two`,
      desc: `Student captains between gates, hostels, departments and SJC. Off campus is charged by distance, so Rock Beach is ₹${rideFare({ km: 12 })}. Your first ride is ${FIRST_RIDE_DISCOUNT * 100}% off.`,
      status: { tone: 'ghost', text: `First ride ${FIRST_RIDE_DISCOUNT * 100}% off` },
    },
    {
      id: 'rental',
      title: 'Rental',
      tagline: `Scooters and bikes from ₹${Math.min(...RENTAL_FLEET.map((v) => v.hourlyRate))} an hour`,
      desc: 'Activa, Jupiter, Ather 450X, Hero Optima and Hunter 350. Sign the lease on your phone, then show your driving licence and student ID at the hub.',
      status: freeVehicles
        ? { tone: 'live', text: `${freeVehicles} available now` }
        : { tone: 'neutral', text: 'All out on trips' },
    },
    {
      id: 'laundry',
      title: 'Laundry',
      tagline: 'Picked up Wednesday and Sunday, back in two days',
      desc: `₹${LAUNDRY_RATES['Wash Only']} a kg to wash, ₹${LAUNDRY_RATES['Wash + Iron']} with ironing. Pick your hostel on the map and book by the day before pickup.`,
      status: { tone: 'ghost', text: `From ₹${LAUNDRY_RATES['Wash Only']} / kg` },
    },
    {
      id: 'food',
      title: 'Food',
      tagline: 'Late-night food to your hostel',
      desc: 'We are signing up campus and Kalapet kitchens now. Vote for the dishes you want first.',
      status: { tone: 'neutral', text: 'Coming soon' },
    },
    {
      id: 'party',
      title: 'Party',
      tagline: 'Birthdays and hostel nights',
      desc: "Cake, decorations and a place to celebrate. Tell us the date and we'll plan it with you.",
      status: { tone: 'neutral', text: 'Coming soon' },
    },
  ];

  let wordIndex = 0;

  return (
    <div className="pb-24">
      {/* Hero: the copy sits over a hairline plan of the real campus */}
      <div className="relative overflow-hidden">
        <CampusPlanBackdrop />

        <section className="relative max-w-[1280px] mx-auto px-5 lg:px-8 pt-8 sm:pt-20 pb-10 sm:pb-16 text-center">
          <div className="flex justify-center animate-fade-in">
            <span className="badge badge-ghost !h-8 !px-3.5 !text-[13px] bg-canvas">Pondicherry University · Kalapet</span>
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
              Book a ride with a student captain, rent a scooter at Gate 1, or get your laundry picked up from your
              hostel. Sign in with your @pondiuni.ac.in email.
            </p>

            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-5 sm:gap-7">
              <button type="button" onClick={() => setActiveTab('rides')} className="btn btn-primary btn-lg">
                Book a ride
                <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setActiveTab('rental')} className="btn btn-link text-[16px]">
                Rent a scooter
              </button>
            </div>

            <PriceList />
          </Reveal>
        </section>
      </div>

      {/* Campus stage: the 3D map is the product's hero image */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 mt-4 sm:mt-8">
        <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-5 mb-4 sm:mb-6">
          <div className="text-left">
            <p className="eyebrow mb-2">Campus map</p>
            <h2 className="heading text-[26px] sm:text-[40px]">Find any gate, block or hostel in 3D</h2>
          </div>
          <Segmented
            ariaLabel="Map engine"
            value={mapEngine}
            onChange={setMapEngine}
            options={[
              { value: 'webgl', label: 'Map', icon: MapIcon },
              { value: 'satellite', label: 'Satellite', icon: Satellite },
            ]}
          />
        </Reveal>

        <Reveal delay={80}>
          {/* Edge to edge on phones, sized to the screen between the top bar and the tab bar */}
          <div className="media-frame map-bleed h-[min(720px,calc(100svh-var(--tabbar-h)-150px))] min-h-[420px] sm:h-[990px]">
            {mapEngine === 'satellite' ? <GoogleCampusMap /> : <CampusMap3D zoom={2} />}
          </div>
        </Reveal>
      </section>

      {/* Services index */}
      <section className="max-w-[1280px] mx-auto px-5 lg:px-8 mt-16 sm:mt-36">
        <Reveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 mb-6 sm:mb-10">
          <div>
            <p className="eyebrow mb-2 sm:mb-4">Services</p>
            <h2 className="display text-[36px] sm:text-[72px]">What you<br />can book</h2>
          </div>
          <p className="text-[15px] sm:text-[17px] text-body max-w-md leading-relaxed">
            Sign in once with your university email to book any of them.
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
    </div>
  );
}
