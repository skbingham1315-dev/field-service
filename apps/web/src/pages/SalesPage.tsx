import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Phone, MapPin, Calendar, CheckCircle, Clock,
  ChevronDown, ChevronUp, User, LogOut, X, Search, Lock,
  DoorOpen, UserCheck, FileText, Target, Briefcase, TrendingUp, BookUser,
} from 'lucide-react';
import { ContactsPage } from './ContactsPage';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useTenantPermissions } from '../lib/permissions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: string;
  notes?: string;
  createdAt: string;
  serviceAddresses: Array<{ id: string; street: string; city: string; state: string; zip: string; isPrimary: boolean }>;
}

interface Job {
  id: string;
  title: string;
  status: string;
  scheduledStart?: string;
  serviceType: string;
  customer?: { id: string; firstName: string; lastName: string; phone?: string };
  serviceAddress?: { street: string; city: string; state: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const SERVICE_TYPES = ['pool', 'pest_control', 'turf', 'handyman'];
const SERVICE_LABELS: Record<string, string> = {
  pool: 'Pool Service',
  pest_control: 'Pest Control',
  turf: 'Turf / Lawn',
  handyman: 'Handyman',
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── New Lead Modal ─────────────────────────────────────────────────────────────

function NewLeadModal({ onClose, onCreated, canCreateJobs }: { onClose: () => void; onCreated: (c: Customer) => void; canCreateJobs: boolean }) {
  const qc = useQueryClient();
  const [step, setStep] = useState<'contact' | 'address' | 'appt'>('contact');
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', notes: '' });
  const [addr, setAddr] = useState({ street: '', city: '', state: '', zip: '' });
  const [appt, setAppt] = useState({ serviceType: 'pool', date: '', time: '09:00', notes: '' });
  const [createdCustomer, setCreatedCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const setA = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddr(a => ({ ...a, [k]: e.target.value }));

  const createCustomerMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form, status: 'lead' };
      if (addr.street && addr.city && addr.state && addr.zip) {
        payload.serviceAddresses = [{ ...addr, label: 'Service Address', isPrimary: true }];
      }
      const { data } = await api.post('/customers', payload);
      return data.data as Customer;
    },
    onSuccess: (customer) => {
      qc.invalidateQueries({ queryKey: ['sales-leads'] });
      setCreatedCustomer(customer);
      if (canCreateJobs) {
        setStep('appt');
      } else {
        onCreated(customer);
        onClose();
      }
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Failed to create lead');
    },
  });

  const scheduleApptMutation = useMutation({
    mutationFn: async () => {
      if (!createdCustomer) return;
      const address = createdCustomer.serviceAddresses[0];
      if (!address) throw new Error('No address on customer');
      const start = new Date(`${appt.date}T${appt.time}:00`);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // +1h default
      const { data } = await api.post('/jobs', {
        customerId: createdCustomer.id,
        serviceAddressId: address.id,
        serviceType: appt.serviceType,
        title: `${SERVICE_LABELS[appt.serviceType]} – ${createdCustomer.firstName} ${createdCustomer.lastName}`,
        description: appt.notes || undefined,
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        status: 'scheduled',
      });
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-appointments'] });
      onCreated(createdCustomer!);
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Failed to schedule appointment');
    },
  });

  const skipAppt = () => {
    if (createdCustomer) onCreated(createdCustomer);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:rounded-2xl sm:max-w-lg max-h-[95vh] flex flex-col rounded-t-2xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {step === 'contact' ? 'New Lead' : step === 'address' ? 'Service Address' : 'Schedule Appointment'}
            </h2>
            <div className="flex gap-1 mt-1">
              {(canCreateJobs ? ['contact', 'address', 'appt'] as const : ['contact', 'address'] as const).map((s, i) => (
                <div key={s} className={`h-1 rounded-full transition-all ${
                  step === s ? 'w-8 bg-blue-600' : i < ['contact','address','appt'].indexOf(step) ? 'w-4 bg-blue-300' : 'w-4 bg-gray-200'
                }`} />
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {step === 'contact' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input value={form.firstName} onChange={set('firstName')} placeholder="Jane"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input value={form.lastName} onChange={set('lastName')} placeholder="Smith"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 123-4567"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={set('notes')} rows={2}
                  placeholder="What are they interested in? Any details from the doorstep..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </>
          )}

          {step === 'address' && (
            <>
              <p className="text-sm text-gray-500">Where will the service be performed?</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street *</label>
                <input value={addr.street} onChange={setA('street')} placeholder="123 Main St"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                  <input value={addr.city} onChange={setA('city')} placeholder="Austin"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                  <input value={addr.state} onChange={setA('state')} placeholder="TX" maxLength={2}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ZIP *</label>
                  <input value={addr.zip} onChange={setA('zip')} placeholder="78701"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </>
          )}

          {step === 'appt' && (
            <>
              {createdCustomer && (
                <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <p className="text-sm text-green-700 font-medium">
                    {createdCustomer.firstName} {createdCustomer.lastName} added as a lead!
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Service Type</label>
                <select value={appt.serviceType} onChange={(e) => setAppt(a => ({ ...a, serviceType: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{SERVICE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" value={appt.date} onChange={(e) => setAppt(a => ({ ...a, date: e.target.value }))}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                  <input type="time" value={appt.time} onChange={(e) => setAppt(a => ({ ...a, time: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Notes</label>
                <textarea value={appt.notes} onChange={(e) => setAppt(a => ({ ...a, notes: e.target.value }))} rows={2}
                  placeholder="What they're looking for, access info, etc."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>

        {/* Footer buttons */}
        <div className="px-5 py-4 border-t bg-gray-50 rounded-b-2xl space-y-2">
          {step === 'contact' && (
            <button
              onClick={() => {
                if (!form.firstName.trim() || !form.lastName.trim()) {
                  setError('First and last name required');
                  return;
                }
                setError('');
                setStep('address');
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
            >
              Next: Add Address
            </button>
          )}
          {step === 'address' && (
            <>
              <button
                onClick={() => {
                  if (!addr.street || !addr.city || !addr.state || !addr.zip) {
                    setError('All address fields required');
                    return;
                  }
                  setError('');
                  createCustomerMutation.mutate();
                }}
                disabled={createCustomerMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
              >
                {createCustomerMutation.isPending ? 'Saving...' : canCreateJobs ? 'Save Lead & Schedule Appointment' : 'Save Lead'}
              </button>
              <button onClick={() => setStep('contact')} className="w-full text-gray-500 text-sm py-1 hover:text-gray-700">
                ← Back
              </button>
            </>
          )}
          {step === 'appt' && (
            <>
              <button
                onClick={() => scheduleApptMutation.mutate()}
                disabled={!appt.date || scheduleApptMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
              >
                {scheduleApptMutation.isPending ? 'Scheduling...' : 'Confirm Appointment'}
              </button>
              <button onClick={skipAppt} className="w-full text-gray-500 text-sm py-1 hover:text-gray-700">
                Skip — save lead without appointment
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Lead Card ──────────────────────────────────────────────────────────────────

function LeadCard({ customer }: { customer: Customer }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const address = customer.serviceAddresses[0];

  const convertMutation = useMutation({
    mutationFn: () => api.patch(`/customers/${customer.id}`, { status: 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sales-leads'] }),
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button className="w-full text-left p-4 flex items-start gap-3" onClick={() => setExpanded(v => !v)}>
        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
          {customer.firstName[0]}{customer.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900">{customer.firstName} {customer.lastName}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              customer.status === 'lead' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
            }`}>
              {customer.status}
            </span>
          </div>
          {customer.phone && (
            <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
              <Phone className="h-3 w-3" />{customer.phone}
            </p>
          )}
          {address && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0" />{address.street}, {address.city}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-3">
          {customer.notes && (
            <p className="text-sm text-gray-600 italic">"{customer.notes}"</p>
          )}
          <p className="text-xs text-gray-400">Added {fmtDate(customer.createdAt)}</p>
          <div className="flex gap-2 flex-wrap">
            {customer.phone && (
              <a href={`tel:${customer.phone}`}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                <Phone className="h-4 w-4 text-blue-500" />Call
              </a>
            )}
            {customer.status === 'lead' && (
              <button
                onClick={() => convertMutation.mutate()}
                disabled={convertMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <CheckCircle className="h-4 w-4" />Convert to Customer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Appointment Card ───────────────────────────────────────────────────────────

function ApptCard({ job }: { job: Job }) {
  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-600',
    draft: 'bg-gray-100 text-gray-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {job.status}
            </span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {SERVICE_LABELS[job.serviceType] ?? job.serviceType}
            </span>
          </div>
          {job.customer && (
            <p className="font-semibold text-gray-900">{job.customer.firstName} {job.customer.lastName}</p>
          )}
          {job.serviceAddress && (
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <MapPin className="h-3 w-3" />{job.serviceAddress.street}, {job.serviceAddress.city}
            </p>
          )}
        </div>
        {job.scheduledStart && (
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold text-gray-800">{fmtTime(job.scheduledStart)}</p>
            <p className="text-xs text-gray-400">{fmtDate(job.scheduledStart)}</p>
          </div>
        )}
      </div>
      {job.customer?.phone && (
        <a href={`tel:${job.customer.phone}`}
          className="mt-3 flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium">
          <Phone className="h-3.5 w-3.5" />{job.customer.phone}
        </a>
      )}
    </div>
  );
}

// ── Activity Tracker ───────────────────────────────────────────────────────────

interface Activity {
  doorsKnocked: number;
  peopleContacted: number;
  estimatesGiven: number;
  leadsAdded: number;
  jobsScheduled: number;
}

interface Goal {
  doorsKnocked: number;
  peopleContacted: number;
  estimatesGiven: number;
  leadsAdded: number;
  jobsScheduled: number;
}

const ACTIVITY_METRICS: Array<{
  key: keyof Activity;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}> = [
  { key: 'doorsKnocked', label: 'Doors Knocked', icon: DoorOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'peopleContacted', label: 'People Contacted', icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50' },
  { key: 'estimatesGiven', label: 'Estimates Given', icon: FileText, color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'leadsAdded', label: 'Leads Added', icon: Target, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { key: 'jobsScheduled', label: 'Jobs Scheduled', icon: Briefcase, color: 'text-indigo-600', bg: 'bg-indigo-50' },
];

function ActivityTab() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [counts, setCounts] = useState<Activity>({
    doorsKnocked: 0, peopleContacted: 0, estimatesGiven: 0, leadsAdded: 0, jobsScheduled: 0,
  });

  const todayISO = new Date().toISOString().split('T')[0];
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const { data: activityData } = useQuery({
    queryKey: ['sales-activity', todayISO],
    queryFn: async () => {
      const { data } = await api.get(`/sales/activity?date=${todayISO}`);
      return data.data as Activity | null;
    },
  });

  const { data: goalData } = useQuery<Goal>({
    queryKey: ['sales-goals'],
    queryFn: async () => {
      const { data } = await api.get('/sales/goals');
      return data.data as Goal;
    },
  });

  useEffect(() => {
    if (activityData) {
      setCounts({
        doorsKnocked: activityData.doorsKnocked,
        peopleContacted: activityData.peopleContacted,
        estimatesGiven: activityData.estimatesGiven,
        leadsAdded: activityData.leadsAdded,
        jobsScheduled: activityData.jobsScheduled,
      });
    }
  }, [activityData]);

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () => api.post('/sales/activity', counts),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-activity'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const adjust = (key: keyof Activity, delta: number) => {
    setCounts((c) => ({ ...c, [key]: Math.max(0, c[key] + delta) }));
  };

  const goals = goalData ?? { doorsKnocked: 20, peopleContacted: 10, estimatesGiven: 5, leadsAdded: 3, jobsScheduled: 2 };

  const totalProgress = ACTIVITY_METRICS.reduce((sum, m) => {
    const goal = goals[m.key];
    return sum + Math.min(1, goal > 0 ? counts[m.key] / goal : 0);
  }, 0) / ACTIVITY_METRICS.length;

  return (
    <div className="space-y-4">
      {/* Day header + overall progress */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Today</p>
            <p className="text-sm font-semibold text-gray-800">{todayLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{Math.round(totalProgress * 100)}%</p>
            <p className="text-xs text-gray-400">of daily goals</p>
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2.5">
          <div
            className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.round(totalProgress * 100)}%` }}
          />
        </div>
      </div>

      {/* Counter cards */}
      {ACTIVITY_METRICS.map(({ key, label, icon: Icon, color, bg }) => {
        const goal = goals[key];
        const val = counts[key];
        const pct = goal > 0 ? Math.min(100, Math.round((val / goal) * 100)) : 0;
        const met = val >= goal;
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`h-9 w-9 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  {met && <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Goal met!</span>}
                </div>
                <p className="text-xs text-gray-400">{val} / {goal} goal</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => adjust(key, -1)}
                disabled={val === 0}
                className="h-10 w-10 rounded-xl bg-gray-100 hover:bg-gray-200 disabled:opacity-30 flex items-center justify-center text-gray-600 font-bold text-lg transition-colors"
              >
                −
              </button>
              <div className="flex-1">
                <div className="text-center text-2xl font-bold text-gray-900 mb-1">{val}</div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-300 ${met ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <button
                onClick={() => adjust(key, 1)}
                className="h-10 w-10 rounded-xl bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white font-bold text-lg transition-colors"
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      <button
        onClick={() => save()}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl text-sm transition-colors"
      >
        {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Today\'s Activity'}
      </button>
    </div>
  );
}

// ── Main Sales Page ────────────────────────────────────────────────────────────

export function SalesPage() {
  const { user, logout } = useAuthStore();
  const [showNewLead, setShowNewLead] = useState(false);
  const [tab, setTab] = useState<'appointments' | 'leads' | 'activity' | 'contacts'>('appointments');
  const [search, setSearch] = useState('');
  const { data: permissions } = useTenantPermissions();
  const canCreateJobs = permissions?.sales.createJobs ?? true;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const todayISO = new Date().toISOString().split('T')[0];

  // Upcoming appointments (jobs with scheduledStart in next 30 days, created from leads)
  const { data: apptData, isLoading: apptLoading } = useQuery({
    queryKey: ['sales-appointments'],
    queryFn: async () => {
      const { data } = await api.get('/jobs?limit=50');
      return data.data as Job[];
    },
  });

  // My leads (status=lead customers)
  const { data: leadsData, isLoading: leadsLoading } = useQuery({
    queryKey: ['sales-leads', search],
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'lead', limit: '50' });
      if (search) params.set('search', search);
      const { data } = await api.get(`/customers?${params}`);
      return data.data as Customer[];
    },
  });

  const appointments = (apptData ?? [])
    .filter(j => j.scheduledStart && j.status !== 'cancelled' && j.status !== 'completed')
    .sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime());

  const todayAppts = appointments.filter(j => j.scheduledStart?.startsWith(todayISO));
  const upcomingAppts = appointments.filter(j => j.scheduledStart && !j.scheduledStart.startsWith(todayISO));
  const leads = leadsData ?? [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div>
            <p className="text-xs text-gray-500">{today}</p>
            <h1 className="text-lg font-bold text-gray-900">
              Hey {user?.firstName} 👋
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowNewLead(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              <Plus className="h-4 w-4" />New Lead
            </button>
            {!canCreateJobs && (
              <span title="Job scheduling disabled by admin" className="text-gray-400">
                <Lock className="h-4 w-4" />
              </span>
            )}
            <button onClick={logout} className="text-gray-400 hover:text-gray-600 p-1">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Stats strip */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-600">{todayAppts.length}</p>
            <p className="text-xs text-gray-500">Today</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">{upcomingAppts.length}</p>
            <p className="text-xs text-gray-500">Upcoming</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-600">{leads.length}</p>
            <p className="text-xs text-gray-500">Open Leads</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-lg mx-auto flex">
          {([['appointments', Calendar, 'Appointments'], ['leads', User, 'Leads'], ['contacts', BookUser, 'Contacts'], ['activity', TrendingUp, 'Activity']] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 px-4 py-4 max-w-lg mx-auto w-full space-y-4">
        {tab === 'appointments' && (
          <>
            {apptLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-gray-100" />)}
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-16">
                <Calendar className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No upcoming appointments</p>
                <button
                  onClick={() => setShowNewLead(true)}
                  className="mt-4 text-blue-600 text-sm font-medium hover:underline"
                >
                  Add a new lead to get started
                </button>
              </div>
            ) : (
              <>
                {todayAppts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />Today
                    </p>
                    <div className="space-y-3">
                      {todayAppts.map(j => <ApptCard key={j.id} job={j} />)}
                    </div>
                  </div>
                )}
                {upcomingAppts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />Upcoming
                    </p>
                    <div className="space-y-3">
                      {upcomingAppts.map(j => <ApptCard key={j.id} job={j} />)}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'activity' && <ActivityTab />}

        {tab === 'contacts' && (
          <div className="-mx-4 -mt-4">
            <ContactsPage />
          </div>
        )}

      {tab === 'leads' && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search leads..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {leadsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-xl animate-pulse border border-gray-100" />)}
              </div>
            ) : leads.length === 0 ? (
              <div className="text-center py-16">
                <User className="h-12 w-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No leads yet</p>
                <button
                  onClick={() => setShowNewLead(true)}
                  className="mt-4 text-blue-600 text-sm font-medium hover:underline"
                >
                  Tap "New Lead" to add your first one
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {leads.map(c => <LeadCard key={c.id} customer={c} />)}
              </div>
            )}
          </>
        )}
      </main>

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          canCreateJobs={canCreateJobs}
          onCreated={(c) => {
            setTab('leads');
            setShowNewLead(false);
          }}
        />
      )}
    </div>
  );
}
