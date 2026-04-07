/**
 * Property Management Suite
 * Tabs: Dashboard | Properties | Tenants | Listings | Applications
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useRef } from 'react';
import {
  Building2,
  Home,
  Users,
  FileText,
  TrendingUp,
  Plus,
  ChevronRight,
  ArrowLeft,
  DollarSign,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Download,
  Clock,
  Edit2,
  Trash2,
  Send,
  BarChart3,
} from 'lucide-react';
import { Button, Badge } from '@fsp/ui';
import { api } from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Property {
  id: string;
  name: string;
  type: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  totalUnits: number;
  yearBuilt?: number;
  notes?: string;
  units: Unit[];
  ownerContacts: OwnerContact[];
}

interface Unit {
  id: string;
  propertyId: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  marketRent?: number;
  isAvailable: boolean;
  leases: Lease[];
}

interface Lease {
  id: string;
  unitId: string;
  pmTenantId: string;
  status: string;
  startDate: string;
  endDate?: string;
  rentAmount: number;
  depositAmount: number;
  pmTenant: PMTenant;
  ledgerEntries?: LedgerEntry[];
  unit?: { unitNumber: string; property?: { name: string } };
}

interface PMTenant {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  notes?: string;
  leases?: Lease[];
}

interface LedgerEntry {
  id: string;
  type: string;
  status: string;
  amount: number;
  dueDate?: string;
  paidAt?: string;
  notes?: string;
  createdAt: string;
}

interface OwnerContact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isPrimary: boolean;
}

interface Expense {
  id: string;
  category: string;
  vendor?: string;
  amount: number;
  date: string;
  description?: string;
}

interface DashboardData {
  totalProperties: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  totalExpenses: number;
  noi: number;
  overdueAmount: number;
  overdueCount: number;
  activeLeases: number;
  rentRoll: Array<{ tenantName: string; unit: string; rent: number; leaseEnd?: string }>;
}

interface RentalListing {
  id: string;
  unitId: string;
  listingPrice: number;
  availableFrom: string;
  description?: string;
  isActive: boolean;
  unit: { unitNumber: string; property: { name: string; street: string; city: string; state: string } };
  applications: Array<{ id: string; status: string }>;
}

interface RentalApplication {
  id: string;
  listingId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  monthlyIncome?: number;
  creditScore?: number;
  message?: string;
  status: string;
  appliedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString();
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  multi_family: 'Multi-Family',
  hoa: 'HOA',
  short_term_rental: 'Short-Term',
};

const LEDGER_COLORS: Record<string, string> = {
  charge: 'text-red-600',
  payment: 'text-emerald-600',
  credit: 'text-blue-600',
  late_fee: 'text-amber-600',
  deposit: 'text-purple-600',
  refund: 'text-teal-600',
};

const STATUS_BADGE: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'secondary' | 'info'> = {
  active: 'success',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  withdrawn: 'secondary',
  paid: 'success',
  overdue: 'destructive',
  waived: 'secondary',
};

// ─── Import Modal ─────────────────────────────────────────────────────────────

type ImportType = 'properties' | 'tenants';

const IMPORT_TEMPLATES: Record<ImportType, { headers: string[]; example: string[] }> = {
  properties: {
    headers: ['name', 'type', 'street', 'city', 'state', 'zip', 'total_units', 'year_built', 'notes'],
    example: ['Sunset Apartments', 'multi_family', '123 Main St', 'Tampa', 'FL', '33601', '4', '1998', ''],
  },
  tenants: {
    headers: ['first_name', 'last_name', 'email', 'phone', 'emergency_name', 'emergency_phone', 'notes'],
    example: ['Jane', 'Smith', 'jane@email.com', '555-0100', 'John Smith', '555-0101', ''],
  },
};

function ImportModal({ type, onClose, onDone }: { type: ImportType; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, string>[]; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; updated?: number; skipped: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const template = IMPORT_TEMPLATES[type];
  const label = type === 'properties' ? 'Properties' : 'Tenants';

  function downloadTemplate() {
    const csv = [template.headers.join(','), template.example.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_import_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setSelectedFile(file);
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const token = useAuthStore.getState().accessToken ?? '';
      const res = await fetch('/api/v1/properties/import/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Preview failed');
      setPreview(data);
      setStep('preview');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    if (!selectedFile) return;
    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', selectedFile);
      const token = useAuthStore.getState().accessToken ?? '';
      const endpoint = type === 'properties' ? 'properties' : 'tenants';
      const res = await fetch(`/api/v1/properties/import/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      setResult(data);
      setStep('result');
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Import {label}</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            {/* Template download */}
            <div className="bg-slate-50 rounded-xl p-4">
              <p className="text-sm font-medium text-slate-700 mb-1">Step 1 — Download the template</p>
              <p className="text-xs text-slate-500 mb-3">
                Fill it in with your data. Column headers must match — extra columns are ignored.
                Accepts <strong>.csv</strong>, <strong>.xlsx</strong>, or <strong>.xls</strong>.
              </p>
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <Download className="h-4 w-4" /> Download template CSV
              </button>
              <div className="mt-3 overflow-x-auto">
                <table className="text-[11px] border-collapse">
                  <thead>
                    <tr>
                      {template.headers.map((h) => (
                        <th key={h} className="border border-slate-200 px-2 py-1 bg-slate-100 text-slate-600 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {template.example.map((v, i) => (
                        <td key={i} className="border border-slate-200 px-2 py-1 text-slate-500 whitespace-nowrap">{v || '—'}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* File drop zone */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Step 2 — Upload your file</p>
              <label
                className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl py-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
              >
                {loading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-blue-500 mb-2" />
                ) : (
                  <Upload className="h-7 w-7 text-slate-400 mb-2" />
                )}
                <span className="text-sm text-slate-500">
                  {loading ? 'Reading file…' : 'Drop file here or click to browse'}
                </span>
                <span className="text-xs text-slate-400 mt-1">.csv, .xlsx, .xls</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </label>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />{error}</p>}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="bg-emerald-50 rounded-xl px-4 py-3 text-sm text-emerald-800">
              Found <strong>{preview.total}</strong> row{preview.total !== 1 ? 's' : ''} ready to import
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Preview (first 5 rows):</p>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="text-xs w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      {preview.headers.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        {preview.headers.map((h) => (
                          <td key={h} className="px-3 py-2 text-slate-700 whitespace-nowrap max-w-[160px] truncate">{row[h] || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" />{error}</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep('upload')}>Back</Button>
              <Button onClick={runImport} disabled={loading}>
                {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Importing…</> : `Import ${preview.total} ${label}`}
              </Button>
            </div>
          </div>
        )}

        {step === 'result' && result && (
          <div className="space-y-4">
            <div className="flex justify-center py-4">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
            </div>
            <h3 className="text-center font-bold text-slate-800 text-lg">Import Complete</h3>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-emerald-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-emerald-700">{result.imported}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Imported</p>
              </div>
              {result.updated !== undefined && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                  <p className="text-xs text-blue-600 mt-0.5">Updated</p>
                </div>
              )}
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-2xl font-bold text-slate-600">{result.skipped}</p>
                <p className="text-xs text-slate-500 mt-0.5">Skipped</p>
              </div>
            </div>
            {result.skipped > 0 && (
              <p className="text-xs text-slate-400 text-center">
                Skipped rows were missing required fields (name/address for properties, first name for tenants).
              </p>
            )}
            <div className="flex justify-end">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ['pm-dashboard'],
    queryFn: () => api.get('/properties/dashboard').then((r) => r.data),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Properties', value: data.totalProperties, icon: Building2, color: 'blue' },
          { label: 'Occupancy', value: `${data.occupancyRate}%`, icon: Home, color: 'emerald' },
          { label: 'Monthly Rent', value: currency(data.totalMonthlyRent), icon: DollarSign, color: 'violet' },
          { label: 'Net Operating Income', value: currency(data.noi), icon: TrendingUp, color: data.noi >= 0 ? 'emerald' : 'red' },
        ].map((card) => {
          const Icon = card.icon;
          const colorMap: Record<string, string> = {
            blue: 'bg-blue-50 text-blue-600',
            emerald: 'bg-emerald-50 text-emerald-600',
            violet: 'bg-violet-50 text-violet-600',
            red: 'bg-red-50 text-red-600',
          };
          return (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[card.color]}`}>
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900">{card.value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{card.label}</p>
            </div>
          );
        })}
      </div>

      {/* Vacancy + Overdue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Occupancy</h3>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${data.occupancyRate}%` }}
              />
            </div>
            <span className="text-sm font-medium text-slate-700">{data.occupancyRate}%</span>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xl font-bold text-slate-900">{data.occupiedUnits}</p>
              <p className="text-xs text-slate-500">Occupied</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600">{data.vacantUnits}</p>
              <p className="text-xs text-slate-500">Vacant</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{data.totalUnits}</p>
              <p className="text-xs text-slate-500">Total Units</p>
            </div>
          </div>
        </div>

        {data.overdueCount > 0 ? (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h3 className="font-semibold text-red-800">Overdue Rent</h3>
            </div>
            <p className="text-2xl font-bold text-red-700">{currency(data.overdueAmount)}</p>
            <p className="text-sm text-red-600 mt-1">{data.overdueCount} overdue payment{data.overdueCount !== 1 ? 's' : ''}</p>
          </div>
        ) : (
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <h3 className="font-semibold text-emerald-800">All Rent Current</h3>
            </div>
            <p className="text-sm text-emerald-600">No overdue payments</p>
          </div>
        )}
      </div>

      {/* Rent Roll */}
      {data.rentRoll.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-800">Rent Roll</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Tenant</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Unit</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500">Monthly Rent</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Lease End</th>
              </tr>
            </thead>
            <tbody>
              {data.rentRoll.map((row, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-medium text-slate-800">{row.tenantName}</td>
                  <td className="px-3 py-3 text-slate-600">{row.unit}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800">{currency(row.rent)}</td>
                  <td className="px-5 py-3 text-right text-slate-500">{fmtDate(row.leaseEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Property Form Modal ──────────────────────────────────────────────────────

function PropertyFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '', type: 'residential', street: '', city: '', state: '', zip: '', totalUnits: 1, yearBuilt: '', notes: '',
  });
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((v) => ({ ...v, [k]: e.target.value }));

  const create = useMutation({
    mutationFn: () => api.post('/properties', form).then((r) => r.data),
    onSuccess: () => { onSaved(); onClose(); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-900">Add Property</h2>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Property Name *</label>
              <input value={form.name} onChange={f('name')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Sunset Apartments" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={form.type} onChange={f('type')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(PROPERTY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Total Units</label>
              <input type="number" value={form.totalUnits} onChange={f('totalUnits')} min={1} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Street *</label>
              <input value={form.street} onChange={f('street')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="123 Main St" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">City *</label>
              <input value={form.city} onChange={f('city')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
                <input value={form.state} onChange={f('state')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="FL" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">ZIP</label>
                <input value={form.zip} onChange={f('zip')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={f('notes')} rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!form.name || !form.street || create.isPending}>
            {create.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Saving…</> : 'Add Property'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Unit Detail / Lease + Ledger ─────────────────────────────────────────────

function UnitDetailPanel({ unit, pmTenants, onBack }: { unit: Unit; pmTenants: PMTenant[]; onBack: () => void }) {
  const qc = useQueryClient();
  const activeLeaseFromUnit = unit.leases?.[0];

  const { data: lease, isLoading: leaseLoading } = useQuery<Lease | null>({
    queryKey: ['pm-lease-unit', unit.id],
    queryFn: () => api.get(`/properties/leases/unit/${unit.id}`).then((r) => r.data),
  });

  const [showLeaseForm, setShowLeaseForm] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showCharge, setShowCharge] = useState(false);
  const [leaseForm, setLeaseForm] = useState({ pmTenantId: '', startDate: '', endDate: '', rentAmount: '', depositAmount: '' });
  const [payAmount, setPayAmount] = useState('');
  const [chargeNote, setChargeNote] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');

  const createLease = useMutation({
    mutationFn: () => api.post('/properties/leases', { unitId: unit.id, ...leaseForm, rentAmount: parseFloat(leaseForm.rentAmount), depositAmount: parseFloat(leaseForm.depositAmount || '0') }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pm-lease-unit', unit.id] }); setShowLeaseForm(false); },
  });

  const addPayment = useMutation({
    mutationFn: () => api.post('/properties/ledger', { leaseId: lease?.id, type: 'payment', amount: parseFloat(payAmount), status: 'paid' }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pm-lease-unit', unit.id] }); setShowPayment(false); setPayAmount(''); },
  });

  const addCharge = useMutation({
    mutationFn: () => api.post('/properties/ledger', { leaseId: lease?.id, type: 'charge', amount: parseFloat(chargeAmount), notes: chargeNote, status: 'pending' }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pm-lease-unit', unit.id] }); setShowCharge(false); setChargeAmount(''); setChargeNote(''); },
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.patch(`/properties/ledger/${id}`, { status: 'paid' }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pm-lease-unit', unit.id] }),
  });

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to units
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-xl text-slate-900">Unit {unit.unitNumber}</h2>
            <p className="text-sm text-slate-500">
              {unit.bedrooms}bd / {unit.bathrooms}ba{unit.sqft ? ` · ${unit.sqft} sqft` : ''}
              {unit.marketRent ? ` · Market rent ${currency(unit.marketRent)}` : ''}
            </p>
          </div>
          <Badge variant={unit.isAvailable ? 'warning' : 'success'}>
            {unit.isAvailable ? 'Vacant' : 'Occupied'}
          </Badge>
        </div>
      </div>

      {leaseLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : !lease ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
          <FileText className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 mb-3">No active lease for this unit</p>
          <Button onClick={() => setShowLeaseForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Create Lease
          </Button>
          {showLeaseForm && (
            <div className="text-left mt-5 space-y-3 pt-4 border-t border-slate-100">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tenant *</label>
                <select
                  value={leaseForm.pmTenantId}
                  onChange={(e) => setLeaseForm((f) => ({ ...f, pmTenantId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select tenant…</option>
                  {pmTenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date *</label>
                  <input type="date" value={leaseForm.startDate} onChange={(e) => setLeaseForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input type="date" value={leaseForm.endDate} onChange={(e) => setLeaseForm((f) => ({ ...f, endDate: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Monthly Rent *</label>
                  <input type="number" value={leaseForm.rentAmount} onChange={(e) => setLeaseForm((f) => ({ ...f, rentAmount: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1200" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Security Deposit</label>
                  <input type="number" value={leaseForm.depositAmount} onChange={(e) => setLeaseForm((f) => ({ ...f, depositAmount: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="1200" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowLeaseForm(false)}>Cancel</Button>
                <Button onClick={() => createLease.mutate()} disabled={!leaseForm.pmTenantId || !leaseForm.startDate || !leaseForm.rentAmount || createLease.isPending}>
                  {createLease.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Lease'}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Lease info */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-semibold text-slate-800">Active Lease</h3>
              <Badge variant="success">Active</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500 text-xs">Tenant</p>
                <p className="font-medium text-slate-800">{lease.pmTenant.firstName} {lease.pmTenant.lastName}</p>
                {lease.pmTenant.email && <p className="text-slate-500">{lease.pmTenant.email}</p>}
                {lease.pmTenant.phone && <p className="text-slate-500">{lease.pmTenant.phone}</p>}
              </div>
              <div>
                <p className="text-slate-500 text-xs">Monthly Rent</p>
                <p className="font-bold text-xl text-slate-900">{currency(Number(lease.rentAmount))}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Lease Period</p>
                <p className="text-slate-700">{fmtDate(lease.startDate)} → {fmtDate(lease.endDate)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Security Deposit</p>
                <p className="text-slate-700">{currency(Number(lease.depositAmount))}</p>
              </div>
            </div>
          </div>

          {/* Rent Ledger */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Rent Ledger</h3>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowCharge(true)} className="text-xs h-8 px-3">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Charge
                </Button>
                <Button onClick={() => setShowPayment(true)} className="text-xs h-8 px-3">
                  <DollarSign className="h-3.5 w-3.5 mr-1" /> Payment
                </Button>
              </div>
            </div>

            {showPayment && (
              <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center gap-3">
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-36"
                  placeholder="Amount"
                />
                <Button onClick={() => addPayment.mutate()} disabled={!payAmount || addPayment.isPending} className="h-8 text-xs">
                  Record Payment
                </Button>
                <button onClick={() => setShowPayment(false)} className="text-slate-400"><X className="h-4 w-4" /></button>
              </div>
            )}
            {showCharge && (
              <div className="px-5 py-4 bg-red-50 border-b border-red-100 flex items-center gap-3 flex-wrap">
                <input
                  type="number"
                  value={chargeAmount}
                  onChange={(e) => setChargeAmount(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 w-36"
                  placeholder="Amount"
                />
                <input
                  value={chargeNote}
                  onChange={(e) => setChargeNote(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 flex-1 min-w-40"
                  placeholder="Description"
                />
                <Button onClick={() => addCharge.mutate()} disabled={!chargeAmount || addCharge.isPending} className="h-8 text-xs">
                  Add Charge
                </Button>
                <button onClick={() => setShowCharge(false)} className="text-slate-400"><X className="h-4 w-4" /></button>
              </div>
            )}

            {(!lease.ledgerEntries || lease.ledgerEntries.length === 0) ? (
              <div className="p-8 text-center text-sm text-slate-400">No ledger entries yet</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">Date</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Type</th>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-slate-500">Notes</th>
                    <th className="text-right px-3 py-2.5 text-xs font-medium text-slate-500">Amount</th>
                    <th className="text-right px-5 py-2.5 text-xs font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(lease.ledgerEntries ?? []).map((entry) => (
                    <tr key={entry.id} className="border-t border-slate-100">
                      <td className="px-5 py-3 text-slate-500">{fmtDate(entry.createdAt)}</td>
                      <td className={`px-3 py-3 font-medium capitalize ${LEDGER_COLORS[entry.type] ?? 'text-slate-700'}`}>
                        {entry.type.replace(/_/g, ' ')}
                      </td>
                      <td className="px-3 py-3 text-slate-500">{entry.notes ?? '—'}</td>
                      <td className={`px-3 py-3 text-right font-semibold ${entry.type === 'payment' || entry.type === 'credit' || entry.type === 'refund' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {entry.type === 'payment' || entry.type === 'credit' ? '+' : '−'}{currency(Number(entry.amount))}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {entry.status === 'pending' ? (
                          <button
                            onClick={() => markPaid.mutate(entry.id)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Mark Paid
                          </button>
                        ) : (
                          <Badge variant={STATUS_BADGE[entry.status] ?? 'default'}>
                            {entry.status}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Properties Tab ───────────────────────────────────────────────────────────

function PropertiesTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  const { data: properties = [], isLoading } = useQuery<Property[]>({
    queryKey: ['pm-properties'],
    queryFn: () => api.get('/properties').then((r) => r.data),
  });

  const { data: pmTenants = [] } = useQuery<PMTenant[]>({
    queryKey: ['pm-tenants'],
    queryFn: () => api.get('/properties/pm-tenants').then((r) => r.data),
  });

  const { data: propertyDetail } = useQuery<Property>({
    queryKey: ['pm-property', selectedProperty?.id],
    queryFn: () => api.get(`/properties/${selectedProperty?.id}`).then((r) => r.data),
    enabled: !!selectedProperty && !selectedUnit,
  });

  if (selectedUnit) {
    return (
      <UnitDetailPanel
        unit={selectedUnit}
        pmTenants={pmTenants}
        onBack={() => setSelectedUnit(null)}
      />
    );
  }

  if (selectedProperty) {
    const detail = propertyDetail ?? selectedProperty;
    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedProperty(null)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> All Properties
        </button>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-xl text-slate-900">{detail.name}</h2>
              <p className="text-sm text-slate-500">{detail.street}, {detail.city}, {detail.state} {detail.zip}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="info">{PROPERTY_TYPE_LABELS[detail.type] ?? detail.type}</Badge>
                <span className="text-xs text-slate-500">{detail.totalUnits} units</span>
                {detail.yearBuilt && <span className="text-xs text-slate-500">Built {detail.yearBuilt}</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Units grid */}
        <h3 className="font-semibold text-slate-800 text-sm px-1">Units</h3>
        {(!detail.units || detail.units.length === 0) ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-400">
            No units added yet
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {detail.units.map((u) => {
              const activeLease = u.leases?.[0];
              return (
                <button
                  key={u.id}
                  onClick={() => setSelectedUnit(u)}
                  className={`bg-white rounded-2xl border p-4 text-left hover:shadow-md transition-shadow ${
                    u.isAvailable ? 'border-amber-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-800">Unit {u.unitNumber}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${u.isAvailable ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {u.isAvailable ? 'Vacant' : 'Occupied'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">{u.bedrooms}bd / {u.bathrooms}ba</p>
                  {activeLease && (
                    <p className="text-xs text-slate-600 mt-1 truncate">
                      {activeLease.pmTenant.firstName} {activeLease.pmTenant.lastName}
                    </p>
                  )}
                  {u.marketRent && (
                    <p className="text-sm font-semibold text-slate-800 mt-1">{currency(u.marketRent)}/mo</p>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400 mt-2" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{properties.length} propert{properties.length !== 1 ? 'ies' : 'y'}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add Property
          </Button>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Building2 className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No properties yet. Add your first property to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p) => {
            const occupied = p.units.filter((u) => !u.isAvailable).length;
            const totalRent = p.units.reduce((s, u) => s + (u.isAvailable ? 0 : (Number(u.marketRent) || 0)), 0);
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProperty(p)}
                className="w-full bg-white rounded-2xl border border-slate-200 p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <span className="font-semibold text-slate-800">{p.name}</span>
                      <Badge variant="info">{PROPERTY_TYPE_LABELS[p.type] ?? p.type}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">{p.street}, {p.city}, {p.state}</p>
                    <div className="flex gap-4 mt-2 text-xs text-slate-500">
                      <span>{p.units.length} units</span>
                      <span>{occupied} occupied</span>
                      {totalRent > 0 && <span className="text-emerald-600 font-medium">{currency(totalRent)}/mo</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}
      {showAdd && (
        <PropertyFormModal
          onClose={() => setShowAdd(false)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['pm-properties'] })}
        />
      )}
      {showImport && (
        <ImportModal
          type="properties"
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['pm-properties'] })}
        />
      )}
    </div>
  );
}

// ─── Tenants Tab ──────────────────────────────────────────────────────────────

function TenantsTab() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', emergencyName: '', emergencyPhone: '', notes: '' });
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((v) => ({ ...v, [k]: e.target.value }));

  const { data: tenants = [], isLoading } = useQuery<PMTenant[]>({
    queryKey: ['pm-tenants'],
    queryFn: () => api.get('/properties/pm-tenants').then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: () => api.post('/properties/pm-tenants', form).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pm-tenants'] }); setShowAdd(false); setForm({ firstName: '', lastName: '', email: '', phone: '', emergencyName: '', emergencyPhone: '', notes: '' }); },
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)} className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" /> Import
          </Button>
          <Button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add Tenant
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">New Tenant</h3>
            <button onClick={() => setShowAdd(false)}><X className="h-4 w-4 text-slate-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">First Name *</label>
              <input value={form.firstName} onChange={f('firstName')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Last Name *</label>
              <input value={form.lastName} onChange={f('lastName')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" value={form.email} onChange={f('email')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
              <input value={form.phone} onChange={f('phone')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact Name</label>
              <input value={form.emergencyName} onChange={f('emergencyName')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Emergency Contact Phone</label>
              <input value={form.emergencyPhone} onChange={f('emergencyPhone')} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={() => create.mutate()} disabled={!form.firstName || !form.lastName || create.isPending}>
              {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Tenant'}
            </Button>
          </div>
        </div>
      )}

      {tenants.length === 0 && !showAdd ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No tenants yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tenants.map((t) => {
            const activeLease = t.leases?.[0];
            return (
              <div key={t.id} className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center font-semibold flex-shrink-0">
                  {t.firstName.charAt(0)}{t.lastName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800">{t.firstName} {t.lastName}</p>
                  <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                    {t.email && <span>{t.email}</span>}
                    {t.phone && <span>{t.phone}</span>}
                  </div>
                  {activeLease && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      {activeLease.unit?.property?.name} — Unit {activeLease.unit?.unitNumber ?? ''}
                    </p>
                  )}
                </div>
                {activeLease ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">No Lease</Badge>}
              </div>
            );
          })}
        </div>
      )}
      {showImport && (
        <ImportModal
          type="tenants"
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ['pm-tenants'] })}
        />
      )}
    </div>
  );
}

// ─── Listings Tab ─────────────────────────────────────────────────────────────

function ListingsTab() {
  const { data: listings = [], isLoading } = useQuery<RentalListing[]>({
    queryKey: ['pm-listings'],
    queryFn: () => api.get('/properties/listings').then((r) => r.data),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Active Listings</h3>
      </div>
      {listings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <FileText className="h-7 w-7 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No active listings. Mark a vacant unit as listed from the Properties tab.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {listings.map((l) => (
            <div key={l.id} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-slate-800">{l.unit.property.name} — Unit {l.unit.unitNumber}</p>
                  <p className="text-xs text-slate-500">{l.unit.property.street}, {l.unit.property.city}, {l.unit.property.state}</p>
                </div>
                <p className="text-lg font-bold text-slate-900">{currency(Number(l.listingPrice))}<span className="text-xs font-normal text-slate-500">/mo</span></p>
              </div>
              {l.description && <p className="text-sm text-slate-600 mt-2 line-clamp-2">{l.description}</p>}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-500">Available {fmtDate(l.availableFrom)}</p>
                <p className="text-xs font-medium text-blue-600">{l.applications.length} application{l.applications.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'properties' | 'tenants' | 'listings';

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'properties', label: 'Properties', icon: Building2 },
  { id: 'tenants', label: 'Tenants', icon: Users },
  { id: 'listings', label: 'Listings', icon: FileText },
];

export function PropertyManagementPage() {
  const [tab, setTab] = useState<Tab>('dashboard');

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Property Management</h1>
            <p className="text-sm text-slate-500">Properties, units, leases, and rent collection</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-slate-100 rounded-2xl p-1 w-fit">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'dashboard' && <DashboardTab />}
      {tab === 'properties' && <PropertiesTab />}
      {tab === 'tenants' && <TenantsTab />}
      {tab === 'listings' && <ListingsTab />}
    </div>
  );
}
