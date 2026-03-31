import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import {
  CheckCircle, AlertTriangle, CreditCard, Zap, Rocket,
  Building2, ExternalLink, Loader2, RefreshCw, ShieldAlert, Clock,
  X, Users, MapPin, Clock3, FileText, MessageSquare, Camera, BarChart3,
  Headphones, Shield, Wrench, Globe, ChevronRight,
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

interface PlanFeature {
  icon: React.ElementType;
  text: string;
  highlight?: boolean;
}

interface PlanDetail {
  id: string;
  name: string;
  price: number;
  tagline: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  badge: string;
  accent: string;
  features: PlanFeature[];
  limits: { technicians: string; customers: string; jobs: string };
}

const PLAN_DETAILS: Record<string, PlanDetail> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 49,
    tagline: 'Everything you need to get your first jobs done.',
    icon: Zap,
    color: 'text-slate-600',
    bg: 'bg-slate-50',
    badge: 'bg-slate-100 text-slate-700',
    accent: 'border-slate-300',
    limits: { technicians: 'Up to 3 technicians', customers: 'Up to 250 customers', jobs: '100 jobs/mo' },
    features: [
      { icon: Wrench, text: 'Job scheduling & dispatch' },
      { icon: Users, text: 'Up to 3 technicians' },
      { icon: FileText, text: 'Invoicing & payment tracking' },
      { icon: Clock3, text: 'Time tracking & clock-in/out' },
      { icon: Camera, text: 'Job photo documentation' },
      { icon: MapPin, text: 'Customer address mapping' },
      { icon: MessageSquare, text: 'Basic email notifications' },
      { icon: Headphones, text: 'Email support' },
    ],
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    price: 149,
    tagline: 'Real-time dispatch and automation for growing teams.',
    icon: Rocket,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    badge: 'bg-violet-100 text-violet-700',
    accent: 'border-violet-400',
    limits: { technicians: 'Up to 15 technicians', customers: 'Unlimited customers', jobs: 'Unlimited jobs' },
    features: [
      { icon: Wrench, text: 'Everything in Starter' },
      { icon: Users, text: 'Up to 15 technicians', highlight: true },
      { icon: BarChart3, text: 'Live dispatch board (drag & drop)', highlight: true },
      { icon: MapPin, text: 'GPS geofence time clock', highlight: true },
      { icon: MessageSquare, text: 'SMS & email notifications (Twilio)', highlight: true },
      { icon: FileText, text: 'Estimates & approval workflow', highlight: true },
      { icon: Camera, text: 'Before/after photo uploads (S3)' },
      { icon: Globe, text: 'Customer portal (view jobs & invoices)' },
      { icon: Headphones, text: 'Priority email + chat support' },
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price: 349,
    tagline: 'Unlimited scale, custom branding, and dedicated support.',
    icon: Building2,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    badge: 'bg-indigo-100 text-indigo-700',
    accent: 'border-indigo-400',
    limits: { technicians: 'Unlimited technicians', customers: 'Unlimited customers', jobs: 'Unlimited jobs' },
    features: [
      { icon: Wrench, text: 'Everything in Professional' },
      { icon: Users, text: 'Unlimited technicians', highlight: true },
      { icon: BarChart3, text: 'Advanced analytics & reporting', highlight: true },
      { icon: Shield, text: 'Custom roles & permissions', highlight: true },
      { icon: Globe, text: 'White-label / custom branding', highlight: true },
      { icon: FileText, text: 'API access & webhooks', highlight: true },
      { icon: MessageSquare, text: 'Custom notification templates' },
      { icon: Headphones, text: 'Dedicated account manager', highlight: true },
      { icon: Shield, text: '99.9% uptime SLA guarantee' },
    ],
  },
};

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  active:    { label: 'Active',         color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle },
  trial:     { label: 'Free Trial',     color: 'text-violet-700 bg-violet-50 border-violet-200',   icon: Clock },
  suspended: { label: 'Payment Failed', color: 'text-red-700 bg-red-50 border-red-200',            icon: AlertTriangle },
  cancelled: { label: 'Cancelled',      color: 'text-gray-700 bg-gray-50 border-gray-200',         icon: AlertTriangle },
};

function daysUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86_400_000));
}

function PlanModal({ detail, isCurrent, isSubscribed, onClose, onCheckout, actionLoading }: {
  detail: PlanDetail;
  isCurrent: boolean;
  isSubscribed: boolean;
  onClose: () => void;
  onCheckout: (id: string) => void;
  actionLoading: string;
}) {
  const Icon = detail.icon;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className={`${detail.bg} px-6 pt-6 pb-5 border-b border-gray-100`}>
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-black/10 transition-colors">
            <X className="h-4 w-4 text-gray-500" />
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className={`h-11 w-11 rounded-xl bg-white/70 flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${detail.color}`} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{detail.name} Plan</h2>
              <p className="text-xs text-gray-500">{detail.tagline}</p>
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-bold ${detail.color}`}>${detail.price}</span>
            <span className="text-sm text-gray-400">/month</span>
            {isCurrent && (
              <span className="ml-auto text-xs font-semibold bg-white/80 text-gray-600 px-2.5 py-1 rounded-full">
                Your current plan
              </span>
            )}
          </div>
        </div>

        {/* Limits */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 grid grid-cols-3 gap-3 text-center">
          {Object.values(detail.limits).map((val, i) => (
            <div key={i}>
              <p className={`text-xs font-semibold ${detail.color}`}>{val.split(' ')[0] === 'Up' ? val.split(' ')[2] : val.split(' ')[0]}</p>
              <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                {val.replace(/^Up to /, '').replace(/^Unlimited /, '').replace(/^(\d+)/, '$1')}
              </p>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className="px-6 py-4 space-y-2.5 max-h-64 overflow-y-auto">
          {detail.features.map((f, i) => {
            const FIcon = f.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  f.highlight ? `${detail.bg}` : 'bg-gray-100'
                }`}>
                  <FIcon className={`h-3.5 w-3.5 ${f.highlight ? detail.color : 'text-gray-500'}`} />
                </div>
                <span className={`text-sm ${f.highlight ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                  {f.text}
                </span>
                {f.highlight && <CheckCircle className={`h-3.5 w-3.5 ml-auto flex-shrink-0 ${detail.color}`} />}
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="px-6 pb-6 pt-3 border-t border-gray-100">
          {isCurrent ? (
            <div className="text-center text-sm text-gray-500 py-2">You're on this plan</div>
          ) : (
            <button
              onClick={() => { onCheckout(detail.id); onClose(); }}
              disabled={!!actionLoading}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading === 'checkout-' + detail.id
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ChevronRight className="h-4 w-4" />}
              {isSubscribed ? `Switch to ${detail.name}` : `Start ${detail.name} — 14-day free trial`}
            </button>
          )}
          <p className="text-center text-[11px] text-gray-400 mt-2">
            {isSubscribed ? 'Change takes effect immediately · Cancel anytime' : 'Cancel anytime · No charge until trial ends'}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [modalPlan, setModalPlan] = useState<string | null>(null);

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
  const planDetail = PLAN_DETAILS[plan as keyof typeof PLAN_DETAILS] ?? PLAN_DETAILS.starter;
  const PlanIcon = planDetail.icon;
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
          trialUrgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'
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
            {actionLoading === 'setup' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Add Card
          </button>
        </div>
      )}

      {/* ── Current plan card ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-xl ${planDetail.bg} flex items-center justify-center flex-shrink-0`}>
                <PlanIcon className={`h-6 w-6 ${planDetail.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900">{planDetail.name} Plan</h2>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${planDetail.badge}`}>
                    ${planDetail.price}/mo
                  </span>
                </div>
                <div className={`inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${statusInfo.color}`}>
                  <StatusIcon className="h-3.5 w-3.5" />
                  {statusInfo.label}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 ${
                billing?.hasPaymentMethod
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                <CreditCard className="h-3.5 w-3.5" />
                {billing?.hasPaymentMethod ? 'Card on file' : 'No card'}
              </div>
              <button
                onClick={() => setModalPlan(plan)}
                className={`flex items-center gap-1 text-xs font-medium ${planDetail.color} hover:underline`}
              >
                View plan details
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Current plan feature highlights */}
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {planDetail.features.filter(f => f.highlight).slice(0, 4).map((f, i) => {
              const FIcon = f.icon;
              return (
                <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-xl ${planDetail.bg}`}>
                  <FIcon className={`h-3.5 w-3.5 flex-shrink-0 ${planDetail.color}`} />
                  <span className="text-xs text-gray-700 leading-tight">{f.text.split('(')[0].trim()}</span>
                </div>
              );
            })}
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

      {/* ── Plan comparison ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900">{isSubscribed ? 'Compare plans' : 'Choose a plan'}</h3>
          {isSubscribed && <span className="text-xs text-gray-400">Click any plan to see full details</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Object.values(PLAN_DETAILS).map((detail) => {
            const Icon = detail.icon;
            const isCurrent = detail.id === plan;
            return (
              <div
                key={detail.id}
                onClick={() => setModalPlan(detail.id)}
                className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md group ${
                  isCurrent
                    ? `${detail.bg} ${detail.accent}`
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={`h-4 w-4 ${detail.color}`} />
                  <span className="font-semibold text-gray-900 text-sm">{detail.name}</span>
                  {isCurrent && <span className="text-xs text-gray-400 ml-auto">Current</span>}
                </div>
                <p className={`text-2xl font-bold ${detail.color} mb-1`}>
                  ${detail.price}<span className="text-xs text-gray-400 font-normal">/mo</span>
                </p>
                <p className="text-xs text-gray-400 mb-3 leading-tight">{detail.tagline}</p>

                {/* Top 3 feature bullets */}
                <ul className="space-y-1.5 mb-4">
                  {detail.features.filter(f => f.highlight).slice(0, 3).map((f, i) => {
                    const FIcon = f.icon;
                    return (
                      <li key={i} className="flex items-center gap-1.5">
                        <FIcon className={`h-3 w-3 flex-shrink-0 ${detail.color}`} />
                        <span className="text-xs text-gray-600 leading-tight">{f.text.split('(')[0].trim()}</span>
                      </li>
                    );
                  })}
                  <li className={`flex items-center gap-1.5 ${detail.color} text-xs font-medium group-hover:underline`}>
                    <ChevronRight className="h-3 w-3" />
                    See all {detail.features.length} features
                  </li>
                </ul>

                <button
                  onClick={(e) => { e.stopPropagation(); isCurrent ? undefined : openCheckout(detail.id); }}
                  disabled={isCurrent || !!actionLoading}
                  className={`w-full text-xs font-semibold py-2.5 rounded-xl transition-opacity disabled:opacity-50 ${
                    isCurrent
                      ? `${detail.bg} ${detail.color} opacity-60 cursor-default`
                      : `bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white`
                  }`}
                >
                  {actionLoading === 'checkout-' + detail.id
                    ? 'Loading...'
                    : isCurrent
                      ? 'Current plan'
                      : isSubscribed ? `Switch to ${detail.name}` : `Start ${detail.name} Trial`}
                </button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-400 mt-4">14-day free trial · Card required upfront · Cancel anytime</p>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Payments processed securely by Stripe. Your card is not charged until the trial ends.
      </p>

      {/* ── Plan detail modal ─────────────────────────────────────── */}
      {modalPlan && (
        <PlanModal
          detail={PLAN_DETAILS[modalPlan as keyof typeof PLAN_DETAILS]}
          isCurrent={modalPlan === plan}
          isSubscribed={isSubscribed}
          onClose={() => setModalPlan(null)}
          onCheckout={openCheckout}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}
