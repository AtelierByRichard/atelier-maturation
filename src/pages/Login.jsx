import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

/**
 * Turn a Supabase auth error into something actionable.
 * Previously every failure showed "Incorrect email or password", which hid
 * real causes (project unreachable, missing env vars, rate limiting).
 */
function describeAuthError(error) {
  const msg = (error?.message || '').toLowerCase();

  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (msg.includes('email not confirmed')) {
    return 'This account exists but the email was never confirmed. Confirm it in Supabase → Authentication → Users.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return 'Cannot reach the database. Check your internet connection, and that the Supabase project is running.';
  }
  return `Login failed: ${error?.message || 'unknown error'}`;
}

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [notice,   setNotice]   = useState(null);
  const [loading,  setLoading]  = useState(false);

  // Misconfigured deployment: env vars missing from the build.
  const configMissing =
    !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.error('[login]', error);
      setError(describeAuthError(error));
      setLoading(false);
    }
    // On success, App.jsx will detect the new session and redirect automatically.
  }

  async function handleReset() {
    setError(null);
    setNotice(null);

    if (!email) {
      setError('Enter your email address first, then tap "Forgot password".');
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });

    if (error) {
      console.error('[reset]', error);
      setError(describeAuthError(error));
    } else {
      setNotice(`Reset link sent to ${email}. Check your inbox.`);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Atelier by Richard Gillet"
            className="h-20 object-contain mx-auto mb-4"
          />
          <p className="text-sm text-stone-500">Maturation Management</p>
        </div>

        {/* Card */}
        <div className="card p-6 shadow-sm">
          <h1 className="text-lg font-bold text-stone-900 mb-5">Sign in</h1>

          {configMissing && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              Configuration problem: the Supabase keys are missing from this build.
              Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel → Settings →
              Environment Variables, then redeploy.
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
              <input
                type="email"
                required
                autoComplete="email"
                className="input w-full"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="input w-full"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {notice && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : 'Sign in'}
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="w-full text-sm text-stone-500 hover:text-stone-700 underline"
            >
              Forgot password
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">Atelier by Richard — Bali 🌴</p>
      </div>
    </div>
  );
}
