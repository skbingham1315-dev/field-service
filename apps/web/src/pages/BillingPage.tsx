import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  CheckCircle, AlertTriangle, CreditCard, Zap, Rocket,
  Building2, ExternalLink, Loader2, RefreshCw, ShieldAlert, Clock,
} from 'lucide-react';

interface BillingStatus {
  plan: string;
  status: string;
  stripeStatus: string | null;
  stripeCustomerId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasPaymentMethod: boolean;
}

const PLAN_INFO = {
  starter:      { name: 'Starter',      price: 49,  icon: Zap,       color: 'text-slate-600',  bg: 'bg-slate-50',  badge: 'bg-slate-100 text-slate-700' },
  professional: { name: 'Professional', price: 149, icon: Rocket,    color: 'text-violet-600', bg: 'bg-violet-50', badge: 'bg-violet-100 text-violet-700' },
  enterprise:   { name: 'Enterprise',   price: 349, icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
};

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:    { label: 'Active',        color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle },
  trial:     { label: 'Free Trial',    color: 'text-violet-700 bg-violet-50 border-violet-200',   icon: Clock },
  suspended: { label: 'Payment Failed',color: 'text-red-700 bg-red-50 border-red-200',            icon: AlertTriangle },
  cancelled: { label: 'Cancelled',     color: 'text-gray-700 bg-gray-50 border-gray-200',         icon: AlertTriangle },
};

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000));
}

export function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/billing/status');
      setBilling(data.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openPortal = async () => {
    setActionLoading('portal');
    try {
      const { data } = await api.post('/billing/portal', { returnUrl: window.location.href });
      window.location.href = data.data.url;
    } catch { setActionLoading(''); }
  };

  const addPaymentMethod = async () => {
    setActionLoading('setup');
    try {
      const { data } = await api.post('/billing/setup-payment', { returnUrl: window.location.href });
      window.location.href = data.data.url;
    } catch { setActionLoading(''); }
  };

  const openCheckout = async (plan: string) => {
    setActionLoading('checkout-' + plan);
    try {
      const { data } = await api.post('/billing/checkout', {
        plan,
        successUrl: window.location.origin,
        cancelUrl: window.location.origin,
      });
      window.location.href = data.data.url;
    } catch { setActionLoading(''); }
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
  const isTrialing = billing?.stripeStatus === 'trialing';
  const isSubscribed = billing?.stripeStatus === 'active' || isTrialing;
  const needsPaymentMethod = isSubscribed && !billing?.hasPaymentMethod;
  const daysLeft = billing?.currentPeriodEnd ? daysUntil(billing.currentPeriodEnd) : null;
  const trialUrgent = isTrialing && daysLeft !== null && daysLeft <= 5;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Billing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your plan and payment method.</p>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ── Payment method warning banner ────────────────────────── */}
      {needsPaymentMethod && (
        <div className={`rounded-2xl border p-4 flex items-start gap-4 ${
          trialUrgent
            ? 'bg-red-50 border-red-200'
            : 'bg-amber-50 border-amber-200'
        }`}>
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            trialUrgent ? 'bg-red-100' : 'bg-amber-100'
          }`}>
            <ShieldAlert className={`h-5 w-5 ${trialUrgent ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${trialUrgent ? 'text-red-800' : 'text-amber-800'}`}>
              {trialUrgent
                ? `Trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — add a card now`
                : 'No payment method on file'}
            </p>
            <p className={`text-xs mt-0.5 ${trialUrgent ? 'text-red-600' : 'text-amber-600'}`}>
              {billing?.currentPeriodEnd
                ? `Your free trial ends ${new Date(billing.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Add a payment method to keep your account active — you won't be charged until the trial ends.`
                : 'Add a payment method so your service continues uninterrupted when the trial ends.'}
            </p>
          </div>
          <button
            onClick={addPaymentMethod}
            disabled={actionLoading === 'setup'}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors flex-shrink-0 disabled:opacity-60 ${
              trialUrgent
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {actionLoading === 'setup'
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <CreditCard className="h-4 w-4" />}
            Add Card
          </button>
        </div>
      )}

      {/* ── Current plan card ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl ${planInfo.bg} flex items-center justify-center flex-shrink-0`}>
                <PlanIcon className={`h-6 w-6 ${planInfo.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
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

            {/* Payment method status pill */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 ${
              billing?.hasPaymentMethod
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-100 text-gray-500 border border-gray-200'
            }`}>
              <CreditCard className="h-3.5 w-3.5" />
              {billing?.hasPaymentMethod ? 'Card on file' : 'No card'}
            </div>
          </div>

          {billing?.currentPeriodEnd && (
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {billing.cancelAtPeriodEnd ? (
                  <span className="text-amber-600 font-medium">
                    ⚠ Cancels {new Date(billing.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                ) : (
                  <>
                    {isTrialing ? 'Trial ends' : 'Renews'}{' '}
                    <span className="font-semibold text-gray-800">
                      {new Date(billing.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </>
                )}
              </span>
              {isTrialing && daysLeft !== null && (
                <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                  daysLeft <= 3 ? 'bg-red-100 text-red-700' :
                  daysLeft <= 7 ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {daysLeft} day{daysLeft === 1 ? '' : 's'} left
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

        <div className="px-6 pb-5 flex flex-wrap gap-3 border-t border-gray-50 pt-4">
          {/* Add / update payment method */}
          <button
            onClick={addPaymentMethod}
            disabled={!!actionLoading}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60 ${
              needsPaymentMethod
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-indigo-200'
                : 'bg-white border border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}
          >
            {actionLoading === 'setup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            {billing?.hasPaymentMethod ? 'Update Payment Method' : 'Add Payment Method'}
          </button>

          {isSubscribed && (
            <button
              onClick={openPortal}
              disabled={!!actionLoading}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60"
            >
              {actionLoading === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Billing Portal
            </button>
          )}
        </div>
      </div>

      {/* ── Plan picker (non-subscribed only) ────────────────────── */}
      {!isSubscribed && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Choose a plan</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(PLAN_INFO).map(([id, info]) => {
              const Icon = info.icon;
              const isCurrent = id === plan;
              return (
                <div key={id} className={`rounded-xl border-2 p-4 transition-all ${isCurrent ? `${info.bg} border-current` : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`h-4 w-4 ${info.color}`} />
                    <span className="font-semibold text-gray-900 text-sm">{info.name}</span>
                    {isCurrent && <span className="text-xs text-gray-400 ml-auto">Current</span>}
                  </div>
                  <p className={`text-2xl font-bold ${info.color} mb-3`}>
                    ${info.price}<span className="text-xs text-gray-400 font-normal">/mo</span>
                  </p>
                  <button
                    onClick={() => openCheckout(id)}
                    disabled={!!actionLoading}
                    className={`w-full text-xs font-semibold py-2.5 rounded-xl transition-opacity disabled:opacity-50 ${
                      isCurrent
                        ? `${info.bg} ${info.color} opacity-60 cursor-default`
                        : `bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white`
                    }`}
                  >
                    {actionLoading === 'checkout-' + id
                      ? 'Loading...'
                      : isCurrent ? 'Current plan' : `Start ${info.name} Trial`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400 mt-4">14-day free trial · Card required upfront · Cancel anytime</p>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Payments processed securely by Stripe. Your card is not charged until the trial ends.
      </p>
    </div>
  );
}
