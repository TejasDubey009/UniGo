import React, { useState } from 'react';
import { useApp } from '../context/useApp';
import { useDialog } from '../hooks/useDialog';
import { Map as MapIcon, Route, KeyRound, Shirt, LayoutGrid, Utensils, PartyPopper, Bike, ShieldCheck, LogIn, LogOut, ChevronRight, X } from 'lucide-react';

const TABS = [
  { id: 'home', label: 'Campus', icon: MapIcon },
  { id: 'rides', label: 'Rides', icon: Route },
  { id: 'rental', label: 'Rental', icon: KeyRound },
  { id: 'laundry', label: 'Laundry', icon: Shirt },
];

// Pages that live behind the More tab
const MORE_PAGES = ['food', 'party', 'captain', 'admin'];

function TabButton({ label, icon: Icon, isActive, dot = false, onClick, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 min-w-0 text-[11px] font-semibold transition-colors duration-150 active:scale-95"
      {...rest}
    >
      {/* Active page: a lime pill behind the icon */}
      <span
        className={`relative w-14 h-8 rounded-full flex items-center justify-center transition-colors duration-200 ${
          isActive ? 'bg-lime text-forest' : 'text-muted'
        }`}
      >
        <Icon className="w-[21px] h-[21px]" strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
        {dot && <span className="live-dot absolute top-1 right-3" aria-hidden="true" />}
      </span>
      <span className={`truncate max-w-full ${isActive ? 'text-forest' : 'text-muted'}`}>{label}</span>
    </button>
  );
}

function SheetRow({ icon: Icon, label, hint, badge, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3.5 px-3 py-3 rounded-2xl text-left hover:bg-paper active:bg-ash transition-colors duration-150"
    >
      <span className="w-10 h-10 rounded-full bg-paper flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-forest" aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[16px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[13px] text-muted truncate">{hint}</span>}
      </span>
      {badge || <ChevronRight className="w-4 h-4 text-subtle shrink-0" aria-hidden="true" />}
    </button>
  );
}

// Phone and tablet navigation: four main pages and a More sheet, pinned to the bottom of the screen
export default function TabBar() {
  const { activeTab, setActiveTab, authReady, user, captain, isAdmin, openAuth, signOut } = useApp();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const sheetRef = useDialog(isMoreOpen, () => setIsMoreOpen(false));

  const go = (id) => {
    setIsMoreOpen(false);
    setActiveTab(id);
  };

  return (
    <>
      <nav
        aria-label="Main"
        className="app-tabbar lg:hidden fixed bottom-0 inset-x-0 z-40 bg-canvas/[0.96] backdrop-blur-xl shadow-[0_-1px_0_rgb(14_15_12/0.1)] pb-[env(safe-area-inset-bottom)] select-none"
      >
        <div className="max-w-xl mx-auto grid grid-cols-5 h-16">
          {TABS.map((tab) => (
            <TabButton
              key={tab.id}
              label={tab.label}
              icon={tab.icon}
              isActive={activeTab === tab.id}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              onClick={() => go(tab.id)}
            />
          ))}
          <TabButton
            label="More"
            icon={LayoutGrid}
            isActive={isMoreOpen || MORE_PAGES.includes(activeTab)}
            dot={Boolean(captain?.on_duty)}
            aria-haspopup="dialog"
            aria-expanded={isMoreOpen}
            onClick={() => setIsMoreOpen((open) => !open)}
          />
        </div>
      </nav>

      {isMoreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-ink/40 backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMoreOpen(false);
          }}
        >
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            className="w-full max-h-[85svh] overflow-y-auto overscroll-contain bg-canvas rounded-t-[28px] px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)] shadow-[var(--shadow-float)] animate-sheet-up"
          >
            <div className="flex items-center justify-between px-3 pt-1 pb-2">
              <p className="heading text-[22px]">More</p>
              <button type="button" onClick={() => setIsMoreOpen(false)} className="btn-icon !w-9 !h-9" aria-label="Close">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {captain && (
              <SheetRow
                icon={Bike}
                label="Captain"
                hint={captain.on_duty ? 'You are on duty' : 'Go on duty to get ride requests'}
                badge={captain.on_duty ? <span className="badge badge-lime"><span className="live-dot" aria-hidden="true" />On duty</span> : null}
                onClick={() => go('captain')}
              />
            )}
            {isAdmin && <SheetRow icon={ShieldCheck} label="Admin" hint="Rides, laundry, rentals and captains" onClick={() => go('admin')} />}
            <SheetRow icon={Utensils} label="Food" hint="Late-night food to your hostel" badge={<span className="badge badge-neutral">Soon</span>} onClick={() => go('food')} />
            <SheetRow icon={PartyPopper} label="Party" hint="Birthdays and hostel nights" badge={<span className="badge badge-neutral">Soon</span>} onClick={() => go('party')} />
            {user && !captain && <SheetRow icon={Bike} label="Drive with UniGo" hint="Earn by giving rides on campus" onClick={() => go('captain')} />}

            <div className="mt-2 pt-2 border-t border-hairline">
              {!authReady ? null : user ? (
                <SheetRow
                  icon={LogOut}
                  label="Sign out"
                  hint={user.email}
                  badge={<span />}
                  onClick={() => {
                    setIsMoreOpen(false);
                    signOut();
                  }}
                />
              ) : (
                <SheetRow
                  icon={LogIn}
                  label="Sign in"
                  hint="With your @pondiuni.ac.in email"
                  onClick={() => {
                    setIsMoreOpen(false);
                    openAuth();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
