import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Check, Wrench, TrendingUp, Shield, MessageSquare, Mail, CheckCircle2, AlertTriangle, Send, Loader2, ExternalLink, Download, RefreshCw } from 'lucide-react';
import { Button, Badge } from '@fsp/ui';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { DEFAULT_PERMISSIONS, type RolePermissions } from '../lib/permissions';

type UserRole = 'owner' | 'admin' | 'dispatcher' | 'technician' | 'sales';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  timezone?: string;
  role: UserRole;
}

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  timezone?: string;
  taxRate?: number;
  plan?: string;
  status?: string;
}

const ROLE_BADGE: Record<UserRole, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  owner: 'default',
  admin: 'info',
  dispatcher: 'success',
  technician: 'warning',
  sales: 'secondary',
};

const ROLE_LABEL: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  dispatcher: 'Dispatcher',
  technician: 'Technician',
  sales: 'Sales Rep',
};

type Tab = 'profile' | 'team' | 'company' | 'permissions' | 'notifications' | 'integrations';

function ProfileTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', timezone: '' });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saved, setSaved] = useState(false);

  const { data: me } = useQuery<UserProfile>({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/users/me');
      return data.data;
    },
  });

  useEffect(() => {
    if (me) {
      setForm({
        firstName: me.firstName ?? '',
        lastName: me.lastName ?? '',
        phone: me.phone ?? '',
        timezone: me.timezone ?? '',
      });
    }
  }, [me]);

  const { mutate: saveProfile, isPending: saving } = useMutation({
    mutationFn: () => api.patch('/users/me', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', 'me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const field = (label: string, key: keyof typeof form, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Personal Information</h3>

        {me && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={me.email}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field('First Name', 'firstName')}
          {field('Last Name', 'lastName')}
        </div>
        {field('Phone', 'phone', 'tel')}
        {field('Timezone', 'timezone')}

        <div className="flex justify-end">
          <Button onClick={() => saveProfile()} disabled={saving}>
            {saved ? <><Check className="h-4 w-4 mr-1" /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Change Password</h3>
        <p className="text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
          Password changes are coming soon. Please contact your administrator if you need to reset your password.
        </p>
        <div className="space-y-4 opacity-50 pointer-events-none">
          {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((key) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {key === 'currentPassword' ? 'Current Password' : key === 'newPassword' ? 'New Password' : 'Confirm New Password'}
              </label>
              <input
                type="password"
                value={pwForm[key]}
                onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
          <Button disabled>Update Password</Button>
        </div>
      </div>
    </div>
  );
}

function TeamTab() {
  const qc = useQueryClient();
  const [roleEdits, setRoleEdits] = useState<Record<string, UserRole>>({});
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ email: '', firstName: '', lastName: '', role: 'technician' as UserRole });
  const [inviteResult, setInviteResult] = useState<{ inviteToken: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/users');
      return data;
    },
  });
  const members: TeamMember[] = usersData?.data ?? usersData ?? [];

  const { mutate: changeRole, isPending: savingRole } = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      api.patch(`/users/${id}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setRoleEdits({});
    },
  });

  const { mutate: deactivateUser } = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const { mutate: sendInvite, isPending: inviting } = useMutation({
    mutationFn: () => api.post('/users/invite', invite),
    onSuccess: (res) => {
      setInviteResult(res.data);
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/accept-invite?token=${token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Team Members</h3>
          <Button onClick={() => setShowInvite((v) => !v)}>
            {showInvite ? 'Cancel' : 'Invite User'}
          </Button>
        </div>

        {showInvite && (
          <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100 space-y-4">
            <h4 className="text-sm font-semibold text-blue-900">Invite New Team Member</h4>
            {inviteResult ? (
              <div className="space-y-3">
                <p className="text-sm text-green-700 font-medium">Invite created successfully!</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/accept-invite?token=${inviteResult.inviteToken}`}
                    className="flex-1 text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700"
                  />
                  <button
                    onClick={() => copyToken(inviteResult.inviteToken)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4 text-gray-500" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <button
                  className="text-sm text-blue-600 hover:underline"
                  onClick={() => { setInviteResult(null); setInvite({ email: '', firstName: '', lastName: '', role: 'technician' }); }}
                >
                  Invite another
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(['firstName', 'lastName', 'email'] as const).map((k) => (
                    <div key={k} className={k === 'email' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-medium text-gray-600 mb-1 capitalize">
                        {k === 'firstName' ? 'First Name' : k === 'lastName' ? 'Last Name' : 'Email'}
                      </label>
                      <input
                        type={k === 'email' ? 'email' : 'text'}
                        value={invite[k]}
                        onChange={(e) => setInvite((f) => ({ ...f, [k]: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                    <select
                      value={invite.role}
                      onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value as UserRole }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="technician">Technician</option>
                      <option value="sales">Sales Rep</option>
                      <option value="dispatcher">Dispatcher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
                <Button onClick={() => sendInvite()} disabled={inviting || !invite.email}>
                  {inviting ? 'Sending...' : 'Send Invite'}
                </Button>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 animate-pulse rounded-lg" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Name</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Role</th>
                  <th className="text-left py-2 pr-4 font-medium text-gray-500">Status</th>
                  <th className="text-right py-2 font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-gray-900">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-gray-400">{member.email}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={ROLE_BADGE[member.role]}>{ROLE_LABEL[member.role]}</Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs font-medium ${member.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {member.role !== 'owner' && (
                          <>
                            <select
                              value={roleEdits[member.id] ?? member.role}
                              onChange={(e) => setRoleEdits((r) => ({ ...r, [member.id]: e.target.value as UserRole }))}
                              className="text-xs border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="technician">Technician</option>
                              <option value="dispatcher">Dispatcher</option>
                              <option value="admin">Admin</option>
                            </select>
                            {roleEdits[member.id] && roleEdits[member.id] !== member.role && (
                              <button
                                onClick={() => changeRole({ id: member.id, role: roleEdits[member.id] })}
                                disabled={savingRole}
                                className="text-xs bg-blue-600 text-white px-2 py-1 rounded-lg hover:bg-blue-700 disabled:opacity-60"
                              >
                                Save
                              </button>
                            )}
                            <button
                              onClick={() => deactivateUser(member.id)}
                              className="text-xs text-red-600 hover:text-red-800 px-2 py-1 border border-red-200 rounded-lg hover:bg-red-50"
                            >
                              Deactivate
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SalesGoalsSection() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [goals, setGoals] = useState({ doorsKnocked: 20, peopleContacted: 10, estimatesGiven: 5, leadsAdded: 3, jobsScheduled: 2 });

  const { data: goalData } = useQuery({
    queryKey: ['sales-goals'],
    queryFn: async () => {
      const { data } = await api.get('/sales/goals');
      return data.data;
    },
  });

  useEffect(() => {
    if (goalData) setGoals(goalData);
  }, [goalData]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => api.patch('/sales/goals', goals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-goals'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const goalFields: Array<{ key: keyof typeof goals; label: string }> = [
    { key: 'doorsKnocked', label: 'Doors Knocked / Day' },
    { key: 'peopleContacted', label: 'People Contacted / Day' },
    { key: 'estimatesGiven', label: 'Estimates Given / Day' },
    { key: 'leadsAdded', label: 'Leads Added / Day' },
    { key: 'jobsScheduled', label: 'Jobs Scheduled / Day' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Sales Daily Goals</h3>
        <p className="text-sm text-gray-500 mt-0.5">Set daily targets for your sales team. Progress is shown on each rep's Activity tab.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {goalFields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type="number"
              min={0}
              value={goals[key]}
              onChange={(e) => setGoals(g => ({ ...g, [key]: parseInt(e.target.value) || 0 }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={saving}>
          {saved ? <><Check className="h-4 w-4 mr-1" />Saved</> : saving ? 'Saving...' : 'Save Goals'}
        </Button>
      </div>
    </div>
  );
}

function CompanyTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', timezone: '', taxRate: '' });
  const [saved, setSaved] = useState(false);

  const { data: tenant } = useQuery<Tenant>({
    queryKey: ['tenants', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/me');
      return data.data;
    },
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name ?? '',
        timezone: tenant.timezone ?? '',
        taxRate: tenant.taxRate != null ? (tenant.taxRate * 100).toFixed(4) : '',
      });
    }
  }, [tenant]);

  const { mutate: saveTenant, isPending: saving } = useMutation({
    mutationFn: () =>
      api.patch('/tenants/me', {
        name: form.name,
        timezone: form.timezone,
        taxRate: form.taxRate !== '' ? parseFloat(form.taxRate) / 100 : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants', 'me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <>
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-5">
      <h3 className="text-base font-semibold text-gray-900">Company Settings</h3>

      {tenant && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-xl text-sm">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Slug</p>
            <p className="text-gray-700 font-mono">{tenant.slug}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Plan</p>
            <p className="text-gray-700 capitalize">{tenant.plan ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-0.5">Status</p>
            <p className="text-gray-700 capitalize">{tenant.status ?? '—'}</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <input
            type="text"
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            placeholder="e.g. America/Chicago"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
          <div className="relative">
            <input
              type="number"
              step="0.0001"
              min={0}
              max={100}
              value={form.taxRate}
              onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
              placeholder="e.g. 8.25"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Stored as decimal (e.g. 8.25% = 0.0825)</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveTenant()} disabled={saving}>
          {saved ? <><Check className="h-4 w-4 mr-1" /> Saved</> : saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>

    <SalesGoalsSection />
    </>
  );
}

// ── Toggle Row ────────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
          value ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

// ── Permissions Tab ───────────────────────────────────────────────────────────

function PermissionsTab() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<RolePermissions>(DEFAULT_PERMISSIONS);

  const { data: permissions, isLoading } = useQuery<RolePermissions>({
    queryKey: ['tenants', 'permissions'],
    queryFn: async () => {
      const { data } = await api.get('/tenants/me/permissions');
      return data.data as RolePermissions;
    },
  });

  useEffect(() => {
    if (permissions) setForm(permissions);
  }, [permissions]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => api.patch('/tenants/me/permissions', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenants', 'permissions'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const toggle = <R extends keyof RolePermissions>(role: R, key: keyof RolePermissions[R]) => {
    setForm((f) => ({
      ...f,
      [role]: { ...f[role], [key]: !f[role][key] },
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-32 bg-gray-100 animate-pulse rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Control what each role can see and do. Changes take effect immediately after saving.
      </p>

      {/* Technician permissions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl bg-yellow-50 flex items-center justify-center">
            <Wrench className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Technician Access</h3>
            <p className="text-xs text-gray-400">What field technicians see on their mobile view</p>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          <ToggleRow
            label="Show job pricing & totals"
            desc="Technicians can see line item prices and job dollar amounts"
            value={form.technician.showJobPricing}
            onChange={() => toggle('technician', 'showJobPricing')}
          />
          <ToggleRow
            label="View all company jobs"
            desc="Off = technicians only see their own assigned jobs"
            value={form.technician.viewAllJobs}
            onChange={() => toggle('technician', 'viewAllJobs')}
          />
          <ToggleRow
            label="View customer phone number"
            desc="Allow technicians to call customers directly from the app"
            value={form.technician.viewCustomerPhone}
            onChange={() => toggle('technician', 'viewCustomerPhone')}
          />
        </div>
      </div>

      {/* Sales permissions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Sales Rep Access</h3>
            <p className="text-xs text-gray-400">What door-to-door and inside sales reps can see and do</p>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          <ToggleRow
            label="Schedule jobs from leads"
            desc="Sales reps can book service appointments during the lead capture flow"
            value={form.sales.createJobs}
            onChange={() => toggle('sales', 'createJobs')}
          />
          <ToggleRow
            label="Convert estimates to invoices"
            desc="Sales reps can finalize accepted quotes into billable invoices"
            value={form.sales.convertEstimates}
            onChange={() => toggle('sales', 'convertEstimates')}
          />
          <ToggleRow
            label="View invoice history"
            desc="Sales reps can see existing invoices for their customers"
            value={form.sales.viewInvoices}
            onChange={() => toggle('sales', 'viewInvoices')}
          />
          <ToggleRow
            label="View payment amounts"
            desc="Sales reps can see what customers have paid and what's outstanding"
            value={form.sales.viewPayments}
            onChange={() => toggle('sales', 'viewPayments')}
          />
        </div>
      </div>

      {/* Dispatcher permissions */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
            <Shield className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Dispatcher Access</h3>
            <p className="text-xs text-gray-400">Additional capabilities for scheduling & operations staff</p>
          </div>
        </div>
        <div className="divide-y divide-gray-50">
          <ToggleRow
            label="View financial data"
            desc="Dispatchers can see revenue figures on the dashboard"
            value={form.dispatcher.viewFinancials}
            onChange={() => toggle('dispatcher', 'viewFinancials')}
          />
          <ToggleRow
            label="Manage invoices"
            desc="Dispatchers can send invoices and manage invoice status"
            value={form.dispatcher.manageInvoices}
            onChange={() => toggle('dispatcher', 'manageInvoices')}
          />
          <ToggleRow
            label="View reports"
            desc="Dispatchers can access job and technician performance reports"
            value={form.dispatcher.viewReports}
            onChange={() => toggle('dispatcher', 'viewReports')}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => save()} disabled={saving}>
          {saved ? <><Check className="h-4 w-4 mr-1" />Saved</> : saving ? 'Saving...' : 'Save Permissions'}
        </Button>
      </div>
    </div>
  );
}

// ── Notifications Tab ─────────────────────────────────────────────────────────

const NOTIFICATION_EVENTS = [
  { trigger: 'Job completed', sms: 'Review request + thank-you', email: 'Review request email' },
  { trigger: 'Invoice sent', sms: 'Payment due reminder', email: 'Invoice with amount due' },
  { trigger: 'Estimate ready', sms: 'Estimate notification', email: 'Estimate details + total' },
  { trigger: 'Estimate approved', sms: 'Converted to invoice notice', email: 'Approval confirmation' },
  { trigger: 'Payment received', sms: 'Payment thank-you', email: 'Payment receipt' },
];

function StatusCard({
  icon: Icon,
  title,
  configured,
  detail,
  setupSteps,
  envVars,
  docsUrl,
}: {
  icon: React.ElementType;
  title: string;
  configured: boolean;
  detail?: string | null;
  setupSteps: string[];
  envVars: string[];
  docsUrl: string;
}) {
  const [open, setOpen] = useState(!configured);
  return (
    <div className={`rounded-2xl border ${configured ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${configured ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            <Icon className={`h-5 w-5 ${configured ? 'text-emerald-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 text-sm">{title}</p>
              {configured
                ? <span className="text-[11px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Active</span>
                : <span className="text-[11px] bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Setup needed</span>}
            </div>
            {detail && <p className="text-xs text-gray-500 mt-0.5">{detail}</p>}
          </div>
        </div>
        <button onClick={() => setOpen(v => !v)} className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2 flex-shrink-0">
          {open ? 'Hide' : 'Setup'}
        </button>
      </div>
      {open && (
        <div className="mt-4 pt-4 border-t border-gray-200/60 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Setup steps</p>
          <ol className="space-y-1.5 text-sm text-gray-700">
            {setupSteps.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 h-5 w-5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center mt-px">{i + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: s }} />
              </li>
            ))}
          </ol>
          <div className="bg-gray-900 rounded-xl p-3 mt-2">
            <p className="text-[11px] text-gray-400 mb-1.5 font-medium">Add to Railway environment variables:</p>
            {envVars.map(v => (
              <p key={v} className="text-xs font-mono text-green-400">{v}</p>
            ))}
          </div>
          <a href={docsUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-700 font-medium">
            <ExternalLink className="h-3.5 w-3.5" /> Open {title} docs
          </a>
        </div>
      )}
    </div>
  );
}

function NotificationsTab() {
  const { data: status } = useQuery({
    queryKey: ['notifications', 'status'],
    queryFn: () => api.get('/notifications/status').then(r => r.data.data as {
      sms: { configured: boolean; phoneNumber: string | null };
      email: { configured: boolean; from: string | null };
    }),
    staleTime: 10_000,
  });

  const { data: smsHistory = [] } = useQuery({
    queryKey: ['notifications', 'sms-history'],
    queryFn: () => api.get('/notifications/sms-history').then(r => r.data.data as Array<{
      id: string; to: string; body: string; status: string; createdAt: string; direction: string;
      customer: { firstName: string; lastName: string } | null;
    }>),
  });

  const [testType, setTestType] = useState<'sms' | 'email'>('sms');
  const [testTo, setTestTo] = useState('');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const sendTest = async () => {
    if (!testTo) return;
    setTestLoading(true); setTestResult(null);
    try {
      const { data } = await api.post('/notifications/test', { type: testType, to: testTo });
      const d = data.data;
      if (d?.simulated) {
        setTestResult({ ok: false, msg: `Simulated only — add real ${testType === 'sms' ? 'Twilio' : 'Resend'} keys to send live messages.` });
      } else {
        setTestResult({ ok: true, msg: `Test ${testType === 'sms' ? 'SMS' : 'email'} sent! Check ${testTo}.` });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Send failed. Check your credentials.' });
    } finally { setTestLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Service status */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Service Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatusCard
            icon={MessageSquare}
            title="SMS (Twilio)"
            configured={status?.sms.configured ?? false}
            detail={status?.sms.phoneNumber ? `Sending from ${status.sms.phoneNumber}` : undefined}
            setupSteps={[
              'Sign up free at <a href="https://www.twilio.com/try-twilio" target="_blank" class="text-violet-600 underline">twilio.com</a>',
              'From the Console Dashboard copy your <strong>Account SID</strong> and <strong>Auth Token</strong>',
              'Buy a phone number (Phone Numbers → Manage → Buy a Number) — ~$1.15/mo',
              'Add all three values to Railway (see below)',
            ]}
            envVars={[
              'TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
              'TWILIO_AUTH_TOKEN=your_auth_token',
              'TWILIO_PHONE_NUMBER=+1xxxxxxxxxx',
            ]}
            docsUrl="https://www.twilio.com/docs/sms/quickstart"
          />
          <StatusCard
            icon={Mail}
            title="Email (Resend)"
            configured={status?.email.configured ?? false}
            detail={status?.email.from ? `Sending from ${status.email.from}` : undefined}
            setupSteps={[
              'Sign up free at <a href="https://resend.com/signup" target="_blank" class="text-violet-600 underline">resend.com</a> — 3,000 emails/month free',
              'Go to API Keys → Create API Key → copy it',
              'Add your domain in Domains → Add Domain (so emails come from your address)',
              'Add the API key and from address to Railway (see below)',
            ]}
            envVars={[
              'RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx',
              'EMAIL_FROM=Your Company <noreply@yourdomain.com>',
            ]}
            docsUrl="https://resend.com/docs"
          />
        </div>
      </div>

      {/* What sends what */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Automated Notifications</h2>
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold">Trigger</th>
                <th className="text-left px-4 py-2.5 font-semibold">SMS sent to customer</th>
                <th className="text-left px-4 py-2.5 font-semibold">Email sent to customer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {NOTIFICATION_EVENTS.map(e => (
                <tr key={e.trigger} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{e.trigger}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.sms}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{e.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2">Notifications only fire if the customer has a phone number (SMS) or email address on file.</p>
      </div>

      {/* Test send */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Send a Test</h2>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
          <div className="flex gap-2">
            {(['sms', 'email'] as const).map(t => (
              <button key={t} onClick={() => { setTestType(t); setTestTo(''); setTestResult(null); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  testType === t ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}>
                {t === 'sms' ? <MessageSquare className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                {t === 'sms' ? 'Test SMS' : 'Test Email'}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input
              type={testType === 'email' ? 'email' : 'tel'}
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder={testType === 'sms' ? '+1 (555) 123-4567' : 'you@example.com'}
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-400"
            />
            <button onClick={sendTest} disabled={testLoading || !testTo}
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
              {testLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </button>
          </div>
          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
              {testResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* SMS history */}
      {smsHistory.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent SMS</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="divide-y divide-gray-50">
              {smsHistory.slice(0, 20).map(msg => (
                <div key={msg.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.direction === 'outbound' ? 'bg-violet-100' : 'bg-gray-100'}`}>
                    <MessageSquare className={`h-3.5 w-3.5 ${msg.direction === 'outbound' ? 'text-violet-600' : 'text-gray-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {msg.customer ? `${msg.customer.firstName} ${msg.customer.lastName}` : msg.to}
                      </span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                        msg.status === 'delivered' ? 'bg-emerald-100 text-emerald-700' :
                        msg.status === 'failed' ? 'bg-red-100 text-red-700' :
                        msg.status === 'simulated' ? 'bg-gray-100 text-gray-500' :
                        'bg-blue-100 text-blue-700'
                      }`}>{msg.status}</span>
                      <span className="text-xs text-gray-400 ml-auto">
                        {new Date(msg.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{msg.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Integrations Tab ──────────────────────────────────────────────────────────

interface SquarePreview {
  customers: number;
  invoices: number;
  estimates: number;
}

interface SquareImportResults {
  customers: { imported: number; skipped: number };
  invoices: { imported: number; skipped: number };
  estimates: { imported: number; skipped: number };
}

function IntegrationsTab() {
  const [options, setOptions] = useState({ importCustomers: true, importInvoices: true, importEstimates: true });
  const [preview, setPreview] = useState<SquarePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<SquareImportResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.get('/square/preview');
      setPreview(res.data.data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to connect to Square. Make sure SQUARE_ACCESS_TOKEN is set in your server .env.');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.post('/square/import', options);
      setResults(res.data.data);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Import failed. Check server logs for details.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Square */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border-b border-gray-200">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">SQ</span>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">Square</p>
            <p className="text-xs text-gray-500">Import customers, invoices, and estimates</p>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Setup note */}
          <div className="flex gap-2.5 bg-blue-50 border border-blue-200 rounded-lg p-3.5 text-sm text-blue-800">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" />
            <div className="space-y-1">
              <p className="font-medium">Setup required</p>
              <p className="text-blue-700">
                Add your Square access token to <code className="bg-blue-100 px-1 rounded font-mono text-xs">apps/api/.env</code>:
                <br />
                <code className="font-mono text-xs">SQUARE_ACCESS_TOKEN=your_token_here</code>
              </p>
              <a
                href="https://developer.squareup.com/apps"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 underline underline-offset-2 text-xs font-medium"
              >
                Get token from Square Developer Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">What to import</p>
            {(['importCustomers', 'importInvoices', 'importEstimates'] as const).map((key) => {
              const labels: Record<typeof key, string> = {
                importCustomers: 'Customers',
                importInvoices: 'Invoices',
                importEstimates: 'Estimates (Square draft invoices)',
              };
              return (
                <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{labels[key]}</span>
                </label>
              );
            })}
          </div>

          {/* Preview result */}
          {preview && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm space-y-1">
              <p className="font-medium text-gray-800 mb-2">Found in Square:</p>
              <p className="text-gray-600"><span className="font-semibold text-gray-900">{preview.customers}</span> customers</p>
              <p className="text-gray-600"><span className="font-semibold text-gray-900">{preview.invoices}</span> invoices</p>
              <p className="text-gray-600"><span className="font-semibold text-gray-900">{preview.estimates}</span> estimates (draft invoices)</p>
            </div>
          )}

          {/* Import results */}
          {results && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-4 text-sm space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <p className="font-semibold text-green-800">Import complete</p>
              </div>
              {(['customers', 'invoices', 'estimates'] as const).map((k) => (
                <p key={k} className="text-green-700 capitalize">
                  {k}: <span className="font-semibold">{results[k].imported} new</span>
                  {results[k].skipped > 0 && <span className="text-green-600">, {results[k].skipped} updated</span>}
                </p>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex gap-2 bg-red-50 border border-red-200 rounded-lg p-3.5 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
              <p>{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewing || importing}
            >
              {previewing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              Preview
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || previewing}
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              {importing ? 'Importing…' : 'Import Now'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('profile');

  const canSeeTeam = user?.role && ['owner', 'admin', 'dispatcher'].includes(user.role);
  const canSeeCompany = user?.role && ['owner', 'admin'].includes(user.role);
  const canSeePermissions = user?.role === 'owner' || user?.role === 'admin';

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'profile', label: 'Profile' },
    ...(canSeeTeam ? [{ id: 'team' as Tab, label: 'Team' }] : []),
    ...(canSeeCompany ? [{ id: 'company' as Tab, label: 'Company' }] : []),
    ...(canSeePermissions ? [{ id: 'permissions' as Tab, label: 'Permissions' }] : []),
    ...(canSeeCompany ? [{ id: 'notifications' as Tab, label: 'Notifications' }] : []),
    ...(canSeeCompany ? [{ id: 'integrations' as Tab, label: 'Integrations' }] : []),
  ];

  return (
    <div className="p-6 space-y-5 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'team' && canSeeTeam && <TeamTab />}
        {tab === 'company' && canSeeCompany && <CompanyTab />}
        {tab === 'permissions' && canSeePermissions && <PermissionsTab />}
        {tab === 'notifications' && canSeeCompany && <NotificationsTab />}
        {tab === 'integrations' && canSeeCompany && <IntegrationsTab />}
      </div>
    </div>
  );
}
