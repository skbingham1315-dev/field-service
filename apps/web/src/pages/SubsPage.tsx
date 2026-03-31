import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Phone, Mail, Star, AlertTriangle,
  X, Shield, ChevronRight, Briefcase,
} from 'lucide-react';
import { Button, Card, CardContent } from '@fsp/ui';
import { api } from '../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRADE_CATEGORIES = ['Pool', 'Lawn/Landscaping', 'Pest Control', 'Handyman', 'Plumbing', 'Electrical', 'HVAC', 'General Contracting', 'Other'];
const RATE_TYPE_LABELS: Record<string, string> = {
  flat_fee: 'Flat Fee',
  percentage: 'Percentage',
  per_hour: 'Per Hour',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Subcontractor {
  id: string; name: string; contactName?: string; phone: string; email?: string;
  licenseNumber?: string; insuranceExpDate?: string;
  tradeSpecialties: string[]; defaultRateType?: string; defaultPercentage?: number;
  notes?: string; reliabilityRating?: number;
  _count?: { crmJobs: number };
  crmJobs?: Array<{
    id: string; actualInvoiceAmount?: number;
    subPaymentAmount?: number; subPaymentPercent?: number; subPaymentType?: string; status: string;
  }>;
}

function insuranceDaysLeft(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function InsuranceBadge({ date }: { date?: string }) {
  if (!date) return null;
  const days = insuranceDaysLeft(date);
  if (days < 0) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Expired</span>;
  if (days <= 30) return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Exp in {days}d</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1"><Shield className="h-3 w-3" />Insured</span>;
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <button key={i} type="button" onClick={() => onChange?.(i)} className={`transition-colors ${onChange ? 'cursor-pointer' : 'cursor-default'}`}>
          <Star className={`h-4 w-4 ${i <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
        </button>
      ))}
    </div>
  );
}

// ─── Sub Form Modal ───────────────────────────────────────────────────────────

function SubFormModal({ sub, onClose }: { sub?: Subcontractor; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!sub;
  const [form, setForm] = useState({
    name: sub?.name ?? '',
    contactName: sub?.contactName ?? '',
    phone: sub?.phone ?? '',
    email: sub?.email ?? '',
    licenseNumber: sub?.licenseNumber ?? '',
    insuranceExpDate: sub?.insuranceExpDate ? sub.insuranceExpDate.split('T')[0] : '',
    tradeSpecialties: sub?.tradeSpecialties ?? [] as string[],
    defaultRateType: sub?.defaultRateType ?? 'percentage',
    defaultPercentage: sub?.defaultPercentage ?? '',
    notes: sub?.notes ?? '',
    reliabilityRating: sub?.reliabilityRating ?? 0,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (isEdit) return api.patch(`/subcontractors/${sub!.id}`, data);
      return api.post('/subcontractors', data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subcontractors'] }); onClose(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Something went wrong');
    },
  });

  const toggleTrade = (trade: string) => {
    setForm(f => ({
      ...f,
      tradeSpecialties: f.tradeSpecialties.includes(trade)
        ? f.tradeSpecialties.filter(t => t !== trade)
        : [...f.tradeSpecialties, trade],
    }));
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [k]: e.target.value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Subcontractor' : 'Add Subcontractor'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Company / Individual Name *</label>
            <input value={form.name} onChange={set('name')} placeholder="ABC Plumbing LLC" required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Contact Name</label>
              <input value={form.contactName} onChange={set('contactName')} placeholder="John Smith"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Phone *</label>
              <input value={form.phone} onChange={set('phone')} placeholder="(480) 555-1234" required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Email</label>
              <input value={form.email} onChange={set('email')} type="email" placeholder="john@abc.com"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">License #</label>
              <input value={form.licenseNumber} onChange={set('licenseNumber')} placeholder="ROC-123456"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Insurance Expiration Date</label>
            <input type="date" value={form.insuranceExpDate} onChange={set('insuranceExpDate')}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Trade Specialties</label>
            <div className="flex flex-wrap gap-2">
              {TRADE_CATEGORIES.map(t => (
                <button key={t} type="button" onClick={() => toggleTrade(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    form.tradeSpecialties.includes(t)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Default Rate Type</label>
              <select value={form.defaultRateType} onChange={set('defaultRateType')}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="flat_fee">Flat Fee</option>
                <option value="percentage">Percentage</option>
                <option value="per_hour">Per Hour</option>
              </select>
            </div>
            {form.defaultRateType === 'percentage' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Default %</label>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
                  <input type="number" value={String(form.defaultPercentage)} onChange={set('defaultPercentage')} min="0" max="100" step="1"
                    className="flex-1 px-3 py-2 text-sm focus:outline-none" placeholder="60" />
                  <span className="px-2 text-sm text-gray-400 bg-gray-50 border-l border-gray-200">%</span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">Reliability Rating</label>
            <StarRating value={form.reliabilityRating} onChange={v => setForm(f => ({ ...f, reliabilityRating: v }))} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={mutation.isPending} onClick={() => mutation.mutate(form)}>
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Sub'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub Detail Drawer ────────────────────────────────────────────────────────

function SubDetailDrawer({ subId, onClose }: { subId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['subcontractor', subId],
    queryFn: async () => {
      const { data } = await api.get(`/subcontractors/${subId}`);
      return data.data as Subcontractor;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.delete(`/subcontractors/${subId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['subcontractors'] }); onClose(); },
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
        <div className="w-full max-w-md bg-white h-full" />
      </div>
    );
  }

  const s = data!;

  // Compute payment history
  const paymentHistory = (s.crmJobs ?? []).reduce(
    (acc, job) => {
      acc.totalJobs++;
      const inv = Number(job.actualInvoiceAmount ?? 0);
      acc.totalRevenue += inv;
      let subPay = 0;
      if (job.subPaymentType === 'flat_fee') subPay = Number(job.subPaymentAmount ?? 0);
      else if (job.subPaymentType && job.subPaymentPercent) subPay = inv * Number(job.subPaymentPercent) / 100;
      acc.totalSubPay += subPay;
      acc.totalProfit += inv - subPay;
      return acc;
    },
    { totalJobs: 0, totalRevenue: 0, totalSubPay: 0, totalProfit: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">{s.name}</h2>
              {s.contactName && <p className="text-sm text-gray-500">{s.contactName}</p>}
              <div className="flex items-center gap-2 mt-1.5">
                {s.reliabilityRating && <StarRating value={s.reliabilityRating} />}
                <InsuranceBadge date={s.insuranceExpDate} />
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowEdit(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Contact info */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-2">
            {s.phone && (
              <a href={`tel:${s.phone}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600">
                <Phone className="h-4 w-4 text-gray-400 shrink-0" />{s.phone}
              </a>
            )}
            {s.email && (
              <a href={`mailto:${s.email}`} className="flex items-center gap-2.5 text-sm text-gray-700 hover:text-blue-600 truncate">
                <Mail className="h-4 w-4 text-gray-400 shrink-0" />{s.email}
              </a>
            )}
            {s.licenseNumber && (
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <Shield className="h-4 w-4 text-gray-400 shrink-0" />License: {s.licenseNumber}
              </div>
            )}
            {s.insuranceExpDate && (
              <div className="flex items-center gap-2.5 text-sm text-gray-600">
                <AlertTriangle className="h-4 w-4 text-gray-400 shrink-0" />
                Insurance exp: {new Date(s.insuranceExpDate).toLocaleDateString()}
                {insuranceDaysLeft(s.insuranceExpDate) < 0 && <span className="text-red-600 font-bold ml-1">(EXPIRED)</span>}
                {insuranceDaysLeft(s.insuranceExpDate) >= 0 && insuranceDaysLeft(s.insuranceExpDate) <= 30 && (
                  <span className="text-orange-600 font-bold ml-1">({insuranceDaysLeft(s.insuranceExpDate)}d left)</span>
                )}
              </div>
            )}
          </div>

          {/* Trade specialties */}
          {s.tradeSpecialties.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">SPECIALTIES</p>
              <div className="flex flex-wrap gap-1.5">
                {s.tradeSpecialties.map(t => (
                  <span key={t} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Rate info */}
          {s.defaultRateType && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1">DEFAULT RATE</p>
              <p className="text-sm text-gray-800">
                {RATE_TYPE_LABELS[s.defaultRateType]}
                {s.defaultRateType === 'percentage' && s.defaultPercentage && ` — ${s.defaultPercentage}%`}
              </p>
            </div>
          )}

          {/* Payment history */}
          {paymentHistory.totalJobs > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />PAYMENT HISTORY ({paymentHistory.totalJobs} jobs)
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ['Revenue', `$${paymentHistory.totalRevenue.toLocaleString()}`],
                  ['Sub Paid', `$${paymentHistory.totalSubPay.toLocaleString()}`],
                  ['Your Profit', `$${paymentHistory.totalProfit.toLocaleString()}`],
                ].map(([label, val]) => (
                  <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-base font-bold text-gray-800">{val}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked jobs */}
          {(s.crmJobs ?? []).length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2">JOBS</p>
              <div className="space-y-2">
                {(s.crmJobs ?? []).slice(0, 10).map(j => (
                  <div key={j.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-gray-50">
                    <span className="text-xs text-gray-600">{j.status.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-medium text-gray-700">${Number(j.actualInvoiceAmount ?? 0).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {s.notes && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{s.notes}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <button onClick={() => { if (confirm('Archive this subcontractor?')) archiveMutation.mutate(); }}
            className="text-xs text-red-500 hover:text-red-700 transition-colors">
            Archive subcontractor
          </button>
        </div>
      </div>

      {showEdit && <SubFormModal sub={s} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SubsPage() {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['subcontractors', search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      const { data } = await api.get(`/subcontractors?${params}`);
      return data;
    },
  });

  const subs: Subcontractor[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;

  // Expiry warnings
  const expiredCount = subs.filter(s => s.insuranceExpDate && insuranceDaysLeft(s.insuranceExpDate) < 0).length;
  const expiringSoonCount = subs.filter(s => s.insuranceExpDate && insuranceDaysLeft(s.insuranceExpDate) >= 0 && insuranceDaysLeft(s.insuranceExpDate) <= 30).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subcontractors</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} subs</p>}
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1.5" />Add Sub
        </Button>
      </div>

      {/* Insurance alerts */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="space-y-2">
          {expiredCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 font-medium">{expiredCount} sub{expiredCount !== 1 ? 's have' : ' has'} expired insurance</p>
            </div>
          )}
          {expiringSoonCount > 0 && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-xl">
              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
              <p className="text-sm text-orange-700 font-medium">{expiringSoonCount} sub{expiringSoonCount !== 1 ? 's have' : ' has'} insurance expiring within 30 days</p>
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input type="text" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : subs.length === 0 ? (
        <Card><CardContent className="text-center py-16">
          <p className="text-gray-500 text-sm">No subcontractors found.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Add first sub</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {subs.map(s => {
            const daysLeft = s.insuranceExpDate ? insuranceDaysLeft(s.insuranceExpDate) : null;
            return (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className="w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition-all flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-sm shrink-0">
                  {s.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm">{s.name}</span>
                    <InsuranceBadge date={s.insuranceExpDate} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {s.phone && <span className="text-xs text-gray-500 flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
                    {s.tradeSpecialties.length > 0 && (
                      <span className="text-xs text-gray-400">{s.tradeSpecialties.slice(0, 2).join(', ')}{s.tradeSpecialties.length > 2 ? '...' : ''}</span>
                    )}
                    {(s._count?.crmJobs ?? 0) > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Briefcase className="h-3 w-3" />{s._count!.crmJobs} jobs</span>
                    )}
                  </div>
                  {s.reliabilityRating && (
                    <div className="mt-1"><StarRating value={s.reliabilityRating} /></div>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {showCreate && <SubFormModal onClose={() => setShowCreate(false)} />}
      {selectedId && <SubDetailDrawer subId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
