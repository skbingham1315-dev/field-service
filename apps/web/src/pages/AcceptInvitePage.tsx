import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface InviteInfo {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  companyName: string;
}

export function AcceptInvitePage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token') ?? '';

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ tenantSlug: string; email: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Fetch invite info
  useEffect(() => {
    if (!token) { setLoading(false); setError('No invite token found'); return; }
    axios.get(`${API_URL}/api/v1/auth/invite-info/${token}`)
      .then(r => setInfo(r.data.data))
      .catch(() => setError('This invite link is invalid or has expired.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_URL}/api/v1/auth/accept-invite`, { token, password });
      setDone({ tenantSlug: data.data.tenantSlug, email: data.data.email });
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-violet-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">You're all set!</h1>
            <p className="text-gray-500 mt-2">Your account has been created. You can now log in.</p>
          </div>

          <a
            href="/"
            className="block w-full py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 transition-colors text-center"
          >
            Go to Login
          </a>

          {/* PWA Install Prompt */}
          {installPrompt && (
            <button
              onClick={handleInstall}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Save App to Home Screen
            </button>
          )}

          {/* Manual install instructions for iOS / non-PWA browsers */}
          {!installPrompt && (
            <div className="bg-gray-50 rounded-xl p-4 text-left space-y-2">
              <p className="text-sm font-semibold text-gray-700">Save the app to your phone</p>
              <div className="text-xs text-gray-500 space-y-1">
                <p><strong>iPhone/iPad:</strong> Tap the Share button <span className="inline-block">&#x2191;</span> then "Add to Home Screen"</p>
                <p><strong>Android Chrome:</strong> Tap the menu (&#x22EE;) then "Add to Home screen"</p>
                <p><strong>Desktop:</strong> Look for the install icon in your browser's address bar</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          {info ? (
            <>
              <h1 className="text-2xl font-bold text-gray-900">Welcome, {info.firstName}!</h1>
              <p className="text-gray-500 mt-1">
                You've been invited to join <strong className="text-gray-700">{info.companyName}</strong> as a{' '}
                <span className="capitalize font-medium text-violet-600">{info.role}</span>.
              </p>
            </>
          ) : (
            <h1 className="text-2xl font-bold text-gray-900">Set Up Your Account</h1>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {info && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={info.email}
                disabled
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Create Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Confirm your password"
                required
                minLength={8}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-400"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'Setting up...' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
