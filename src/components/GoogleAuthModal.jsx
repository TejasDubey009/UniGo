import React, { useState, useEffect } from 'react';
import { useApp } from '../context/useApp';
import { X, Check, Mail } from 'lucide-react';

const PRESET_STUDENTS = [
  {
    id: 'usr_arjun_01',
    name: 'Arjun Sharma',
    email: 'arjun.sharma@pondiuni.ac.in',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    department: 'M.Sc. Computer Science',
    hostelCategory: 'Boys Hostel',
    hostelName: 'Subramania Bharathiar Hostel',
    room: 'Room 214',
    phone: '+91 98765 43210',
    coins: 480,
    rollNo: '24CS089',
  },
  {
    id: 'usr_priya_02',
    name: 'Priya Nair',
    email: 'priya.nair@pondiuni.ac.in',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80',
    department: 'MBA International Business',
    hostelCategory: 'Girls Hostel',
    hostelName: 'Mother Teresa Hostel',
    room: 'Room 308',
    phone: '+91 98452 77123',
    coins: 620,
    rollNo: '24IB042',
  },
  {
    id: 'usr_admin_03',
    name: 'PU Campus Admin',
    email: 'admin@unigo.in',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80',
    department: 'Campus Transport & Logistics',
    hostelCategory: 'Others',
    hostelName: 'Staff Quarters Complex',
    room: 'Admin Block Ground Floor',
    phone: '+91 94432 00119',
    coins: 9999,
    rollNo: 'FACULTY-01',
  },
];

export default function GoogleAuthModal() {
  const { isAuthModalOpen, setIsAuthModalOpen, user, setUser, addDevLog } = useApp();
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');

  useEffect(() => {
    if (!isAuthModalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setIsAuthModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isAuthModalOpen, setIsAuthModalOpen]);

  if (!isAuthModalOpen) return null;

  const handleSelectStudent = (student) => {
    setUser({ ...student, verifiedStudent: true });
    addDevLog('AUTH', `Signed in as ${student.name} (${student.email}) via Google Identity`);
    setIsAuthModalOpen(false);
  };

  const handleCustomLogin = (e) => {
    e.preventDefault();
    const email = customEmail.trim().toLowerCase();
    if (!email) return;
    const isPondi = email.endsWith('@pondiuni.ac.in');
    const newUser = {
      id: `usr_${Date.now()}`,
      name: customName.trim() || email.split('@')[0],
      email,
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80',
      department: 'Pondicherry University Student',
      hostelCategory: 'Boys Hostel',
      hostelName: 'Subramania Bharathiar Hostel',
      room: 'Room 101',
      phone: '+91 98765 00000',
      coins: 200,
      rollNo: isPondi ? '24PU100' : 'GUEST-01',
      // Only university addresses count as verified students
      verifiedStudent: isPondi,
    };
    setUser(newUser);
    addDevLog('AUTH', `Custom Gmail sign in: ${newUser.email}`);
    setCustomName('');
    setCustomEmail('');
    setIsAuthModalOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsAuthModalOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="bg-canvas rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-8 max-w-md w-full shadow-[var(--shadow-float)] relative sm:my-auto animate-sheet-up"
      >
        <button
          type="button"
          onClick={() => setIsAuthModalOpen(false)}
          className="btn-icon !w-9 !h-9 absolute top-5 right-5"
          aria-label="Close sign-in"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Google header */}
        <div className="flex items-center gap-3 mb-2 pr-10">
          <span className="w-10 h-10 rounded-full bg-canvas shadow-[var(--shadow-ring)] flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          </span>
          <p className="eyebrow">Google single sign-on</p>
        </div>
        <h3 id="auth-modal-title" className="heading text-[30px] mt-4">Sign in to UniGo</h3>
        <p className="text-[15px] text-body mt-2 mb-6">
          Pick a Pondicherry University profile to switch instantly.
        </p>

        {/* One-click profiles */}
        <div className="space-y-2.5 mb-7">
          {PRESET_STUDENTS.map((st, i) => {
            const isCurrent = user.email === st.email;
            return (
              <button
                type="button"
                key={st.id}
                onClick={() => handleSelectStudent(st)}
                aria-pressed={isCurrent}
                style={{ animationDelay: `${80 + i * 50}ms` }}
                className="option w-full p-3 flex items-center gap-3 animate-pop-in"
              >
                <img src={st.avatar} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold text-ink leading-tight">{st.name}</span>
                  <span className="block text-[13px] text-muted truncate">{st.email}</span>
                  <span className="block text-[12px] text-subtle truncate">
                    {st.hostelName} · {st.department}
                  </span>
                </span>
                {isCurrent && (
                  <span className="w-6 h-6 rounded-full bg-lime text-forest flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Or any email */}
        <div className="pt-6 border-t border-hairline">
          <p className="label mb-3">Or sign in with your email</p>
          <form onSubmit={handleCustomLogin} className="space-y-2.5">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Your name (optional)"
              aria-label="Your name"
              autoComplete="name"
              className="field"
            />
            <input
              type="email"
              aria-label="Email address"
              autoComplete="email"
              required
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              placeholder="yourname@pondiuni.ac.in"
              className="field"
            />
            <button type="submit" className="btn btn-forest w-full !mt-4">
              <Mail className="w-4 h-4" aria-hidden="true" />
              Continue with email
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
