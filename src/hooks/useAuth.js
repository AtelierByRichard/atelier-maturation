import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const IDLE_TIMEOUT_MS = 60_000; // 1 minute

/**
 * Returns { session, loading }
 *
 * Security behaviour:
 * - persistSession: false → session never saved to localStorage
 * - Idle timeout: signs out after 1 minute of no user activity
 *   (switching tabs or apps does NOT immediately sign out — the timer
 *   simply keeps running and triggers if 1 minute passes without interaction)
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

    // Idle timeout — reset on any user interaction
    let idleTimer = null;

    function resetIdleTimer() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => supabase.auth.signOut(), IDLE_TIMEOUT_MS);
    }

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach(e => document.addEventListener(e, resetIdleTimer, { passive: true }));
    resetIdleTimer();

    return () => {
      subscription.unsubscribe();
      clearTimeout(idleTimer);
      activityEvents.forEach(e => document.removeEventListener(e, resetIdleTimer));
    };
  }, []);

  return { session, loading };
}
