import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  DollarSign, Users, TrendingUp, Target, CheckCircle, Loader2, X,
  Download, Lock, Trophy, ChevronDown, ChevronUp, Plus, Edit2, Trash2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PayrollEntry {
  id: string;
  userId: string;
  regularHours: number;
  overtimeHours: number;
  payRate: number;
  payType: string;
  grossPay: number;
  notes?: string;
  user: { id: string; firstName: string; lastName: string; role: string };
}

interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalGross: number;
  notes?: string;
  paidAt?: string;
  entries: PayrollEntry[];
  createdBy?: { firstName: string; lastName: string };
}

interface PreviewEntry {
  userId: string;
  name: string;
  role: string;
  payType: string;
  payRate: number;
  hoursLogged: number;
  basePay: number;
  commissions: number;
  totalGross: number;
  commissionEntryIds: string[];
  overrideNote?: string;
}

interface LeaderboardEntry {
  user: { id: string; firstName: string; lastName: string; role: string };
  jobsWon: number;
  totalRevenue: number;
  winRate: number;
  commissionEarned: number;
  target: { amount: number; start: string; end: string } | null;
}

interface SalesTarget {
  id: string;
  userId: string;
  targetAmount: number;
  period: string;
  startDate: string;
  endDate: string;
  user: { id: string; firstName: string; lastName: string; role: string };
}

interface TeamMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
function fmtUSDCents(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const STATUS_STYLES: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-700',
  approved: 'bg-blue-100 text-blue-700',
  paid:     'bg-emerald-100 text-emerald-700',
};

// ── Payroll Run Tab ───────────────────────────────────────────────────────────

function PayRunTab() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get('/payroll').then(r => r.data.data as PayrollRun[]),
  });

  const today = new Date().toISOString().split('T')[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="h-4 w-4" /> New Pay Run
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

      {runs.length === 0 && !isLoading && (
        <div className="text-center py-16 text-gray-500">No pay runs yet. Create one to get started.</div>
      )}

      {runs.map(run => (
        <div key={run.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">{fmtDate(run.periodStart)} – {fmtDate(run.periodEnd)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{run.entries?.length ?? 0} employees · {run.notes}</p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLES[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {run.status}
            </span>
            <p className="text-base font-bold text-gray-900">{fmtUSD(run.totalGross)}</p>
            <a href={`/api/v1/compensation/payroll/export/${run.id}`} target="_blank" rel="noreferrer"
              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Export CSV">
              <Download className="h-4 w-4" />
            </a>
            <button onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg">
              {expanded === run.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {expanded === run.id && run.entries?.length > 0 && (
            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Name</th>
                    <th className="px-4 py-2 text-right text-gray-500 font-medium">Hours</th>
                    <th className="px-4 py-2 text-right text-gray-500 font-medium">Base</th>
                    <th className="px-4 py-2 text-right text-gray-500 font-medium">Gross</th>
                    <th className="px-4 py-2 text-left text-gray-500 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {run.entries.map(e => (
                    <tr key={e.id}>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{e.user.firstName} {e.user.lastName}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{e.regularHours.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmtUSDCents(e.payRate)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtUSDCents(e.grossPay)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {showNew && (
        <NewPayRunModal
          defaultStart={twoWeeksAgo}
          defaultEnd={today}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ['payroll-runs'] }); }}
        />
      )}
    </div>
  );
}

// ── New Pay Run Modal ─────────────────────────────────────────────────────────

function NewPayRunModal({ defaultStart, defaultEnd, onClose, onCreated }: {
  defaultStart: string; defaultEnd: string;
  onClose: () => void; onCreated: () => void;
}) {
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [notes, setNotes] = useState('');
  const [step, setStep] = useState<'configure' | 'review'>('configure');
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { totalGross: number; overrideNote: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePreview = async () => {
    setError(''); setLoading(true);
    try {
      const { data } = await api.post('/compensation/payroll/preview', { periodStart: start, periodEnd: end });
      setPreview(data.data.entries);
      setStep('review');
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to generate preview');
    } finally { setLoading(false); }
  };

  const handleFinalize = async () => {
    if (!preview) return;
    setError(''); setLoading(true);
    try {
      const entries = preview.map(e => ({
        userId: e.userId,
        basePay: e.basePay,
        commissions: e.commissions,
        totalGross: overrides[e.userId]?.totalGross ?? e.totalGross,
        hoursLogged: e.hoursLogged,
        overrideNote: overrides[e.userId]?.overrideNote || undefined,
        commissionEntryIds: e.commissionEntryIds,
      }));
      await api.post('/compensation/payroll/finalize', { periodStart: start, periodEnd: end, notes, entries });
      onCreated();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to finalize');
    } finally { setLoading(false); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">
            {step === 'configure' ? 'New Pay Run' : 'Review Pay Run'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        {step === 'configure' && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Period Start</label>
                <input type="date" value={start} onChange={e => setStart(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Period End</label>
                <input type="date" value={end} onChange={e => setEnd(e.target.value)} className={inp} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. March bi-weekly" className={inp} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handlePreview} disabled={loading}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Preview Pay Run →
              </button>
            </div>
          </div>
        )}

        {step === 'review' && preview && (
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              Finalizing will lock all pending commissions for this period. You can edit any total below before finalizing.
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Name</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Hours</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Base Pay</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Commissions</th>
                    <th className="px-3 py-2.5 text-right text-gray-500 font-medium">Total Gross</th>
                    <th className="px-3 py-2.5 text-left text-gray-500 font-medium">Override Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.map(e => {
                    const ov = overrides[e.userId];
                    const gross = ov?.totalGross ?? e.totalGross;
                    const isOverridden = ov?.totalGross !== undefined && ov.totalGross !== e.totalGross;
                    return (
                      <tr key={e.userId} className={isOverridden ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-gray-800">{e.name}</p>
                          <p className="text-gray-500 capitalize">{e.role}</p>
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{e.hoursLogged.toFixed(1)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{fmtUSDCents(e.basePay)}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">{fmtUSDCents(e.commissions)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <input
                            type="number"
                            value={gross}
                            onChange={ev => setOverrides(prev => ({
                              ...prev,
                              [e.userId]: { ...prev[e.userId], totalGross: +ev.target.value },
                            }))}
                            className="w-24 px-2 py-1 border border-gray-300 rounded text-xs text-right font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <input
                            type="text"
                            placeholder="reason for edit..."
                            value={ov?.overrideNote ?? ''}
                            onChange={ev => setOverrides(prev => ({
                              ...prev,
                              [e.userId]: { ...prev[e.userId], overrideNote: ev.target.value },
                            }))}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-gray-50 border-t border-gray-200">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-sm font-semibold text-gray-700">Total Gross Payroll</td>
                    <td className="px-3 py-2 text-right text-sm font-bold text-gray-900">
                      {fmtUSDCents(preview.reduce((s, e) => s + (overrides[e.userId]?.totalGross ?? e.totalGross), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep('configure')} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">← Back</button>
              <button onClick={handleFinalize} disabled={loading}
                className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Finalize Pay Run
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Leaderboard Tab ───────────────────────────────────────────────────────────

const MEDAL = ['🥇', '🥈', '🥉'];
const PERIODS = [
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
];

function LeaderboardTab() {
  const [period, setPeriod] = useState('this_month');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: board = [], isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => api.get(`/compensation/leaderboard?period=${period}`).then(r => r.data.data as LeaderboardEntry[]),
  });

  const { data: stats } = useQuery({
    queryKey: ['leaderboard-stats', expanded],
    queryFn: () => expanded ? api.get(`/compensation/leaderboard/${expanded}/stats`).then(r => r.data.data) : null,
    enabled: !!expanded,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${period === p.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {p.label}
          </button>
        ))}
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

      <div className="space-y-3">
        {board.map((entry, i) => {
          const isExpanded = expanded === entry.user.id;
          const targetPct = entry.target ? Math.min(100, (entry.totalRevenue / entry.target.amount) * 100) : null;

          return (
            <div key={entry.user.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div
                className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : entry.user.id)}>
                <div className="text-xl w-8 text-center flex-shrink-0">{MEDAL[i] ?? `#${i+1}`}</div>
                <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700 flex-shrink-0">
                  {entry.user.firstName[0]}{entry.user.lastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{entry.user.firstName} {entry.user.lastName}</p>
                  {targetPct !== null && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full max-w-[120px]">
                        <div
                          className={`h-1.5 rounded-full ${targetPct >= 100 ? 'bg-emerald-500' : targetPct >= 75 ? 'bg-blue-500' : targetPct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                          style={{ width: `${targetPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{Math.round(targetPct)}% of {fmtUSD(entry.target!.amount)} target</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-6 flex-shrink-0 text-right">
                  <div>
                    <p className="text-xs text-gray-500">Jobs Won</p>
                    <p className="text-sm font-bold text-gray-900">{entry.jobsWon}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Revenue</p>
                    <p className="text-sm font-bold text-gray-900">{fmtUSD(entry.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Win Rate</p>
                    <p className={`text-sm font-bold ${entry.winRate >= 60 ? 'text-emerald-600' : entry.winRate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                      {entry.winRate}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Commission</p>
                    <p className="text-sm font-bold text-emerald-700">{fmtUSD(entry.commissionEarned)}</p>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />}
              </div>

              {isExpanded && stats && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Pipeline by Status</p>
                    {Object.entries(stats.byStatus as Record<string, number>).map(([status, count]) => (
                      <p key={status} className="text-xs text-gray-700 capitalize">{status.replace(/_/g, ' ')}: <strong>{count}</strong></p>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Avg Job Value</p>
                    <p className="text-lg font-bold text-gray-900">{fmtUSD(stats.avgJobValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Jobs</p>
                    <p className="text-lg font-bold text-gray-900">{stats.jobsWon}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">6-Month Revenue</p>
                    <div className="flex items-end gap-1 h-12">
                      {Object.entries(stats.monthlyRevenue as Record<string, number>).slice(-6).map(([month, rev]) => {
                        const maxRev = Math.max(...Object.values(stats.monthlyRevenue as Record<string, number>), 1);
                        const h = Math.round((rev / maxRev) * 100);
                        return (
                          <div key={month} className="flex-1 flex flex-col items-center gap-1" title={`${month}: ${fmtUSD(rev)}`}>
                            <div className="w-full bg-indigo-400 rounded-t" style={{ height: `${h}%` }} />
                            <span className="text-xs text-gray-400">{month.split('-')[1]}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {board.length === 0 && !isLoading && (
        <div className="text-center py-16 text-gray-500">No sales data yet for this period.</div>
      )}
    </div>
  );
}

// ── Targets Tab ───────────────────────────────────────────────────────────────

function TargetsTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['sales-targets'],
    queryFn: () => api.get('/compensation/targets').then(r => r.data.data as SalesTarget[]),
  });

  const { data: team = [] } = useQuery({
    queryKey: ['team-sales'],
    queryFn: () => api.get('/users?role=sales').then(r => r.data.data as TeamMember[]),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/compensation/targets/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-targets'] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
          <Plus className="h-4 w-4" /> Set Target
        </button>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

      {targets.length === 0 && !isLoading && (
        <div className="text-center py-16 text-gray-500">No active targets set. Set revenue targets for your sales team.</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {targets.map(t => {
          const now = new Date();
          const start = new Date(t.startDate);
          const end = new Date(t.endDate);
          const totalDays = (end.getTime() - start.getTime()) / 86400000;
          const daysElapsed = Math.min(totalDays, (now.getTime() - start.getTime()) / 86400000);
          const timePct = Math.round((daysElapsed / totalDays) * 100);

          return (
            <div key={t.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">{t.user.firstName} {t.user.lastName}</p>
                  <p className="text-xs text-gray-500 capitalize">{t.period} target · {fmtDate(t.startDate)} – {fmtDate(t.endDate)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => { if (confirm('Delete this target?')) deleteMutation.mutate(t.id); }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="flex items-end justify-between mb-2">
                <span className="text-2xl font-bold text-gray-900">{fmtUSD(Number(t.targetAmount))}</span>
                <span className="text-xs text-gray-500">{timePct}% of period elapsed</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-2 bg-indigo-400 rounded-full transition-all" style={{ width: `${timePct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {showForm && <TargetFormModal team={team} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['sales-targets'] }); }} />}
    </div>
  );
}

function TargetFormModal({ team, onClose, onSaved }: {
  team: TeamMember[]; onClose: () => void; onSaved: () => void;
}) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const [form, setForm] = useState({
    userId: team[0]?.id ?? '',
    targetAmount: '',
    period: 'monthly',
    startDate: firstOfMonth,
    endDate: lastOfMonth,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setError(''); setLoading(true);
    try {
      await api.post('/compensation/targets', { ...form, targetAmount: +form.targetAmount });
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold text-gray-900">Set Sales Target</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Salesperson</label>
            <select value={form.userId} onChange={set('userId')} className={`${inp} bg-white`}>
              {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Amount ($)</label>
              <input required type="number" value={form.targetAmount} onChange={set('targetAmount')} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period</label>
              <select value={form.period} onChange={set('period')} className={`${inp} bg-white`}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={set('startDate')} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={set('endDate')} className={inp} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Set Target
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'payroll' | 'leaderboard' | 'targets';

export function PayrollPage() {
  const [tab, setTab] = useState<Tab>('payroll');

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'payroll',     label: 'Pay Runs',    icon: DollarSign },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'targets',     label: 'Targets',     icon: Target },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payroll & Sales</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage pay runs, track leaderboard, and set revenue targets</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'payroll'     && <PayRunTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'targets'     && <TargetsTab />}
    </div>
  );
}
