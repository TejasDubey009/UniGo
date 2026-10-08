import React from 'react';
import { useApp } from '../context/useApp';
import { MapPin } from 'lucide-react';
import { Wordmark } from './ui';

const CURRENT_YEAR = new Date().getFullYear();

const SERVICE_LINKS = [
  { id: 'rides', label: 'Campus rides' },
  { id: 'rental', label: 'Scooter rental' },
  { id: 'laundry', label: 'Hostel laundry' },
  { id: 'food', label: 'Midnight food' },
  { id: 'party', label: 'Party planning' },
];

export default function Footer() {
  const { setActiveTab } = useApp();

  const linkClass =
    'text-body hover:text-forest underline-offset-4 hover:underline decoration-[1.5px] transition-colors duration-150';

  return (
    <footer className="w-full bg-paper select-none">
      <div className="max-w-[1280px] mx-auto px-5 lg:px-8 pt-16 sm:pt-20 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-12 pb-14">
          <div className="space-y-6 max-w-sm">
            <Wordmark />
            <p className="text-[15px] text-body leading-relaxed">
              Rides, rentals, laundry and late-night food for Pondicherry University students, all on
              one campus map.
            </p>
            <p className="flex items-start gap-2 text-[14px] text-body">
              <MapPin className="w-4 h-4 mt-0.5 text-forest shrink-0" aria-hidden="true" />
              Pondicherry University, East Coast Road, Kalapet, Puducherry 605014
            </p>
          </div>

          <div>
            <h4 className="eyebrow mb-5">Services</h4>
            <ul className="space-y-3 text-[15px]">
              {SERVICE_LINKS.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => setActiveTab(l.id)} className={linkClass}>
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Oversized logotype sign-off, cropped by the footer edge */}
        <div className="overflow-hidden border-t border-hairline pt-8" aria-hidden="true">
          <p className="wordmark text-[min(330px,calc((100vw-72px)/3.6))] leading-[0.8] text-ash text-center -mb-[0.1em]">
            UniGo
          </p>
        </div>

        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-muted">
          <p>© {CURRENT_YEAR} UniGo Technologies. Made for Pondicherry University students.</p>
          <p>Ride smarter with UniGo.</p>
        </div>
      </div>
    </footer>
  );
}
