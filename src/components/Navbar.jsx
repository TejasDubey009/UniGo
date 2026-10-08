import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { useSlidingThumb } from '../hooks/useMotion';
import { Wordmark, CoinIcon } from './ui';
import {
  User,
  ShieldCheck,
  Terminal,
  Menu,
  X,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react';

const DASHBOARDS = [
  { id: 'user-dashboard', label: 'Student dashboard', hint: 'Profile, leases & orders', icon: User },
  { id: 'admin-dashboard', label: 'Admin console', hint: 'Fleet & laundry queue', icon: ShieldCheck },
  { id: 'dev-dashboard', label: 'Developer console', hint: 'WebGL telemetry & logs', icon: Terminal },
];

export default function Navbar() {
  const {
    activeTab,
    setActiveTab,
    user,
    setIsAuthModalOpen,
    rentalSettings,
  } = useApp();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDashboardsOpen, setIsDashboardsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const dashboardsRef = useRef(null);
  const navRef = useRef(null);

  const navItems = [
    { id: 'home', label: 'Campus' },
    { id: 'rides', label: 'Rides' },
    { id: 'rental', label: 'Rental', live: rentalSettings.isAvailable },
    { id: 'laundry', label: 'Laundry' },
    { id: 'food', label: 'Food', soon: true },
    { id: 'party', label: 'Party', soon: true },
  ];

  const isNavTab = navItems.some((item) => item.id === activeTab);
  const thumb = useSlidingThumb(navRef, activeTab);
  const isDashboardTab = DASHBOARDS.some((d) => d.id === activeTab);

  // Hairline under the bar only once the page has scrolled
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the dashboards dropdown on outside click or Escape
  useEffect(() => {
    if (!isDashboardsOpen) return;
    const onPointerDown = (e) => {
      if (!dashboardsRef.current?.contains(e.target)) setIsDashboardsOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsDashboardsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isDashboardsOpen]);

  const handleNavClick = (id) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
    setIsDashboardsOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-40 w-full bg-canvas/[0.97] backdrop-blur-xl select-none transition-shadow duration-200 ${
        isScrolled || isMobileMenuOpen ? 'shadow-[0_1px_0_rgb(14_15_12/0.1)]' : ''
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-5 lg:px-8 h-[72px] flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="shrink-0 rounded-xl transition-transform duration-150 active:scale-95"
          aria-label="UniGo home"
        >
          <Wordmark />
        </button>

        {/* Desktop navigation with a thumb that slides to the active page */}
        <nav ref={navRef} aria-label="Main" className="hidden lg:flex items-center relative">
          {thumb && isNavTab && (
            <span
              aria-hidden="true"
              className="absolute top-0 bottom-0 left-0 rounded-full bg-ash transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
              style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
            />
          )}
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                data-key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative z-10 px-4 py-2 rounded-full text-[15px] font-semibold flex items-center gap-1.5 transition-colors duration-150 ${
                  isActive ? 'text-forest' : 'text-body hover:text-ink'
                }`}
              >
                {item.label}
                {item.live && <span className="live-dot" title="Scooters available now" />}
                {item.soon && (
                  <span className="text-[11px] font-semibold text-subtle -translate-y-1">soon</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Role dashboards */}
          <div className="relative" ref={dashboardsRef}>
            <button
              type="button"
              onClick={() => setIsDashboardsOpen(!isDashboardsOpen)}
              aria-expanded={isDashboardsOpen}
              aria-haspopup="menu"
              className={`btn btn-sm ${isDashboardTab ? 'btn-forest' : 'btn-quiet'} !gap-1.5`}
            >
              <span className="hidden sm:inline">Dashboards</span>
              <span className="sm:hidden">Roles</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${isDashboardsOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {isDashboardsOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-72 bg-canvas rounded-[18px] p-2 shadow-[var(--shadow-float)] z-50 origin-top-right animate-pop-in"
              >
                <p className="eyebrow px-3 pt-2 pb-1.5">Switch view</p>
                {DASHBOARDS.map((d) => {
                  const Icon = d.icon;
                  const isActive = activeTab === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleNavClick(d.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors duration-150 ${
                        isActive ? 'bg-paper' : 'hover:bg-paper'
                      }`}
                    >
                      <span
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isActive ? 'bg-lime text-forest' : 'bg-ash text-ink'
                        }`}
                      >
                        <Icon className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-semibold text-ink">{d.label}</span>
                        <span className="block text-[13px] text-muted">{d.hint}</span>
                      </span>
                      {isActive && <span className="live-dot" aria-label="Current view" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Signed-in student */}
          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="flex items-center gap-2.5 pl-1 pr-1 sm:pr-3.5 py-1 rounded-full bg-canvas shadow-[var(--shadow-ring)] hover:bg-paper transition-colors duration-150 active:scale-[0.98]"
            title="Switch student profile"
          >
            <img
              src={user.avatar}
              alt=""
              className="w-8 h-8 shrink-0 rounded-full object-cover"
            />
            <span className="text-left hidden sm:block leading-tight">
              <span className="block text-[13px] font-semibold text-ink">{user.name.split(' ')[0]}</span>
              <span className="flex items-center gap-1 text-[12px] text-muted num">
                <CoinIcon className="w-3 h-3" />
                {user.coins}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            className="lg:hidden btn-icon"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <nav aria-label="Main" className="lg:hidden px-5 pb-5 pt-1 animate-pop-in origin-top">
          <div className="surface p-2">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full px-4 py-3.5 rounded-2xl text-left text-[17px] font-semibold flex items-center justify-between transition-colors duration-150 ${
                    isActive ? 'bg-canvas text-forest shadow-[var(--shadow-ring)]' : 'text-ink hover:bg-canvas/70'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {item.label}
                    {item.live && <span className="live-dot" />}
                  </span>
                  {item.soon ? (
                    <span className="badge badge-neutral">Soon</span>
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-subtle" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
