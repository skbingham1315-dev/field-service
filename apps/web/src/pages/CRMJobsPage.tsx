import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Search, Download, ChevronRight, X, RefreshCw,
  DollarSign, Calendar, User, Building, Clock, Filter,
} from 'lucide-react';
import { Button, Card, CardContent } from '@fsp/ui';
import { api } from '../lib/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const JOB_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  estimate_pending: { label: 'Estimate Pending', color: 'bg-gray-100 text-gray-600' },
  estimate_sent:    { label: 'Estimate Sent',    color: 'bg-blue-100 text-blue-700' },
  approved:         { label: 'Approved',          color: 'bg-indigo-100 text-indigo-700' },
  scheduled:        { label: 'Scheduled',         color: 'bg-purple-100 text-purple-700' },
  in_progress:      { label: 'In Progress',       color: 'bg-amber-100 text-amber-700' },
  completed:        { label: 'Completed',         color: 'bg-green-100 text-green-700' },
  invoiced:         { label: 'Invoiced',          color: 'bg-teal-100 text-teal-700' },
  paid:             { label: 'Paid',              color: 'bg-emerald-100 text-emerald-700' },
  on_hold:          { label: 'On Hold',           color: 'bg-slate-100 text-slate-600' },
  cancelled:        { label: 'Cancelled',         color: 'bg-red-100 text-red-700' },
  warranty_callback:{ label: 'Warranty/Callback', color: 'bg-orange-100 text-orange-700' },
};

const TRADE_CATEGORIES = ['Pool', 'Lawn/Landscaping', 'Pest Control', 'Handyman', 'Plumbing', 'Electrical', 'HVAC', 'General Contracting', 'Other'];

const ACTIVITY_LABELS: Record<string, string> = {
  call:'Call', email:'Email', visit:'Visit', text:'Text',
  estimate_sent:'Estimate Sent', job_completed:'Job Completed',
  note:'Note', status_change:'Status Change', follow_up_set:'Follow-up Set',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContactSummary { id: string; type: string; fullName?: string; businessName?: string; phone?: string; leadSource?: string }
interface SubSummary { id: string; name: string; phone?: string; defaultPercentage?: number; defaultRateType?: string }
interface Activity { id: string; type: string; note?: string; createdBy: string; createdAt: string }
interface CRMJob {
  id: string; jobNumber: string; name: string; status: string; executionType: string;
  tradeCategory?: string; serviceAddress?: string; serviceCity?: string; serviceState?: string; serviceZip?: string;
  estimatedStartDate?: string; completionDate?: string;
  estimatedValue?: number; actualInvoiceAmount?: number;
  permitRequired?: string; permitNumber?: string; notes?: string;
  assignedToId?: string; subcontractorId?: string;
  subPaymentType?: string; subPaymentAmount?: number; subPaymentPercent?: number;
  materialsCost?: number; otherCosts?: number; targetMargin?: number;
  contact: ContactSummary; subcontractor?: SubSummary;
  activities: Activity[];
}

interface JobFormState {
  name: string; status: string; tradeCategory: string; executionType: string;
  contactId?: string; serviceAddress: string; serviceCity: string; serviceState: string; serviceZip: string;
  estimatedStartDate: string; completionDate: string;
  estimatedValue?: number; actualInvoiceAmount?: number;
  permitRequired: string; permitNumber: string; notes: string;
  subcontractorId?: string; subPaymentType: string;
  subPaymentAmount?: number; subPaymentPercent?: number;
  materialsCost?: number; otherCosts?: number; targetMargin: number;
}

function displayContactName(c: ContactSummary) {
  return c.type === 'business' ? (c.businessName ?? c.fullName ?? '') : (c.fullName ?? c.businessName ?? '');
}

// ─── Sub Payment Calculator ───────────────────────────────────────────────────

function PaymentCalculator({ job, onChange }: {
  job: Partial<JobFormState>;
  onChange: (updates: Partial<JobFormState>) => void;
}) {
  const invoice = Number(job.actualInvoiceAmount ?? job.estimatedValue ?? 0);
  const payType = job.subPaymentType ?? 'percent_invoice';
  const payAmt = Number(job.subPaymentAmount ?? 0);
  const payPct = Number(job.subPaymentPercent ?? 0);
  const materials = Number(job.materialsCost ?? 0);
  const other = Number(job.otherCosts ?? 0);
  const targetMargin = Number(job.targetMargin ?? 25);

  const subPay = payType === 'flat_fee' ? payAmt
    : payType === 'percent_invoice' ? (invoice * payPct / 100)
    : payType === 'percent_profit' ? ((invoice - materials - other) * payPct / 100)
    : 0;

  const totalCosts = subPay + materials + other;
  const grossProfit = invoice - totalCosts;
  const margin = invoice > 0 ? (grossProfit / invoice) * 100 : 0;
  const recommendedInvoice = totalCosts > 0 ? totalCosts / (1 - targetMargin / 100) : 0;

  const subW = invoice > 0 ? (subPay / invoice) * 100 : 0;
  const matW = invoice > 0 ? (materials / invoice) * 100 : 0;
  const profW = invoice > 0 ? (grossProfit / invoice) * 100 : 0;

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
      <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
        <DollarSign className="h-4 w-4 text-gray-500" />Sub Payment Calculator
      </h4>

      <div className="grid grid-cols-2 gap-3">
        <CalcField label="Customer Invoice $" value={String(job.actualInvoiceAmount ?? job.estimatedValue ?? '')}
          onChange={v => onChange({ actualInvoiceAmount: parseFloat(v) || 0 })} prefix="$" />
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Type</label>
          <select value={payType} onChange={e => onChange({ subPaymentType: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
            <option value="flat_fee">Flat Fee</option>
            <option value="percent_invoice">% of Invoice</option>
            <option value="percent_profit">% of Profit</option>
          </select>
        </div>
        <CalcField
          label={payType === 'flat_fee' ? 'Sub Payment $' : 'Sub %'}
          value={String(payType === 'flat_fee' ? (job.subPaymentAmount ?? '') : (job.subPaymentPercent ?? ''))}
          onChange={v => payType === 'flat_fee' ? onChange({ subPaymentAmount: parseFloat(v) || 0 }) : onChange({ subPaymentPercent: parseFloat(v) || 0 })}
          prefix={payType === 'flat_fee' ? '$' : undefined}
          suffix={payType !== 'flat_fee' ? '%' : undefined}
        />
        <CalcField label="Materials Cost $" value={String(job.materialsCost ?? '')}
          onChange={v => onChange({ materialsCost: parseFloat(v) || 0 })} prefix="$" />
        <CalcField label="Other Costs $" value={String(job.otherCosts ?? '')}
          onChange={v => onChange({ otherCosts: parseFloat(v) || 0 })} prefix="$" />
        <CalcField label="Target Margin %" value={String(job.targetMargin ?? 25)}
          onChange={v => onChange({ targetMargin: parseFloat(v) || 25 })} suffix="%" />
      </div>

      {/* Visual bar */}
      {invoice > 0 && (
        <div className="rounded-lg overflow-hidden flex h-6 text-white text-xs font-bold">
          {subW > 0 && <div style={{ width: `${Math.min(subW, 100)}%` }} className="bg-orange-400 flex items-center justify-center truncate px-1">Sub</div>}
          {matW > 0 && <div style={{ width: `${Math.min(matW, 100)}%` }} className="bg-amber-400 flex items-center justify-center truncate px-1">Mat</div>}
          {profW > 0 && <div style={{ width: `${Math.max(Math.min(profW, 100), 0)}%` }} className="bg-emerald-500 flex items-center justify-center truncate px-1">Profit</div>}
        </div>
      )}

      {/* Results */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        {[
          ['Sub Payment', `$${subPay.toFixed(2)}`],
          ['Total Costs', `$${totalCosts.toFixed(2)}`],
          ['Gross Profit', `$${grossProfit.toFixed(2)}`, grossProfit >= 0 ? 'text-green-700' : 'text-red-700'],
          ['Your Margin', `${margin.toFixed(1)}%`, margin >= targetMargin ? 'text-green-700' : 'text-red-600'],
          ['Recommended Invoice', `$${recommendedInvoice.toFixed(2)}`, 'text-blue-700'],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="flex justify-between items-center px-2 py-1 bg-white rounded-lg border border-gray-100">
            <span className="text-xs text-gray-500">{label}</span>
            <span className={`text-xs font-bold ${cls ?? 'text-gray-800'}`}>{val}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CalcField({ label, value, onChange, prefix, suffix }: {
  label: string; value: string; onChange: (v: string) => void; prefix?: string; suffix?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-white">
        {prefix && <span className="px-2 text-sm text-gray-400 bg-gray-50 border-r border-gray-200">{prefix}</span>}
        <input type="number" value={value} onChange={e => onChange(e.target.value)} step="0.01" min="0"
          className="flex-1 px-2 py-1.5 text-sm focus:outline-none" />
        {suffix && <span className="px-2 text-sm text-gray-400 bg-gray-50 border-l border-gray-200">{suffix}</span>}
      </div>
    </div>
  );
}

// ─── Job Form Modal ───────────────────────────────────────────────────────────

function JobFormModal({ job, onClose }: { job?: CRMJob; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!job;
  const [form, setForm] = useState<JobFormState>({
    name: job?.name ?? '',
    status: job?.status ?? 'estimate_pending',
    tradeCategory: job?.tradeCategory ?? '',
    executionType: job?.executionType ?? 'in_house',
    serviceAddress: job?.serviceAddress ?? '',
    serviceCity: job?.serviceCity ?? '',
    serviceState: job?.serviceState ?? '',
    serviceZip: job?.serviceZip ?? '',
    estimatedStartDate: job?.estimatedStartDate?.split('T')[0] ?? '',
    completionDate: job?.completionDate?.split('T')[0] ?? '',
    estimatedValue: job?.estimatedValue,
    actualInvoiceAmount: job?.actualInvoiceAmount,
    permitRequired: job?.permitRequired ?? 'No',
    permitNumber: job?.permitNumber ?? '',
    notes: job?.notes ?? '',
    subPaymentType: job?.subPaymentType ?? 'percent_invoice',
    subPaymentAmount: job?.subPaymentAmount,
    subPaymentPercent: job?.subPaymentPercent,
    materialsCost: job?.materialsCost,
    otherCosts: job?.otherCosts,
    targetMargin: job?.targetMargin ?? 25,
    contactId: job?.contact?.id,
    subcontractorId: job?.subcontractorId,
  });
  const [contactSearch, setContactSearch] = useState(job ? displayContactName(job.contact) : '');
  const [error, setError] = useState('');

  const { data: contactsData } = useQuery({
    queryKey: ['contacts-search', contactSearch],
    queryFn: async () => {
      if (!contactSearch || contactSearch.length < 2) return { data: [] };
      const { data } = await api.get(`/contacts?search=${encodeURIComponent(contactSearch)}&limit=10`);
      return data;
    },
    enabled: contactSearch.length >= 2 && !form.contactId,
  });

  const { data: subsData } = useQuery({
    queryKey: ['subcontractors-list'],
    queryFn: async () => {
      const { data } = await api.get('/subcontractors?limit=100');
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: JobFormState) => {
      if (isEdit) return api.patch(`/crm-jobs/${job!.id}`, data);
      return api.post('/crm-jobs', data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-jobs'] }); onClose(); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Something went wrong');
    },
  });

  const contactResults: ContactSummary[] = contactsData?.data ?? [];
  const subResults: SubSummary[] = subsData?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Job' : 'New Job'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Job name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Job Name / Description *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Pool replaster — Smith residence"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Contact */}
          {!isEdit && (
            <div className="relative">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Client Contact *</label>
              <input value={form.contactId ? `✓ Contact selected` : contactSearch}
                onChange={e => { setContactSearch(e.target.value); setForm(f => ({ ...f, contactId: undefined })); }}
                placeholder="Search by name or phone..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {form.contactId && (
                <button onClick={() => { setForm(f => ({ ...f, contactId: undefined })); setContactSearch(''); }}
                  className="absolute right-2 top-7 text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              )}
              {!form.contactId && contactResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {contactResults.map(c => (
                    <button key={c.id} onClick={() => { setForm(f => ({ ...f, contactId: c.id })); setContactSearch(displayContactName(c)); }}
                      className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm text-gray-700">
                      {displayContactName(c)} <span className="text-gray-400 text-xs">{c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Trade Category</label>
              <select value={form.tradeCategory} onChange={e => setForm(f => ({ ...f, tradeCategory: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select...</option>
                {TRADE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(JOB_STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Execution type toggle */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Job Execution</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {['in_house', 'subcontracted'].map(t => (
                <button key={t} type="button"
                  onClick={() => setForm(f => ({ ...f, executionType: t }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${form.executionType === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {t === 'in_house' ? 'In-House' : 'Subcontracted'}
                </button>
              ))}
            </div>
          </div>

          {form.executionType === 'subcontracted' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Subcontractor</label>
              <select value={form.subcontractorId ?? ''} onChange={e => setForm(f => ({ ...f, subcontractorId: e.target.value || undefined }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select subcontractor...</option>
                {subResults.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Service Address</label>
            <input value={form.serviceAddress} onChange={e => setForm(f => ({ ...f, serviceAddress: e.target.value }))}
              placeholder="123 Main St"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
            <div className="grid grid-cols-3 gap-2">
              {(['serviceCity','serviceState'] as const).map((k, i) => (
                <input key={k} value={(form[k] as string) ?? ''} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  placeholder={i === 0 ? 'City' : 'State'}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              ))}
              <input value={form.serviceZip ?? ''} onChange={e => setForm(f => ({ ...f, serviceZip: e.target.value }))}
                placeholder="Zip"
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Est. Start Date</label>
              <input type="date" value={form.estimatedStartDate as string ?? ''} onChange={e => setForm(f => ({ ...f, estimatedStartDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Completion Date</label>
              <input type="date" value={form.completionDate as string ?? ''} onChange={e => setForm(f => ({ ...f, completionDate: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <CalcField label="Est. Job Value $" value={String(form.estimatedValue ?? '')}
              onChange={v => setForm(f => ({ ...f, estimatedValue: parseFloat(v) || 0 }))} prefix="$" />
            <CalcField label="Actual Invoice $" value={String(form.actualInvoiceAmount ?? '')}
              onChange={v => setForm(f => ({ ...f, actualInvoiceAmount: parseFloat(v) || 0 }))} prefix="$" />
          </div>

          {/* Permit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Permit Required</label>
              <select value={form.permitRequired ?? 'No'} onChange={e => setForm(f => ({ ...f, permitRequired: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="No">No</option>
                <option value="Yes">Yes</option>
                <option value="TBD">TBD</option>
              </select>
            </div>
            {form.permitRequired === 'Yes' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Permit Number</label>
                <input value={form.permitNumber ?? ''} onChange={e => setForm(f => ({ ...f, permitNumber: e.target.value }))}
                  placeholder="ABC-123456"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Payment calculator for subcontracted jobs */}
          {form.executionType === 'subcontracted' && (
            <PaymentCalculator job={form} onChange={updates => setForm(f => ({ ...f, ...updates }))} />
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={mutation.isPending} onClick={() => mutation.mutate(form)}>
            {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Job'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Permit Pro Export Modal ──────────────────────────────────────────────────

function PermitProModal({ selectedIds, onClose }: { selectedIds: string[]; onClose: () => void }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [startAfter, setStartAfter] = useState('');
  const [startBefore, setStartBefore] = useState('');
  const [previewRows, setPreviewRows] = useState<Record<string, string>[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedIds.length > 0) params.set('ids', selectedIds.join(','));
      if (statusFilter) params.set('status', statusFilter);
      if (startAfter) params.set('startAfter', startAfter);
      if (startBefore) params.set('startBefore', startBefore);
      const resp = await api.get(`/crm-jobs/export/permit-pro?${params}`, { responseType: 'text' });
      // Parse for preview
      const lines = (resp.data as string).split('\n');
      const headers = lines[0].split(',').map((h: string) => h.replace(/"/g, ''));
      const rows: Record<string, string>[] = [];
      for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
        if (!lines[i].trim()) continue;
        const vals = lines[i].split(',').map((v: string) => v.replace(/"/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h: string, j: number) => { row[h] = vals[j] ?? ''; });
        rows.push(row);
      }
      setPreviewRows(rows);
    } finally {
      setLoading(false);
    }
  };

  const doExport = async () => {
    const params = new URLSearchParams();
    if (selectedIds.length > 0) params.set('ids', selectedIds.join(','));
    if (statusFilter) params.set('status', statusFilter);
    if (startAfter) params.set('startAfter', startAfter);
    if (startBefore) params.set('startBefore', startBefore);
    const resp = await api.get(`/crm-jobs/export/permit-pro?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PermitPro_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Export for Arizona Permit Pro</h2>
            {selectedIds.length > 0 && <p className="text-sm text-gray-500">{selectedIds.length} jobs selected</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {selectedIds.length === 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Job Status</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                  <option value="">All statuses</option>
                  {Object.entries(JOB_STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
                </select>
              </div>
              <div />
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date After</label>
                <input type="date" value={startAfter} onChange={e => setStartAfter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Start Date Before</label>
                <input type="date" value={startBefore} onChange={e => setStartBefore(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          <Button variant="outline" onClick={loadPreview} disabled={loading} className="w-full">
            {loading ? 'Loading...' : 'Preview Export'}
          </Button>

          {previewRows && previewRows.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-2">Preview (first 5 rows)</p>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>{Object.keys(previewRows[0]).map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500 whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewRows.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1.5 text-gray-600 whitespace-nowrap max-w-[120px] truncate">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {previewRows && previewRows.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-4">No jobs match the selected filters.</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={doExport}>
            <Download className="h-4 w-4 mr-1.5" />Download CSV
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Job Detail Drawer ────────────────────────────────────────────────────────

function JobDetailDrawer({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logType, setLogType] = useState('note');
  const [logNote, setLogNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['crm-job', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/crm-jobs/${jobId}`);
      return data.data as CRMJob;
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/crm-jobs/${jobId}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-job', jobId] }); qc.invalidateQueries({ queryKey: ['crm-jobs'] }); },
  });

  const logMutation = useMutation({
    mutationFn: () => api.post(`/crm-jobs/${jobId}/activities`, { type: logType, note: logNote.trim() || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['crm-job', jobId] }); setShowLog(false); setLogNote(''); },
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

  const j = data!;
  const sc = JOB_STATUS_CONFIG[j.status] ?? { label: j.status, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white h-full flex flex-col shadow-2xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-mono text-gray-400">{j.jobNumber}</p>
              <h2 className="font-bold text-gray-900 mt-0.5">{j.name}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color} inline-block mt-1`}>{sc.label}</span>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setShowEdit(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X className="h-4 w-4" /></button>
            </div>
          </div>

          {/* Quick status change */}
          <div className="mt-3 flex flex-wrap gap-1">
            {Object.entries(JOB_STATUS_CONFIG).map(([v, cfg]) => (
              <button key={v} onClick={() => statusMutation.mutate(v)} disabled={v === j.status || statusMutation.isPending}
                className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors disabled:opacity-40 ${cfg.color} hover:opacity-80`}>
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Client info */}
          <div className="px-5 py-4 border-b border-gray-100 space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-800">{displayContactName(j.contact)}</span>
            </div>
            {j.contact.phone && (
              <a href={`tel:${j.contact.phone}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
                <span className="h-4 w-4" />📞 {j.contact.phone}
              </a>
            )}
            {(j.serviceAddress || j.serviceCity) && (
              <p className="text-sm text-gray-600 ml-6">{[j.serviceAddress, j.serviceCity, j.serviceState].filter(Boolean).join(', ')}</p>
            )}
          </div>

          {/* Details */}
          <div className="px-5 py-4 border-b border-gray-100 grid grid-cols-2 gap-3 text-sm">
            {j.tradeCategory && <div><p className="text-xs text-gray-400">Trade</p><p className="font-medium text-gray-800">{j.tradeCategory}</p></div>}
            <div><p className="text-xs text-gray-400">Type</p><p className="font-medium text-gray-800">{j.executionType === 'in_house' ? 'In-House' : 'Subcontracted'}</p></div>
            {j.estimatedStartDate && <div><p className="text-xs text-gray-400">Start</p><p className="font-medium text-gray-800">{new Date(j.estimatedStartDate).toLocaleDateString()}</p></div>}
            {j.estimatedValue && <div><p className="text-xs text-gray-400">Est. Value</p><p className="font-medium text-green-700">${Number(j.estimatedValue).toLocaleString()}</p></div>}
            {j.actualInvoiceAmount && <div><p className="text-xs text-gray-400">Invoice</p><p className="font-medium text-green-700">${Number(j.actualInvoiceAmount).toLocaleString()}</p></div>}
            {j.permitRequired === 'Yes' && <div><p className="text-xs text-gray-400">Permit #</p><p className="font-medium text-gray-800">{j.permitNumber || 'Pending'}</p></div>}
          </div>

          {j.subcontractor && j.executionType === 'subcontracted' && (
            <div className="px-5 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                <Building className="h-3.5 w-3.5" />SUBCONTRACTOR
              </p>
              <p className="text-sm font-medium text-gray-800">{j.subcontractor.name}</p>
              {j.subcontractor.phone && <p className="text-sm text-gray-500">{j.subcontractor.phone}</p>}
            </div>
          )}

          {j.notes && (
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 mb-1">Notes</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{j.notes}</p>
            </div>
          )}

          {/* Log activity button */}
          <div className="px-5 py-4 border-b border-gray-100">
            <button onClick={() => setShowLog(v => !v)}
              className="w-full py-2 bg-blue-50 text-blue-700 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-100 transition-colors">
              <Clock className="h-4 w-4" />Log Activity
            </button>
            {showLog && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {['call','email','visit','note','estimate_sent','job_completed'].map(t => (
                    <button key={t} onClick={() => setLogType(t)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${logType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {ACTIVITY_LABELS[t]}
                    </button>
                  ))}
                </div>
                <textarea value={logNote} onChange={e => setLogNote(e.target.value)} rows={2} placeholder="Note (optional)"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <Button size="sm" onClick={() => logMutation.mutate()} disabled={logMutation.isPending} className="w-full">
                  {logMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </div>

          {/* Activity log */}
          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 mb-3 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />ACTIVITY LOG
            </p>
            <div className="space-y-3">
              {j.activities.map(a => (
                <div key={a.id} className="flex gap-2.5">
                  <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-gray-500">{ACTIVITY_LABELS[a.type]?.slice(0,2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-700">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
                      <span className="text-[10px] text-gray-400">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                    {a.note && <p className="text-xs text-gray-600 mt-0.5">{a.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showEdit && <JobFormModal job={j} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function CRMJobsPage() {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterExecType, setFilterExecType] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showPermitPro, setShowPermitPro] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['crm-jobs', search, filterStatus, filterExecType],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterExecType) params.set('executionType', filterExecType);
      const { data } = await api.get(`/crm-jobs?${params}`);
      return data;
    },
  });

  const jobs: CRMJob[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;

  const toggleCheck = useCallback((id: string) => {
    setCheckedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);

  const handleExportContacts = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set('status', filterStatus);
    const resp = await api.get(`/crm-jobs/export/permit-pro?${params}`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PermitPro_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filterStatus]);

  const hasFilters = filterStatus || filterExecType;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM Jobs</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} jobs</p>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setShowPermitPro(true)}
            className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors" title="Export for Permit Pro">
            <Download className="h-4 w-4" />
          </button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1.5" />New Job
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" placeholder="Search jobs..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={() => setShowFilters(v => !v)}
          className={`p-2.5 rounded-xl border transition-colors ${hasFilters ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
          <Filter className="h-4 w-4" />
        </button>
      </div>

      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
              <option value="">All</option>
              {Object.entries(JOB_STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Execution</label>
            <select value={filterExecType} onChange={e => setFilterExecType(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
              <option value="">All</option>
              <option value="in_house">In-House</option>
              <option value="subcontracted">Subcontracted</option>
            </select>
          </div>
          {hasFilters && (
            <button onClick={() => { setFilterStatus(''); setFilterExecType(''); }}
              className="text-xs text-red-500 hover:text-red-700 col-span-full text-left">Clear filters</button>
          )}
        </div>
      )}

      {checkedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
          <span className="text-sm text-blue-700 font-medium">{checkedIds.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => setShowPermitPro(true)}
              className="text-xs text-blue-700 font-semibold hover:text-blue-900 flex items-center gap-1">
              <Download className="h-3.5 w-3.5" />Export Permit Pro
            </button>
            <button onClick={() => setCheckedIds(new Set())} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : jobs.length === 0 ? (
        <Card><CardContent className="text-center py-16">
          <p className="text-gray-500 text-sm">No jobs found.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />Create first job</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {jobs.map(j => {
            const sc = JOB_STATUS_CONFIG[j.status] ?? { label: j.status, color: 'bg-gray-100 text-gray-600' };
            return (
              <div key={j.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3.5 hover:border-blue-200 hover:shadow-sm transition-all">
                <input type="checkbox" checked={checkedIds.has(j.id)} onChange={() => toggleCheck(j.id)}
                  className="accent-blue-600 h-4 w-4 rounded shrink-0" onClick={e => e.stopPropagation()} />
                <button className="flex-1 text-left flex items-center gap-3 min-w-0" onClick={() => setSelectedId(j.id)}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">{j.jobNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.color} shrink-0`}>{sc.label}</span>
                      {j.executionType === 'subcontracted' && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium shrink-0">Sub</span>
                      )}
                    </div>
                    <p className="font-semibold text-gray-900 text-sm mt-0.5 truncate">{j.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <User className="h-3 w-3" />{displayContactName(j.contact)}
                      </span>
                      {j.serviceCity && <span className="text-xs text-gray-400">{j.serviceCity}</span>}
                      {j.tradeCategory && <span className="text-xs text-gray-400">{j.tradeCategory}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {j.estimatedValue && <p className="text-sm font-bold text-green-700">${Number(j.estimatedValue).toLocaleString()}</p>}
                    {j.estimatedStartDate && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                        <Calendar className="h-3 w-3" />{new Date(j.estimatedStartDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <JobFormModal onClose={() => setShowCreate(false)} />}
      {showPermitPro && <PermitProModal selectedIds={[...checkedIds]} onClose={() => setShowPermitPro(false)} />}
      {selectedId && <JobDetailDrawer jobId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
