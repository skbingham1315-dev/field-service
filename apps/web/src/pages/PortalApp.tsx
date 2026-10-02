/**
 * FieldOps Connect — Customer Portal
 * Served at /portal/:tenantSlug/*
 *
 * Routes (handled client-side):
 *   /portal/:slug          → redirect to login
 *   /portal/:slug/login    → magic link request form
 *   /portal/:slug/verify   → token verification landing
 *   /portal/:slug/dashboard → customer home
 *   /portal/:slug/invoices  → invoice list & pay
 *   /portal/:slug/requests  → work requests
 *   /portal/:slug/messages  → messaging
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AuthPhoto, uploadPhoto } from '../lib/photos';
import {
  Camera,
  FileText,
  Home,
  MessageSquare,
  Clipboard,
  LogOut,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  ChevronRight,
  Loader2,
  ArrowLeft,
  Plus,
  X,
  DollarSign,
} from 'lucide-react';
import axios from 'axios';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalMeResponse {
  id: string;
  email: string;
  phone?: string;
  displayName?: string;
  portalName: string;
  config: {
    primaryColor: string;
    logoUrl?: string;
    enableBilling: boolean;
    enableWorkRequests: boolean;
    enableMessaging: boolean;
  };
  customer?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
    serviceAddresses: Array<{
      id: string;
      street: string;
      city: string;
      state: string;
    }>;
  };
  /** Present instead of `customer` when the portal user is a rental tenant. */
  rental?: {
    propertyId: string;
    propertyName: string;
    address: string;
    leaseEndDate?: string | null;
    /** False for occupants — they live there but aren't named on the lease. */
    isLeaseholder: boolean;
  } | null;
}

/** What the tenant is told about the service fee before they submit. */
interface FeeQuote {
  applies: boolean;
  amount: number | null;
  disclosure: string;
  requiresAcknowledgement: boolean;
  headline?: string;
  acknowledgementLabel?: string;
}

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountDue: number;
  amountPaid: number;
  dueDate?: string;
  issuedAt?: string;
  lineItems: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
}

interface WorkRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  urgency: string;
  category?: string;
  createdAt: string;
  feeStatus?: 'not_applicable' | 'disclosed' | 'waived' | 'assessed' | 'invoiced' | 'paid';
  feeAmount?: string | number | null;
  photos?: Array<{ id: string; createdAt: string }>;
  notes?: RequestNote[];
  feeInvoice?: { invoiceNumber: string; status: string; amountDue: number; squarePaymentUrl?: string | null } | null;
}

interface RequestNote {
  id: string;
  body: string;
  createdAt: string;
  fromTenant: boolean;
  author: string;
}

const MAX_PHOTOS = 8;

interface PortalMessage {
  id: string;
  body: string;
  fromPortal: boolean;
  senderName?: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// `??` is wrong here: VITE_API_URL is set to an EMPTY STRING in .env for dev
// (the Vite proxy handles routing), and ?? only falls back on null/undefined.
// That left API_BASE as '' so every portal call hit the Vite dev server, got
// index.html back with a 200, and silently parsed HTML as JSON.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : '/api/v1';

const INVOICE_STATUS_COLORS: Record<string, string> = {
  draft: 'text-slate-600 bg-slate-100',
  sent: 'text-blue-700 bg-blue-50',
  viewed: 'text-blue-700 bg-blue-50',
  paid: 'text-emerald-700 bg-emerald-50',
  overdue: 'text-red-700 bg-red-50',
  void: 'text-slate-400 bg-slate-50',
};

const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Submitted', color: 'text-purple-700 bg-purple-50' },
  reviewing: { label: 'Under Review', color: 'text-blue-700 bg-blue-50' },
  scheduled: { label: 'Scheduled', color: 'text-amber-700 bg-amber-50' },
  in_progress: { label: 'In Progress', color: 'text-orange-700 bg-orange-50' },
  completed: { label: 'Completed', color: 'text-emerald-700 bg-emerald-50' },
  cancelled: { label: 'Cancelled', color: 'text-slate-500 bg-slate-100' },
};

/**
 * Service-fee outcome, as the tenant sees it. `disclosed` deliberately reads as
 * "may apply" — nothing has been decided at that point, and telling someone they
 * owe money before anyone has looked is how disputes start.
 */
const FEE_STATUS: Record<string, { label: (amount: number | null) => string; color: string }> = {
  disclosed: {
    label: (a) => (a != null ? `$${a.toFixed(2)} fee may apply` : 'Fee may apply'),
    color: 'text-amber-700 bg-amber-50',
  },
  waived: { label: () => 'No fee', color: 'text-emerald-700 bg-emerald-50' },
  assessed: {
    label: (a) => (a != null ? `$${a.toFixed(2)} fee` : 'Fee applies'),
    color: 'text-rose-700 bg-rose-50',
  },
  invoiced: {
    label: (a) => (a != null ? `$${a.toFixed(2)} due` : 'Fee due'),
    color: 'text-rose-700 bg-rose-50',
  },
  paid: { label: () => 'Fee paid', color: 'text-slate-600 bg-slate-100' },
};

// ─── Local storage helpers ────────────────────────────────────────────────────

function getToken(slug: string) {
  return localStorage.getItem(`portal_token_${slug}`);
}
function setToken(slug: string, token: string) {
  localStorage.setItem(`portal_token_${slug}`, token);
}
function clearToken(slug: string) {
  localStorage.removeItem(`portal_token_${slug}`);
}

// ─── Portal API client ───────────────────────────────────────────────────────

function portalApi(slug: string) {
  const token = getToken(slug);
  return axios.create({
    baseURL: API_BASE,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ─── Color utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

// ─── Login Page ───────────────────────────────────────────────────────────────

function PortalLoginPage({
  slug,
  portalName,
  logoUrl,
  primaryColor,
  onSuccess,
  linkExpired,
}: {
  slug: string;
  portalName: string;
  logoUrl?: string;
  primaryColor: string;
  onSuccess: () => void;
  /** Arrived via a sign-in link that was expired or already used. */
  linkExpired?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      await axios.post(`${API_BASE}/portal/auth/magic-link`, { email, tenantSlug: slug });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Failed to send login link. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-50 px-4"
      style={{ '--brand': hexToRgb(primaryColor) } as React.CSSProperties}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          {logoUrl ? (
            <img src={logoUrl} alt={portalName} className="h-12 mx-auto mb-3 object-contain" />
          ) : (
            <div
              className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center text-white font-bold text-xl"
              style={{ background: primaryColor }}
            >
              {portalName.charAt(0)}
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-900">{portalName}</h1>
          <p className="text-sm text-slate-500 mt-1">Sign in to your account</p>
        </div>

        {linkExpired && !sent && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            That sign-in link has expired or was already used. Enter your email below and we'll send you a new one.
          </div>
        )}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-3" style={{ color: primaryColor }} />
              <h2 className="font-semibold text-slate-800 mb-1">Check your email</h2>
              <p className="text-sm text-slate-500">
                We sent a sign-in link to <strong>{email}</strong>. It expires in 15 minutes.
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-4 text-sm text-slate-500 hover:text-slate-700 underline"
              >
                Try a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 transition-shadow"
                  style={{ '--tw-ring-color': primaryColor } as any}
                  placeholder="you@example.com"
                  required
                  autoFocus
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-2.5 rounded-xl text-white font-medium text-sm transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: primaryColor }}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                ) : (
                  'Send Sign-In Link'
                )}
              </button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-4">
          Powered by FieldOps Connect
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard (home) ─────────────────────────────────────────────────────────

function DashboardTab({ me, primaryColor, onNavigate }: {
  me: PortalMeResponse;
  primaryColor: string;
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-1">
          Welcome back{me.displayName ? `, ${me.displayName.split(' ')[0]}` : ''}!
        </h2>
        <p className="text-sm text-slate-500">{me.email}</p>
        {me.customer && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium mb-1">Service Address</p>
            {me.customer.serviceAddresses.slice(0, 1).map((a) => (
              <p key={a.id} className="text-sm text-slate-700">
                {a.street}, {a.city}, {a.state}
              </p>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {me.config.enableBilling && (
          <button
            onClick={() => onNavigate('invoices')}
            className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 transition-colors flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${primaryColor}15` }}>
              <FileText className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-800 text-sm">Invoices & Payments</p>
              <p className="text-xs text-slate-500">View and pay your invoices</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        )}

        {me.config.enableWorkRequests && (
          <button
            onClick={() => onNavigate('requests')}
            className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 transition-colors flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${primaryColor}15` }}>
              <Clipboard className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-800 text-sm">Service Requests</p>
              <p className="text-xs text-slate-500">Submit and track work requests</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        )}

        {me.config.enableMessaging && (
          <button
            onClick={() => onNavigate('messages')}
            className="bg-white rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 transition-colors flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${primaryColor}15` }}>
              <MessageSquare className="h-5 w-5" style={{ color: primaryColor }} />
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-800 text-sm">Messages</p>
              <p className="text-xs text-slate-500">Chat with your service team</p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

function InvoicesTab({ slug, primaryColor }: { slug: string; primaryColor: string }) {
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    portalApi(slug)
      .get('/portal/invoices')
      .then((r) => setInvoices(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  function fmt(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-slate-800">Invoices</h2>
      {invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <FileText className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No invoices yet</p>
        </div>
      ) : (
        invoices.map((inv) => (
          <div key={inv.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <button
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-800">#{inv.invoiceNumber}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${INVOICE_STATUS_COLORS[inv.status] ?? 'text-slate-600 bg-slate-100'}`}>
                    {inv.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : '—'}
                  {inv.dueDate ? ` · Due ${new Date(inv.dueDate).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">{fmt(inv.total)}</p>
                {inv.amountDue > 0 && inv.status !== 'paid' && (
                  <p className="text-xs text-red-600">{fmt(inv.amountDue)} due</p>
                )}
              </div>
            </button>
            {expanded === inv.id && (
              <div className="px-5 pb-5 border-t border-slate-100">
                <table className="w-full text-sm mt-3">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-100">
                      <th className="text-left py-1.5 font-medium">Description</th>
                      <th className="text-right py-1.5 font-medium">Qty</th>
                      <th className="text-right py-1.5 font-medium">Unit</th>
                      <th className="text-right py-1.5 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lineItems.map((li, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="py-2 text-slate-700">{li.description}</td>
                        <td className="py-2 text-right text-slate-600">{li.quantity}</td>
                        <td className="py-2 text-right text-slate-600">{fmt(li.unitPrice)}</td>
                        <td className="py-2 text-right font-medium text-slate-800">{fmt(li.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="text-right py-2 font-semibold text-slate-700 text-sm">Total</td>
                      <td className="text-right py-2 font-bold text-slate-900">{fmt(inv.total)}</td>
                    </tr>
                  </tfoot>
                </table>
                {inv.amountDue > 0 && inv.status !== 'paid' && inv.status !== 'void' && (
                  <div className="mt-4 flex justify-end">
                    <button
                      className="px-5 py-2.5 rounded-xl text-white text-sm font-medium"
                      style={{ background: primaryColor }}
                      onClick={() => {
                        // Service-fee invoices are collected through Square; everything else uses /pay.
                        if ((inv as any).squarePaymentUrl) {
                          window.open((inv as any).squarePaymentUrl, '_blank');
                        } else if ((inv as any).payToken) {
                          window.open(`/pay/${(inv as any).payToken}`, '_blank');
                        }
                      }}
                    >
                      Pay {fmt(inv.amountDue)}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Work Requests ────────────────────────────────────────────────────────────

function RequestsTab({ slug, primaryColor, me }: { slug: string; primaryColor: string; me: PortalMeResponse }) {
  const [requests, setRequests] = useState<WorkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', urgency: 'normal', category: '', serviceAddress: '' });
  const [submitting, setSubmitting] = useState(false);
  const [fee, setFee] = useState<FeeQuote | null>(null);
  const [acknowledgedFee, setAcknowledgedFee] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [extraNote, setExtraNote] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const client = useMemo(() => portalApi(slug), [slug]);

  function loadRequests() {
    portalApi(slug)
      .get('/portal/work-requests')
      .then((r) => setRequests(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadRequests(); }, [slug]);

  // Re-quote whenever urgency changes — emergencies are typically fee-free, so
  // the disclosure has to track the selection rather than being fetched once.
  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    portalApi(slug)
      .get('/portal/service-fee', { params: { urgency: form.urgency } })
      .then((r) => { if (!cancelled) setFee(r.data); })
      .catch(() => { if (!cancelled) setFee(null); });
    return () => { cancelled = true; };
  }, [slug, showForm, form.urgency]);

  // A fresh quote means a fresh decision — never carry a tick across a change
  // that altered what the tenant is agreeing to.
  useEffect(() => { setAcknowledgedFee(false); }, [fee?.amount, fee?.applies]);

  function resetForm() {
    setShowForm(false);
    setForm({ title: '', description: '', urgency: 'normal', category: '', serviceAddress: '' });
    setAcknowledgedFee(false);
    setSubmitError(null);
    setPhotos([]);
    setExtraNote('');
  }

  async function submitRequest() {
    if (!form.title || !form.description) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data: created } = await client.post('/portal/work-requests', { ...form, acknowledgedFee });
      // The request exists now; photos and the note are extras. If one fails,
      // say so but don't pretend the request wasn't submitted.
      let failed = 0;
      for (const p of photos) {
        try { await uploadPhoto(client, `/portal/work-requests/${created.id}/photos`, p); } catch { failed++; }
      }
      if (extraNote.trim()) {
        await client.post(`/portal/work-requests/${created.id}/notes`, { body: extraNote.trim() }).catch(() => { failed++; });
      }
      resetForm();
      loadRequests();
      setExpanded(created.id);
      if (failed) {
        window.alert('Your request was submitted, but some photos or your note did not upload. Open the request below to try adding them again.');
      }
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.error ?? 'Could not submit your request. Please try again.',
      );
    }
    setSubmitting(false);
  }

  const needsAck = Boolean(fee?.requiresAcknowledgement);
  // Only co-tenants hit this — everyone else gets an address from their lease or customer record.
  const needsTypedAddress = !me.rental && !me.customer?.serviceAddresses?.length;
  const canSubmit =
    Boolean(form.title) &&
    Boolean(form.description) &&
    (!needsTypedAddress || Boolean(form.serviceAddress.trim())) &&
    (!needsAck || acknowledgedFee);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Service Requests</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-medium"
          style={{ background: primaryColor }}
        >
          <Plus className="h-4 w-4" /> New Request
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">New Service Request</h3>
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                placeholder="e.g. Pool pump repair"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                rows={3}
                placeholder="Describe the issue in detail…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Urgency</label>
                <select
                  value={form.urgency}
                  onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="e.g. Pool, Pest, Landscaping"
                />
              </div>
            </div>
            {me.rental && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Service Address</label>
                <div className="w-full border border-slate-200 bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-600">
                  {me.rental.address}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Taken from your lease. Contact the office if this is wrong.
                </p>
              </div>
            )}
            {me.customer && me.customer.serviceAddresses.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Service Address</label>
                <select
                  value={form.serviceAddress}
                  onChange={(e) => setForm((f) => ({ ...f, serviceAddress: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                >
                  <option value="">Select address…</option>
                  {me.customer.serviceAddresses.map((a) => (
                    <option key={a.id} value={`${a.street}, ${a.city}, ${a.state}`}>
                      {a.street}, {a.city}, {a.state}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Co-tenants aren't named on a lease, so nothing resolves an address for
                them. Without this they'd submit a request with no address at all. */}
            {!me.rental && !me.customer?.serviceAddresses?.length && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Service Address *
                </label>
                <input
                  value={form.serviceAddress}
                  onChange={(e) => setForm((f) => ({ ...f, serviceAddress: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                  placeholder="Street address of the property"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Notes for the technician <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={extraNote}
                onChange={(e) => setExtraNote(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                rows={2}
                maxLength={2000}
                placeholder="Pets at home, gate or lockbox details, best times to come by…"
              />
            </div>
            <PhotoPicker files={photos} onChange={setPhotos} primaryColor={primaryColor} />
            {fee?.disclosure && (
              <div
                className={`rounded-xl border p-3 ${
                  fee.applies
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-emerald-200 bg-emerald-50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      fee.applies ? 'text-amber-600' : 'text-emerald-600'
                    }`}
                  />
                  <div className="flex-1">
                    {fee.applies && fee.amount != null && (
                      <p className="text-sm font-semibold text-amber-900 mb-0.5">
                        {fee.headline || `$${fee.amount.toFixed(2)} service fee may apply`}
                      </p>
                    )}
                    <p
                      className={`text-xs leading-relaxed whitespace-pre-line max-h-56 overflow-y-auto ${
                        fee.applies ? 'text-amber-800' : 'text-emerald-800'
                      }`}
                    >
                      {fee.disclosure}
                    </p>
                    {needsAck && (
                      <label className="flex items-start gap-2 mt-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={acknowledgedFee}
                          onChange={(e) => setAcknowledgedFee(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-amber-300"
                        />
                        <span className="text-xs font-medium text-amber-900">
                          {fee.acknowledgementLabel ||
                            `I understand a $${fee.amount?.toFixed(2)} service fee may apply to this request.`}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}

            {submitError && (
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={resetForm}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={submitRequest}
                disabled={!canSubmit || submitting}
                className="px-5 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                style={{ background: primaryColor }}
              >
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {requests.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Clipboard className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No service requests yet.</p>
        </div>
      ) : (
        requests.map((r) => {
          const statusInfo = REQUEST_STATUS[r.status] ?? { label: r.status, color: 'text-slate-600 bg-slate-100' };
          return (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-800">{r.title}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    {r.urgency !== 'normal' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium text-amber-700 bg-amber-50">
                        {r.urgency}
                      </span>
                    )}
                    {r.feeStatus && r.feeStatus !== 'not_applicable' && (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          FEE_STATUS[r.feeStatus].color
                        }`}
                      >
                        {FEE_STATUS[r.feeStatus].label(
                          r.feeAmount != null ? Number(r.feeAmount) : null,
                        )}
                      </span>
                    )}
                  </div>
                  {r.feeStatus === 'invoiced' && r.feeInvoice?.squarePaymentUrl && r.feeInvoice.amountDue > 0 && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap rounded-xl border border-rose-100 bg-rose-50 px-3 py-2">
                      <span className="text-xs text-rose-800 flex-1">
                        Service fee of ${(r.feeInvoice.amountDue / 100).toFixed(2)} is due (invoice {r.feeInvoice.invoiceNumber}).
                      </span>
                      <a
                        href={r.feeInvoice.squarePaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                        style={{ background: primaryColor }}
                      >
                        Pay now
                      </a>
                    </div>
                  )}
                  <p className={`text-xs text-slate-500 mt-1 ${expanded === r.id ? 'whitespace-pre-line' : 'line-clamp-2'}`}>{r.description}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                    <button
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      className="text-xs font-medium"
                      style={{ color: primaryColor }}
                    >
                      {expanded === r.id
                        ? 'Hide details'
                        : `Notes & photos${(r.photos?.length ?? 0) + (r.notes?.length ?? 0) ? ` (${(r.photos?.length ?? 0)} photo${r.photos?.length === 1 ? '' : 's'}, ${r.notes?.length ?? 0} note${r.notes?.length === 1 ? '' : 's'})` : ''}`}
                    </button>
                  </div>
                </div>
              </div>
              {expanded === r.id && (
                <RequestDetail request={r} client={client} primaryColor={primaryColor} onChanged={loadRequests} />
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── Photos & notes on a request ──────────────────────────────────────────────

function PhotoPicker({ files, onChange, primaryColor }: { files: File[]; onChange: (f: File[]) => void; primaryColor: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        Photos <span className="text-slate-400 font-normal">(optional, up to {MAX_PHOTOS})</span>
      </label>
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative h-16 w-16">
            <img src={src} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-slate-800 text-white flex items-center justify-center"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="h-16 w-16 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:text-slate-600 flex flex-col items-center justify-center text-[10px] gap-0.5"
            style={{ borderColor: files.length ? undefined : primaryColor + '55' }}
          >
            <Camera className="h-4 w-4" /> Add
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []).filter((x) => x.type.startsWith('image/') || /\.(heic|heif)$/i.test(x.name));
          onChange([...files, ...picked].slice(0, MAX_PHOTOS));
          e.target.value = '';
        }}
      />
      <p className="text-[11px] text-slate-400 mt-1">A photo of the problem helps us send the right person with the right parts.</p>
    </div>
  );
}

function RequestDetail({
  request,
  client,
  primaryColor,
  onChanged,
}: {
  request: WorkRequest;
  client: ReturnType<typeof portalApi>;
  primaryColor: string;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'note' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoCount = request.photos?.length ?? 0;
  const closed = request.status === 'cancelled';

  async function addNote() {
    if (!note.trim()) return;
    setBusy('note');
    setError(null);
    try {
      await client.post(`/portal/work-requests/${request.id}/notes`, { body: note.trim() });
      setNote('');
      onChanged();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not save your note. Please try again.');
    }
    setBusy(null);
  }

  async function addPhotos(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, MAX_PHOTOS - photoCount);
    if (!files.length) return;
    setBusy('photo');
    setError(null);
    let failed = 0;
    for (const f of files) {
      try { await uploadPhoto(client, `/portal/work-requests/${request.id}/photos`, f); } catch { failed++; }
    }
    if (failed) setError(`${failed} photo${failed === 1 ? '' : 's'} could not be uploaded.`);
    setBusy(null);
    onChanged();
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">Photos</p>
        <div className="flex flex-wrap gap-2">
          {request.photos?.map((p) => (
            <AuthPhoto
              key={p.id}
              client={client}
              url={`/portal/work-requests/${request.id}/photos/${p.id}`}
              className="h-20 w-20 rounded-lg border border-slate-200"
            />
          ))}
          {!closed && photoCount < MAX_PHOTOS && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy === 'photo'}
              className="h-20 w-20 rounded-lg border-2 border-dashed border-slate-200 text-slate-400 hover:text-slate-600 flex flex-col items-center justify-center text-[11px] gap-1"
            >
              {busy === 'photo' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              {busy === 'photo' ? 'Uploading' : 'Add photo'}
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">Notes</p>
        {request.notes?.length ? (
          <div className="space-y-2 mb-2">
            {request.notes.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl px-3 py-2 text-sm ${n.fromTenant ? 'bg-slate-50 border border-slate-100' : 'border'}`}
                style={n.fromTenant ? undefined : { borderColor: primaryColor + '40', background: primaryColor + '0d' }}
              >
                <p className="text-slate-700 whitespace-pre-line">{n.body}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {n.fromTenant ? 'You' : n.author} · {new Date(n.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 mb-2">No notes yet.</p>
        )}
        {!closed && (
          <div className="flex gap-2">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Add a note — e.g. it got worse, or when you'll be home"
              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
            />
            <button
              onClick={addNote}
              disabled={!note.trim() || busy === 'note'}
              className="self-end px-3 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50"
              style={{ background: primaryColor }}
            >
              {busy === 'note' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add note'}
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

// ─── Messages ─────────────────────────────────────────────────────────────────

function MessagesTab({ slug, primaryColor }: { slug: string; primaryColor: string }) {
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  function loadMessages() {
    portalApi(slug)
      .get('/portal/messages')
      .then((r) => {
        setMessages(r.data);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 15000);
    return () => clearInterval(interval);
  }, [slug]);

  async function send() {
    if (!body.trim()) return;
    setSending(true);
    try {
      await portalApi(slug).post('/portal/messages', { body: body.trim() });
      setBody('');
      loadMessages();
    } catch {}
    setSending(false);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[400px]">
      <h2 className="font-semibold text-slate-800 mb-4 flex-shrink-0">Messages</h2>
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.length === 0 && (
          <div className="text-center py-10">
            <MessageSquare className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No messages yet. Send one to get started!</p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.fromPortal ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                m.fromPortal
                  ? 'text-white'
                  : 'bg-slate-100 text-slate-800'
              }`}
              style={m.fromPortal ? { background: primaryColor } : {}}
            >
              {m.senderName && !m.fromPortal && (
                <p className="text-[10px] font-semibold opacity-60 mb-0.5">{m.senderName}</p>
              )}
              <p>{m.body}</p>
              <p className={`text-[10px] mt-1 ${m.fromPortal ? 'opacity-60' : 'text-slate-400'}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 flex-shrink-0 pt-3 border-t border-slate-100">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && body.trim()) {
              e.preventDefault();
              send();
            }
          }}
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
          placeholder="Type a message…"
        />
        <button
          onClick={send}
          disabled={!body.trim() || sending}
          className="px-4 py-2 rounded-xl text-white flex items-center gap-1.5 disabled:opacity-50"
          style={{ background: primaryColor }}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

// ─── Portal Shell ─────────────────────────────────────────────────────────────

export function PortalApp() {
  // Extract slug from URL: /portal/:slug/*
  const pathParts = window.location.pathname.split('/');
  const slug = pathParts[2] ?? '';
  const subPath = pathParts[3] ?? '';

  const [tab, setTabState] = useState<string>(() => {
    if (subPath === 'invoices') return 'invoices';
    if (subPath === 'requests') return 'requests';
    if (subPath === 'messages') return 'messages';
    return 'dashboard';
  });

  // Sync tab with URL for browser back/forward support
  const setTab = useCallback((newTab: string) => {
    setTabState(newTab);
    const newPath = newTab === 'dashboard' ? `/portal/${slug}` : `/portal/${slug}/${newTab}`;
    window.history.pushState({}, '', newPath);
  }, [slug]);

  useEffect(() => {
    const onPop = () => {
      const parts = window.location.pathname.split('/');
      const sub = parts[3] ?? '';
      setTabState(['invoices', 'requests', 'messages'].includes(sub) ? sub : 'dashboard');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);

  // Check for magic link token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const magicToken = urlParams.get('token');

  useEffect(() => {
    if (magicToken) {
      // Verify the magic link token
      setVerifying(true);
      axios
        .get(`${API_BASE}/portal/auth/verify?token=${magicToken}`)
        .then((r) => {
          setToken(slug, r.data.token);
          window.history.replaceState({}, '', window.location.pathname);
          loadMe();
        })
        .catch(() => {
          // Strip the dead token so a refresh doesn't retry it, and say why
          // they're looking at the sign-in form.
          window.history.replaceState({}, '', `/portal/${slug}`);
          setLinkExpired(true);
          setVerifying(false);
          setAuthLoading(false);
        });
    } else {
      loadMe();
    }
  }, []);

  function loadMe() {
    const token = getToken(slug);
    if (!token) {
      setAuthLoading(false);
      return;
    }
    axios
      .get(`${API_BASE}/portal/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setMe(r.data))
      .catch(() => clearToken(slug))
      .finally(() => {
        setVerifying(false);
        setAuthLoading(false);
      });
  }

  function logout() {
    clearToken(slug);
    setMe(null);
  }

  const primaryColor = me?.config.primaryColor ?? '#2563eb';
  const portalName = me?.portalName ?? 'Customer Portal';

  if (authLoading || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" style={{ color: primaryColor }} />
          <p className="text-sm text-slate-500">
            {verifying ? 'Signing you in…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <PortalLoginPage
        slug={slug}
        portalName={portalName}
        primaryColor={primaryColor}
        onSuccess={() => loadMe()}
        linkExpired={linkExpired}
      />
    );
  }

  const NAV_ITEMS: Array<{ id: string; label: string; icon: React.ElementType; feature?: keyof typeof me.config }> = [
    { id: 'dashboard', label: 'Home', icon: Home },
    { id: 'invoices', label: 'Invoices', icon: FileText, feature: 'enableBilling' },
    { id: 'requests', label: 'Requests', icon: Clipboard, feature: 'enableWorkRequests' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, feature: 'enableMessaging' },
  ];

  const visibleNav = NAV_ITEMS.filter(
    (n) => !n.feature || me.config[n.feature as keyof typeof me.config],
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 py-3 text-white shadow-sm"
        style={{ background: primaryColor }}
      >
        <div className="flex items-center gap-2.5">
          {me.config.logoUrl ? (
            <img src={me.config.logoUrl} alt={portalName} className="h-7 object-contain" />
          ) : (
            <span className="font-bold text-lg">{portalName}</span>
          )}
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-5">
        {tab === 'dashboard' && (
          <DashboardTab me={me} primaryColor={primaryColor} onNavigate={setTab} />
        )}
        {tab === 'invoices' && (
          <InvoicesTab slug={slug} primaryColor={primaryColor} />
        )}
        {tab === 'requests' && (
          <RequestsTab slug={slug} primaryColor={primaryColor} me={me} />
        )}
        {tab === 'messages' && (
          <MessagesTab slug={slug} primaryColor={primaryColor} />
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="bg-white border-t border-slate-200 flex items-center sticky bottom-0">
        {visibleNav.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
              style={active ? { color: primaryColor } : { color: '#94a3b8' }}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{n.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
