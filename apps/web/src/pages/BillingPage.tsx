import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { CheckCircle, AlertTriangle, CreditCard, Zap, Rocket, Building2, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

interface BillingStatus {
  plan: string;
  status: string;
  stripeStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const PLAN_INFO = {
  starter: { name: 'Starter', price: 49, icon: Zap, color: 'text-blue-600', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
  professional: { name: 'Professional', price: 149, icon: Rocket, color: 'text-indigo-600', bg: 'bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
  enterprise: { name: 'Enterprise', price: 349, icon: Building2, color: 'text-purple-600', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700' },
};

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active: { label: 'Active', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle },
  trial: { label: 'Free Trial', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: CheckCircle },
  suspended: { label: 'Payment Failed', color: 'text-red-700 bg-red-50 border-red-200', icon: AlertTriangle },
  cancelled: { label: 'Cancelled', color: 'text-gray-700 bg-gray-50 border-gray-200', icon: AlertTriangle },
};

export function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get('/billing/status');
      setBilling(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await api.post('/billing/portal', { returnUrl: window.location.href });
      window.location.href = data.data.url;
    } catch { setPortalLoading(false); }
  };

  const openCheckout = async (plan: string) => {
    setCheckoutLoading(true);
    try {
      const { data } = await api.post('/billing/checkout', {
        plan,
        successUrl: window.location.origin,
        cancelUrl: window.location.origin,
      });
      window.location.href = data.data.url;
    } catch { setCheckoutLoading(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const plan = billing?.plan ?? 'starter';
  const planInfo = PLAN_INFO[plan as keyof typeof PLAN_INFO] ?? PLAN_INFO.starter;
  const PlanIcon = planInfo.icon;
  const statusInfo = STATUS_INFO[billing?.status ?? 'trial'] ?? STATUS_INFO.trial;
  const StatusIcon = statusInfo.icon;
  const isSubscribed = billing?.stripeStatus === 'active' || billing?.stripeStatus === 'trialing';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing & Subscription</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your plan, payment method, and invoices.</p>
      </div>

      {/* Current plan card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl ${planInfo.bg} flex items-center justify-center`}>
                <PlanIcon className={`h-6 w-6 ${planInfo.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-gray-900">{planInfo.name} Plan</h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planInfo.badge}`}>
                    ${planInfo.price}/mo
                  </span>
                </div>
                <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${statusInfo.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusInfo.label}
                </div>
              </div>
            </div>
            <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {billing?.currentPeriodEnd && (
            <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-500">
              {billing.cancelAtPeriodEnd ? (
                <span className="text-amber-600 font-medium">
                  ⚠ Cancels on {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                </span>
              ) : (
                <span>
                  {billing.stripeStatus === 'trialing' ? 'Trial ends' : 'Renews'} on{' '}
                  <span className="font-medium text-gray-700">
                    {new Date(billing.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </span>
              )}
            </div>
          )}

          {billing?.status === 'suspended' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <strong>Payment failed.</strong> Update your payment method to restore access.
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex flex-wrap gap-3">
          {isSubscribed ? (
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {portalLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Manage Billing
              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
            </button>
          ) : (
            <button
              onClick={() => openCheckout(plan)}
              disabled={checkoutLoading}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Add Payment Method
            </button>
          )}
          {isSubscribed && (
            <button
              onClick={openPortal}
              disabled={portalLoading}
              className="flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              Change Plan
            </button>
          )}
        </div>
      </div>

      {/* Plan comparison */}
      {!isSubscribed && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Upgrade your plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(PLAN_INFO).map(([id, info]) => {
              const Icon = info.icon;
              const isCurrent = id === plan;
              return (
                <div key={id} className={`rounded-xl border-2 p-4 ${isCurrent ? `${info.bg} border-current` : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${info.color}`} />
                    <span className="font-semibold text-gray-900 text-sm">{info.name}</span>
                    {isCurrent && <span className="text-xs text-gray-500 ml-auto">Current</span>}
                  </div>
                  <p className={`text-2xl font-bold ${info.color}`}>${info.price}<span className="text-xs text-gray-400 font-normal">/mo</span></p>
                  {!isCurrent && (
                    <button
                      onClick={() => openCheckout(id)}
                      disabled={checkoutLoading}
                      className={`mt-3 w-full text-xs font-semibold py-2 rounded-lg ${info.bg} ${info.color} hover:opacity-80 transition-opacity disabled:opacity-50`}
                    >
                      Select {info.name}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info */}
      <p className="text-xs text-gray-400 text-center">
        Payments are processed securely by Stripe. Cancel anytime from the billing portal.
      </p>
    </div>
  );
}
