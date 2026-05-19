import { useRef, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera, MessageSquare, User, MapPin, Clock, Receipt,
  CheckCircle2, PlayCircle, Navigation, XCircle, Upload, Lock, Unlock, Edit2,
  FileText, DollarSign, Loader2, Trash2, Eye, EyeOff, X, ClipboardList,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Badge, Textarea, Select, Input,
} from '@fsp/ui';
import { api } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import type { JobStatus } from '@fsp/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const STATUS_COLORS: Record<JobStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary', scheduled: 'info', en_route: 'warning',
  in_progress: 'warning', completed: 'success', cancelled: 'destructive', on_hold: 'secondary',
};

const STATUS_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['en_route', 'on_hold', 'cancelled'],
  en_route: ['in_progress', 'on_hold'],
  in_progress: ['completed', 'on_hold'],
  on_hold: ['scheduled', 'in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft', scheduled: 'Scheduled', en_route: 'En Route',
  in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
};

const PHOTO_CATEGORIES = ['before', 'after', 'stage', 'general'] as const;
const RECEIPT_CATEGORIES = ['materials', 'fuel', 'dump_fees', 'equipment', 'subcontractor', 'misc'] as const;

// ── Authenticated image component ─────────────────────────────────────────────

function AuthImg({ src, className, alt }: { src: string; className?: string; alt?: string }) {
  const [blobSrc, setBlobSrc] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) return;
    let objectUrl = '';
    api.get(src, { responseType: 'blob' })
      .then(r => {
        objectUrl = URL.createObjectURL(r.data);
        setBlobSrc(objectUrl);
      })
      .catch(() => setError(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);

  if (error) return (
    <div className={`${className} bg-gray-100 flex items-center justify-center text-gray-300`}>
      <Camera className="h-6 w-6" />
    </div>
  );
  if (!blobSrc) return <div className={`${className} bg-gray-100 animate-pulse`} />;
  return <img src={blobSrc} className={`${className} object-cover`} alt={alt ?? ''} />;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobFile {
  id: string;
  fileType: string;
  photoCategory?: string;
  stageType?: string;
  stageName?: string;
  originalName: string;
  mimeType: string;
  fileSizeBytes: number;
  visibility: string;
  notes?: string;
  noteVisibility: string;
  costAmount?: number;
  costBillable: boolean;
  receiptCategory?: string;
  vendorName?: string;
  purchaseDate?: string;
  createdAt: string;
  url: string;
  uploadedBy: { id: string; firstName: string; lastName: string; role: string };
}

interface Props {
  jobId: string | null;
  onClose: () => void;
}

type TabType = 'details' | 'edit' | 'photos' | 'work_orders' | 'receipts' | 'cost_summary' | 'notes';

// ── Photos Tab ────────────────────────────────────────────────────────────────

function PhotosTab({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>('before');
  const [visibility, setVisibility] = useState<'internal' | 'customer_visible'>('internal');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [lightbox, setLightbox] = useState<JobFile | null>(null);

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['job-files', jobId, 'photo'],
    queryFn: () => api.get(`/job-files/${jobId}?fileType=photo`).then(r => r.data.data as JobFile[]),
  });

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileType', 'photo');
        fd.append('photoCategory', category);
        fd.append('visibility', visibility);
        if (notes.trim()) fd.append('notes', notes.trim());
        await api.post(`/job-files/${jobId}`, fd);
      }
      setNotes('');
      qc.invalidateQueries({ queryKey: ['job-files', jobId, 'photo'] });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => api.delete(`/job-files/${jobId}/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-files', jobId, 'photo'] }),
  });

  const toggleVisibility = useMutation({
    mutationFn: (f: JobFile) => api.patch(`/job-files/${jobId}/${f.id}`, {
      visibility: f.visibility === 'internal' ? 'customer_visible' : 'internal',
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-files', jobId, 'photo'] }),
  });

  const displayed = filter === 'all' ? files : files.filter(f => f.photoCategory === filter);

  return (
    <div className="space-y-4">
      {/* Upload bar */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
            {PHOTO_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <button
            onClick={() => setVisibility(v => v === 'internal' ? 'customer_visible' : 'internal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              visibility === 'customer_visible'
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-amber-50 border-amber-300 text-amber-700'
            }`}
          >
            {visibility === 'customer_visible' ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {visibility === 'customer_visible' ? 'Customer-visible' : 'Internal only'}
          </button>
          <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" /> Upload Photos
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ''; }} />
        </div>
        <input
          type="text"
          placeholder="Optional caption / note..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Filter */}
      {files.length > 0 && (
        <div className="flex gap-1.5">
          {(['all', ...PHOTO_CATEGORIES] as const).map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors capitalize ${
                filter === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {c}
              {c !== 'all' && (
                <span className="ml-1 opacity-70">{files.filter(f => f.photoCategory === c).length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Gallery */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Camera className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No photos yet. Upload before &amp; after shots.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {displayed.map(f => (
            <div key={f.id} className="relative group">
              <button onClick={() => setLightbox(f)} className="w-full aspect-square rounded-lg overflow-hidden block">
                <AuthImg src={f.url} className="w-full h-full" alt={f.notes ?? f.photoCategory} />
              </button>
              {/* Badges */}
              <div className="absolute top-1 left-1 flex gap-1">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize ${
                  f.photoCategory === 'before' ? 'bg-blue-600 text-white' :
                  f.photoCategory === 'after' ? 'bg-green-600 text-white' :
                  'bg-gray-700 text-white'
                }`}>{f.photoCategory}</span>
              </div>
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => toggleVisibility.mutate(f)}
                  className="p-1 rounded bg-white/90 hover:bg-white text-gray-700" title={f.visibility}>
                  {f.visibility === 'customer_visible' ? <Eye className="h-3 w-3 text-green-600" /> : <EyeOff className="h-3 w-3 text-amber-600" />}
                </button>
                <button onClick={() => { if (confirm('Delete this photo?')) deleteMutation.mutate(f.id); }}
                  className="p-1 rounded bg-white/90 hover:bg-white text-red-500">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              {f.notes && <p className="text-xs text-gray-500 mt-0.5 truncate px-0.5">{f.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setLightbox(null)} className="absolute -top-10 right-0 text-white hover:text-gray-300">
              <X className="h-6 w-6" />
            </button>
            <AuthImg src={lightbox.url} className="w-full rounded-xl max-h-[70vh] object-contain" alt={lightbox.notes ?? ''} />
            <div className="mt-3 text-white text-sm space-y-1">
              <p className="font-medium capitalize">{lightbox.photoCategory} • {lightbox.uploadedBy.firstName} {lightbox.uploadedBy.lastName}</p>
              {lightbox.notes && <p className="text-gray-300">{lightbox.notes}</p>}
              <p className="text-gray-400 text-xs">{new Date(lightbox.createdAt).toLocaleString()}</p>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                lightbox.visibility === 'customer_visible' ? 'bg-green-900 text-green-300' : 'bg-amber-900 text-amber-300'
              }`}>
                {lightbox.visibility === 'customer_visible' ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {lightbox.visibility === 'customer_visible' ? 'Customer-visible' : 'Internal only'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Work Orders Tab ───────────────────────────────────────────────────────────

function WorkOrdersTab({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['job-files', jobId, 'work_order'],
    queryFn: () => api.get(`/job-files/${jobId}?fileType=work_order`).then(r => r.data.data as JobFile[]),
  });

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileType', 'work_order');
        if (notes.trim()) fd.append('notes', notes.trim());
        await api.post(`/job-files/${jobId}`, fd);
      }
      setNotes('');
      qc.invalidateQueries({ queryKey: ['job-files', jobId, 'work_order'] });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => api.delete(`/job-files/${jobId}/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-files', jobId, 'work_order'] }),
  });

  const openFile = async (f: JobFile) => {
    const r = await api.get(f.url, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" /> Upload Work Order
          </Button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ''; }} />
        </div>
        <input type="text" placeholder="Optional note..." value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : files.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <ClipboardList className="h-9 w-9 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No work orders uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50">
              <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{f.originalName}</p>
                <p className="text-xs text-gray-500">
                  {f.uploadedBy.firstName} {f.uploadedBy.lastName} · {new Date(f.createdAt).toLocaleDateString()}
                  {f.notes && ` · ${f.notes}`}
                </p>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button onClick={() => openFile(f)}
                  className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium">
                  Open
                </button>
                <button onClick={() => { if (confirm('Delete this work order?')) deleteMutation.mutate(f.id); }}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Receipts Tab ──────────────────────────────────────────────────────────────

function ReceiptsTab({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    costAmount: '', receiptCategory: 'materials', vendorName: '',
    purchaseDate: '', notes: '', costBillable: false,
  });

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['job-files', jobId, 'receipt'],
    queryFn: () => api.get(`/job-files/${jobId}?fileType=receipt`).then(r => r.data.data as JobFile[]),
  });

  const total = files.reduce((sum, f) => sum + Number(f.costAmount ?? 0), 0);

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileType', 'receipt');
        fd.append('receiptCategory', form.receiptCategory);
        if (form.costAmount) fd.append('costAmount', form.costAmount);
        if (form.vendorName) fd.append('vendorName', form.vendorName);
        if (form.purchaseDate) fd.append('purchaseDate', form.purchaseDate);
        if (form.notes) fd.append('notes', form.notes);
        fd.append('costBillable', String(form.costBillable));
        await api.post(`/job-files/${jobId}`, fd);
      }
      setForm(f => ({ ...f, costAmount: '', vendorName: '', purchaseDate: '', notes: '' }));
      qc.invalidateQueries({ queryKey: ['job-files', jobId, 'receipt'] });
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => api.delete(`/job-files/${jobId}/${fileId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-files', jobId, 'receipt'] }),
  });

  const openFile = async (f: JobFile) => {
    const r = await api.get(f.url, { responseType: 'blob' });
    const url = URL.createObjectURL(r.data);
    window.open(url, '_blank');
  };

  const inp = 'w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-4">
      {/* Upload form */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Amount ($)</label>
            <input type="number" step="0.01" min="0" placeholder="0.00"
              value={form.costAmount} onChange={e => setForm(f => ({ ...f, costAmount: e.target.value }))}
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Category</label>
            <select value={form.receiptCategory} onChange={e => setForm(f => ({ ...f, receiptCategory: e.target.value }))}
              className={`${inp} bg-white`}>
              {RECEIPT_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Vendor / Store</label>
            <input type="text" placeholder="Home Depot, etc."
              value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
              className={inp} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Purchase Date</label>
            <input type="date" value={form.purchaseDate} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
              className={inp} />
          </div>
        </div>
        <input type="text" placeholder="Note (optional)" value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inp} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.costBillable}
              onChange={e => setForm(f => ({ ...f, costBillable: e.target.checked }))}
              className="rounded border-gray-300 text-blue-600" />
            Billable to customer
          </label>
          <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1.5" /> Upload Receipt
          </Button>
          <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      {/* Running total */}
      {files.length > 0 && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" /> Total Receipt Costs
          </span>
          <span className="text-lg font-bold text-emerald-700">{fmtUSD(total)}</span>
        </div>
      )}

      {/* Receipt list */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : files.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <Receipt className="h-9 w-9 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No receipts yet. Upload material and supply receipts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map(f => (
            <div key={f.id} className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-xl">
              <Receipt className="h-7 w-7 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {f.costAmount != null && (
                    <span className="font-bold text-emerald-700">{fmtUSD(Number(f.costAmount))}</span>
                  )}
                  {f.receiptCategory && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">
                      {f.receiptCategory.replace('_', ' ')}
                    </span>
                  )}
                  {f.costBillable && (
                    <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">Billable</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {f.vendorName && `${f.vendorName} · `}
                  {f.purchaseDate ? new Date(f.purchaseDate).toLocaleDateString() : new Date(f.createdAt).toLocaleDateString()}
                  {` · ${f.uploadedBy.firstName} ${f.uploadedBy.lastName}`}
                </p>
                {f.notes && <p className="text-xs text-gray-600 mt-0.5">{f.notes}</p>}
                <p className="text-xs text-gray-400 mt-0.5 truncate">{f.originalName}</p>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openFile(f)}
                  className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
                  View
                </button>
                <button onClick={() => { if (confirm('Delete this receipt?')) deleteMutation.mutate(f.id); }}
                  className="p-1.5 text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Cost Summary Tab ──────────────────────────────────────────────────────────

function CostSummaryTab({ jobId }: { jobId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['job-cost-summary', jobId],
    queryFn: () => api.get(`/job-files/${jobId}/cost-summary`).then(r => r.data.data as {
      total: number; count: number; byCategory: Record<string, number>; receipts: JobFile[];
    }),
  });

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-xs text-emerald-600 font-medium mb-1">Total Receipt Cost</p>
          <p className="text-2xl font-bold text-emerald-700">{fmtUSD(data.total)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Receipts Uploaded</p>
          <p className="text-2xl font-bold text-gray-700">{data.count}</p>
        </div>
      </div>

      {Object.keys(data.byCategory).length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2 bg-gray-50 border-b">By Category</p>
          {Object.entries(data.byCategory).map(([cat, amt]) => (
            <div key={cat} className="flex items-center justify-between px-4 py-2.5 border-b last:border-0">
              <span className="text-sm text-gray-700 capitalize">{cat.replace('_', ' ')}</span>
              <span className="text-sm font-semibold text-gray-900">{fmtUSD(amt)}</span>
            </div>
          ))}
        </div>
      )}

      {data.count === 0 && (
        <div className="text-center py-10 text-gray-400">
          <DollarSign className="h-9 w-9 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No receipts uploaded yet.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export function JobDetailModal({ jobId, onClose }: Props) {
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<TabType>('details');
  const [noteText, setNoteText] = useState('');
  const [noteInternal, setNoteInternal] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string; description: string; priority: string; serviceType: string;
    scheduledStart: string; scheduledEnd: string; technicianIds: string[];
  } | null>(null);

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/jobs/${jobId}`);
      return data.data;
    },
    enabled: !!jobId,
  });

  const job = data as {
    id: string;
    title: string;
    description?: string;
    status: JobStatus;
    priority: string;
    serviceType: string;
    scheduledStart?: string;
    scheduledEnd?: string;
    actualStart?: string;
    actualEnd?: string;
    customer: { firstName: string; lastName: string; phone?: string; email?: string };
    serviceAddress: { street: string; city: string; state: string; zip: string };
    technician?: { firstName: string; lastName: string; phone?: string };
    assignedTechnicians: Array<{ userId: string; user: { id: string; firstName: string; lastName: string } }>;
    lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
    notes: Array<{ id: string; content: string; isInternal: boolean; createdAt: string; author: { firstName: string; lastName: string } }>;
  } | undefined;

  const { data: techData } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: async () => { const { data } = await api.get('/users?hasRole=technician'); return data; },
    enabled: !!jobId,
  });
  const allTechs: Array<{ id: string; firstName: string; lastName: string }> = techData?.data ?? [];

  const { mutate: updateStatus, isPending: isUpdatingStatus } = useMutation({
    mutationFn: (status: JobStatus) => api.patch(`/jobs/${jobId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const { mutate: saveEdit, isPending: isSavingEdit } = useMutation({
    mutationFn: (form: NonNullable<typeof editForm>) => api.patch(`/jobs/${jobId}`, {
      title: form.title,
      description: form.description || null,
      priority: form.priority,
      serviceType: form.serviceType,
      scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : null,
      scheduledEnd: form.scheduledEnd ? new Date(form.scheduledEnd).toISOString() : null,
      technicianId: form.technicianIds[0] || null,
      technicianIds: form.technicianIds.length > 0 ? form.technicianIds : [],
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); setTab('details'); },
  });

  const { mutate: addNote, isPending: isAddingNote } = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/notes`, { content: noteText, isInternal: noteInternal }),
    onSuccess: () => { setNoteText(''); qc.invalidateQueries({ queryKey: ['jobs', jobId] }); },
  });

  const transitions = job ? STATUS_TRANSITIONS[job.status] : [];

  const tabs: { id: TabType; label: string; icon?: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'details', label: 'Details' },
    { id: 'edit', label: 'Edit', icon: <Edit2 className="h-3 w-3" /> },
    { id: 'photos', label: 'Photos', icon: <Camera className="h-3 w-3" /> },
    { id: 'work_orders', label: 'Work Orders', icon: <ClipboardList className="h-3 w-3" /> },
    { id: 'receipts', label: 'Receipts', icon: <Receipt className="h-3 w-3" /> },
    { id: 'cost_summary', label: 'Cost Summary', icon: <DollarSign className="h-3 w-3" />, adminOnly: true },
    { id: 'notes', label: 'Notes', icon: <MessageSquare className="h-3 w-3" /> },
  ].filter(t => !t.adminOnly || isAdmin);

  return (
    <Dialog open={!!jobId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl">{job?.title ?? '...'}</DialogTitle>
              {job && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant={STATUS_COLORS[job.status]}>{STATUS_LABELS[job.status]}</Badge>
                  {job.priority === 'urgent' && <Badge variant="destructive">Urgent</Badge>}
                  {job.priority === 'high' && <Badge variant="warning">High Priority</Badge>}
                  <span className="text-xs text-gray-500 capitalize">{job.serviceType.replace('_', ' ')}</span>
                  <span className="text-xs text-gray-400 ml-auto font-mono">{job.id.slice(-8)}</span>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {isLoading && <div className="py-12 text-center text-muted-foreground">Loading...</div>}

        {job && (
          <div className="space-y-4">
            {/* Status actions */}
            {transitions.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-600 self-center mr-1">Move to:</span>
                {transitions.map((s) => (
                  <Button key={s} size="sm"
                    variant={s === 'cancelled' ? 'ghost' : s === 'completed' ? 'default' : 'outline'}
                    className={s === 'cancelled' ? 'text-destructive hover:text-destructive' : ''}
                    loading={isUpdatingStatus} onClick={() => updateStatus(s)}>
                    {STATUS_LABELS[s]}
                  </Button>
                ))}
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b overflow-x-auto">
              {tabs.map((t) => (
                <button key={t.id}
                  onClick={() => {
                    if (t.id === 'edit' && job && !editForm) {
                      const toLocal = (iso?: string) => iso ? new Date(iso).toLocaleString('sv').slice(0, 16) : '';
                      setEditForm({
                        title: job.title, description: job.description ?? '',
                        priority: job.priority, serviceType: job.serviceType,
                        scheduledStart: toLocal(job.scheduledStart), scheduledEnd: toLocal(job.scheduledEnd),
                        technicianIds: job.assignedTechnicians?.map(a => a.user.id) ?? [],
                      });
                    }
                    setTab(t.id);
                  }}
                  className={`flex items-center gap-1 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                    tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.icon}{t.label}
                  {t.id === 'notes' && job.notes.length > 0 && (
                    <span className="ml-1 bg-gray-200 text-gray-700 text-xs rounded-full px-1.5">{job.notes.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Details tab ── */}
            {tab === 'details' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><User className="h-3.5 w-3.5" /> Customer</p>
                      <p className="font-medium">{job.customer.firstName} {job.customer.lastName}</p>
                      {job.customer.phone && <p className="text-gray-600">{job.customer.phone}</p>}
                      {job.customer.email && <p className="text-gray-500 text-xs">{job.customer.email}</p>}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Service Address</p>
                      <p className="font-medium">{job.serviceAddress.street}</p>
                      <p className="text-gray-600">{job.serviceAddress.city}, {job.serviceAddress.state} {job.serviceAddress.zip}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><User className="h-3.5 w-3.5" /> Technician</p>
                      {job.technician ? (
                        <>
                          <p className="font-medium">{job.technician.firstName} {job.technician.lastName}</p>
                          {job.technician.phone && <p className="text-gray-600">{job.technician.phone}</p>}
                        </>
                      ) : (
                        <p className="text-gray-400 italic">Unassigned</p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Schedule</p>
                      <p className="font-medium">{formatDate(job.scheduledStart)}</p>
                      {job.scheduledEnd && <p className="text-gray-600">to {formatDate(job.scheduledEnd)}</p>}
                    </div>
                  </div>
                </div>

                {job.description && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    <p className="text-xs text-gray-500 mb-1">Description</p>
                    <p className="text-gray-800">{job.description}</p>
                  </div>
                )}

                {job.lineItems.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5">Services / Line Items</p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600 w-12">Qty</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600 w-24">Price</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {job.lineItems.map((li) => (
                            <tr key={li.id}>
                              <td className="px-3 py-2">{li.description}</td>
                              <td className="px-3 py-2 text-right">{li.quantity}</td>
                              <td className="px-3 py-2 text-right">{fmtUSD(li.unitPrice / 100)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Portal access code */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-blue-700">Customer Portal Access Code</p>
                    <p className="text-xs text-blue-600">Share with customer: job ID + their email</p>
                  </div>
                  <code className="text-sm font-mono font-bold text-blue-800 bg-blue-100 px-3 py-1 rounded-lg">
                    {job.id.slice(-8).toUpperCase()}
                  </code>
                </div>
              </div>
            )}

            {/* ── Edit tab ── */}
            {tab === 'edit' && editForm && (
              <div className="space-y-4">
                <Input label="Job Title *" value={editForm.title}
                  onChange={e => setEditForm(f => f && ({ ...f, title: e.target.value }))} />
                <div className="grid grid-cols-2 gap-4">
                  <Select label="Service Type" value={editForm.serviceType}
                    onChange={e => setEditForm(f => f && ({ ...f, serviceType: e.target.value }))}>
                    <option value="pool">Pool</option>
                    <option value="pest_control">Pest Control</option>
                    <option value="turf">Turf</option>
                    <option value="handyman">Handyman</option>
                  </Select>
                  <Select label="Priority" value={editForm.priority}
                    onChange={e => setEditForm(f => f && ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low</option><option value="normal">Normal</option>
                    <option value="high">High</option><option value="urgent">Urgent</option>
                  </Select>
                  <Input label="Scheduled Start" type="datetime-local" value={editForm.scheduledStart}
                    onChange={e => setEditForm(f => f && ({ ...f, scheduledStart: e.target.value }))} />
                  <Input label="Scheduled End" type="datetime-local" value={editForm.scheduledEnd}
                    onChange={e => setEditForm(f => f && ({ ...f, scheduledEnd: e.target.value }))} />
                </div>
                <Textarea label="Description" rows={3} value={editForm.description}
                  onChange={e => setEditForm(f => f && ({ ...f, description: e.target.value }))} />
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1.5">Assigned Technicians</p>
                  {allTechs.length === 0 ? (
                    <p className="text-sm text-gray-400">No technicians available</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {allTechs.map(t => (
                        <label key={t.id} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                          <input type="checkbox"
                            checked={editForm.technicianIds.includes(t.id)}
                            onChange={() => setEditForm(f => {
                              if (!f) return f;
                              const ids = f.technicianIds.includes(t.id)
                                ? f.technicianIds.filter(x => x !== t.id)
                                : [...f.technicianIds, t.id];
                              return { ...f, technicianIds: ids };
                            })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-800">{t.firstName} {t.lastName}</span>
                          {editForm.technicianIds[0] === t.id && (
                            <span className="ml-auto text-xs text-blue-600 font-medium">Lead</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setTab('details')}>Cancel</Button>
                  <Button className="flex-1" loading={isSavingEdit}
                    disabled={!editForm.title.trim()} onClick={() => saveEdit(editForm)}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {/* ── Tab content rendered by sub-components ── */}
            {tab === 'photos' && <PhotosTab jobId={job.id} />}
            {tab === 'work_orders' && <WorkOrdersTab jobId={job.id} />}
            {tab === 'receipts' && <ReceiptsTab jobId={job.id} />}
            {tab === 'cost_summary' && isAdmin && <CostSummaryTab jobId={job.id} />}

            {/* ── Notes tab ── */}
            {tab === 'notes' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Textarea placeholder="Add a note or technician comment..."
                    value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} />
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={noteInternal}
                        onChange={(e) => setNoteInternal(e.target.checked)} className="rounded" />
                      {noteInternal ? (
                        <span className="flex items-center gap-1 text-amber-700"><Lock className="h-3.5 w-3.5" /> Internal only</span>
                      ) : (
                        <span className="flex items-center gap-1"><Unlock className="h-3.5 w-3.5" /> Visible to customer</span>
                      )}
                    </label>
                    <Button size="sm" onClick={() => noteText.trim() && addNote()}
                      loading={isAddingNote} disabled={!noteText.trim()}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Add Note
                    </Button>
                  </div>
                </div>
                {job.notes.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">No notes yet.</div>
                ) : (
                  <div className="space-y-3">
                    {[...job.notes].reverse().map((note) => (
                      <div key={note.id} className={`p-3 rounded-lg text-sm ${
                        note.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'
                      }`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-medium text-gray-900">{note.author.firstName} {note.author.lastName}</span>
                          {note.isInternal && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-700">
                              <Lock className="h-3 w-3" /> Internal
                            </span>
                          )}
                          <span className="text-xs text-gray-400 ml-auto">
                            {new Date(note.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-gray-800 whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
