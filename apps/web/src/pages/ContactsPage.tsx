import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Papa from 'papaparse';
import {
  Plus, Search, Filter, Download, Upload, Phone, Mail, MapPin,
  Calendar, X, ChevronRight, Clock, Briefcase, CheckCircle,
  AlertCircle, Star, RefreshCw,
} from 'lucide-react';
import { Button, Card, CardContent, Badge, Dialog } from '@fsp/ui';
import { api } from '../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  prospect:      { label: 'Prospect',      color: 'bg-gray-100 text-gray-600',        dot: 'bg-gray-400' },
  contacted:     { label: 'Contacted',     color: 'bg-blue-100 text-blue-700',        dot: 'bg-blue-500' },
  follow_up:     { label: 'Follow Up',     color: 'bg-yellow-100 text-yellow-700',    dot: 'bg-yellow-500' },
  try_later:     { label: 'Try Later',     color: 'bg-orange-100 text-orange-700',    dot: 'bg-orange-500' },
  scheduled:     { label: 'Scheduled',     color: 'bg-purple-100 text-purple-700',    dot: 'bg-purple-500' },
  new_client:    { label: 'New Client',    color: 'bg-green-100 text-green-700',      dot: 'bg-green-500' },
  active_client: { label: 'Active Client', color: 'bg-emerald-100 text-emerald-700',  dot: 'bg-emerald-500' },
  on_hold:       { label: 'On Hold',       color: 'bg-slate-100 text-slate-500',      dot: 'bg-slate-400' },
  do_not_contact:{ label: 'Do Not Contact',color: 'bg-red-100 text-red-700',          dot: 'bg-red-500' },
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  natural_contact:   'Natural Contact',
  door_to_door:      'Door-to-Door',
  business_referral: 'Business Referral',
  cold_outreach:     'Cold Outreach',
  social_media:      'Social Media',
  online_ad:         'Online Ad',
  google_search:     'Google / Search',
  past_customer:     'Past Customer',
  other:             'Other',
};

const ACTIVITY_TYPES = ['call','email','visit','text','estimate_sent','job_completed','note','follow_up_set'];
const ACTIVITY_LABELS: Record<string, string> = {
  call:'Call', email:'Email', visit:'Visit', text:'Text',
  estimate_sent:'Estimate Sent', job_completed:'Job Completed',
  note:'Note', status_change:'Status Change', follow_up_set:'Follow-up Set',
};

const CONTACT_FIELDS = ['fullName','businessName','contactPerson','phone','email','address','city','state','zip','notes','leadSource','industry','website'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Activity { id: string; type: string; note?: string; createdBy: string; createdAt: string }
interface Contact {
  id: string; type: string; fullName?: string; businessName?: string; contactPerson?: string;
  phone: string; email?: string; address?: string; city?: string; state?: string; zip?: string;
  status: string; leadSource: string; leadSourceOther?: string;
  followUpDate?: string; notes?: string; website?: string; industry?: string;
  activities: Activity[]; _count?: { crmJobs: number };
  crmJobs?: Array<{ id: string; jobNumber: string; name: string; status: string; estimatedValue?: number }>;
  howWeMet?: string;
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10);
  if (d.length >= 7) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length >= 4) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return d.length ? `(${d}` : '';
}

function displayName(c: Contact) {
  return c.type === 'business' ? (c.businessName ?? c.fullName ?? '') : (c.fullName ?? c.businessName ?? '');
}

function initials(c: Contact) {
  const n = displayName(c);
  const parts = n.trim().split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

// ─── Add/Edit Contact Modal ───────────────────────────────────────────────────

function ContactFormModal({ contact, onClose }: { contact?: Contact; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!contact;
  const [form, setForm] = useState({
    type: contact?.type ?? 'individual',
    fullName: contact?.fullName ?? '',
    businessName: contact?.businessName ?? '',
    contactPerson: contact?.contactPerson ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    address: contact?.address ?? '',
    city: contact?.city ?? '',
    state: contact?.state ?? '',
    zip: contact?.zip ?? '',
    website: contact?.website ?? '',
    industry: contact?.industry ?? '',
    leadSource: contact?.leadSource ?? 'natural_contact',
    leadSourceOther: contact?.leadSourceOther ?? '',
    status: contact?.status ?? 'prospect',
    followUpDate: contact?.followUpDate ? contact.followUpDate.split('T')[0] : '',
    notes: contact?.notes ?? '',
    howWeMet: contact?.howWeMet ?? '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (isEdit) {
        return api.patch(`/contacts/${contact!.id}`, data);
      }
      return api.post('/contacts', data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Something went wrong');
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const isBusiness = form.type === 'business';
  const needsFollowUp = form.status === 'try_later' || form.status === 'follow_up';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Contact' : 'Add Contact'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Type toggle */}
          {!isEdit && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {['individual', 'business'].map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {t === 'individual' ? 'Individual' : 'Business'}
                </button>
              ))}
            </div>
          )}

          {isBusiness ? (
            <>
              <Field label="Business Name *" value={form.businessName} onChange={set('businessName')} placeholder="Acme Property Mgmt" required />
              <Field label="Contact Person" value={form.contactPerson} onChange={set('contactPerson')} placeholder="John Smith" />
            </>
          ) : (
            <Field label="Full Name *" value={form.fullName} onChange={set('fullName')} placeholder="Jane Doe" required />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone *" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="(480) 555-1234" required />
            <Field label="Email" value={form.email} onChange={set('email')} placeholder="jane@example.com" type="email" />
          </div>

          <Field label="Address" value={form.address} onChange={set('address')} placeholder="1234 Main St" />
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={form.city} onChange={set('city')} placeholder="Phoenix" />
            <Field label="State" value={form.state} onChange={set('state')} placeholder="AZ" />
            <Field label="Zip" value={form.zip} onChange={set('zip')} placeholder="85001" />
          </div>

          {isBusiness && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Website" value={form.website} onChange={set('website')} placeholder="https://..." />
              <SelectField label="Industry" value={form.industry} onChange={set('industry')}>
                <option value="">Select...</option>
                {['Property Management','HOA','General Contractor','Real Estate','Homeowner','Other'].map(i => <option key={i} value={i}>{i}</option>)}
              </SelectField>
            </div>
          )}

          {!isBusiness && (
            <Field label="How we met / context" value={form.howWeMet} onChange={set('howWeMet')} placeholder="Met at trade show..." />
          )}

          <SelectField label="Lead Source *" value={form.leadSource} onChange={set('leadSource')} disabled={isEdit}>
            {Object.entries(LEAD_SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </SelectField>
          {form.leadSource === 'other' && (
            <Field label="Lead source detail" value={form.leadSourceOther} onChange={set('leadSourceOther')} placeholder="Describe..." />
          )}

          <SelectField label="Status" value={form.status} onChange={set('status')}>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </SelectField>

          {needsFollowUp && (
            <Field label="Follow-up Date *" value={form.followUpDate} onChange={set('followUpDate')} type="date" required={needsFollowUp} />
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Any relevant notes..." />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </form>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button type="submit" className="flex-1" disabled={mutation.isPending} onClick={handleSubmit}>
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Contact'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', required = false, disabled = false }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; type?: string; required?: boolean; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required} disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400" />
    </div>
  );
}

function SelectField({ label, value, onChange, children, disabled = false }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <select value={value} onChange={onChange} disabled={disabled}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400">
        {children}
      </select>
    </div>
  );
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────

function LogActivityModal({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState('call');
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => api.post(`/contacts/${contactId}/activities`, { type, note: note.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contact', contactId] }); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Log Activity</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Type</label>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${type === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {ACTIVITY_LABELS[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">
              Note {type === 'note' ? '*' : '(optional)'}
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder={type === 'note' ? 'Enter your note...' : 'Optional details...'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={mutation.isPending || (type === 'note' && !note.trim())}
            onClick={() => mutation.mutate()}>
            {mutation.isPending ? 'Saving...' : 'Log Activity'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Contact Detail Drawer ────────────────────────────────────────────────────

function ContactDetailDrawer({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showStatusChange, setShowStatusChange] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['contact', contactId],
    queryFn: async () => {
      const { data } = await api.get(`/contacts/${contactId}`);
      return data.data as Contact;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.delete(`/contacts/${contactId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); onClose(); },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/contacts/${contactId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', contactId] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
      setShowStatusChange(false);
    },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
        <div className="w-full max-w-md bg-white h-full flex items-center justify-center">
          <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  const c = data!;
  const sc = STATUS_CONFIG[c.status] ?? { label: c.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-lg shrink-0">
              {initials(c)}
            </div>
            <div>
              <h2 className="font-bold text-gray-900 leading-tight">{displayName(c)}</h2>
              {c.type === 'business' && c.contactPerson && (
                <p className="text-sm text-gray-500">{c.contactPerson}</p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <span className={`h-2 w-2 rounded-full ${sc.dot}`} />
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 shrink-0"><X className="h-4 w-4" /></button>
        </div>

        {/* Quick actions */}
        <div className="px-5 py-3 flex gap-2 border-b border-gray-100 shrink-0">
          <button onClick={() => setShowLogActivity(true)}
            className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors">
            <Clock className="h-4 w-4" />Log Activity
          </button>
          <button onClick={() => setShowStatusChange(v => !v)}
            className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-gray-200 transition-colors">
            <RefreshCw className="h-4 w-4" />Change Status
          </button>
          <button onClick={() => setShowEdit(true)}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors">
            Edit
          </button>
        </div>

        {/* Status picker */}
        {showStatusChange && (
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
            <p className="text-xs font-semibold text-gray-600 mb-2">Change status to:</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STATUS_CONFIG).map(([v, cfg]) => (
                <button key={v} onClick={() => statusMutation.mutate(v)}
                  disabled={v === c.status || statusMutation.isPending}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors disabled:opacity-40 ${cfg.color} hover:opacity-80`}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* Contact info */}
          <div className="px-5 py-4 space-y-2.5 border-b border-gray-100">
            {c.phone && (
              <a href={`tel:${c.phone}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600">
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />{c.phone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600 truncate">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />{c.email}
              </a>
            )}
            {(c.address || c.city) && (
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                <span>{[c.address, c.city, c.state, c.zip].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {c.followUpDate && (
              <div className={`flex items-center gap-2.5 text-sm ${new Date(c.followUpDate) < new Date() ? 'text-red-600' : 'text-orange-600'}`}>
                <Calendar className="h-4 w-4 shrink-0" />
                Follow-up: {new Date(c.followUpDate).toLocaleDateString()}
                {new Date(c.followUpDate) < new Date() && <span className="text-xs font-bold ml-1">(OVERDUE)</span>}
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm text-gray-500">
              <Star className="h-4 w-4 text-gray-400 shrink-0" />
              {LEAD_SOURCE_LABELS[c.leadSource] ?? c.leadSource}
              {c.leadSourceOther && ` — ${c.leadSourceOther}`}
            </div>
          </div>

          {c.notes && (
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.notes}</p>
            </div>
          )}

          {/* Linked jobs */}
          {(c.crmJobs?.length ?? 0) > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />LINKED JOBS
              </p>
              <div className="space-y-2">
                {c.crmJobs!.map(j => (
                  <div key={j.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{j.jobNumber}</p>
                      <p className="text-xs text-gray-500 truncate max-w-[180px]">{j.name}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{j.status.replace(/_/g, ' ')}</span>
                      {j.estimatedValue && <p className="text-xs text-gray-500 mt-0.5">${Number(j.estimatedValue).toLocaleString()}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity log */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />ACTIVITY LOG
            </p>
            {c.activities.length === 0 ? (
              <p className="text-sm text-gray-400">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {c.activities.map(a => (
                  <div key={a.id} className="flex gap-2.5">
                    <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-bold text-gray-500">{ACTIVITY_LABELS[a.type]?.slice(0,2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-gray-700">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
                        <span className="text-[10px] text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
                        <span className="text-[10px] text-gray-400">by {a.createdBy}</span>
                      </div>
                      {a.note && <p className="text-xs text-gray-600 mt-0.5">{a.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Archive footer */}
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <button onClick={() => { if (confirm('Archive this contact?')) archiveMutation.mutate(); }}
            className="text-xs text-red-500 hover:text-red-700 transition-colors">
            Archive contact
          </button>
        </div>
      </div>

      {showLogActivity && <LogActivityModal contactId={contactId} onClose={() => setShowLogActivity(false)} />}
      {showEdit && <ContactFormModal contact={c} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

function CSVImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'map' | 'result'>('upload');
  const [preview, setPreview] = useState<{ columns: string[]; preview: Record<string, string>[]; totalRows: number } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicateAction, setDuplicateAction] = useState<'skip' | 'update' | 'create'>('skip');
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; skippedCsv?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      const { data } = await api.post('/contacts/import/preview', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(data.data);

      // Auto-map obvious columns
      const autoMap: Record<string, string> = {};
      for (const col of data.data.columns) {
        const lower = col.toLowerCase().replace(/[\s_-]/g, '');
        if (lower.includes('fullname') || lower === 'name') autoMap[col] = 'fullName';
        else if (lower.includes('business')) autoMap[col] = 'businessName';
        else if (lower.includes('phone')) autoMap[col] = 'phone';
        else if (lower.includes('email')) autoMap[col] = 'email';
        else if (lower.includes('address') && !lower.includes('city') && !lower.includes('state')) autoMap[col] = 'address';
        else if (lower.includes('city')) autoMap[col] = 'city';
        else if (lower.includes('state')) autoMap[col] = 'state';
        else if (lower.includes('zip') || lower.includes('postal')) autoMap[col] = 'zip';
        else if (lower.includes('note')) autoMap[col] = 'notes';
        else if (lower.includes('leadsource') || lower.includes('lead')) autoMap[col] = 'leadSource';
        else if (lower.includes('contact')) autoMap[col] = 'contactPerson';
      }
      setMapping(autoMap);
      setStep('map');
    } catch {
      alert('Failed to parse file. Please check it is a valid CSV.');
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('mapping', JSON.stringify(mapping));
      form.append('duplicateAction', duplicateAction);
      const { data } = await api.post('/contacts/import/csv', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(data.data);
      setStep('result');
      qc.invalidateQueries({ queryKey: ['contacts'] });
    } catch {
      alert('Import failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const downloadSkipped = () => {
    if (!result?.skippedCsv) return;
    const blob = new Blob([result.skippedCsv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skipped_contacts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Import Contacts</h2>
            <div className="flex gap-2 mt-1">
              {(['upload', 'map', 'result'] as const).map((s, i) => (
                <span key={s} className={`text-xs font-medium ${step === s ? 'text-blue-600' : 'text-gray-300'}`}>
                  {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">Drop a file here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Accepts .csv and .xlsx files</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>
              {uploading && <p className="text-sm text-center text-gray-500 animate-pulse">Parsing file...</p>}
            </div>
          )}

          {step === 'map' && preview && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                <strong>{preview.totalRows}</strong> rows found. Map your CSV columns to contact fields below.
              </p>

              {/* Column mapping table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">CSV Column</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Sample Value</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Maps To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.columns.map(col => (
                      <tr key={col} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">{col}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 max-w-[120px] truncate">
                          {preview.preview[0]?.[col] ?? '—'}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={mapping[col] ?? ''}
                            onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="">(skip)</option>
                            {CONTACT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Preview rows */}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Preview (first 5 rows)</p>
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        {preview.columns.map(c => <th key={c} className="px-2 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{c}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {preview.preview.map((row, i) => (
                        <tr key={i}>
                          {preview.columns.map(c => <td key={c} className="px-2 py-1.5 text-gray-600 max-w-[100px] truncate whitespace-nowrap">{row[c] ?? ''}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Duplicate handling */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-800 mb-2">When duplicate phone number is found:</p>
                <div className="space-y-1.5">
                  {([['skip','Skip the duplicate (keep existing)'],['update','Update existing contact with new data'],['create','Import anyway as a new contact']] as const).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="dup" value={v} checked={duplicateAction === v} onChange={() => setDuplicateAction(v)} className="accent-blue-600" />
                      <span className="text-xs text-amber-900">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="text-center space-y-4 py-6">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Import Complete</h3>
              <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.imported}</p>
                  <p className="text-xs text-green-600">Imported</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                  <p className="text-xs text-blue-600">Updated</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-600">{result.skipped}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
              </div>
              {result.skippedCsv && (
                <button onClick={downloadSkipped}
                  className="flex items-center gap-2 mx-auto text-sm text-blue-600 hover:text-blue-800 underline">
                  <Download className="h-4 w-4" />Download skipped rows
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          {step === 'result' ? (
            <Button className="w-full" onClick={onClose}>Done</Button>
          ) : step === 'map' ? (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setStep('upload')}>Back</Button>
              <Button className="flex-1" disabled={uploading} onClick={handleImport}>
                {uploading ? 'Importing...' : `Import ${preview?.totalRows ?? ''} Contacts`}
              </Button>
            </>
          ) : (
            <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ContactsPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLead, setFilterLead] = useState('');
  const [filterFollowUp, setFilterFollowUp] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search, filterStatus, filterLead, filterFollowUp],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterLead) params.set('leadSource', filterLead);
      if (filterFollowUp) params.set('followUpDue', filterFollowUp);
      const { data } = await api.get(`/contacts?${params}`);
      return data;
    },
  });

  const contacts: Contact[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;

  const handleExport = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    if (filterLead) params.set('leadSource', filterLead);
    const resp = await api.get(`/contacts/export/csv?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filterStatus, filterLead]);

  const hasFilters = filterStatus || filterLead || filterFollowUp;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} contacts</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setShowImport(true)}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors" title="Import CSV">
            <Upload className="h-4 w-4" />
          </button>
          <button onClick={handleExport}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors" title="Export CSV">
            <Download className="h-4 w-4" />
          </button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Add Contact
          </Button>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, phone, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`p-2.5 rounded-xl border transition-colors ${hasFilters ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <Filter className="h-4 w-4" />
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">All</option>
              {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Lead Source</label>
            <select value={filterLead} onChange={e => setFilterLead(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">All</option>
              {Object.entries(LEAD_SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Follow-up Due</label>
            <select value={filterFollowUp} onChange={e => setFilterFollowUp(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Any</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
          {hasFilters && (
            <button onClick={() => { setFilterStatus(''); setFilterLead(''); setFilterFollowUp(''); }}
              className="text-xs text-red-500 hover:text-red-700 col-span-full text-left">Clear filters</button>
          )}
        </div>
      )}

      {/* Follow-up alert banner */}
      {filterFollowUp === 'overdue' && contacts.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">{contacts.length} contact{contacts.length !== 1 ? 's' : ''} with overdue follow-ups</p>
        </div>
      )}

      {/* Contact list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : contacts.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-500 text-sm">No contacts found.</p>
            {hasFilters || search ? (
              <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterLead(''); setFilterFollowUp(''); }}
                className="mt-2 text-blue-600 text-sm hover:underline">Clear filters</button>
            ) : (
              <div className="flex flex-col items-center gap-2 mt-4">
                <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Add first contact</Button>
                <button onClick={() => setShowImport(true)} className="text-sm text-gray-500 hover:text-blue-600 flex items-center gap-1.5">
                  <Upload className="h-3.5 w-3.5" />Or import from CSV
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const sc = STATUS_CONFIG[c.status] ?? { label: c.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
            const lastActivity = c.activities?.[0];
            const isOverdue = c.followUpDate && new Date(c.followUpDate) < new Date();
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                  {initials(c)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm truncate">{displayName(c)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color} shrink-0`}>{sc.label}</span>
                    {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium shrink-0">Overdue</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {c.phone && <span className="text-xs text-gray-500">{c.phone}</span>}
                    {c.city && <span className="text-xs text-gray-400">{c.city}, {c.state}</span>}
                    {(c._count?.crmJobs ?? 0) > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Briefcase className="h-3 w-3" />{c._count!.crmJobs}
                      </span>
                    )}
                  </div>
                  {lastActivity && (
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                      {ACTIVITY_LABELS[lastActivity.type]} · {new Date(lastActivity.createdAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {showCreate && <ContactFormModal onClose={() => setShowCreate(false)} />}
      {showImport && <CSVImportModal onClose={() => setShowImport(false)} />}
      {selectedId && <ContactDetailDrawer contactId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
