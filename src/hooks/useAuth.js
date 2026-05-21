import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Returns { session, loading }
 * session is null when logged out, a Supabase Session object when logged in.
 */
export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = still loading
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

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}
