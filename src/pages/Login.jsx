import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function Login() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('Incorrect email or password. Please try again.');
      setLoading(false);
    }
    // On success, App.jsx will detect the new session and redirect automatically.
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
            >
              {loading ? (
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 mt-6">Atelier by Richard — Bali 🌴</p>
      </div>
    </div>
  );
}
