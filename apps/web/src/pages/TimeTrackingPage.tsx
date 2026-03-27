import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Clock, Play, Square, Plus, Edit2, Trash2, Loader2, X, DollarSign, CheckCircle, AlertCircle } from 'lucide-react';

interface TimeEntry {
  id: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  hoursWorked: number;
  notes?: string;
  status: string;
  job?: { id: string; title: string };
  user?: { payRate?: number; payType?: string };
}

function fmt(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtHours(h: number) {
  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
};

function LogHoursModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [form, setForm] = useState({ date: today, clockIn: '', clockOut: '', hoursWorked: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const payload: Record<string, unknown> = { date: form.date, notes: form.notes || undefined };
      if (form.clockIn && form.clockOut) {
        const ci = new Date(`${form.date}T${form.clockIn}`);
        const co = new Date(`${form.date}T${form.clockOut}`);
        payload.clockIn = ci.toISOString(); payload.clockOut = co.toISOString();
      } else if (form.hoursWorked) {
        payload.hoursWorked = Number(form.hoursWorked);
      }
      await api.post('/time-entries', payload);
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="font-bold text-gray-900">Log Hours</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input type="date" required value={form.date} onChange={set('date')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock In</label>
              <input type="time" value={form.clockIn} onChange={set('clockIn')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock Out</label>
              <input type="time" value={form.clockOut} onChange={set('clockOut')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" /> or enter hours directly <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hours Worked</label>
            <input type="number" min="0.25" max="24" step="0.25" value={form.hoursWorked} onChange={set('hoursWorked')}
              placeholder="e.g. 8.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="What did you work on?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TimeTrackingPage() {
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockError, setClockError] = useState('');

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ['time-entries'],
    queryFn: () => api.get('/time-entries').then(r => r.data.data),
  });

  // Detect if clocked in (entry today with clockIn but no clockOut)
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const active = entries.find(e => e.date.startsWith(today) && e.clockIn && !e.clockOut);
    setClockedIn(!!active);
  }, [entries]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['time-entries'] });

  const handleClockIn = async () => {
    setClockLoading(true); setClockError('');
    try { await api.post('/time-entries/clock-in', {}); refresh(); }
    catch (err: unknown) { setClockError((err as {response?:{data?:{message?:string}}})?.response?.data?.message ?? 'Error'); }
    finally { setClockLoading(false); }
  };

  const handleClockOut = async () => {
    setClockLoading(true); setClockError('');
    try { await api.post('/time-entries/clock-out', {}); refresh(); }
    catch (err: unknown) { setClockError((err as {response?:{data?:{message?:string}}})?.response?.data?.message ?? 'Error'); }
    finally { setClockLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await api.delete(`/time-entries/${id}`).catch(() => {});
    refresh();
  };

  const thisWeek = entries.filter(e => {
    const d = new Date(e.date); return d >= weekStart && d <= weekEnd;
  });
  const totalHoursWeek = thisWeek.reduce((s, e) => s + e.hoursWorked, 0);

  const payRate = entries[0]?.user?.payRate ?? 0;
  const payType = entries[0]?.user?.payType ?? 'hourly';
  const estPay = payType === 'hourly' ? totalHoursWeek * payRate : (payRate / 52);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Time Tracking</h1>
        <p className="text-sm text-gray-500 mt-0.5">Log your daily hours and track earnings.</p>
      </div>

      {/* Clock in/out + week summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-3">Today</p>
          {clockError && <p className="text-xs text-red-500 mb-2 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{clockError}</p>}
          <button
            onClick={clockedIn ? handleClockOut : handleClockIn}
            disabled={clockLoading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${
              clockedIn ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'
            }`}
          >
            {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
              clockedIn ? <><Square className="h-4 w-4" /> Clock Out</> : <><Play className="h-4 w-4" /> Clock In</>}
          </button>
          {clockedIn && <p className="text-xs text-emerald-600 text-center mt-2 font-medium">● Currently clocked in</p>}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-500 mb-1">This Week</p>
          <p className="text-3xl font-bold text-gray-900">{fmtHours(totalHoursWeek)}</p>
          {payRate > 0 && (
            <p className="text-sm text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              Est. {payType === 'hourly' ? `$${estPay.toFixed(2)}` : `$${estPay.toFixed(2)}/wk`}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">{thisWeek.length} entries</p>
        </div>
      </div>

      {/* Log hours button */}
      <button onClick={() => setShowLog(true)}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:text-indigo-600 text-gray-500 rounded-xl py-3 text-sm font-medium transition-colors">
        <Plus className="h-4 w-4" /> Log Hours Manually
      </button>

      {/* Entries list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock className="h-4 w-4" /> History</span>
            <span className="text-xs text-gray-400">{entries.length} entries</span>
          </div>
          {entries.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No time entries yet. Clock in or log hours above.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-center px-5 py-3.5 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{fmtDate(entry.date)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[entry.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {entry.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {entry.clockIn && entry.clockOut ? `${fmt(entry.clockIn)} – ${fmt(entry.clockOut)}` : 'Manual entry'}
                      {entry.job ? ` · ${entry.job.title}` : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className="text-sm font-bold text-gray-800">{fmtHours(entry.hoursWorked)}</span>
                    {entry.status === 'pending' && (
                      <button onClick={() => handleDelete(entry.id)} className="p-1 text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showLog && <LogHoursModal onClose={() => setShowLog(false)} onSaved={() => { setShowLog(false); refresh(); }} />}
    </div>
  );
}
