/**
 * FieldOps Connect — Admin Configuration Page
 * Accessible from the main nav under "Connect"
 * Allows owners/admins to configure the customer portal,
 * manage portal users, view message threads, and review work requests.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import {
  Settings,
  Users,
  MessageSquare,
  Clipboard,
  Globe,
  Palette,
  Bell,
  Shield,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  UserPlus,
  X,
  Loader2,
  Eye,
  EyeOff,
  FlaskConical,
  Mail,
} from 'lucide-react';
import { AuthPhoto } from '../lib/photos';
import { Button, Badge } from '@fsp/ui';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortalConfig {
  id?: string;
  tenantId?: string;
  isEnabled: boolean;
  portalName: string;
  logoUrl?: string;
  primaryColor: string;
  customDomain?: string;
  enableBilling: boolean;
  enableWorkRequests: boolean;
  enableMessaging: boolean;
  enableDocuments: boolean;
  allowMagicLink: boolean;
  allowSmsOtp: boolean;
  notifyOnJobUpdate: boolean;
  notifyOnInvoice: boolean;
  notifyOnMessage: boolean;
}

interface PortalUser {
  id: string;
  email: string;
  phone?: string;
  displayName?: string;
  isActive: boolean;
  lastLoginAt?: string;
  customerId?: string;
  customer?: { firstName: string; lastName: string; email?: string };
  /** Rental tenants resolve to a property; plain customers do not. */
  isRentalTenant?: boolean;
  property?: string | null;
  role?: 'leaseholder' | 'occupant' | null;
}

interface WorkRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  urgency: string;
  category?: string;
  serviceAddress?: string;
  createdAt: string;
  portalUser: { email: string; displayName?: string; customerId?: string };
  isTest?: boolean;
  photos?: Array<{ id: string; createdAt: string }>;
  notes?: Array<{ id: string; body: string; createdAt: string; fromTenant: boolean; author: string }>;
  feeStatus: 'not_applicable' | 'disclosed' | 'waived' | 'assessed' | 'invoiced' | 'paid';
  feeAmount?: string | number | null;
  feeAcknowledgedAt?: string | null;
  feeInvoice?: {
    id: string;
    invoiceNumber: string;
    status: string;
    amountDue: number;
    squarePaymentUrl?: string | null;
    paidAt?: string | null;
  } | null;
}

const FEE_BADGE: Record<WorkRequest['feeStatus'], { label: string; cls: string }> = {
  not_applicable: { label: 'No fee', cls: 'text-slate-500 bg-slate-100' },
  disclosed: { label: 'Fee agreed', cls: 'text-amber-700 bg-amber-50' },
  assessed: { label: 'Fee owed', cls: 'text-amber-700 bg-amber-50' },
  waived: { label: 'Fee waived', cls: 'text-slate-600 bg-slate-100' },
  invoiced: { label: 'Fee invoiced', cls: 'text-blue-700 bg-blue-50' },
  paid: { label: 'Fee paid', cls: 'text-emerald-700 bg-emerald-50' },
};

interface MessageThread {
  portalUserId: string;
  email: string;
  displayName?: string;
  customer?: { firstName: string; lastName: string };
  lastMessage: { body: string; fromPortal: boolean; createdAt: string };
  unreadCount: number;
}

interface PortalMessage {
  id: string;
  body: string;
  fromPortal: boolean;
  senderName?: string;
  isRead: boolean;
  createdAt: string;
}

// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = 'settings' | 'users' | 'messages' | 'work-requests' | 'test';

const URGENCY_COLORS: Record<string, string> = {
  low: 'text-slate-500 bg-slate-100',
  normal: 'text-blue-700 bg-blue-50',
  high: 'text-amber-700 bg-amber-50',
  emergency: 'text-red-700 bg-red-50',
};

const STATUS_COLORS: Record<string, string> = {
  submitted: 'text-purple-700 bg-purple-50',
  reviewing: 'text-blue-700 bg-blue-50',
  scheduled: 'text-amber-700 bg-amber-50',
  in_progress: 'text-orange-700 bg-orange-50',
  completed: 'text-emerald-700 bg-emerald-50',
  cancelled: 'text-slate-500 bg-slate-100',
};

// ─── Settings Tab ─────────────────────────────────────────────────────────────

function SettingsTab() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const tenantSlug = (user as any)?.tenantSlug ?? '';

  const { data: config, isLoading } = useQuery<PortalConfig>({
    queryKey: ['portal-config'],
    queryFn: () => api.get('/portal/config').then((r) => r.data),
  });

  const [form, setForm] = useState<PortalConfig>({
    isEnabled: false,
    portalName: 'Customer Portal',
    primaryColor: '#2563eb',
    enableBilling: true,
    enableWorkRequests: true,
    enableMessaging: true,
    enableDocuments: false,
    allowMagicLink: true,
    allowSmsOtp: false,
    notifyOnJobUpdate: true,
    notifyOnInvoice: true,
    notifyOnMessage: true,
  });
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (config && !loaded) {
    setForm({ ...form, ...config });
    setLoaded(true);
  }

  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api.put('/portal/config', form).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['portal-config'] }); toast.success('Portal settings saved'); },
    onError: () => toast.error('Failed to save portal settings'),
  });

  const portalUrl = `${window.location.origin}/portal/${tenantSlug}`;

  function toggle(key: keyof PortalConfig) {
    setForm((f) => ({ ...f, [key]: !(f[key] as boolean) }));
  }

  function ToggleRow({
    label,
    desc,
    field,
  }: {
    label: string;
    desc: string;
    field: keyof PortalConfig;
  }) {
    const val = form[field] as boolean;
    return (
      <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
        <div>
          <p className="text-sm font-medium text-slate-800">{label}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        <button
          onClick={() => toggle(field)}
          className={`relative w-11 h-6 rounded-full transition-colors ${val ? 'bg-blue-600' : 'bg-slate-200'}`}
        >
          <span
            className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${val ? 'left-6' : 'left-1'}`}
          />
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Enable / Portal URL */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-slate-800">Customer Portal</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Give customers a white-labeled portal to view jobs, pay invoices, and message your team.
            </p>
          </div>
          <button
            onClick={() => toggle('isEnabled')}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.isEnabled ? 'bg-emerald-500' : 'bg-slate-200'}`}
          >
            <span
              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.isEnabled ? 'left-7' : 'left-1'}`}
            />
          </button>
        </div>

        {form.isEnabled && (
          <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2.5">
            <Globe className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm text-slate-600 flex-1 truncate">{portalUrl}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(portalUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="text-slate-400 hover:text-slate-700"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <a href={portalUrl} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-blue-600">
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        )}
      </div>

      {/* Branding */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-4 w-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800">Branding</h3>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Portal Name</label>
            <input
              value={form.portalName}
              onChange={(e) => setForm((f) => ({ ...f, portalName: e.target.value }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="My Customer Portal"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Brand Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-1"
                />
                <input
                  value={form.primaryColor}
                  onChange={(e) => setForm((f) => ({ ...f, primaryColor: e.target.value }))}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Logo URL</label>
              <input
                value={form.logoUrl ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value || undefined }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://..."
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Custom Domain <span className="text-slate-400">(optional)</span>
            </label>
            <input
              value={form.customDomain ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, customDomain: e.target.value || undefined }))}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="portal.yourcompany.com"
            />
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800">Features</h3>
        </div>
        <ToggleRow label="Billing & Payments" desc="Customers can view and pay invoices" field="enableBilling" />
        <ToggleRow label="Work Requests" desc="Customers can submit service requests" field="enableWorkRequests" />
        <ToggleRow label="Messaging" desc="In-app chat between customers and your team" field="enableMessaging" />
        <ToggleRow label="Documents" desc="Share documents and reports with customers" field="enableDocuments" />
      </div>

      {/* Auth */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800">Authentication</h3>
        </div>
        <ToggleRow
          label="Magic Link (Email)"
          desc="Customers receive a one-click sign-in link by email"
          field="allowMagicLink"
        />
        <ToggleRow
          label="SMS OTP"
          desc="Customers verify with a 6-digit code sent to their phone"
          field="allowSmsOtp"
        />
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="h-4 w-4 text-slate-500" />
          <h3 className="font-semibold text-slate-800">Customer Notifications</h3>
        </div>
        <ToggleRow label="Job Status Updates" desc="Email when job status changes" field="notifyOnJobUpdate" />
        <ToggleRow label="Invoice Reminders" desc="Email when invoice is sent or overdue" field="notifyOnInvoice" />
        <ToggleRow label="New Messages" desc="Email when your team sends a message" field="notifyOnMessage" />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="min-w-[120px]"
        >
          {save.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </span>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: '', displayName: '', phone: '' });

  const { data: users = [], isLoading } = useQuery<PortalUser[]>({
    queryKey: ['portal-users'],
    queryFn: () => api.get('/portal/users').then((r) => r.data),
  });

  const toast = useToast();
  const createUser = useMutation({
    mutationFn: () => api.post('/portal/users', invite).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-users'] });
      setShowInvite(false);
      setInvite({ email: '', displayName: '', phone: '' });
      toast.success('Account created. No email was sent — use Send login link when ready.');
    },
    onError: () => toast.error('Failed to create account'),
  });

  // Nothing here goes out on its own — one person, one click, every time.
  const [sending, setSending] = useState<string | null>(null);
  const [preview, setPreview] = useState<
    { userId: string; to: string; subject: string; html: string; firstEmail: boolean } | null
  >(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const openPreview = async (id: string) => {
    setPreviewLoading(id);
    try {
      const { data } = await api.get(`/portal/users/${id}/invite-preview`);
      setPreview({ userId: id, ...data });
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Could not load the email preview');
    } finally {
      setPreviewLoading(null);
    }
  };
  const confirmAndSend = (u: { id: string; email: string; lastLoginAt?: string }) => {
    const what = u.lastLoginAt ? 'a sign-in link' : 'the welcome email';
    if (window.confirm(`Send ${what} to ${u.email}?\n\nThis emails the tenant right away.`)) sendLink.mutate(u.id);
  };
  const sendLink = useMutation({
    mutationFn: (id: string) =>
      api.post(`/portal/users/${id}/send-login-link`).then((r) => r.data),
    onMutate: (id: string) => setSending(id),
    onSettled: () => setSending(null),
    onSuccess: (data: { result: string; message: string; link?: string }) => {
      qc.invalidateQueries({ queryKey: ['portal-users'] });
      if (data.result === 'sent') toast.success(data.message);
      // Simulated and failed are NOT successes — say so plainly rather than
      // letting an operator believe a tenant was emailed.
      else if (data.result === 'simulated') {
        toast.error(data.message);
        // eslint-disable-next-line no-console
        console.info('[portal] sign-in link (email not configured):', data.link);
      } else toast.error(data.message);
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error ?? 'Could not send the login link'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/portal/users/${id}`, { isActive }).then((r) => r.data),
    onSuccess: (_data, { isActive }) => { qc.invalidateQueries({ queryKey: ['portal-users'] }); toast.success(isActive ? 'User activated' : 'User deactivated'); },
    onError: () => toast.error('Failed to update user'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Portal Users</h3>
          <p className="text-sm text-slate-500">
            {users.length} with portal access
            {users.filter((u) => !u.lastLoginAt).length > 0 &&
              ` · ${users.filter((u) => !u.lastLoginAt).length} never signed in`}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Nothing is emailed automatically. New tenants get a welcome email (link valid 7 days); use Preview to see it first.
          </p>
        </div>
        <Button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" /> Add Portal User
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-800">Add Portal User</h4>
            <button onClick={() => setShowInvite(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
              <input
                value={invite.email}
                onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="customer@example.com"
                type="email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Display Name</label>
              <input
                value={invite.displayName}
                onChange={(e) => setInvite((i) => ({ ...i, displayName: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input
                value={invite.phone}
                onChange={(e) => setInvite((i) => ({ ...i, phone: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createUser.mutate()}
              disabled={!invite.email || createUser.isPending}
            >
              {createUser.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                </span>
              ) : (
                'Create Account'
              )}
            </Button>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">
                  {preview.firstEmail ? 'Welcome email' : 'Welcome email (this person has signed in before, so Send gives them a plain sign-in link instead)'}
                </p>
                <p className="text-sm font-semibold text-slate-800 truncate">{preview.subject}</p>
                <p className="text-xs text-slate-500 truncate">To: {preview.to}</p>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe
              title="Email preview"
              srcDoc={preview.html}
              sandbox=""
              className="flex-1 w-full min-h-[480px] bg-slate-100"
            />
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">Preview only — the button in it does nothing and nothing has been sent.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
                <Button
                  onClick={() => {
                    const u = users.find((x) => x.id === preview.userId);
                    setPreview(null);
                    if (u) confirmAndSend(u);
                  }}
                >
                  Send…
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {users.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No portal users yet. Invite a customer to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {users.map((u, i) => (
            <div
              key={u.id}
              className={`flex items-center gap-4 px-5 py-4 ${i < users.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {(u.displayName ?? u.email).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">
                  {u.displayName ?? u.email}
                </p>
                <p className="text-xs text-slate-500 truncate">{u.email}</p>
                {u.property && (
                  <p className="text-xs text-slate-400">
                    {u.property}
                    {u.role === 'occupant' && ' · occupant'}
                    {u.role === 'leaseholder' && ' · leaseholder'}
                  </p>
                )}
                {!u.property && u.customer && (
                  <p className="text-xs text-slate-400">
                    Linked: {u.customer.firstName} {u.customer.lastName}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                {u.lastLoginAt ? (
                  <span className="text-xs text-slate-400">
                    Last login {new Date(u.lastLoginAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs font-medium text-amber-600">Never signed in</span>
                )}
                <Badge variant={u.isActive ? 'success' : 'secondary'}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <button
                  onClick={() => openPreview(u.id)}
                  disabled={previewLoading === u.id}
                  className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
                  title={`See the email ${u.email} would receive`}
                >
                  {previewLoading === u.id ? 'Loading…' : 'Preview'}
                </button>
                <Button
                  variant="outline"
                  onClick={() => confirmAndSend(u)}
                  disabled={!u.isActive || sending === u.id}
                  className="text-xs px-3 py-1.5 h-auto"
                  title={u.lastLoginAt ? `Email a sign-in link to ${u.email}` : `Email the welcome invitation to ${u.email}`}
                >
                  {sending === u.id ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" /> Sending…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Send className="h-3 w-3" />
                      {u.lastLoginAt ? 'Send login link' : 'Send welcome email'}
                    </span>
                  )}
                </Button>
                <button
                  onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                  className="text-slate-400 hover:text-slate-700"
                  title={u.isActive ? 'Deactivate' : 'Reactivate'}
                >
                  {u.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Messages Tab ─────────────────────────────────────────────────────────────

function MessagesTab() {
  const [selectedThread, setSelectedThread] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const qc = useQueryClient();

  const { data: threads = [], isLoading } = useQuery<MessageThread[]>({
    queryKey: ['portal-message-threads'],
    queryFn: () => api.get('/portal/admin/messages').then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: messages = [] } = useQuery<PortalMessage[]>({
    queryKey: ['portal-thread', selectedThread],
    queryFn: () => api.get(`/portal/admin/messages/${selectedThread}`).then((r) => r.data),
    enabled: !!selectedThread,
    refetchInterval: 10000,
  });

  const toast = useToast();
  const sendReply = useMutation({
    mutationFn: () =>
      api.post(`/portal/admin/messages/${selectedThread}`, { body: reply }).then((r) => r.data),
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['portal-thread', selectedThread] });
      qc.invalidateQueries({ queryKey: ['portal-message-threads'] });
    },
    onError: () => toast.error('Failed to send reply'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-240px)] min-h-[400px]">
      {/* Thread list */}
      <div className="w-72 flex-shrink-0 bg-white rounded-2xl border border-slate-200 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Conversations</h3>
        </div>
        {threads.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="h-7 w-7 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No messages yet</p>
          </div>
        ) : (
          threads.map((t) => (
            <button
              key={t.portalUserId}
              onClick={() => setSelectedThread(t.portalUserId)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                selectedThread === t.portalUserId ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-sm font-medium text-slate-800 truncate">
                  {t.displayName ??
                    (t.customer
                      ? `${t.customer.firstName} ${t.customer.lastName}`
                      : t.email)}
                </span>
                {t.unreadCount > 0 && (
                  <span className="flex-shrink-0 bg-blue-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {t.unreadCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {t.lastMessage.fromPortal ? '' : 'You: '}
                {t.lastMessage.body}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Message pane */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden">
        {!selectedThread ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Select a conversation</p>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <h4 className="font-semibold text-slate-800">
                {threads.find((t) => t.portalUserId === selectedThread)?.displayName ??
                  threads.find((t) => t.portalUserId === selectedThread)?.email}
              </h4>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.fromPortal ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.fromPortal
                        ? 'bg-slate-100 text-slate-800'
                        : 'bg-blue-600 text-white'
                    }`}
                  >
                    {m.senderName && m.fromPortal && (
                      <p className="text-[10px] font-semibold opacity-60 mb-0.5">{m.senderName}</p>
                    )}
                    <p>{m.body}</p>
                    <p className={`text-[10px] mt-1 ${m.fromPortal ? 'text-slate-400' : 'text-blue-200'}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2 flex-shrink-0">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && reply.trim()) {
                    e.preventDefault();
                    sendReply.mutate();
                  }
                }}
                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Type a reply…"
              />
              <Button
                onClick={() => sendReply.mutate()}
                disabled={!reply.trim() || sendReply.isPending}
                className="flex items-center gap-1.5"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Work Requests Tab ────────────────────────────────────────────────────────

function RequestNotes({ request }: { request: WorkRequest }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: () => api.post(`/portal/admin/work-requests/${request.id}/notes`, { body: body.trim() }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['portal-work-requests'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Could not add the note'),
  });
  return (
    <div className="mt-4">
      <p className="text-xs font-medium text-slate-600 mb-1.5">Notes</p>
      {request.notes?.length ? (
        <div className="space-y-2 mb-2">
          {request.notes.map((n) => (
            <div key={n.id} className={`rounded-xl px-3 py-2 text-sm ${n.fromTenant ? 'bg-amber-50 border border-amber-100' : 'bg-slate-50 border border-slate-100'}`}>
              <p className="text-slate-700 whitespace-pre-line">{n.body}</p>
              <p className="text-[11px] text-slate-400 mt-1">
                {n.author}{n.fromTenant ? ' (tenant)' : ''} · {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 mb-2">No notes yet.</p>
      )}
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Reply to the tenant (they will see this in their portal)"
          className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <button
          onClick={() => add.mutate()}
          disabled={!body.trim() || add.isPending}
          className="self-end text-xs px-3 py-2 rounded-lg bg-slate-800 text-white disabled:opacity-50"
        >
          {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add note'}
        </button>
      </div>
    </div>
  );
}

// ─── Test Tab ─────────────────────────────────────────────────────────────────
// Sends the real tenant emails to the workspace's own owners/admins, through a
// hidden test tenant login, so the links can actually be clicked and used.

interface TestRecipient {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  role: string;
  testPortalUserId: string | null;
  testLastLoginAt: string | null;
}

function TestTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ portalUrl: string; recipients: TestRecipient[] }>({
    queryKey: ['portal-test-recipients'],
    queryFn: () => api.get('/portal/test/recipients').then((r) => r.data),
  });
  const recipients = data?.recipients ?? [];
  const portalUrl = data?.portalUrl ?? null;
  const [log, setLog] = useState<Array<{ at: string; to: string; kind: string; result: string; message: string; preview: { subject: string; html: string } | null }>>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function send(r: TestRecipient, kind: 'welcome' | 'login') {
    setBusy(r.id + kind);
    try {
      const { data } = await api.post('/portal/test/send', { userId: r.id, kind });
      setLog((l) => [{ at: new Date().toLocaleTimeString(), to: data.to, kind, result: data.result, message: data.message, preview: data.preview }, ...l]);
      setOpen(0);
      if (data.result === 'sent') toast.success(data.message);
      else toast.error(data.message);
      qc.invalidateQueries({ queryKey: ['portal-test-recipients'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Could not send the test email');
    }
    setBusy(null);
  }


  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800">Test the tenant experience</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Sends the real tenant emails to you and your admins, not to any tenant. Each person gets their own
          test tenant login, so the link in the email really works: you can sign in, submit a request with
          photos and notes, and see it arrive under Work Requests marked <span className="font-medium text-violet-700">TEST</span>.
        </p>
        {portalUrl && (
          <p className="text-xs text-slate-400 mt-1">
            Tenant portal: <a href={portalUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{portalUrl}</a>
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {recipients.map((r, i) => (
          <div key={r.id} className={`flex items-center gap-3 px-5 py-4 flex-wrap ${i < recipients.length - 1 ? 'border-b border-slate-100' : ''}`}>
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium text-slate-800">
                {`${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email}
                <span className="ml-2 text-[11px] text-slate-400 capitalize">{r.role}</span>
              </p>
              <p className="text-xs text-slate-500">{r.email}</p>
              <p className="text-[11px] text-slate-400">
                {r.testPortalUserId
                  ? r.testLastLoginAt
                    ? `Test login last used ${new Date(r.testLastLoginAt).toLocaleString()}`
                    : 'Test login created, not used yet'
                  : 'No test login yet (created on first send)'}
              </p>
            </div>
            <Button
              variant="outline"
              className="text-xs px-3 py-1.5 h-auto"
              disabled={!!busy}
              onClick={() => send(r, 'welcome')}
            >
              {busy === r.id + 'welcome' ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> Welcome email</span>}
            </Button>
            <Button
              variant="outline"
              className="text-xs px-3 py-1.5 h-auto"
              disabled={!!busy}
              onClick={() => send(r, 'login')}
            >
              {busy === r.id + 'login' ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="flex items-center gap-1.5"><Send className="h-3 w-3" /> Sign-in link</span>}
            </Button>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-slate-700">Sent this session</h4>
          {log.map((e, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200">
              <button className="w-full flex items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(open === i ? null : i)}>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${e.result === 'sent' ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'}`}>{e.result}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">
                  {e.kind === 'welcome' ? 'Welcome email' : 'Sign-in link'} → {e.to}
                </span>
                <span className="text-xs text-slate-400">{e.at}</span>
              </button>
              {open === i && (
                <div className="px-4 pb-4">
                  {e.preview ? (
                    <>
                      <p className="text-xs text-slate-500 mb-1">Subject: {e.preview.subject}</p>
                      <iframe title="Sent email" srcDoc={e.preview.html} sandbox="" className="w-full h-[520px] rounded-xl border border-slate-200 bg-slate-100" />
                      <p className="text-[11px] text-slate-400 mt-1">This copy's button is inert; use the one in the email you received.</p>
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">
                      A short "Sign in to …" email with a button that works once within 15 minutes. Check your inbox.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtFee(amount: string | number | null | undefined): string {
  return '$' + Number(amount ?? 0).toFixed(2);
}

function WorkRequestsTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const { data: requests = [], isLoading } = useQuery<WorkRequest[]>({
    queryKey: ['portal-work-requests', statusFilter],
    queryFn: () =>
      api
        .get('/portal/admin/work-requests', { params: statusFilter ? { status: statusFilter } : {} })
        .then((r) => r.data),
  });

  const toast = useToast();
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/portal/admin/work-requests/${id}`, { status }).then((r) => r.data),
    onSuccess: (_data, { status }) => { qc.invalidateQueries({ queryKey: ['portal-work-requests'] }); toast.success(`Request ${status}`); },
    onError: () => toast.error('Failed to update request'),
  });

  const invoiceFee = useMutation({
    mutationFn: (id: string) =>
      api.post(`/portal/admin/work-requests/${id}/invoice-fee`).then((r) => r.data as {
        invoiceNumber: string;
        paymentUrl: string;
        email: 'sent' | 'simulated' | 'failed' | 'no_email_on_file';
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['portal-work-requests'] });
      if (data.email === 'sent') {
        toast.success(`${data.invoiceNumber} emailed to the tenant with a Square pay link`);
      } else {
        // Be explicit: the invoice exists, but nobody was told about it.
        toast.error(
          `${data.invoiceNumber} created but NOT emailed (${data.email.replace(/_/g, ' ')}). Send the tenant this link: ${data.paymentUrl}`,
        );
      }
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error?.message ?? err?.response?.data?.error ?? 'Could not invoice the fee'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const STATUS_OPTIONS = ['submitted', 'reviewing', 'scheduled', 'in_progress', 'completed', 'cancelled'];

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Work Requests</h3>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Clipboard className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No work requests{statusFilter ? ' with this status' : ''}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-slate-200">
              <button
                className="w-full flex items-center gap-3 px-5 py-4 text-left"
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-slate-800">{r.title}</span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status] ?? 'text-slate-600 bg-slate-100'}`}
                    >
                      {r.status.replace(/_/g, ' ')}
                    </span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${URGENCY_COLORS[r.urgency] ?? 'text-slate-600 bg-slate-100'}`}
                    >
                      {r.urgency}
                    </span>
                    {r.isTest && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full font-medium text-violet-700 bg-violet-50">TEST</span>
                    )}
                    {(r.photos?.length ?? 0) > 0 && (
                      <span className="text-[11px] text-slate-500">📷 {r.photos!.length}</span>
                    )}
                    {(r.notes?.length ?? 0) > 0 && (
                      <span className="text-[11px] text-slate-500">💬 {r.notes!.length}</span>
                    )}
                    {r.feeStatus && r.feeStatus !== 'not_applicable' && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${FEE_BADGE[r.feeStatus].cls}`}>
                        {FEE_BADGE[r.feeStatus].label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.portalUser.displayName ?? r.portalUser.email} ·{' '}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {expanded === r.id ? (
                  <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                )}
              </button>
              {expanded === r.id && (
                <div className="px-5 pb-5 border-t border-slate-100">
                  <p className="text-sm text-slate-700 mt-3 whitespace-pre-line">{r.description}</p>
                  {r.serviceAddress && (
                    <p className="text-xs text-slate-500 mt-2">📍 {r.serviceAddress}</p>
                  )}
                  {r.category && (
                    <p className="text-xs text-slate-500 mt-1">Category: {r.category}</p>
                  )}
                  {(r.photos?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.photos!.map((p) => (
                        <AuthPhoto
                          key={p.id}
                          client={api}
                          url={`/portal/admin/work-requests/${r.id}/photos/${p.id}`}
                          className="h-24 w-24 rounded-lg border border-slate-200"
                        />
                      ))}
                    </div>
                  )}
                  <RequestNotes request={r} />
                  {r.feeStatus !== 'not_applicable' && r.feeAmount != null && (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[12rem]">
                        <p className="text-sm font-medium text-slate-800">
                          {fmtFee(r.feeAmount)} service fee · {FEE_BADGE[r.feeStatus].label.toLowerCase()}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {r.feeInvoice
                            ? `Invoice ${r.feeInvoice.invoiceNumber} · ${r.feeInvoice.status}${
                                r.feeInvoice.paidAt ? ' ' + new Date(r.feeInvoice.paidAt).toLocaleDateString() : ''
                              }`
                            : r.feeAcknowledgedAt
                              ? `Tenant agreed ${new Date(r.feeAcknowledgedAt).toLocaleString()}`
                              : 'Not yet invoiced'}
                        </p>
                      </div>
                      {r.feeInvoice?.squarePaymentUrl && r.feeStatus === 'invoiced' && (
                        <a
                          href={r.feeInvoice.squarePaymentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Pay link
                        </a>
                      )}
                      {(r.feeStatus === 'assessed' || r.feeStatus === 'disclosed') && r.urgency !== 'emergency' && (
                        <button
                          onClick={() => {
                            const who = r.portalUser.displayName ?? r.portalUser.email;
                            if (
                              window.confirm(
                                `Invoice ${who} ${fmtFee(r.feeAmount)} for "${r.title}"?\n\nThis emails the tenant a Square payment link.`,
                              )
                            ) {
                              invoiceFee.mutate(r.id);
                            }
                          }}
                          disabled={invoiceFee.isPending}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {invoiceFee.isPending && invoiceFee.variables === r.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Invoice {fmtFee(r.feeAmount)} fee
                        </button>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-4">
                    <span className="text-xs text-slate-500">Update status:</span>
                    {STATUS_OPTIONS.filter((s) => s !== r.status).map((s) => (
                      <button
                        key={s}
                        onClick={() => updateStatus.mutate({ id: r.id, status: s })}
                        disabled={updateStatus.isPending}
                        className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                      >
                        → {s.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ConnectPage ─────────────────────────────────────────────────────────

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'settings', label: 'Portal Settings', icon: Settings },
  { id: 'users', label: 'Portal Users', icon: Users },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'work-requests', label: 'Work Requests', icon: Clipboard },
  { id: 'test', label: 'Test', icon: FlaskConical },
];

export function ConnectPage() {
  const [tab, setTab] = useState<Tab>('settings');

  return (
    <div className="p-6 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">FieldOps Connect</h1>
            <p className="text-sm text-slate-500">Customer portal, messaging, and work request management</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'messages' && <MessagesTab />}
      {tab === 'work-requests' && <WorkRequestsTab />}
      {tab === 'test' && <TestTab />}
    </div>
  );
}
