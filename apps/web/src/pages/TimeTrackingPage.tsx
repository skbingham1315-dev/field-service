import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Clock, Play, Square, Plus, Trash2, Loader2, X, DollarSign, CheckCircle, AlertCircle, MapPin, Navigation } from 'lucide-react';

interface TimeEntry {
  id: string;
  date: string;
  clockIn?: string;
  clockOut?: string;
  clockInLat?: number | null;
  clockInLng?: number | null;
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
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtHours(h: number) {
  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60);
  return `${hrs}h ${mins}m`;
}

/** Haversine distance in miles between two lat/lng points */
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GEOFENCE_RADIUS_MI = 1;

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
        if (form.clockOut <= form.clockIn) {
          setError('Clock-out must be after clock-in. For overnight shifts, enter hours directly.');
          setLoading(false);
          return;
        }
        payload.clockIn = new Date(`${form.date}T${form.clockIn}`).toISOString();
        payload.clockOut = new Date(`${form.date}T${form.clockOut}`).toISOString();
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock In</label>
              <input type="time" value={form.clockIn} onChange={set('clockIn')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Clock Out</label>
              <input type="time" value={form.clockOut} onChange={set('clockOut')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <div className="flex-1 h-px bg-gray-200" /> or enter hours directly <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hours Worked</label>
            <input type="number" min="0.25" max="24" step="0.25" value={form.hoursWorked} onChange={set('hoursWorked')}
              placeholder="e.g. 8.5"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="What did you work on?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
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
  useAuthStore(s => s.user);
  const qc = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockError, setClockError] = useState('');
  const [autoClockOutMsg, setAutoClockOutMsg] = useState('');

  // Geofence state
  const [currentDist, setCurrentDist] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const autoedOut = useRef(false); // prevent double auto-clock-out

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ['time-entries'],
    queryFn: () => api.get('/time-entries').then(r => r.data.data),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['time-entries'] });

  // Derive active entry (clocked in, no clock-out)
  const today = new Date().toISOString().split('T')[0];
  const activeEntry = entries.find(e => e.date.startsWith(today) && e.clockIn && !e.clockOut) ?? null;
  const clockedIn = !!activeEntry;

  // ─── Geofence watch ──────────────────────────────────────────────────────────
  const stopWatch = () => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    setCurrentDist(null);
  };

  const doAutoClockOut = async () => {
    if (autoedOut.current) return;
    autoedOut.current = true;
    stopWatch();
    try {
      await api.post('/time-entries/clock-out', {});
      refresh();
      setAutoClockOutMsg('You moved more than 1 mile from your clock-in spot — you\'ve been automatically clocked out.');
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!clockedIn || !activeEntry?.clockInLat || !activeEntry?.clockInLng || !navigator.geolocation) {
      stopWatch();
      autoedOut.current = false;
      return;
    }

    const homeLat = activeEntry.clockInLat;
    const homeLng = activeEntry.clockInLng;
    autoedOut.current = false;

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const d = distanceMiles(homeLat, homeLng, pos.coords.latitude, pos.coords.longitude);
        setCurrentDist(d);
        if (d > GEOFENCE_RADIUS_MI) {
          doAutoClockOut();
        }
      },
      () => { /* permission denied or unavailable — geofence just won't show */ },
      { enableHighAccuracy: true },
    );

    return () => stopWatch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockedIn, activeEntry?.id]);

  // ─── Clock in / out ──────────────────────────────────────────────────────────
  const handleClockIn = async () => {
    setClockLoading(true); setClockError(''); setAutoClockOutMsg('');
    try {
      // Get GPS first; proceed even if denied
      let lat: number | undefined, lng: number | undefined;
      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => { lat = pos.coords.latitude; lng = pos.coords.longitude; resolve(); },
            () => resolve(),
            { timeout: 6000, enableHighAccuracy: true },
          );
        });
      }
      await api.post('/time-entries/clock-in', { lat, lng });
      refresh();
    } catch (err: unknown) {
      setClockError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error');
    } finally { setClockLoading(false); }
  };

  const handleClockOut = async () => {
    setClockLoading(true); setClockError('');
    try {
      await api.post('/time-entries/clock-out', {});
      stopWatch();
      refresh();
    } catch (err: unknown) {
      setClockError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error');
    } finally { setClockLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    await api.delete(`/time-entries/${id}`).catch(() => {});
    refresh();
  };

  // ─── Summaries ───────────────────────────────────────────────────────────────
  const thisWeek = entries.filter(e => { const d = new Date(e.date); return d >= weekStart && d <= weekEnd; });
  const totalHoursWeek = thisWeek.reduce((s, e) => s + e.hoursWorked, 0);
  const payRate = entries[0]?.user?.payRate ?? 0;
  const payType = entries[0]?.user?.payType ?? 'hourly';
  const estPay = payType === 'hourly' ? totalHoursWeek * payRate : payRate / 52;

  // Geofence ring values
  const hasGeofence = clockedIn && activeEntry?.clockInLat != null;
  const pct = hasGeofence && currentDist !== null ? Math.min((currentDist / GEOFENCE_RADIUS_MI) * 100, 100) : null;
  const distColor =
    pct === null ? 'text-gray-400' :
    pct > 90 ? 'text-red-600' :
    pct > 70 ? 'text-amber-500' :
    'text-emerald-600';
  const ringColor =
    pct === null ? '#e5e7eb' :
    pct > 90 ? '#ef4444' :
    pct > 70 ? '#f59e0b' :
    '#10b981';

  // SVG ring (circumference of r=38 circle ≈ 238.76)
  const CIRC = 238.76;
  const dashOffset = pct !== null ? CIRC - (pct / 100) * CIRC : CIRC;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-gray-900">Time Tracking</h1>
        <p className="text-sm text-gray-500 mt-0.5">Log your hours and stay in range.</p>
      </div>

      {/* Auto clock-out notice */}
      {autoClockOutMsg && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Auto Clocked Out</p>
            <p className="text-xs text-amber-700 mt-0.5">{autoClockOutMsg}</p>
          </div>
          <button onClick={() => setAutoClockOutMsg('')} className="ml-auto text-amber-400 hover:text-amber-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Clock in/out + geofence + week summary */}
      <div className="grid grid-cols-2 gap-4">
        {/* Clock button card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Today</p>
          {clockError && (
            <p className="text-xs text-red-500 mb-2 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />{clockError}
            </p>
          )}
          <button
            onClick={clockedIn ? handleClockOut : handleClockIn}
            disabled={clockLoading}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 ${
              clockedIn
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-md shadow-red-200'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-md shadow-emerald-200'
            }`}
          >
            {clockLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
              clockedIn
                ? <><Square className="h-4 w-4" /> Clock Out</>
                : <><Play className="h-4 w-4" /> Clock In</>}
          </button>
          {clockedIn && (
            <p className="text-xs text-emerald-600 text-center mt-2 font-medium flex items-center justify-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              Clocked in {fmt(activeEntry?.clockIn)}
            </p>
          )}
          {!clockedIn && !hasGeofence && (
            <p className="text-xs text-gray-400 text-center mt-2 flex items-center justify-center gap-1">
              <MapPin className="h-3 w-3" /> GPS captured on clock-in
            </p>
          )}
        </div>

        {/* Geofence ring or week summary */}
        {hasGeofence ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex flex-col items-center justify-center">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 self-start">Geofence</p>
            <div className="relative flex items-center justify-center">
              {/* SVG ring */}
              <svg width="88" height="88" className="-rotate-90">
                <circle cx="44" cy="44" r="38" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                <circle
                  cx="44" cy="44" r="38" fill="none"
                  stroke={ringColor}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  strokeDashoffset={dashOffset}
                  style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
                />
              </svg>
              {/* Center content */}
              <div className="absolute flex flex-col items-center">
                <Navigation className={`h-3.5 w-3.5 mb-0.5 ${distColor}`} />
                <span className={`text-xs font-bold leading-none ${distColor}`}>
                  {currentDist !== null ? `${currentDist.toFixed(2)}` : '—'}
                </span>
                <span className="text-[9px] text-gray-400 leading-tight">mi</span>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center leading-tight">
              {pct !== null && pct > 90
                ? '⚠️ Near boundary!'
                : `${GEOFENCE_RADIUS_MI} mi limit`}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">This Week</p>
            <p className="text-3xl font-bold text-gray-900">{fmtHours(totalHoursWeek)}</p>
            {payRate > 0 && (
              <p className="text-sm text-emerald-600 font-medium mt-1 flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                Est. {payType === 'hourly' ? `$${estPay.toFixed(2)}` : `$${estPay.toFixed(2)}/wk`}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-1">{thisWeek.length} entries</p>
          </div>
        )}
      </div>

      {/* When geofenced show week summary below */}
      {hasGeofence && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">This Week</p>
            <p className="text-2xl font-bold text-gray-900">{fmtHours(totalHoursWeek)}</p>
            <p className="text-xs text-gray-400">{thisWeek.length} entries</p>
          </div>
          {payRate > 0 && (
            <div className="text-right">
              <p className="text-[11px] text-gray-400">Est. earnings</p>
              <p className="text-lg font-bold text-emerald-600">
                ${(payType === 'hourly' ? estPay : payRate / 52).toFixed(2)}
              </p>
              <p className="text-xs text-gray-400">{payType === 'hourly' ? `$${payRate}/hr` : 'salary'}</p>
            </div>
          )}
        </div>
      )}

      {/* Log hours */}
      <button
        onClick={() => setShowLog(true)}
        className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-violet-400 hover:text-violet-600 text-gray-500 rounded-xl py-3 text-sm font-medium transition-colors"
      >
        <Plus className="h-4 w-4" /> Log Hours Manually
      </button>

      {/* Entry history */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="h-4 w-4" /> History
            </span>
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
                      {entry.clockInLat && (
                        <span title="GPS tracked"><MapPin className="h-3 w-3 text-violet-400" /></span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {entry.clockIn && entry.clockOut
                        ? `${fmt(entry.clockIn)} – ${fmt(entry.clockOut)}`
                        : entry.clockIn && !entry.clockOut
                        ? `${fmt(entry.clockIn)} – active`
                        : 'Manual entry'}
                      {entry.job ? ` · ${entry.job.title}` : ''}
                      {entry.notes ? ` · ${entry.notes}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-3">
                    <span className="text-sm font-bold text-gray-800">{fmtHours(entry.hoursWorked)}</span>
                    {entry.status === 'pending' && !(!entry.clockOut && entry.clockIn) && (
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
