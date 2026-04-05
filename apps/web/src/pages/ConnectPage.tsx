/**
 * FieldOps Connect — Admin Configuration Page
 * Accessible from the main nav under "Connect"
 * Allows owners/admins to configure the customer portal,
 * manage portal users, view message threads, and review work requests.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
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
}

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
type Tab = 'settings' | 'users' | 'messages' | 'work-requests';

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

  const save = useMutation({
    mutationFn: () => api.put('/portal/config', form).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-config'] }),
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

  const createUser = useMutation({
    mutationFn: () => api.post('/portal/users', invite).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal-users'] });
      setShowInvite(false);
      setInvite({ email: '', displayName: '', phone: '' });
    },
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/portal/users/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-users'] }),
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
          <p className="text-sm text-slate-500">{users.length} customer{users.length !== 1 ? 's' : ''} with portal access</p>
        </div>
        <Button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5">
          <UserPlus className="h-4 w-4" /> Invite Customer
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-slate-800">Invite Customer</h4>
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
                {u.customer && (
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
                  <span className="text-xs text-slate-400">Never logged in</span>
                )}
                <Badge variant={u.isActive ? 'success' : 'secondary'}>
                  {u.isActive ? 'Active' : 'Inactive'}
                </Badge>
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

  const sendReply = useMutation({
    mutationFn: () =>
      api.post(`/portal/admin/messages/${selectedThread}`, { body: reply }).then((r) => r.data),
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['portal-thread', selectedThread] });
      qc.invalidateQueries({ queryKey: ['portal-message-threads'] });
    },
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

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/portal/admin/work-requests/${id}`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal-work-requests'] }),
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
    </div>
  );
}
