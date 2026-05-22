import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Returns { session, loading }
 * session is null when logged out, a Supabase Session object when logged in.
 *
 * Security behaviour:
 * - persistSession: false → session is never saved to localStorage
 * - visibilitychange → signs out the moment the app goes to background or tab is switched
 *   This ensures iPhone users must log in again every time they re-open the app.
 */
export function useAuth() {
  const [session, setSession] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for login / logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // iPhone fix: sign out when the app comes BACK into focus after being hidden.
    // Signing out on 'hidden' is unreliable on iOS because the OS may suspend
    // the process before the async call completes. Signing out on 'visible'
    // (after the app was hidden) runs while the app is fully active.
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
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { session, loading };
}
