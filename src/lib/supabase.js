import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Accounts and bookings need a Supabase project (see README). Without one the app still
// shows the campus and prices; booking explains that sign-in isn't set up.
export const supabase =
  url && anonKey && !url.includes('your-project-id')
    ? createClient(url, anonKey, {
        // PKCE returns the sign-in code as ?code=, which leaves the app's #page hash alone
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export const UNIVERSITY_DOMAIN = 'pondiuni.ac.in';

export const isUniversityEmail = (email = '') => /^[^\s@]+@pondiuni\.ac\.in$/i.test(email.trim());

// The page to come back to after leaving for Google sign-in
export const RETURN_TAB_KEY = 'unigo_return_tab';

// Where Supabase sends people back after Google, a confirmation link or a password reset
export const authRedirectUrl = () => `${window.location.origin}${window.location.pathname}`;

// A sign-in error handed back in the page address. Anyone can put text in a link, so only known
// errors get a specific message; anything else gets a fixed one rather than echoing the link's words.
export function urlAuthError(description = '', code = '') {
  if (/database error saving new user|pondiuni|only for pondicherry/i.test(description)) return friendlyAuthError(description);
  if (/access_denied/i.test(code) || /denied|cancel/i.test(description)) return 'Google sign-in was cancelled. Try again when you are ready.';
  if (/otp_expired|expired/i.test(`${code} ${description}`)) return 'That link has expired. Ask for a new one and use it straight away.';
  return "Sign-in didn't complete. Please try again.";
}

// Supabase's messages, rewritten for students
export function friendlyAuthError(error) {
  const message = typeof error === 'string' ? error : error?.message || '';
  if (/database error saving new user|pondiuni|only for pondicherry/i.test(message)) {
    return `UniGo is only for Pondicherry University accounts. Use your @${UNIVERSITY_DOMAIN} email or Google account.`;
  }
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Try again or reset your password.";
  if (/email not confirmed/i.test(message)) return 'Confirm your email first: open the link we sent to your university inbox.';
  if (/user already registered|already been registered/i.test(message)) return 'There is already an account with this email. Sign in instead.';
  if (/password should be at least/i.test(message)) return 'Use a password of at least 8 characters.';
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach UniGo. Check your connection and try again.";
  return message || 'Something went wrong. Please try again.';
}

// Database errors from bookings, rewritten for students. Messages raised by our own SQL
// (e.g. "That vehicle was just taken") are already written for them.
export function friendlyDbError(error) {
  const message = error?.message || '';
  if (/row-level security|jwt|not authenticated/i.test(message)) return 'Your session has ended. Sign in again to book.';
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach UniGo. Check your connection and try again.";
  // Messages raised by our own SQL (prices, pickup days, captain steps) are written for students already
  if (error?.code === '23514' && !/violates/i.test(message)) return message;
  if (/permission denied for function/i.test(message)) return "You don't have access to that.";
  // Two people acted on the same thing at once (e.g. two bookings or two accepts racing)
  if (error?.code === '23505') return 'That just changed. Refresh and try again.';
  return 'Something went wrong saving that. Please try again.';
}

