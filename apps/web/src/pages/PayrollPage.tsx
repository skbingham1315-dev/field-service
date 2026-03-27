import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DollarSign, Plus, CheckCircle, CreditCard, ChevronDown, ChevronUp, Loader2, X, Clock, Users } from 'lucide-react';

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

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtUSD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function NewPayrollModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  const [form, setForm] = useState({ periodStart: twoWeeksAgo, periodEnd: today, notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({...f, [k]: e.target.value}));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await api.post('/payroll', form);
      onCreated();
    } catch (err: unknown) {
      setError((err as {response?:{data?:{message?:string}}})?.response?.data?.message ?? 'Failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Run Payroll</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-gray-500">Automatically calculates pay from logged hours in the date range.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period Start</label>
              <input type="date" required value={form.periodStart} onChange={set('periodStart')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Period End</label>
              <input type="date" required value={form.periodEnd} onChange={set('periodEnd')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <DollarSign className="h-4 w-4" />}
              Calculate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayrollRunCard({ run, onRefresh }: { run: PayrollRun; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState('');

  const approve = async () => {
    setLoading('approve');
    await api.post(`/payroll/${run.id}/approve`).catch(() => {});
    onRefresh(); setLoading('');
  };
  const markPaid = async () => {
    if (!confirm('Mark this payroll as paid?')) return;
    setLoading('paid');
    await api.post(`/payroll/${run.id}/mark-paid`).catch(() => {});
    onRefresh(); setLoading('');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-gray-900">{fmtDate(run.periodStart)} – {fmtDate(run.periodEnd)}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLES[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {run.status}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{run.entries.length} employees</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />
              {run.entries.reduce((s, e) => s + e.regularHours + e.overtimeHours, 0).toFixed(1)}h total
            </span>
            {run.paidAt && <span>Paid {fmtDate(run.paidAt)}</span>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-bold text-gray-900">{fmtUSD(run.totalGross)}</p>
          <p className="text-xs text-gray-400">gross pay</p>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {run.entries.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No time entries found for this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium">Employee</th>
                  <th className="text-center px-3 py-2.5 font-medium">Reg Hrs</th>
                  <th className="text-center px-3 py-2.5 font-medium">OT Hrs</th>
                  <th className="text-right px-3 py-2.5 font-medium">Rate</th>
                  <th className="text-right px-5 py-2.5 font-medium">Gross Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {run.entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-900">{entry.user.firstName} {entry.user.lastName}</p>
                      <p className="text-xs text-gray-400 capitalize">{entry.user.role}</p>
                    </td>
                    <td className="text-center px-3 py-3 text-gray-700">{entry.regularHours.toFixed(1)}</td>
                    <td className="text-center px-3 py-3">
                      <span className={entry.overtimeHours > 0 ? 'text-amber-600 font-medium' : 'text-gray-400'}>
                        {entry.overtimeHours.toFixed(1)}
                      </span>
                    </td>
                    <td className="text-right px-3 py-3 text-gray-700">
                      {entry.payRate > 0 ? (entry.payType === 'hourly' ? `$${entry.payRate}/hr` : `$${entry.payRate.toLocaleString()}/yr`) : '—'}
                    </td>
                    <td className="text-right px-5 py-3 font-semibold text-gray-900">{fmtUSD(entry.grossPay)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-5 py-3 text-gray-700">Total</td>
                  <td className="text-right px-5 py-3 text-gray-900">{fmtUSD(run.totalGross)}</td>
                </tr>
              </tbody>
            </table>
          )}

          {run.status !== 'paid' && run.entries.length > 0 && (
            <div className="flex gap-3 p-4 border-t border-gray-100">
              {run.status === 'draft' && (
                <button onClick={approve} disabled={loading === 'approve'}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                  {loading === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Approve
                </button>
              )}
              {run.status === 'approved' && (
                <button onClick={markPaid} disabled={loading === 'paid'}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60">
                  {loading === 'paid' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Mark as Paid
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PayrollPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const { data: runs = [], isLoading } = useQuery<PayrollRun[]>({
    queryKey: ['payroll'],
    queryFn: () => api.get('/payroll').then(r => r.data.data),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] });
  const totalPaidYTD = runs.filter(r => r.status === 'paid').reduce((s, r) => s + r.totalGross, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
          <p className="text-sm text-gray-500 mt-0.5">Calculate pay from logged hours · YTD paid: <span className="font-semibold text-gray-700">{fmtUSD(totalPaidYTD)}</span></p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
          <Plus className="h-4 w-4" /> Run Payroll
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : runs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center">
          <DollarSign className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No payroll runs yet</p>
          <p className="text-sm text-gray-400 mt-1">Click "Run Payroll" to calculate pay from logged hours.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map(run => <PayrollRunCard key={run.id} run={run} onRefresh={refresh} />)}
        </div>
      )}

      {showNew && <NewPayrollModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />}
    </div>
  );
}
