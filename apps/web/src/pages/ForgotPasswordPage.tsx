import { useState } from 'react';
import { Loader2, ArrowLeft, MailCheck } from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';

function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fp-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#fp-g)" />
      <path d="M16 7C12.134 7 9 10.134 9 14c0 4.9 7 11 7 11s7-6.1 7-11c0-3.866-3.134-7-7-7z" fill="white" />
      <path d="M13.5 14l2 2 3.5-3.5" stroke="#6366f1" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ForgotPasswordPage({ onBack }: { onBack?: () => void }) {
  const [form, setForm] = useState({ email: '', tenantSlug: '' });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email.trim(), tenantSlug: form.tenantSlug.trim() }),
      });
      if (!res.ok) throw new Error('Request failed');
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-[#f4f5f8]">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2.5 mb-10 justify-center">
          <LogoMark size={30} />
          <span className="font-display font-bold text-gray-900 text-xl">FieldOps</span>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="flex justify-center mb-5">
              <div className="h-14 w-14 rounded-full bg-violet-100 flex items-center justify-center">
                <MailCheck className="h-7 w-7 text-violet-600" />
              </div>
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Check your email</h1>
            <p className="text-gray-500 text-sm mb-8">
              If an account exists for <strong>{form.email}</strong>, a reset link has been sent. Check your inbox (and spam folder).
            </p>
            {onBack && (
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 mx-auto text-sm text-violet-600 font-medium hover:text-violet-700 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-display font-bold text-gray-900 mb-1">Forgot password?</h1>
            <p className="text-gray-500 text-sm mb-8">Enter your workspace and email to receive a reset link.</p>

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
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>

            {onBack && (
              <div className="mt-6 text-center">
                <button
                  onClick={onBack}
                  className="flex items-center gap-1.5 mx-auto text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
