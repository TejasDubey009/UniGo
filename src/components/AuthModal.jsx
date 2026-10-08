import React, { useEffect, useId, useRef, useState } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useApp } from '../context/useApp';
import {
  supabase,
  UNIVERSITY_DOMAIN,
  isUniversityEmail,
  authRedirectUrl,
  friendlyAuthError,
  RETURN_TAB_KEY,
} from '../lib/supabase';
import { ArrowRight, MailCheck, X } from 'lucide-react';

const MIN_PASSWORD = 8;

const TITLES = {
  signin: 'Sign in to UniGo',
  signup: 'Create your UniGo account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
};

// Students can type just their ID ("asha.r") and we add the university domain
const toUniversityEmail = (value) => {
  const trimmed = value.trim();
  return trimmed && !trimmed.includes('@') ? `${trimmed}@${UNIVERSITY_DOMAIN}` : trimmed;
};

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

// The sheet's contents; remounted per prompt so every open starts clean
function AuthPanel({ prompt, onClose, ids }) {
  const { activeTab, user } = useApp();
  const [mode, setMode] = useState(prompt.mode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(prompt.error || '');
  const [sentTo, setSentTo] = useState(null); // { email, kind: 'signup' | 'reset' } after a link is emailed
  const [notice, setNotice] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const firstFieldRef = useRef(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode, sentTo]);

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    setSentTo(null);
  };

  const run = async (task) => {
    setIsBusy(true);
    setError('');
    try {
      await task();
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setIsBusy(false);
    }
  };

  const checkedEmail = () => {
    const address = toUniversityEmail(email);
    if (!isUniversityEmail(address)) throw new Error(`Use your university email ending in @${UNIVERSITY_DOMAIN}.`);
    return address;
  };

  const handleGoogle = () =>
    run(async () => {
      try {
        sessionStorage.setItem(RETURN_TAB_KEY, activeTab);
      } catch {
        // Without storage the student lands on the home page after Google; nothing else changes
      }
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectUrl(),
          // Google shows university accounts first; the database still refuses any other domain
          queryParams: { hd: UNIVERSITY_DOMAIN, prompt: 'select_account' },
        },
      });
      if (oauthError) throw oauthError;
    });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isBusy) return;

    if (mode === 'signin') {
      run(async () => {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: checkedEmail(), password });
        if (signInError) throw signInError;
        onClose();
      });
    } else if (mode === 'signup') {
      run(async () => {
        const address = checkedEmail();
        if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`);
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: authRedirectUrl(), data: { full_name: name.trim() } },
        });
        if (signUpError) throw signUpError;
        // With email confirmation on (the default), there's no session until the link is opened
        if (data.session) onClose();
        else setSentTo({ email: address, kind: 'signup' });
      });
    } else if (mode === 'forgot') {
      run(async () => {
        const address = checkedEmail();
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: authRedirectUrl() });
        if (resetError) throw resetError;
        setSentTo({ email: address, kind: 'reset' });
      });
    } else if (mode === 'reset') {
      run(async () => {
        if (password.length < MIN_PASSWORD) throw new Error(`Use a password of at least ${MIN_PASSWORD} characters.`);
        if (password !== confirmPassword) throw new Error("The two passwords don't match.");
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        onClose();
      });
    }
  };

  const resend = () =>
    run(async () => {
      const { error: resendError } =
        sentTo.kind === 'signup'
          ? await supabase.auth.resend({ type: 'signup', email: sentTo.email, options: { emailRedirectTo: authRedirectUrl() } })
          : await supabase.auth.resetPasswordForEmail(sentTo.email, { redirectTo: authRedirectUrl() });
      if (resendError) throw resendError;
      setNotice('Sent again. It can take a minute to arrive; check spam too.');
    });

  const errorBox = error && (
    <p role="alert" className="rounded-[10px] bg-alert-wash px-4 py-3 text-[14px] text-alert">
      {error}
    </p>
  );

  // Sign-in only works once the Supabase project is connected (see README)
  if (!supabase) {
    return (
      <>
        <h3 id={`${ids}-title`} className="heading text-[28px] pr-10">
          Sign-in isn't set up yet
        </h3>
        <p className="text-[15px] text-body mt-3 leading-relaxed">
          This copy of UniGo isn't connected to its Supabase project, so accounts and bookings are switched off. Add{' '}
          <code className="font-mono text-[13px]">VITE_SUPABASE_URL</code> and{' '}
          <code className="font-mono text-[13px]">VITE_SUPABASE_ANON_KEY</code> to <code className="font-mono text-[13px]">.env.local</code>{' '}
          and restart the dev server.
        </p>
        <button type="button" onClick={onClose} className="btn btn-quiet w-full mt-7">
          Close
        </button>
      </>
    );
  }

  if (sentTo) {
    return (
      <>
        <span className="w-12 h-12 rounded-full bg-lime text-forest flex items-center justify-center animate-pop-in">
          <MailCheck className="w-6 h-6" aria-hidden="true" />
        </span>
        <h3 id={`${ids}-title`} className="heading text-[28px] mt-6 pr-10">
          Check your university inbox
        </h3>
        <p className="text-[15px] text-body mt-2 leading-relaxed">
          We sent a link to <span className="font-semibold text-ink break-all">{sentTo.email}</span>.{' '}
          {sentTo.kind === 'signup'
            ? 'Open it to confirm your account, then you can book.'
            : 'Open it to choose a new password.'}
        </p>
        {notice && <p className="mt-4 text-[14px] text-forest font-medium">{notice}</p>}
        {error && <div className="mt-4">{errorBox}</div>}
        <div className="mt-7 flex flex-col-reverse sm:flex-row gap-3">
          <button type="button" onClick={() => switchMode('signin')} className="btn btn-quiet">
            Back to sign in
          </button>
          <button ref={firstFieldRef} type="button" onClick={resend} disabled={isBusy} className="btn btn-forest flex-1">
            {isBusy ? 'Sending…' : 'Send the link again'}
          </button>
        </div>
      </>
    );
  }

  const showGoogle = mode === 'signin' || mode === 'signup';
  const emailHint = mode === 'signup' || mode === 'signin' ? `Your @${UNIVERSITY_DOMAIN} address` : null;

  return (
    <>
      <p className="eyebrow pr-12">Pondicherry University accounts only</p>
      <h3 id={`${ids}-title`} className="heading text-[28px] sm:text-[30px] mt-3 pr-10">
        {TITLES[mode]}
      </h3>
      <p className="text-[15px] text-body mt-2">
        {mode === 'reset'
          ? `Signed in as ${user?.email || 'your account'}.`
          : mode === 'forgot'
            ? "Enter your university email and we'll send a reset link."
            : prompt.reason || `Use your @${UNIVERSITY_DOMAIN} email or university Google account.`}
      </p>

      {showGoogle && (
        <>
          <button type="button" onClick={handleGoogle} disabled={isBusy} className="btn btn-outline w-full mt-7 !gap-3">
            <GoogleMark />
            Continue with Google
          </button>
          <div className="my-6 flex items-center gap-3 text-[13px] text-muted" aria-hidden="true">
            <span className="flex-1 border-t border-hairline" />
            or with your university email
            <span className="flex-1 border-t border-hairline" />
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className={`space-y-4 ${showGoogle ? '' : 'mt-7'}`} noValidate>
        {mode === 'signup' && (
          <div>
            <label htmlFor={`${ids}-name`} className="label">
              Full name
            </label>
            <input
              ref={firstFieldRef}
              id={`${ids}-name`}
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="field"
            />
          </div>
        )}

        {mode !== 'reset' && (
          <div>
            <label htmlFor={`${ids}-email`} className="label">
              University email
            </label>
            <input
              ref={mode === 'signup' ? undefined : firstFieldRef}
              id={`${ids}-email`}
              type="text"
              inputMode="email"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={`name@${UNIVERSITY_DOMAIN}`}
              aria-describedby={emailHint ? `${ids}-email-hint` : undefined}
              className="field"
            />
            {emailHint && (
              <p id={`${ids}-email-hint`} className="mt-1.5 text-[13px] text-muted">
                {emailHint}
              </p>
            )}
          </div>
        )}

        {mode !== 'forgot' && (
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor={`${ids}-password`} className="label">
                {mode === 'reset' ? 'New password' : 'Password'}
              </label>
              {mode === 'signin' && (
                <button type="button" onClick={() => switchMode('forgot')} className="btn btn-link !text-[13px] mb-1.5">
                  Forgot password?
                </button>
              )}
            </div>
            <input
              ref={mode === 'reset' ? firstFieldRef : undefined}
              id={`${ids}-password`}
              type="password"
              required
              minLength={mode === 'signin' ? undefined : MIN_PASSWORD}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field"
            />
            {mode !== 'signin' && <p className="mt-1.5 text-[13px] text-muted">At least {MIN_PASSWORD} characters</p>}
          </div>
        )}

        {mode === 'reset' && (
          <div>
            <label htmlFor={`${ids}-confirm`} className="label">
              Confirm new password
            </label>
            <input
              id={`${ids}-confirm`}
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="field"
            />
          </div>
        )}

        {errorBox}

        <button type="submit" disabled={isBusy} aria-busy={isBusy} className="btn btn-primary btn-lg w-full !mt-6">
          {isBusy
            ? 'One moment…'
            : { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save new password' }[mode]}
          {!isBusy && <ArrowRight className="w-4 h-4 btn-arrow" aria-hidden="true" />}
        </button>
      </form>

      {mode !== 'reset' && (
        <p className="mt-6 text-center text-[14px] text-body">
          {mode === 'signin' ? 'New to UniGo? ' : mode === 'signup' ? 'Already have an account? ' : 'Remembered it? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="btn btn-link !text-[14px] !inline"
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      )}
    </>
  );
}

// Sign in, sign up, Google and password reset, limited to @pondiuni.ac.in accounts
export default function AuthModal() {
  const { authPrompt, closeAuth } = useApp();
  const titleId = useId();
  const dialogRef = useDialog(Boolean(authPrompt), closeAuth);

  if (!authPrompt) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-ink/40 backdrop-blur-sm overflow-y-auto animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeAuth();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${titleId}-title`}
        className="bg-canvas rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-8 pb-[calc(env(safe-area-inset-bottom)+24px)] sm:pb-8 max-w-md w-full shadow-[var(--shadow-float)] relative sm:my-auto animate-sheet-up"
      >
        <button type="button" onClick={closeAuth} className="btn-icon !w-9 !h-9 absolute top-5 right-5" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
        <AuthPanel key={JSON.stringify(authPrompt)} prompt={authPrompt} onClose={closeAuth} ids={titleId} />
      </div>
    </div>
  );
}
