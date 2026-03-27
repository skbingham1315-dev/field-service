import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Plus, Users, Edit2, DollarSign, Shield, X, Loader2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  payRate?: number;
  payType?: string;
  customPermissions?: Record<string, boolean>;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  dispatcher: 'bg-indigo-100 text-indigo-700',
  technician: 'bg-emerald-100 text-emerald-700',
  sales: 'bg-amber-100 text-amber-700',
};

const ROLE_PERMISSIONS: Record<string, Array<{ key: string; label: string; description: string }>> = {
  technician: [
    { key: 'showJobPricing', label: 'See job pricing', description: 'Can view invoice amounts on jobs' },
    { key: 'viewAllJobs', label: 'View all jobs', description: 'Can see all jobs, not just their own' },
    { key: 'viewCustomerPhone', label: 'See customer phone', description: 'Can view customer contact info' },
  ],
  sales: [
    { key: 'viewPayments', label: 'View payments', description: 'Can see payment records' },
    { key: 'convertEstimates', label: 'Convert estimates', description: 'Can turn estimates into jobs/invoices' },
    { key: 'viewInvoices', label: 'View invoices', description: 'Can access the invoices section' },
    { key: 'createJobs', label: 'Create jobs', description: 'Can schedule new appointments' },
  ],
  dispatcher: [
    { key: 'viewFinancials', label: 'View financials', description: 'Can see revenue and payment data' },
    { key: 'manageInvoices', label: 'Manage invoices', description: 'Can create and edit invoices' },
    { key: 'viewReports', label: 'View reports', description: 'Can access analytics reports' },
  ],
  admin: [
    { key: 'manageTeam', label: 'Manage team', description: 'Can add and edit team members' },
    { key: 'viewPayroll', label: 'View payroll', description: 'Can access payroll information' },
  ],
};

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  technician: { showJobPricing: false, viewAllJobs: false, viewCustomerPhone: true },
  sales: { viewPayments: false, convertEstimates: true, viewInvoices: false, createJobs: true },
  dispatcher: { viewFinancials: false, manageInvoices: true, viewReports: true },
  admin: { manageTeam: true, viewPayroll: true },
};

function AddMemberModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    role: 'technician', payRate: '', payType: 'hourly',
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [permOpen, setPermOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const rolePerms = ROLE_PERMISSIONS[form.role] ?? [];
  const effectivePerms = { ...(DEFAULT_PERMISSIONS[form.role] ?? {}), ...permissions };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/users', {
        ...form,
        payRate: form.payRate ? Number(form.payRate) : null,
        customPermissions: Object.keys(permissions).length ? permissions : undefined,
      });
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add member');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">Add Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['firstName', 'lastName'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-700 mb-1 capitalize">{k === 'firstName' ? 'First Name' : 'Last Name'}</label>
                <input required value={form[k]} onChange={set(k)} placeholder={k === 'firstName' ? 'Jane' : 'Smith'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone (optional)</label>
            <input value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input required type="password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" minLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={set('role')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="technician">Technician</option>
              <option value="sales">Sales Rep</option>
              <option value="dispatcher">Dispatcher</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Pay */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <DollarSign className="h-4 w-4 text-emerald-600" /> Compensation
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Pay Type</label>
                <select value={form.payType} onChange={set('payType')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary (annual)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {form.payType === 'hourly' ? 'Hourly Rate ($)' : 'Annual Salary ($)'}
                </label>
                <input type="number" min="0" step="0.01" value={form.payRate} onChange={set('payRate')}
                  placeholder={form.payType === 'hourly' ? '18.00' : '45000'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {/* Permissions */}
          {rolePerms.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <button type="button" onClick={() => setPermOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100">
                <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-indigo-500" /> Permissions</div>
                {permOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {permOpen && (
                <div className="p-4 space-y-3">
                  {rolePerms.map(p => (
                    <label key={p.key} className="flex items-start gap-3 cursor-pointer">
                      <input type="checkbox"
                        checked={effectivePerms[p.key] ?? false}
                        onChange={e => setPermissions(prev => ({ ...prev, [p.key]: e.target.checked }))}
                        className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">{p.label}</p>
                        <p className="text-xs text-gray-500">{p.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditMemberModal({ member, onClose, onSaved }: { member: TeamMember; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: member.firstName, lastName: member.lastName,
    phone: member.phone ?? '', role: member.role,
    payRate: member.payRate?.toString() ?? '', payType: member.payType ?? 'hourly',
    status: member.status,
  });
  const [permissions, setPermissions] = useState<Record<string, boolean>>(member.customPermissions ?? {});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const rolePerms = ROLE_PERMISSIONS[form.role] ?? [];
  const effectivePerms = { ...(DEFAULT_PERMISSIONS[form.role] ?? {}), ...permissions };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await api.patch(`/users/${member.id}`, {
        ...form,
        payRate: form.payRate ? Number(form.payRate) : null,
        customPermissions: permissions,
      });
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to update');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">Edit {member.firstName} {member.lastName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['firstName', 'lastName'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{k === 'firstName' ? 'First Name' : 'Last Name'}</label>
                <input required value={form[k]} onChange={set(k)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role} onChange={set('role')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="technician">Technician</option>
                <option value="sales">Sales Rep</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={set('status')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Compensation</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Pay Type</label>
                <select value={form.payType} onChange={set('payType')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{form.payType === 'hourly' ? 'Hourly Rate ($)' : 'Annual Salary ($)'}</label>
                <input type="number" min="0" step="0.01" value={form.payRate} onChange={set('payRate')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {rolePerms.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-700 flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-indigo-500" /> Permissions</p>
              {rolePerms.map(p => (
                <label key={p.key} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox"
                    checked={effectivePerms[p.key] ?? false}
                    onChange={e => setPermissions(prev => ({ ...prev, [p.key]: e.target.checked }))}
                    className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.label}</p>
                    <p className="text-xs text-gray-500">{p.description}</p>
                  </div>
                </label>
              ))}
            </div>
          )}

          {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TeamPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/users').then(r => r.data.data as TeamMember[]),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] });

  const byRole = (data ?? []).reduce((acc, u) => {
    const r = u.role; if (!acc[r]) acc[r] = []; acc[r].push(u); return acc;
  }, {} as Record<string, TeamMember[]>);

  const roleOrder = ['owner', 'admin', 'dispatcher', 'technician', 'sales'];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.length ?? 0} members · Manage roles, pay, and permissions</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="h-4 w-4" /> Add Member
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      )}

      {roleOrder.filter(r => byRole[r]?.length).map(role => (
        <div key={role} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700 capitalize">{role}s</span>
            <span className="ml-auto text-xs text-gray-400">{byRole[role].length}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {byRole[role].map(member => (
              <div key={member.id} className="flex items-center px-5 py-4 hover:bg-gray-50 transition-colors">
                <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 flex-shrink-0">
                  {member.firstName[0]}{member.lastName[0]}
                </div>
                <div className="ml-3 flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{member.firstName} {member.lastName}</p>
                  <p className="text-xs text-gray-500">{member.email}{member.phone ? ` · ${member.phone}` : ''}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {member.payRate && (
                    <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg font-medium">
                      ${member.payRate}{member.payType === 'hourly' ? '/hr' : '/yr'}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {member.role}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {member.status}
                  </span>
                  {role !== 'owner' && (
                    <button onClick={() => setEditing(member)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refresh(); }} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    </div>
  );
}
