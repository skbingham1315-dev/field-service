import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import {
  DollarSign, Clock, Target, CheckCircle, Loader2, X,
  Download, Lock, Trophy, ChevronDown, ChevronUp, Plus, Edit2, Trash2,
  Upload, AlertTriangle, FileSpreadsheet,
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

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

interface TimeEntry {
  id: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  hoursWorked: number;
  notes?: string;
  status: string;
  userId: string;
  user?: { id: string; firstName: string; lastName: string; payRate?: number; payType?: string };
  job?: { id: string; title: string };
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
  const [editEntry, setEditEntry] = useState<{ runId: string; entry: PayrollEntry } | null>(null);

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
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {run.entries.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{e.user.firstName} {e.user.lastName}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{e.regularHours.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{fmtUSDCents(e.payRate)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmtUSDCents(e.grossPay)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{e.notes}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setEditEntry({ runId: run.id, entry: e })}
                          className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors" title="Edit entry">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
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
      {editEntry && (
        <EditPayEntryModal
          runId={editEntry.runId}
          entry={editEntry.entry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); qc.invalidateQueries({ queryKey: ['payroll-runs'] }); }}
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

// ── Edit Payroll Entry Modal ───────────────────────────────────────────────────

function EditPayEntryModal({ runId, entry, onClose, onSaved }: {
  runId: string;
  entry: PayrollEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [regularHours, setRegularHours] = useState(String(entry.regularHours));
  const [overtimeHours, setOvertimeHours] = useState(String(entry.overtimeHours));
  const [grossPay, setGrossPay] = useState(String(entry.grossPay));
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const handleSave = async (ev: React.FormEvent) => {
    ev.preventDefault(); setError(''); setLoading(true);
    try {
      await api.patch(`/payroll/${runId}/entries/${entry.id}`, {
        regularHours: +regularHours,
        overtimeHours: +overtimeHours,
        grossPay: +grossPay,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Edit Entry — {entry.user.firstName} {entry.user.lastName}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Regular Hours</label>
              <input type="number" min="0" step="0.25" value={regularHours} onChange={e => setRegularHours(e.target.value)} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Overtime Hours</label>
              <input type="number" min="0" step="0.25" value={overtimeHours} onChange={e => setOvertimeHours(e.target.value)} className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Gross Pay ($)</label>
            <input type="number" min="0" step="0.01" value={grossPay} onChange={e => setGrossPay(e.target.value)} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Override reason…" className={inp} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Spreadsheet Import ────────────────────────────────────────────────────────

/** Normalise header names to a canonical key */
function normaliseKey(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const COLUMN_MAP: Record<string, string> = {
  employee: 'name', employeename: 'name', name: 'name',
  firstname: 'firstName', lastname: 'lastName',
  date: 'date',
  clockin: 'clockIn', timein: 'clockIn', start: 'clockIn', starttime: 'clockIn',
  clockout: 'clockOut', timeout: 'clockOut', end: 'clockOut', endtime: 'clockOut',
  hours: 'hoursWorked', hoursworked: 'hoursWorked', totalhours: 'hoursWorked', hrs: 'hoursWorked',
  notes: 'notes', description: 'notes', note: 'notes',
};

interface ParsedRow {
  raw: Record<string, string>;
  name?: string;
  firstName?: string;
  lastName?: string;
  date?: string;
  clockIn?: string;
  clockOut?: string;
  hoursWorked?: string;
  notes?: string;
  matchedUserId?: string;
  error?: string;
}

function parseSheetData(rows: Record<string, string>[], team: TeamMember[]): ParsedRow[] {
  return rows.map(raw => {
    const mapped: ParsedRow = { raw };
    for (const [rawKey, value] of Object.entries(raw)) {
      const canonical = COLUMN_MAP[normaliseKey(rawKey)];
      if (canonical) (mapped as unknown as Record<string, string>)[canonical] = String(value ?? '').trim();
    }

    // Try to match employee by name (case-insensitive, also partial last-name match)
    const fullName = mapped.name ?? `${mapped.firstName ?? ''} ${mapped.lastName ?? ''}`.trim();
    if (fullName) {
      const lower = fullName.toLowerCase().replace(/\s+/g, ' ');
      const match = team.find(u => {
        const full = `${u.firstName} ${u.lastName}`.toLowerCase();
        const first = u.firstName.toLowerCase();
        const last = u.lastName.toLowerCase();
        return full === lower || first === lower || last === lower ||
          lower.includes(last) || lower.includes(first);
      });
      if (match) mapped.matchedUserId = match.id;
    }

    // Validate
    if (!mapped.date) mapped.error = 'Missing date';
    else if (!mapped.hoursWorked && !(mapped.clockIn && mapped.clockOut)) mapped.error = 'Need hours or clock in/out';

    return mapped;
  }).filter(r => Object.values(r.raw).some(v => v !== ''));
}

function parseDateValue(raw: string): string {
  // Handle Excel serial numbers
  if (/^\d{5}$/.test(raw)) {
    const d = XLSX.SSF.parse_date_code(Number(raw));
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  // Try natural parse
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return raw;
}

function SpreadsheetImportModal({ team, onClose, onImported }: {
  team: TeamMember[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [userMap, setUserMap] = useState<Record<number, string>>({});
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErrors, setSubmitErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    setParseError(''); setRows([]); setUserMap({});
    setFileName(file.name);
    const isExcel = file.name.match(/\.xlsx?$/i);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target!.result, { type: 'array', cellDates: false });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false });
          const parsed = parseSheetData(data, team);
          setRows(parsed);
          const map: Record<number, string> = {};
          parsed.forEach((r, i) => { if (r.matchedUserId) map[i] = r.matchedUserId; });
          setUserMap(map);
        } catch {
          setParseError('Could not read Excel file. Try saving as CSV.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          const parsed = parseSheetData(result.data, team);
          setRows(parsed);
          const map: Record<number, string> = {};
          parsed.forEach((r, i) => { if (r.matchedUserId) map[i] = r.matchedUserId; });
          setUserMap(map);
        },
        error: () => setParseError('Could not parse CSV. Check the file format.'),
      });
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [team]);

  const handleSubmit = async () => {
    setSubmitting(true); setSubmitErrors([]);
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const userId = userMap[i];
      if (!userId) { errors.push(`Row ${i + 1}: No employee matched`); continue; }
      if (row.error) { errors.push(`Row ${i + 1}: ${row.error}`); continue; }

      try {
        const dateStr = parseDateValue(row.date!);
        const payload: Record<string, unknown> = { userId, date: dateStr, notes: row.notes || undefined };
        if (row.clockIn && row.clockOut) {
          payload.clockIn = new Date(`${dateStr}T${row.clockIn}`).toISOString();
          payload.clockOut = new Date(`${dateStr}T${row.clockOut}`).toISOString();
        } else if (row.hoursWorked) {
          payload.hoursWorked = Number(row.hoursWorked);
        }
        await api.post('/time-entries', payload);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error';
        errors.push(`Row ${i + 1} (${rows[i].name ?? ''}): ${msg}`);
      }
    }

    setSubmitting(false);
    if (errors.length === 0) {
      onImported();
    } else {
      setSubmitErrors(errors);
    }
  };

  const readyCount = rows.filter((r, i) => userMap[i] && !r.error).length;
  const inp = 'w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-500" /> Import Hours from Spreadsheet
          </h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            {fileName ? (
              <p className="text-sm font-medium text-indigo-600">{fileName}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-700">Drop your spreadsheet here, or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supports .csv, .xls, .xlsx</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
          </div>

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {parseError}
            </div>
          )}

          {/* Column hint */}
          {rows.length === 0 && !parseError && (
            <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
              <p className="font-medium text-gray-700 mb-2">Expected columns (any order, headers required):</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                <p><span className="font-medium">Employee / Name</span> — employee's full name</p>
                <p><span className="font-medium">Date</span> — e.g. 4/15/2026 or 2026-04-15</p>
                <p><span className="font-medium">Hours / Hours Worked</span> — e.g. 8.5</p>
                <p><span className="font-medium">Clock In / Clock Out</span> — e.g. 08:00, 17:00</p>
                <p><span className="font-medium">Notes</span> — optional</p>
              </div>
            </div>
          )}

          {/* Preview table */}
          {rows.length > 0 && (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-xs text-gray-500">{rows.length} rows found · {readyCount} ready to import</p>
                {rows.some((_, i) => !userMap[i]) && (
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Apply to all unmatched:</span>
                    <select
                      defaultValue=""
                      onChange={e => {
                        if (!e.target.value) return;
                        setUserMap(m => {
                          const next = { ...m };
                          rows.forEach((_, i) => { if (!next[i]) next[i] = e.target.value; });
                          return next;
                        });
                        e.target.value = '';
                      }}
                      className="px-2 py-1.5 border border-indigo-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-indigo-700 font-medium"
                    >
                      <option value="">— select employee —</option>
                      {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Employee</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Date</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Hours / Times</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Notes</th>
                        <th className="px-3 py-2.5 text-left font-medium text-gray-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {rows.map((row, i) => {
                        const hasError = !userMap[i] || !!row.error;
                        return (
                          <tr key={i} className={hasError ? 'bg-red-50' : 'hover:bg-gray-50'}>
                            <td className="px-3 py-2">
                              <select value={userMap[i] ?? ''} onChange={e => setUserMap(m => ({ ...m, [i]: e.target.value }))} className={inp}>
                                <option value="">— select employee —</option>
                                {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
                              </select>
                              {row.name && !userMap[i] && (
                                <p className="text-red-500 mt-0.5 text-[10px]">No match for "{row.name}"</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{row.date ?? <span className="text-red-500">missing</span>}</td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.clockIn && row.clockOut
                                ? `${row.clockIn} – ${row.clockOut}`
                                : row.hoursWorked
                                ? `${row.hoursWorked}h`
                                : <span className="text-red-500">missing</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-500">{row.notes ?? ''}</td>
                            <td className="px-3 py-2">
                              {row.error ? (
                                <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{row.error}</span>
                              ) : !userMap[i] ? (
                                <span className="text-amber-600">Unmatched</span>
                              ) : (
                                <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />Ready</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {submitErrors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
              <p className="text-sm font-semibold text-red-700">Some rows failed:</p>
              {submitErrors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting || readyCount === 0}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Import {readyCount > 0 ? `${readyCount} Entries` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hours Tab (admin time entry management) ────────────────────────────────────

function HoursTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);
  const [filterUserId, setFilterUserId] = useState('');

  const { data: team = [] } = useQuery({
    queryKey: ['team-all'],
    queryFn: () => api.get('/users').then(r => r.data.data as TeamMember[]),
  });

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ['time-entries-all', filterUserId],
    queryFn: () => api.get(`/time-entries${filterUserId ? `?userId=${filterUserId}` : ''}`).then(r => r.data.data),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['time-entries-all'] });

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await api.delete(`/time-entries/${id}`).catch(() => {});
    refresh();
  };

  const STATUS_COLOR: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-blue-100 text-blue-700',
    paid: 'bg-emerald-100 text-emerald-700',
  };

  function fmtTime(iso?: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  function fmtEntryDate(iso: string) {
    return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={filterUserId} onChange={e => setFilterUserId(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Employees</option>
          {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <FileSpreadsheet className="h-4 w-4" /> Import Spreadsheet
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
            <Plus className="h-4 w-4" /> Add Hours for Employee
          </button>
        </div>
      </div>

      {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}

      {entries.length === 0 && !isLoading && (
        <div className="text-center py-16 text-gray-500">No time entries found.</div>
      )}

      {entries.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Employee</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Hours</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Notes</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      {e.user ? `${e.user.firstName} ${e.user.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{fmtEntryDate(e.date)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {e.clockIn ? `${fmtTime(e.clockIn)} – ${fmtTime(e.clockOut)}` : 'Manual'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{e.hoursWorked.toFixed(2)}h</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[e.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px] truncate">{e.notes ?? ''}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setEditEntry(e)}
                          className="p-1 text-gray-400 hover:text-indigo-600 rounded-lg transition-colors" title="Edit">
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {e.status !== 'paid' && (
                          <button onClick={() => handleDelete(e.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded-lg transition-colors" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && (
        <AddHoursForEmployeeModal
          team={team}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refresh(); }}
        />
      )}
      {showImport && (
        <SpreadsheetImportModal
          team={team}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refresh(); }}
        />
      )}
      {editEntry && (
        <EditTimeEntryModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { setEditEntry(null); refresh(); }}
        />
      )}
    </div>
  );
}

function AddHoursForEmployeeModal({ team, onClose, onSaved }: {
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({
    userId: team[0]?.id ?? '',
    date: today,
    clockIn: '',
    clockOut: '',
    hoursWorked: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setError(''); setLoading(true);
    try {
      const payload: Record<string, unknown> = { userId: form.userId, date: form.date, notes: form.notes || undefined };
      if (form.clockIn && form.clockOut) {
        payload.clockIn = new Date(`${form.date}T${form.clockIn}`).toISOString();
        payload.clockOut = new Date(`${form.date}T${form.clockOut}`).toISOString();
      } else if (form.hoursWorked) {
        payload.hoursWorked = Number(form.hoursWorked);
      }
      await api.post('/time-entries', payload);
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Add Hours for Employee</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Employee</label>
            <select value={form.userId} onChange={set('userId')} className={`${inp} bg-white`}>
              {team.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="date" required value={form.date} onChange={set('date')} className={inp} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock In</label>
              <input type="time" value={form.clockIn} onChange={set('clockIn')} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock Out</label>
              <input type="time" value={form.clockOut} onChange={set('clockOut')} className={inp} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" /> or enter hours directly <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hours Worked</label>
            <input type="number" min="0.25" max="24" step="0.25" value={form.hoursWorked} onChange={set('hoursWorked')}
              placeholder="e.g. 8.5" className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              placeholder="What did they work on?" className={`${inp} resize-none`} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditTimeEntryModal({ entry, onClose, onSaved }: {
  entry: TimeEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const entryDate = entry.date.split('T')[0];
  const toTime = (iso?: string) => iso ? new Date(iso).toTimeString().slice(0, 5) : '';
  const [form, setForm] = useState({
    date: entryDate,
    clockIn: toTime(entry.clockIn),
    clockOut: toTime(entry.clockOut),
    hoursWorked: String(entry.hoursWorked),
    notes: entry.notes ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const inp = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault(); setError(''); setLoading(true);
    try {
      const payload: Record<string, unknown> = { notes: form.notes || undefined };
      if (form.clockIn && form.clockOut) {
        payload.clockIn = new Date(`${form.date}T${form.clockIn}`).toISOString();
        payload.clockOut = new Date(`${form.date}T${form.clockOut}`).toISOString();
      } else {
        payload.hoursWorked = Number(form.hoursWorked);
      }
      await api.patch(`/time-entries/${entry.id}`, payload);
      onSaved();
    } catch (e: unknown) {
      setError((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">
            Edit Hours — {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : 'Employee'}
          </h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={form.date} readOnly className={`${inp} bg-gray-50 cursor-not-allowed`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock In</label>
              <input type="time" value={form.clockIn} onChange={set('clockIn')} className={inp} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock Out</label>
              <input type="time" value={form.clockOut} onChange={set('clockOut')} className={inp} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" /> or override hours directly <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hours Worked</label>
            <input type="number" min="0.25" max="24" step="0.25" value={form.hoursWorked} onChange={set('hoursWorked')} className={inp} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inp} resize-none`} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = 'payroll' | 'hours' | 'leaderboard' | 'targets';

export function PayrollPage() {
  const [tab, setTab] = useState<Tab>('payroll');

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'payroll',     label: 'Pay Runs',    icon: DollarSign },
    { id: 'hours',       label: 'Hours',       icon: Clock },
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
      {tab === 'hours'       && <HoursTab />}
      {tab === 'leaderboard' && <LeaderboardTab />}
      {tab === 'targets'     && <TargetsTab />}
    </div>
  );
}
