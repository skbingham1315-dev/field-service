import { useState, useEffect, useRef } from 'react';
import { Check, Zap, Building2, Rocket, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';

const PLANS = [
  {
    id: 'starter' as const,
    name: 'Starter',
    price: 49,
    icon: Zap,
    color: 'blue' as const,
    popular: false,
    description: 'Perfect for small operations just getting started.',
    features: [
      'Up to 3 technicians',
      'Job scheduling & dispatch',
      'Customer management',
      'Basic invoicing',
      'Mobile technician app',
      'Email notifications',
    ],
  },
  {
    id: 'professional' as const,
    name: 'Professional',
    price: 149,
    icon: Rocket,
    color: 'indigo' as const,
    popular: true,
    description: 'For growing teams that need more power.',
    features: [
      'Up to 15 technicians',
      'Everything in Starter',
      'Estimates & quotes',
      'SMS notifications',
      'Sales rep tracking',
      'Customer reviews',
      'Advanced reporting',
      'Dispatch board',
    ],
  },
  {
    id: 'enterprise' as const,
    name: 'Enterprise',
    price: 349,
    icon: Building2,
    color: 'purple' as const,
    popular: false,
    description: 'Unlimited scale with full control.',
    features: [
      'Unlimited technicians',
      'Everything in Professional',
      'Custom permissions',
      'Priority support',
      'Dedicated onboarding',
      'SLA guarantee',
    ],
  },
];

type PlanId = 'starter' | 'professional' | 'enterprise';

const COLOR_MAP = {
  blue: {
    border: 'border-slate-300',
    bg: 'bg-slate-50',
    badge: 'bg-slate-100 text-slate-600',
    button: 'bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-800 hover:to-slate-900',
    check: 'text-violet-500',
    ring: 'ring-slate-300',
  },
  indigo: {
    border: 'border-violet-400',
    bg: 'bg-violet-50',
    badge: 'bg-violet-100 text-violet-700',
    button: 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700',
    check: 'text-violet-600',
    ring: 'ring-violet-400',
  },
  purple: {
    border: 'border-indigo-300',
    bg: 'bg-indigo-50',
    badge: 'bg-indigo-100 text-indigo-700',
    button: 'bg-gradient-to-r from-indigo-700 to-purple-700 hover:from-indigo-800 hover:to-purple-800',
    check: 'text-indigo-600',
    ring: 'ring-indigo-300',
  },
};

function PlanPicker({ onSelect }: { onSelect: (plan: PlanId) => void }) {
  return (
    <div className="min-h-screen bg-[#f4f5f8] py-12 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-display font-bold text-gray-900">Choose your plan</h1>
          <p className="text-gray-500 mt-2">Start free for 14 days. No credit card required.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const c = COLOR_MAP[plan.color];
            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border-2 shadow-sm transition-all hover:shadow-md ${
                  plan.popular ? `${c.border} ring-2 ${c.ring} ring-offset-2` : 'border-gray-200'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full ${c.badge}`}>
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="p-6">
                  <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} mb-4`}>
                    <Icon className={`h-5 w-5 ${c.check}`} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>
                  <p className="text-sm text-gray-500 mt-1 mb-4">{plan.description}</p>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold text-gray-900">${plan.price}</span>
                    <span className="text-gray-400 text-sm">/month</span>
                  </div>

                  <button
                    onClick={() => onSelect(plan.id)}
                    className={`w-full ${c.button} text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2`}
                  >
                    Get Started <ChevronRight className="h-4 w-4" />
                  </button>

                  <ul className="mt-6 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-gray-600">
                        <Check className={`h-4 w-4 flex-shrink-0 mt-0.5 ${c.check}`} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-gray-400 mt-8">
          Already have an account?{' '}
          <button
            onClick={() => window.history.back()}
            className="text-indigo-600 font-medium hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

function RegisterForm({ plan, onBack }: { plan: PlanId; onBack: () => void }) {
  const login = useAuthStore((s) => s.login);
  const selectedPlan = PLANS.find((p) => p.id === plan)!;
  const c = COLOR_MAP[selectedPlan.color];

  const [form, setForm] = useState({
    companyName: '',
    slug: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
  });
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const slugTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  // Auto-generate slug from company name
  useEffect(() => {
    if (form.companyName && !form.slug) {
      const auto = form.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      setForm((f) => ({ ...f, slug: auto }));
    }
  }, [form.companyName]);

  // Debounced slug availability check
  useEffect(() => {
    if (!form.slug) { setSlugStatus('idle'); return; }
    setSlugStatus('checking');
    if (slugTimer.current) clearTimeout(slugTimer.current);
    slugTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.post('/auth/check-slug', { slug: form.slug });
        setSlugStatus(data.data.available ? 'available' : 'taken');
      } catch {
        setSlugStatus('idle');
      }
    }, 500);
  }, [form.slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (slugStatus === 'taken') { setError('That URL is already taken. Choose another.'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', { ...form, plan });
      const { accessToken, refreshToken, user, checkoutUrl } = data.data;
      useAuthStore.getState().setAuth({ accessToken, refreshToken, user });
      // Redirect to Stripe Checkout to enter payment details (14-day trial starts)
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f5f8] flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-md">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to plans
        </button>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className={`h-9 w-9 rounded-xl ${c.bg} flex items-center justify-center`}>
              <selectedPlan.icon className={`h-5 w-5 ${c.check}`} />
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-gray-900">Create your account</h1>
              <p className="text-xs text-gray-400">{selectedPlan.name} plan · ${selectedPlan.price}/mo · 14-day free trial</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
                <input
                  required
                  value={form.firstName}
                  onChange={set('firstName')}
                  placeholder="Jane"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  required
                  value={form.lastName}
                  onChange={set('lastName')}
                  placeholder="Smith"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company Name</label>
              <input
                required
                value={form.companyName}
                onChange={set('companyName')}
                placeholder="Acme Pool Services"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Company URL</label>
              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 whitespace-nowrap">app/</span>
                <input
                  required
                  value={form.slug}
                  onChange={set('slug')}
                  placeholder="acme-pool"
                  className="flex-1 px-3 py-2 text-sm focus:outline-none"
                />
                <span className="px-3">
                  {slugStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                  {slugStatus === 'available' && <Check className="h-4 w-4 text-green-500" />}
                  {slugStatus === 'taken' && <span className="text-xs text-red-500 font-medium">Taken</span>}
                </span>
              </div>
              {slugStatus === 'available' && (
                <p className="text-xs text-green-600 mt-1">✓ This URL is available</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Work Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="jane@acmepools.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                required
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
                minLength={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || slugStatus === 'taken'}
              className={`w-full ${c.button} disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2`}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</> : 'Start Free Trial'}
            </button>

            <p className="text-xs text-gray-400 text-center">
              By signing up you agree to our Terms of Service and Privacy Policy.
              No credit card required for trial.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

export function SignupPage({ onLogin }: { onLogin: () => void }) {
  const [step, setStep] = useState<'plans' | 'register'>('plans');
  const [plan, setPlan] = useState<PlanId>('professional');

  return step === 'plans' ? (
    <PlanPicker onSelect={(p) => { setPlan(p); setStep('register'); }} />
  ) : (
    <RegisterForm plan={plan} onBack={() => setStep('plans')} />
  );
}
