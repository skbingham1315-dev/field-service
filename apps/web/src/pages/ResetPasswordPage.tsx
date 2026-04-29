import { useState } from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rp-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#rp-g)" />
      <path d="M16 7C12.134 7 9 10.134 9 14c0 4.9 7 11 7 11s7-6.1 7-11c0-3.866-3.134-7-7-7z" fill="white" />
      <path d="M13.5 14l2 2 3.5-3.5" stroke="#6366f1" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ResetPasswordPage({ onLogin }: { onLogin?: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';
  const slug = params.get('slug') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? 'Invalid or expired reset link.');
        return;
      }
      setDone(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[#f4f5f8]">
        <div className="w-full max-w-[360px] text-center">
          <p className="text-gray-500 text-sm mb-4">Invalid reset link.</p>
          {onLogin && (
            <button onClick={onLogin} className="text-violet-600 font-medium hover:text-violet-700 text-sm transition-colors">
              Back to sign in
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-[#f4f5f8]">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <LogoMark size={30} />
          <span className="font-display font-bold text-gray-900 text-xl">FieldOps</span>
        </div>

        {done ? (
          <div className="text-center">
            <div className="flex justify-center mb-5">
              <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Password updated!</h1>
            <p className="text-gray-500 text-sm mb-8">
              Your password has been reset. You can now sign in with your new password.
            </p>
            {onLogin && (
              <button
                onClick={onLogin}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-indigo-300/40"
              >
                Sign In
              </button>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-1">Set new password</h1>
            <p className="text-gray-500 text-sm mb-8">
              {slug ? <>For workspace <strong>{slug}</strong>. </> : ''}
              Choose a strong password (at least 8 characters).
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-widest">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 transition-all shadow-sm"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-widest">
                  Confirm Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 transition-all shadow-sm"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition-all shadow-md shadow-indigo-300/40 flex items-center justify-center gap-2 mt-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Updating...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
