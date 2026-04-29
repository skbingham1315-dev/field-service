import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Loader2, CheckCircle2 } from 'lucide-react';

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lp-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lp-g)" />
      <path d="M16 7C12.134 7 9 10.134 9 14c0 4.9 7 11 7 11s7-6.1 7-11c0-3.866-3.134-7-7-7z" fill="white" />
      <path d="M13.5 14l2 2 3.5-3.5" stroke="#6366f1" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const FEATURES = [
  'Drag-and-drop dispatch board',
  'Live GPS tracking for field staff',
  'Automated invoicing & payments',
  'AI scheduling assistant',
  'Payroll calculated from logged hours',
];

export function LoginPage({ onSignup, onForgotPassword }: { onSignup?: () => void; onForgotPassword?: () => void }) {
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ email: '', password: '', tenantSlug: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.email, form.password, form.tenantSlug);
    } catch {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex lg:w-[460px] xl:w-[500px] bg-[#0c0e16] flex-col justify-between p-12 flex-shrink-0">
        <div className="flex items-center gap-3">
          <LogoMark size={34} />
          <span className="font-display font-bold text-white text-xl tracking-tight">FieldOps</span>
        </div>

        <div>
          <h2 className="text-[2.6rem] font-display font-bold text-white leading-[1.15] mb-5">
            Run your field ops<br />like a machine.
          </h2>
          <p className="text-slate-400 leading-relaxed mb-10 text-[15px]">
            Schedule jobs, track your crew in real time, and collect payments — all from one elegant dashboard.
          </p>
          <div className="space-y-3.5">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-3 w-3 text-violet-400" />
                </div>
                <span className="text-sm text-slate-300">{f}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-700 text-xs">© 2025 FieldOps. All rights reserved.</p>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#f4f5f8]">
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10 justify-center">
            <LogoMark size={30} />
            <span className="font-display font-bold text-gray-900 text-xl">FieldOps</span>
          </div>

          <h1 className="text-2xl font-display font-bold text-gray-900 mb-1">Welcome back</h1>
          <p className="text-gray-500 text-sm mb-8">Sign in to your workspace</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-widest">
                Workspace
              </label>
              <input
                type="text"
                required
                placeholder="my-pool-company"
                value={form.tenantSlug}
                onChange={(e) => setForm((f) => ({ ...f, tenantSlug: e.target.value.toLowerCase().trim() }))}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 transition-all shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-widest">
                Email
              </label>
              <input
                type="email"
                required
                placeholder="you@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.trim() }))}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 transition-all shadow-sm"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-widest">
                Password
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400 transition-all shadow-sm"
              />
              {onForgotPassword && (
                <div className="text-right mt-1.5">
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="text-xs text-violet-600 hover:text-violet-700 font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
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
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {onSignup && (
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-400">
                Don't have a workspace?{' '}
                <button
                  onClick={onSignup}
                  className="text-violet-600 font-semibold hover:text-violet-700 transition-colors"
                >
                  Create one free →
                </button>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
