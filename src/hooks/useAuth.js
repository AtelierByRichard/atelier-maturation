import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const IDLE_TIMEOUT_MS = 60_000; // 1 minute

/**
 * Returns { session, loading }
 *
 * Security behaviour:
 * - persistSession: false → session never saved to localStorage
 * - Idle timeout: signs out after 1 minute of no user activity
 * - Background logout: signs out immediately when the app returns from background
 */
export function useAuth() {
  const [session, setSession] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // ── 1. Idle timeout (1 minute of no interaction) ──────────────────────────
    let idleTimer = null;

    function resetIdleTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => supabase.auth.signOut(), IDLE_TIMEOUT_MS);
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer(); // start the timer immediately on login

    // ── 2. Background logout ──────────────────────────────────────────────────
    // Signs out when the app comes BACK into focus after being hidden.
    // (Signing out on 'hidden' is unreliable on iOS — the OS may suspend the
    // process before the async call completes, so we do it on 'visible' instead.)
    let wasHidden = false;
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        wasHidden = true;
      } else if (document.visibilityState === 'visible' && wasHidden) {
        wasHidden = false;
        supabase.auth.signOut();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      subscription.unsubscribe();
      clearTimeout(idleTimer);
      activityEvents.forEach(e => document.removeEventListener(e, resetIdleTimer));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { session, loading };
}
