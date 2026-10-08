import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { useSlidingThumb } from '../hooks/useMotion';
import { Wordmark } from './ui';
import { Menu, X, ChevronDown, ArrowUpRight, LogOut, Bike } from 'lucide-react';

const initialsOf = (user) =>
  (user.name || user.email)
    .split(/[\s.@]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

function Avatar({ user }) {
  return user.avatar ? (
    <img src={user.avatar} alt="" referrerPolicy="no-referrer" className="w-8 h-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span aria-hidden="true" className="w-8 h-8 shrink-0 rounded-full bg-forest text-lime text-[13px] font-semibold flex items-center justify-center">
      {initialsOf(user)}
    </span>
  );
}

export default function Navbar() {
  const { activeTab, setActiveTab, authReady, user, captain, isAdmin, openAuth, signOut, fleet } = useApp();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const accountRef = useRef(null);
  const navRef = useRef(null);

  const navItems = [
    { id: 'home', label: 'Campus' },
    { id: 'rides', label: 'Rides' },
    { id: 'rental', label: 'Rental', live: fleet.some((v) => v.available) },
    { id: 'laundry', label: 'Laundry' },
    { id: 'food', label: 'Food', soon: true },
    { id: 'party', label: 'Party', soon: true },
    // Captains and admins see their own pages in the menu
    ...(captain ? [{ id: 'captain', label: 'Captain', live: captain.on_duty }] : []),
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : []),
  ];

  const thumb = useSlidingThumb(navRef, activeTab);
  // The Captain and Admin tabs make the bar wider, so on laptops between lg and xl the long menu folds
  // into a dropdown. Phones and tablets use the bottom tab bar instead.
  const isLongMenu = navItems.length > 6;

  // Hairline under the bar only once the page has scrolled
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the account menu on outside click or Escape
  useEffect(() => {
    if (!isAccountOpen) return;
    const onPointerDown = (e) => {
      if (!accountRef.current?.contains(e.target)) setIsAccountOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isAccountOpen]);

  const handleNavClick = (id) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
  };

  return (
    <header
      className={`app-header sticky top-0 z-40 w-full bg-canvas/[0.97] backdrop-blur-xl select-none transition-shadow duration-200 ${
        isScrolled || isMobileMenuOpen ? 'shadow-[0_1px_0_rgb(14_15_12/0.1)]' : ''
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-5 lg:px-8 h-[60px] sm:h-[72px] flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="shrink-0 rounded-xl transition-transform duration-150 active:scale-95"
          aria-label="UniGo home"
        >
          <Wordmark />
        </button>

        {/* Desktop navigation with a thumb that slides to the active page */}
        <nav ref={navRef} aria-label="Main" className={`${isLongMenu ? 'hidden xl:flex' : 'hidden lg:flex'} items-center relative`}>
          {thumb && (
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
                {item.live && <span className="live-dot" title={item.id === 'captain' ? 'On duty' : 'Scooters available now'} />}
                {item.soon && (
                  <span className="text-[11px] font-semibold text-subtle -translate-y-1">soon</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Account: sign in, or the signed-in student with a sign-out menu */}
          {!authReady ? (
            <span aria-hidden="true" className="w-8 h-8 sm:w-28 sm:h-10 rounded-full bg-ash animate-pulse" />
          ) : user ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setIsAccountOpen((open) => !open)}
                aria-expanded={isAccountOpen}
                aria-haspopup="menu"
                aria-label={`Account: ${user.name || user.email}`}
                className="flex items-center gap-2 pl-1 pr-1 sm:pr-3 py-1 rounded-full bg-canvas shadow-[var(--shadow-ring)] hover:bg-paper transition-colors duration-150 active:scale-[0.98]"
              >
                <Avatar user={user} />
                <span className="hidden sm:block text-[14px] font-semibold text-ink max-w-[120px] truncate">
                  {(user.name || user.email).split(/[\s@]/)[0]}
                </span>
                <ChevronDown
                  className={`hidden sm:block w-4 h-4 text-muted transition-transform duration-200 ${isAccountOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>

              {isAccountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-72 bg-canvas rounded-[18px] p-2 shadow-[var(--shadow-float)] z-50 origin-top-right animate-pop-in"
                >
                  <div className="px-3 pt-2.5 pb-3 flex items-center gap-3 border-b border-hairline">
                    <Avatar user={user} />
                    <div className="min-w-0">
                      {user.name && <p className="text-[14px] font-semibold text-ink truncate">{user.name}</p>}
                      <p className="text-[13px] text-muted truncate">{user.email}</p>
                    </div>
                  </div>
                  {!captain && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAccountOpen(false);
                        handleNavClick('captain');
                      }}
                      className="mt-1 w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-[14px] font-semibold text-ink hover:bg-paper transition-colors duration-150"
                    >
                      <Bike className="w-4 h-4 text-muted" aria-hidden="true" />
                      Drive with UniGo
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsAccountOpen(false);
                      signOut();
                    }}
                    className="mt-1 w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-[14px] font-semibold text-ink hover:bg-paper transition-colors duration-150"
                  >
                    <LogOut className="w-4 h-4 text-muted" aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={() => openAuth()} className="btn btn-sm btn-primary">
              Sign in
            </button>
          )}

          {isLongMenu && (
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              className="hidden lg:inline-flex xl:hidden btn-icon"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Dropdown menu for the long menu on laptops */}
      {isMobileMenuOpen && isLongMenu && (
        <nav
          aria-label="Main"
          className={`hidden lg:block xl:hidden px-5 pb-5 pt-1 max-h-[calc(100dvh-72px)] overflow-y-auto overscroll-contain animate-pop-in origin-top`}
        >
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
