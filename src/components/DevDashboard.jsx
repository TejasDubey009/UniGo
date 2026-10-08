import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { getLastFps } from '../context/telemetry';
import { GIRLS_HOSTELS, BOYS_HOSTELS, PU_LANDMARKS } from '../data/campusData';
import { useCountUp, useInView } from '../hooks/useMotion';
import { PageHeader, Reveal } from './ui';
import {
  Activity,
  RotateCcw,
  Copy,
  Check,
  Shirt,
  Navigation
} from 'lucide-react';

const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

// Log tags inside the console: lime for bookings, gold for admin and dev actions, alert for resets
const LOG_TAG = {
  LAUNDRY: 'text-lime',
  RENTAL: 'text-lime',
  RIDES: 'text-lime',
  ADMIN: 'text-gold',
  DEV: 'text-gold',
  RESET: 'bg-alert text-white rounded px-1',
};

const JSON_TABS = {
  laundry: 'Laundry',
  fleet: 'Fleet',
  rentals: 'Rentals',
  rides: 'Rides',
  settings: 'Settings',
};

const RENDERER_SPECS = [
  ['Renderer', 'WebGL 2.0 (Three.js)'],
  ['Camera', 'Perspective, FOV 45°'],
  ['Shadows', 'PCFShadowMap, 2048'],
  ['Tone mapping', 'ACES Filmic'],
];

// One telemetry figure in a hairline-separated row; counts up the first time it scrolls into view
function Stat({ label, value, text, unit, hint, hintClass = 'text-muted', title, index }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const shown = useCountUp(inView ? (value ?? 0) : 0, 700);
  const edges = [
    index % 2 === 1 && 'border-l pl-5',
    index >= 2 && 'border-t lg:border-t-0',
    index > 0 && 'lg:border-l lg:pl-8',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={ref} title={title} className={`border-hairline py-6 pr-3 min-w-0 ${edges}`}>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-2 font-display font-black text-[28px] sm:text-[40px] leading-none text-ink num [font-stretch:112%]">
        {text ?? shown}
        {unit && <span className="ml-1.5 font-sans text-[15px] font-semibold text-muted">{unit}</span>}
      </dd>
      {hint && <dd className={`mt-2 text-[13px] ${hintClass}`}>{hint}</dd>}
    </div>
  );
}

function Trigger({ icon: Icon, title, detail, aside, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-[18px] bg-canvas shadow-[var(--shadow-ring)] transition-[box-shadow,transform] duration-150 hover:shadow-[0_0_0_1px_var(--color-subtle)] active:scale-[0.99]"
    >
      <span className="w-10 h-10 rounded-full bg-ash text-ink flex items-center justify-center shrink-0 transition-colors duration-150 group-hover:bg-lime group-hover:text-forest">
        <Icon className="w-4 h-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block text-[13px] text-muted">{detail}</span>
      </span>
      {aside}
    </button>
  );
}

export default function DevDashboard() {
  const {
    devLogs,
    addDevLog,
    fleet,
    laundryOrders,
    rentalBookings,
    ridesHistory,
    rentalSettings,
    updateRentalSettings,
    addLaundryOrder,
    startRide,
    resetAllToDefaults
  } = useApp();

  // The 3D map isn't mounted on this page, so show the last frame rate it reported
  const [lastFps] = useState(getLastFps);
  const [activeJsonTab, setActiveJsonTab] = useState('laundry'); // 'laundry' | 'fleet' | 'rentals' | 'rides' | 'settings'
  const [copyState, setCopyState] = useState('idle'); // 'idle' | 'copied' | 'failed'
  const copyTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const jsonSources = {
    laundry: laundryOrders,
    fleet,
    rentals: rentalBookings,
    rides: ridesHistory,
    settings: rentalSettings,
  };
  const activeJson = jsonSources[activeJsonTab];

  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(activeJson, null, 2));
      setCopyState('copied');
    } catch {
      // Clipboard API is unavailable on insecure origins or when permission is denied
      setCopyState('failed');
    }
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  const simulateRandomLaundry = () => {
    const names = ['Divya Ramesh', 'Kiran Kumar', 'Siddharth Roy', 'Pooja Hegde', 'Meera Iyer'];
    const chosenHostel = pickRandom([...GIRLS_HOSTELS, ...BOYS_HOSTELS]);
    const chosenType = pickRandom(['Wash Only', 'Wash + Iron']);
    const weight = Number((3 + Math.random() * 4).toFixed(1));

    addLaundryOrder({
      studentName: pickRandom(names),
      phone: '+91 98' + Math.floor(10000000 + Math.random() * 90000000),
      category: chosenHostel.category === 'girls-hostel' ? 'Girls Hostel' : 'Boys Hostel',
      hostelName: chosenHostel.name,
      room: `Room ${Math.floor(100 + Math.random() * 300)}`,
      type: chosenType,
      weightEstimate: `${weight} kg`,
      price: Math.round(weight * (chosenType === 'Wash + Iron' ? 79 : 49)),
      slot: 'Today Evening (05:00 PM - 07:30 PM)',
    });
  };

  const simulateRideMatch = () => {
    const [pickup, drop] = [...PU_LANDMARKS].sort(() => Math.random() - 0.5);
    startRide({
      passenger: 'Dev Tester',
      passengerPhone: '+91 99999 00000',
      pickup: pickup.name,
      drop: drop.name,
      vehicle: 'UniGo Solo Bike',
      fare: 16,
    });
  };

  const fpsHint =
    lastFps === null
      ? 'Open the 3D map to take a sample'
      : lastFps >= 55
        ? 'On target (55 fps and up)'
        : 'Below the 55 fps target';

  return (
    <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-12 sm:pt-16 pb-24">
      <PageHeader
        eyebrow="Developer console"
        title="System monitor"
        description="WebGL render stats, the live event stream and the raw app state. Use the triggers to push test orders and rides through the system."
      />

      {/* Telemetry */}
      <dl className="mt-12 sm:mt-14 grid grid-cols-2 lg:grid-cols-4 border-y border-hairline">
        <Stat
          index={0}
          label="Last WebGL frame rate"
          title="Last frame rate reported by the WebGL 3D campus map"
          value={lastFps}
          text={lastFps === null ? '—' : undefined}
          unit="fps"
          hint={fpsHint}
          hintClass={lastFps !== null && lastFps < 55 ? 'text-alert' : 'text-muted'}
        />
        <Stat index={1} label="PU 3D meshes" value={142} hint="Campus model" />
        <Stat index={2} label="Events logged" value={devLogs.length} hint="Newest 50 kept" />
        <Stat index={3} label="Context store" text="Active" hint="React context, saved locally" />
      </dl>

      <div className="mt-12 sm:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-start">
        {/* Left: sandbox triggers and renderer facts */}
        <div className="lg:col-span-4 min-w-0 space-y-12">
          <section aria-labelledby="triggers-heading" className="surface p-5 sm:p-6">
            <p className="eyebrow mb-2">Sandbox</p>
            <h2 id="triggers-heading" className="heading text-[24px] sm:text-[28px]">
              Triggers
            </h2>

            <div className="mt-5 space-y-2.5">
              <Trigger
                icon={Shirt}
                title="Simulate a laundry order"
                detail="Random hostel and student"
                onClick={simulateRandomLaundry}
              />
              <Trigger
                icon={Navigation}
                title="Dispatch a test ride"
                detail="Random campus pickup and drop"
                onClick={simulateRideMatch}
              />
              <Trigger
                icon={Activity}
                title="Toggle rental availability"
                detail={`Now ${rentalSettings.isAvailable ? 'available' : 'busy'}`}
                aside={
                  <span
                    key={String(rentalSettings.isAvailable)}
                    className={`badge shrink-0 animate-pop-in ${rentalSettings.isAvailable ? 'badge-lime' : 'badge-neutral'}`}
                  >
                    {rentalSettings.isAvailable ? 'On' : 'Off'}
                  </span>
                }
                onClick={() => {
                  updateRentalSettings({ isAvailable: !rentalSettings.isAvailable });
                  addDevLog('DEV', `Toggled Rental Availability to ${!rentalSettings.isAvailable}`);
                }}
              />
            </div>

            <div className="mt-6 pt-6 border-t border-hairline">
              <button type="button" onClick={resetAllToDefaults} className="btn btn-danger w-full">
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                Reset store to demo defaults
              </button>
              <p className="mt-2.5 text-[13px] text-muted text-center">
                Restores the fleet, orders, rides, leases and rental settings.
              </p>
            </div>
          </section>

          <Reveal as="section" aria-labelledby="renderer-heading">
            <h2 id="renderer-heading" className="eyebrow mb-3">
              Renderer
            </h2>
            <dl className="border-t border-hairline divide-y divide-hairline text-[14px]">
              {RENDERER_SPECS.map(([term, detail]) => (
                <div key={term} className="flex justify-between gap-4 py-3">
                  <dt className="text-muted">{term}</dt>
                  <dd className="font-semibold text-ink text-right">{detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        {/* Right: event stream and state inspector */}
        <div className="lg:col-span-8 min-w-0 space-y-12">
          <section aria-labelledby="events-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
              <div>
                <p className="eyebrow mb-2">Event stream</p>
                <h2 id="events-heading" className="heading text-[24px] sm:text-[28px]">
                  System events <span className="text-subtle num">{devLogs.length}</span>
                </h2>
              </div>
              <span className="badge badge-neutral">
                <span className="live-dot" aria-hidden="true" />
                Streaming
              </span>
            </div>

            <div
              role="log"
              aria-label="System events"
              className="console p-4 sm:p-5 max-h-72 overflow-y-auto text-[12px] leading-relaxed"
            >
              <ol className="space-y-2">
                {devLogs.map((log) => (
                  <li
                    key={log.id}
                    className="flex flex-wrap sm:flex-nowrap items-baseline gap-x-3 gap-y-0.5 animate-pop-in"
                  >
                    <span className="text-white/40 shrink-0 tabular-nums">{log.time}</span>
                    <span className={`shrink-0 min-w-[9ch] text-[11px] font-semibold ${LOG_TAG[log.type] || 'text-[#d4dacf]'}`}>
                      [{log.type}]
                    </span>
                    <span className="basis-full sm:basis-auto min-w-0 break-words">{log.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <Reveal as="section" aria-labelledby="state-heading">
            <div className="flex flex-wrap items-end justify-between gap-3 pb-4">
              <div>
                <p className="eyebrow mb-2">Raw state</p>
                <h2 id="state-heading" className="heading text-[24px] sm:text-[28px]">
                  State inspector
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span aria-live="polite" className="text-[13px]">
                  {copyState === 'copied' && <span className="text-forest font-semibold animate-pop-in">Copied</span>}
                  {copyState === 'failed' && <span className="text-alert animate-pop-in">Clipboard unavailable</span>}
                </span>
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="btn btn-sm btn-quiet"
                  title={copyState === 'failed' ? 'Copy failed — clipboard unavailable' : 'Copy JSON'}
                  aria-label="Copy JSON"
                >
                  {copyState === 'copied' ? (
                    <Check className="w-4 h-4 text-forest" aria-hidden="true" />
                  ) : (
                    <Copy className={`w-4 h-4 ${copyState === 'failed' ? 'text-alert' : ''}`} aria-hidden="true" />
                  )}
                  Copy JSON
                </button>
              </div>
            </div>

            <div role="group" aria-label="State source" className="flex flex-wrap gap-2 pb-4">
              {Object.keys(jsonSources).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={activeJsonTab === tab}
                  onClick={() => setActiveJsonTab(tab)}
                  className={`btn btn-sm ${activeJsonTab === tab ? 'btn-forest' : 'btn-quiet'}`}
                >
                  {JSON_TABS[tab]}
                </button>
              ))}
            </div>

            <pre
              key={activeJsonTab}
              className="console p-4 sm:p-5 text-[12px] leading-relaxed max-h-80 overflow-auto animate-fade-in"
            >
              {JSON.stringify(activeJson, null, 2)}
            </pre>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
