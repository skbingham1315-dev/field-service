import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  Plus, Users, Edit2, DollarSign, Shield, X, Loader2, CheckCircle,
  ChevronDown, ChevronUp, Trash2, TrendingUp, AlertCircle, Lock, Activity,
} from 'lucide-react';
import { MemberActivityDrawer } from '../components/MemberActivityDrawer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: string;
  secondaryRoles?: string[];
  status: string;
  payRate?: number;
  payType?: string;
  employmentType?: string;
  territory?: string;
  startDate?: string;
  showEarnings?: boolean;
  customPermissions?: Record<string, boolean>;
  createdAt: string;
}

interface PayComponent {
  id: string;
  userId: string;
  type: string;
  label?: string;
  config: Record<string, unknown>;
  effectiveDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:      'bg-purple-100 text-purple-700',
  admin:      'bg-blue-100 text-blue-700',
  dispatcher: 'bg-indigo-100 text-indigo-700',
  technician: 'bg-emerald-100 text-emerald-700',
  sales:      'bg-amber-100 text-amber-700',
};

const PAY_TYPE_LABELS: Record<string, string> = {
  hourly:            'Hourly Rate',
  salary:            'Salary',
  commission_flat:   'Commission — Flat Per Job',
  commission_pct:    'Commission — % of Job',
  commission_tiered: 'Commission — Tiered %',
  bonus_milestone:   'Bonus Milestone',
  draw:              'Draw Against Commission',
  revenue_share:     'Revenue Share',
};

const PAY_TYPE_COLORS: Record<string, string> = {
  hourly:            'bg-blue-50 text-blue-700 border-blue-200',
  salary:            'bg-violet-50 text-violet-700 border-violet-200',
  commission_flat:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  commission_pct:    'bg-green-50 text-green-700 border-green-200',
  commission_tiered: 'bg-teal-50 text-teal-700 border-teal-200',
  bonus_milestone:   'bg-amber-50 text-amber-700 border-amber-200',
  draw:              'bg-orange-50 text-orange-700 border-orange-200',
  revenue_share:     'bg-pink-50 text-pink-700 border-pink-200',
};

const ROLE_PERMISSIONS: Record<string, Array<{ key: string; label: string; description: string }>> = {
  technician: [
    { key: 'showJobPricing', label: 'See job pricing', description: 'Can view invoice amounts on jobs' },
    { key: 'viewAllJobs',    label: 'View all jobs',   description: 'Can see all jobs, not just their own' },
    { key: 'viewCustomerPhone', label: 'See customer phone', description: 'Can view customer contact info' },
  ],
  sales: [
    { key: 'viewPayments',    label: 'View payments',       description: 'Can see payment records' },
    { key: 'convertEstimates',label: 'Convert estimates',   description: 'Can turn estimates into jobs/invoices' },
    { key: 'viewInvoices',    label: 'View invoices',       description: 'Can access the invoices section' },
    { key: 'createJobs',      label: 'Create jobs',         description: 'Can schedule new appointments' },
  ],
  dispatcher: [
    { key: 'viewFinancials',  label: 'View financials',     description: 'Can see revenue and payment data' },
    { key: 'manageInvoices',  label: 'Manage invoices',     description: 'Can create and edit invoices' },
    { key: 'viewReports',     label: 'View reports',        description: 'Can access analytics reports' },
  ],
  admin: [
    { key: 'manageTeam',  label: 'Manage team',  description: 'Can add and edit team members' },
    { key: 'viewPayroll', label: 'View payroll', description: 'Can access payroll information' },
  ],
};

const DEFAULT_PERMISSIONS: Record<string, Record<string, boolean>> = {
  technician: { showJobPricing: false, viewAllJobs: false, viewCustomerPhone: true },
  sales:      { viewPayments: false, convertEstimates: true, viewInvoices: false, createJobs: true },
  dispatcher: { viewFinancials: false, manageInvoices: true, viewReports: true },
  admin:      { manageTeam: true, viewPayroll: true },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function describeComponent(comp: PayComponent): string {
  const cfg = comp.config as Record<string, unknown>;
  switch (comp.type) {
    case 'hourly':           return `$${cfg.rate}/hr · OT threshold: ${cfg.overtimeThreshold ?? 40}hrs`;
    case 'salary':           return `${fmtUSD(Number(cfg.annualAmount ?? 0))}/yr · ${cfg.frequency ?? 'biweekly'}`;
    case 'commission_flat':  return `$${cfg.amount} per job · trigger: ${cfg.trigger ?? 'approved'}`;
    case 'commission_pct':   return `${cfg.percentage}% of ${cfg.basis ?? 'gross'} · trigger: ${cfg.trigger ?? 'approved'}`;
    case 'commission_tiered':return `Tiered % · ${(cfg.tiers as unknown[])?.length ?? 0} tiers · trigger: ${cfg.trigger ?? 'approved'}`;
    case 'bonus_milestone':  return `$${cfg.amount} bonus at $${cfg.threshold} ${cfg.period ?? 'monthly'}`;
    case 'draw':             return `$${cfg.amount} draw · ${cfg.frequency ?? 'biweekly'}`;
    case 'revenue_share':    return `${cfg.percentage}% ${cfg.basis ?? 'gross'} revenue · ${cfg.period ?? 'monthly'}`;
    default: return comp.label ?? comp.type;
  }
}

// ── Pay Component Form ────────────────────────────────────────────────────────

interface Tier { min: number; max: number | null; pct: number }

function PayComponentForm({
  userId, onSaved, onCancel, existing,
}: {
  userId: string;
  onSaved: () => void;
  onCancel: () => void;
  existing?: PayComponent;
}) {
  const [type, setType] = useState(existing?.type ?? 'commission_pct');
  const [label, setLabel] = useState(existing?.label ?? '');
  const [effectiveDate, setEffectiveDate] = useState(
    existing?.effectiveDate?.split('T')[0] ?? new Date().toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Type-specific state
  const cfg = (existing?.config ?? {}) as Record<string, unknown>;
  const [rate, setRate]               = useState(String(cfg.rate ?? ''));
  const [otThreshold, setOtThreshold] = useState(String(cfg.overtimeThreshold ?? '40'));
  const [otMult, setOtMult]           = useState(String(cfg.overtimeMultiplier ?? '1.5'));
  const [annualAmt, setAnnualAmt]     = useState(String(cfg.annualAmount ?? ''));
  const [frequency, setFrequency]     = useState(String(cfg.frequency ?? 'biweekly'));
  const [flatAmt, setFlatAmt]         = useState(String(cfg.amount ?? ''));
  const [trigger, setTrigger]         = useState(String(cfg.trigger ?? 'approved'));
  const [pct, setPct]                 = useState(String(cfg.percentage ?? ''));
  const [basis, setBasis]             = useState(String(cfg.basis ?? 'gross'));
  const [tiers, setTiers]             = useState<Tier[]>(
    (cfg.tiers as Tier[] | undefined) ?? [{ min: 0, max: 5000, pct: 5 }, { min: 5001, max: null, pct: 8 }]
  );
  const [bonusTrigger, setBonusTrigger] = useState(String(cfg.triggerType ?? 'revenue'));
  const [bonusThreshold, setBonusThreshold] = useState(String(cfg.threshold ?? ''));
  const [bonusAmt, setBonusAmt]             = useState(String(cfg.amount ?? ''));
  const [bonusPeriod, setBonusPeriod]       = useState(String(cfg.period ?? 'monthly'));
  const [drawAmt, setDrawAmt]               = useState(String(cfg.amount ?? ''));
  const [drawFreq, setDrawFreq]             = useState(String(cfg.frequency ?? 'biweekly'));
  const [rsPct, setRsPct]                   = useState(String(cfg.percentage ?? ''));
  const [rsBasis, setRsBasis]               = useState(String(cfg.basis ?? 'gross'));
  const [rsPeriod, setRsPeriod]             = useState(String(cfg.period ?? 'monthly'));

  const buildConfig = (): Record<string, unknown> => {
    switch (type) {
      case 'hourly':            return { rate: +rate, overtimeThreshold: +otThreshold, overtimeMultiplier: +otMult };
      case 'salary':            return { annualAmount: +annualAmt, frequency };
      case 'commission_flat':   return { amount: +flatAmt, trigger };
      case 'commission_pct':    return { percentage: +pct, basis, trigger };
      case 'commission_tiered': return { tiers, basis, trigger };
      case 'bonus_milestone':   return { triggerType: bonusTrigger, threshold: +bonusThreshold, amount: +bonusAmt, period: bonusPeriod };
      case 'draw':              return { amount: +drawAmt, frequency: drawFreq };
      case 'revenue_share':     return { percentage: +rsPct, basis: rsBasis, period: rsPeriod };
      default: return {};
    }
  };

  const handleSave = async () => {
    setError(''); setLoading(true);
    try {
      const payload = { userId, type, label: label || undefined, config: buildConfig(), effectiveDate };
      if (existing) {
        await api.patch(`/compensation/pay-components/${existing.id}`, payload);
      } else {
        await api.post('/compensation/pay-components', payload);
      }
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const sel = `${inp} bg-white`;

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Pay Type</label>
          <select value={type} onChange={e => setType(e.target.value)} className={sel}>
            {Object.entries(PAY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label (optional)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Base commission" className={inp} />
        </div>
      </div>

      {/* Type-specific fields */}
      {type === 'hourly' && (
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Rate ($/hr)</label><input type="number" value={rate} onChange={e => setRate(e.target.value)} className={inp} /></div>
          <div><label className="block text-xs text-gray-600 mb-1">OT Threshold (hrs)</label><input type="number" value={otThreshold} onChange={e => setOtThreshold(e.target.value)} className={inp} /></div>
          <div><label className="block text-xs text-gray-600 mb-1">OT Multiplier</label><input type="number" step="0.1" value={otMult} onChange={e => setOtMult(e.target.value)} className={inp} /></div>
        </div>
      )}

      {type === 'salary' && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Annual Amount ($)</label><input type="number" value={annualAmt} onChange={e => setAnnualAmt(e.target.value)} className={inp} /></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Pay Frequency</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)} className={sel}>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="semimonthly">Semi-monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          {annualAmt && (
            <div className="col-span-2 bg-blue-50 rounded-lg p-2 text-xs text-blue-700">
              Per period: {fmtUSD(Number(annualAmt) / (frequency === 'weekly' ? 52 : frequency === 'biweekly' ? 26 : frequency === 'semimonthly' ? 24 : 12))}
            </div>
          )}
        </div>
      )}

      {(type === 'commission_flat') && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Amount Per Job ($)</label><input type="number" value={flatAmt} onChange={e => setFlatAmt(e.target.value)} className={inp} /></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Trigger Status</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} className={sel}>
              <option value="approved">Approved</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option>
            </select>
          </div>
        </div>
      )}

      {type === 'commission_pct' && (
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Percentage (%)</label><input type="number" step="0.1" value={pct} onChange={e => setPct(e.target.value)} className={inp} /></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Applies To</label>
            <select value={basis} onChange={e => setBasis(e.target.value)} className={sel}>
              <option value="gross">Gross Invoice</option><option value="net">Net Profit</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Trigger Status</label>
            <select value={trigger} onChange={e => setTrigger(e.target.value)} className={sel}>
              <option value="approved">Approved</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option>
            </select>
          </div>
        </div>
      )}

      {type === 'commission_tiered' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Applies To</label>
              <select value={basis} onChange={e => setBasis(e.target.value)} className={sel}>
                <option value="gross">Gross Invoice</option><option value="net">Net Profit</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Trigger Status</label>
              <select value={trigger} onChange={e => setTrigger(e.target.value)} className={sel}>
                <option value="approved">Approved</option><option value="invoiced">Invoiced</option><option value="paid">Paid</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600">Tiers (first match wins)</p>
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-8">Tier {i+1}</span>
                <input type="number" value={tier.min} onChange={e => setTiers(ts => ts.map((t, j) => j===i ? {...t, min: +e.target.value} : t))}
                  placeholder="Min $" className={`${inp} w-24`} />
                <span className="text-xs text-gray-400">–</span>
                <input type="number" value={tier.max ?? ''} onChange={e => setTiers(ts => ts.map((t, j) => j===i ? {...t, max: e.target.value ? +e.target.value : null} : t))}
                  placeholder="Max $ (blank=∞)" className={`${inp} w-28`} />
                <input type="number" step="0.1" value={tier.pct} onChange={e => setTiers(ts => ts.map((t, j) => j===i ? {...t, pct: +e.target.value} : t))}
                  placeholder="%" className={`${inp} w-16`} />
                <span className="text-xs text-gray-500">%</span>
                {tiers.length > 1 && <button onClick={() => setTiers(ts => ts.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>}
              </div>
            ))}
            <button onClick={() => setTiers(ts => [...ts, { min: 0, max: null, pct: 0 }])}
              className="text-xs text-indigo-600 hover:underline">+ Add tier</button>
          </div>
        </div>
      )}

      {type === 'bonus_milestone' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Trigger Type</label>
            <select value={bonusTrigger} onChange={e => setBonusTrigger(e.target.value)} className={sel}>
              <option value="revenue">Revenue Threshold</option><option value="job_count">Job Count</option>
            </select>
          </div>
          <div><label className="block text-xs text-gray-600 mb-1">Threshold ($ or # jobs)</label><input type="number" value={bonusThreshold} onChange={e => setBonusThreshold(e.target.value)} className={inp} /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Bonus Amount ($)</label><input type="number" value={bonusAmt} onChange={e => setBonusAmt(e.target.value)} className={inp} /></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Period</label>
            <select value={bonusPeriod} onChange={e => setBonusPeriod(e.target.value)} className={sel}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option>
            </select>
          </div>
        </div>
      )}

      {type === 'draw' && (
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Draw Amount ($)</label><input type="number" value={drawAmt} onChange={e => setDrawAmt(e.target.value)} className={inp} /></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Frequency</label>
            <select value={drawFreq} onChange={e => setDrawFreq(e.target.value)} className={sel}>
              <option value="weekly">Weekly</option><option value="biweekly">Bi-weekly</option>
            </select>
          </div>
        </div>
      )}

      {type === 'revenue_share' && (
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs text-gray-600 mb-1">Percentage (%)</label><input type="number" step="0.1" value={rsPct} onChange={e => setRsPct(e.target.value)} className={inp} /></div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Basis</label>
            <select value={rsBasis} onChange={e => setRsBasis(e.target.value)} className={sel}>
              <option value="gross">Gross Revenue</option><option value="net">Net Profit</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Period</label>
            <select value={rsPeriod} onChange={e => setRsPeriod(e.target.value)} className={sel}>
              <option value="monthly">Monthly</option><option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Effective Date</label>
        <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} className={`${inp} w-44`} />
        {!existing && <p className="text-xs text-amber-600 mt-1">Changes apply to jobs created on or after this date.</p>}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
        <button onClick={handleSave} disabled={loading}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium disabled:opacity-60 flex items-center gap-1">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
          {existing ? 'Update' : 'Add Component'}
        </button>
      </div>
    </div>
  );
}

// ── Pay Structure Drawer ──────────────────────────────────────────────────────

function PayStructureDrawer({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingComp, setEditingComp] = useState<PayComponent | null>(null);

  const { data: components = [], isLoading } = useQuery({
    queryKey: ['pay-components', member.id],
    queryFn: () => api.get(`/compensation/pay-components?userId=${member.id}`).then(r => r.data.data as PayComponent[]),
  });

  const { data: earnings } = useQuery({
    queryKey: ['earnings', member.id, 'this_month'],
    queryFn: () => api.get(`/compensation/earnings/${member.id}?period=this_month`).then(r => r.data.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/compensation/pay-components/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pay-components', member.id] }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pay-components', member.id] });
    setAdding(false);
    setEditingComp(null);
  };

  const active = components.filter(c => c.isActive);
  const inactive = components.filter(c => !c.isActive);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
          <div>
            <h2 className="text-base font-bold text-gray-900">{member.firstName} {member.lastName}</h2>
            <p className="text-xs text-gray-500 capitalize">{member.role} · Pay Structure</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Earnings summary */}
          {earnings && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">Jobs This Month</p>
                <p className="text-xl font-bold text-emerald-700">{earnings.summary.jobsCount}</p>
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                <p className="text-xs text-blue-600 font-medium">Revenue Credited</p>
                <p className="text-xl font-bold text-blue-700">{fmtUSD(earnings.summary.totalRevenueCredited)}</p>
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
                <p className="text-xs text-violet-600 font-medium">Commission Earned</p>
                <p className="text-xl font-bold text-violet-700">{fmtUSD(earnings.summary.totalCommission)}</p>
              </div>
            </div>
          )}

          {/* Active Components */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-emerald-500" /> Active Pay Components
              </h3>
              {!adding && !editingComp && (
                <button onClick={() => setAdding(true)}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              )}
            </div>

            {isLoading && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>}

            {adding && (
              <div className="mb-3">
                <PayComponentForm userId={member.id} onSaved={refresh} onCancel={() => setAdding(false)} />
              </div>
            )}

            {active.length === 0 && !adding && (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center">
                <DollarSign className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No pay components yet</p>
                <button onClick={() => setAdding(true)} className="mt-2 text-xs text-indigo-600 hover:underline">Add first component</button>
              </div>
            )}

            <div className="space-y-2">
              {active.map(comp => (
                <div key={comp.id}>
                  {editingComp?.id === comp.id ? (
                    <PayComponentForm userId={member.id} existing={comp} onSaved={refresh} onCancel={() => setEditingComp(null)} />
                  ) : (
                    <div className={`border rounded-xl p-3 ${PAY_TYPE_COLORS[comp.type] ?? 'bg-gray-50 border-gray-200'}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">{PAY_TYPE_LABELS[comp.type] ?? comp.type}</p>
                          {comp.label && <p className="text-xs opacity-75">{comp.label}</p>}
                          <p className="text-xs mt-0.5 opacity-80">{describeComponent(comp)}</p>
                          <p className="text-xs opacity-60 mt-0.5">Effective {new Date(comp.effectiveDate).toLocaleDateString()}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          <button onClick={() => setEditingComp(comp)} className="p-1 hover:bg-black/10 rounded transition-colors">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { if (confirm('Remove this pay component?')) deleteMutation.mutate(comp.id); }}
                            className="p-1 hover:bg-black/10 rounded transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Inactive Components */}
          {inactive.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Lock className="h-3 w-3" /> Historical (inactive)
              </h3>
              <div className="space-y-1">
                {inactive.map(comp => (
                  <div key={comp.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 opacity-60">
                    <p className="text-xs font-medium text-gray-600">{PAY_TYPE_LABELS[comp.type]} · {describeComponent(comp)}</p>
                    <p className="text-xs text-gray-400">Ended {comp.endDate ? new Date(comp.endDate).toLocaleDateString() : '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Earnings breakdown */}
          {earnings?.entries?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-indigo-500" /> This Month's Earnings
              </h3>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Job</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Credit</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Earned</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {earnings.entries.map((e: {
                      id: string;
                      crmJob: { jobNumber: string; name: string };
                      creditPct: number;
                      amount: number;
                      status: string;
                    }) => (
                      <tr key={e.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{e.crmJob.jobNumber}</p>
                          <p className="text-gray-500 truncate max-w-[120px]">{e.crmJob.name}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{e.creditPct}%</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmtUSD(Number(e.amount))}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${e.status === 'finalized' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>
                            {e.status === 'finalized' ? <Lock className="h-3 w-3 inline mr-0.5" /> : null}{e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Member Modal ──────────────────────────────────────────────────────────

const SECONDARY_ROLE_OPTIONS = ['technician', 'sales', 'dispatcher', 'admin'];

function AddMemberModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', email: '', phone: '', password: '',
    role: 'technician', payRate: '', payType: 'hourly',
    employmentType: 'w2', territory: '',
  });
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
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
        secondaryRoles,
        payRate: form.payRate ? Number(form.payRate) : null,
        customPermissions: Object.keys(permissions).length ? permissions : undefined,
      });
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to add member');
    } finally { setLoading(false); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">Add Team Member</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
              <input required value={form.firstName} onChange={set('firstName')} placeholder="Jane" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
              <input required value={form.lastName} onChange={set('lastName')} placeholder="Smith" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
            <input required type="email" value={form.email} onChange={set('email')} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="(555) 000-0000" className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input required type="password" value={form.password} onChange={set('password')} minLength={8} className={inp} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role} onChange={set('role')} className={`${inp} bg-white`}>
                <option value="technician">Technician</option>
                <option value="sales">Sales Rep</option>
                <option value="dispatcher">Dispatcher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Employment Type</label>
              <select value={form.employmentType} onChange={set('employmentType')} className={`${inp} bg-white`}>
                <option value="w2">W-2 Employee</option>
                <option value="contractor_1099">1099 Contractor</option>
                <option value="owner_partner">Owner / Partner</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Territory / Region (optional)</label>
            <input value={form.territory} onChange={set('territory')} placeholder="e.g. East Valley, Phoenix North" className={inp} />
          </div>

          <div className="border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-gray-700">Additional Roles (optional)</p>
            <p className="text-xs text-gray-400">Give this member access to features from other roles.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SECONDARY_ROLE_OPTIONS.filter(r => r !== form.role).map(r => (
                <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={secondaryRoles.includes(r)}
                    onChange={e => setSecondaryRoles(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600'}`}>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Base Compensation</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Pay Type</label>
                <select value={form.payType} onChange={set('payType')} className={`${inp} bg-white`}>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="commission">Commission Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{form.payType === 'hourly' ? 'Rate ($/hr)' : 'Amount ($)'}</label>
                <input type="number" min="0" step="0.01" value={form.payRate} onChange={set('payRate')} className={inp} />
              </div>
            </div>
            <p className="text-xs text-gray-400">You can add detailed pay components (commissions, tiers, bonuses) after creating the member.</p>
          </div>

          {rolePerms.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-700 flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-indigo-500" /> Permissions</p>
              {rolePerms.map(p => (
                <label key={p.key} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={effectivePerms[p.key] ?? false}
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
              Add Member
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Edit Member Modal ─────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSaved }: { member: TeamMember; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    firstName: member.firstName, lastName: member.lastName,
    phone: member.phone ?? '', role: member.role, status: member.status,
    payRate: String(member.payRate ?? ''), payType: member.payType ?? 'hourly',
    employmentType: member.employmentType ?? 'w2',
    territory: member.territory ?? '',
  });
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>(member.secondaryRoles ?? []);
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
        secondaryRoles,
        payRate: form.payRate ? Number(form.payRate) : null,
        customPermissions: permissions,
      });
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">Edit {member.firstName} {member.lastName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['firstName', 'lastName'] as const).map(k => (
              <div key={k}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{k === 'firstName' ? 'First Name' : 'Last Name'}</label>
                <input value={form[k]} onChange={set(k)} className={inp} />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
            <input value={form.phone} onChange={set('phone')} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <select value={form.role} onChange={set('role')} className={`${inp} bg-white`}>
                <option value="technician">Technician</option><option value="sales">Sales Rep</option>
                <option value="dispatcher">Dispatcher</option><option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={set('status')} className={`${inp} bg-white`}>
                <option value="active">Active</option><option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Employment Type</label>
              <select value={form.employmentType} onChange={set('employmentType')} className={`${inp} bg-white`}>
                <option value="w2">W-2 Employee</option>
                <option value="contractor_1099">1099 Contractor</option>
                <option value="owner_partner">Owner / Partner</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Territory</label>
              <input value={form.territory} onChange={set('territory')} placeholder="e.g. East Valley" className={inp} />
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-gray-700">Additional Roles</p>
            <p className="text-xs text-gray-400">Give this member access to features from other roles.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SECONDARY_ROLE_OPTIONS.filter(r => r !== form.role).map(r => (
                <label key={r} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={secondaryRoles.includes(r)}
                    onChange={e => setSecondaryRoles(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600'}`}>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Base Pay</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Pay Type</label>
                <select value={form.payType} onChange={set('payType')} className={`${inp} bg-white`}>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                  <option value="commission">Commission Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">{form.payType === 'hourly' ? 'Rate ($/hr)' : 'Amount ($)'}</label>
                <input type="number" min="0" step="0.01" value={form.payRate} onChange={set('payRate')} className={inp} />
              </div>
            </div>
          </div>

          {rolePerms.length > 0 && (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-medium text-gray-700 flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-indigo-500" /> Permissions</p>
              {rolePerms.map(p => (
                <label key={p.key} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={effectivePerms[p.key] ?? false}
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TeamPage() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [payDrawer, setPayDrawer] = useState<TeamMember | null>(null);
  const [activityMember, setActivityMember] = useState<TeamMember | null>(null);
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => api.get('/users').then(r => r.data.data as TeamMember[]),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] });

  const byRole = (data ?? []).reduce((acc, u) => {
    if (!acc[u.role]) acc[u.role] = [];
    acc[u.role].push(u);
    return acc;
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

      {isLoading && <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

      {roleOrder.filter(r => byRole[r]?.length).map(role => {
        const isExpanded = expandedRoles[role] !== false; // default open
        return (
          <div key={role} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedRoles(prev => ({ ...prev, [role]: !isExpanded }))}
              className="w-full px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-700 capitalize">{role}s</span>
              <span className="text-xs text-gray-400">{byRole[role].length}</span>
              <span className="ml-auto text-gray-400">{isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
            </button>

            {isExpanded && (
              <div className="divide-y divide-gray-100">
                {byRole[role].map(member => (
                  <div key={member.id} className="flex items-center px-5 py-4 hover:bg-gray-50 transition-colors">
                    <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 flex-shrink-0">
                      {member.firstName[0]}{member.lastName[0]}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{member.firstName} {member.lastName}</p>
                      <p className="text-xs text-gray-500">
                        {member.email}
                        {member.territory ? ` · ${member.territory}` : ''}
                        {member.employmentType ? ` · ${member.employmentType === 'w2' ? 'W-2' : member.employmentType === 'contractor_1099' ? '1099' : 'Partner'}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {member.payRate && (
                        <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg font-medium">
                          ${member.payRate}{member.payType === 'hourly' ? '/hr' : '/yr'}
                        </span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {member.role}
                      </span>
                      {member.secondaryRoles?.map(r => (
                        <span key={r} className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600'}`}>
                          +{r}
                        </span>
                      ))}
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${member.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {member.status}
                      </span>
                      <button
                        onClick={() => setActivityMember(member)}
                        title="Today's Activity"
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                        <Activity className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPayDrawer(member)}
                        title="Pay Structure"
                        className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                        <DollarSign className="h-4 w-4" />
                      </button>
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
            )}
          </div>
        );
      })}

      {data?.length === 0 && !isLoading && (
        <div className="text-center py-16">
          <AlertCircle className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No team members yet. Add your first one.</p>
        </div>
      )}

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refresh(); }} />}
      {editing && <EditMemberModal member={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {payDrawer && <PayStructureDrawer member={payDrawer} onClose={() => setPayDrawer(null)} />}
      {activityMember && (
        <MemberActivityDrawer
          userId={activityMember.id}
          name={`${activityMember.firstName} ${activityMember.lastName}`}
          onClose={() => setActivityMember(null)}
        />
      )}
    </div>
  );
}
