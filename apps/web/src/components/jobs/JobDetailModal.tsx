import { useRef, useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Camera, MessageSquare, User, MapPin, Clock, Receipt,
  CheckCircle2, PlayCircle, Navigation, XCircle, Upload, Lock, Unlock, Edit2,
  FileText, DollarSign, Loader2, Trash2, Eye, EyeOff, X, ClipboardList,
  CheckCircle, ArrowRight, RotateCcw, Layers, Copy, Check, Plus, Link2,
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

const API_BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api/v1` : '/api/v1';

function AuthImg({ src, className, alt }: { src: string; className?: string; alt?: string }) {
  const [blobSrc, setBlobSrc] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    let objectUrl = '';

    const token = useAuthStore.getState().accessToken;
    fetch(`${API_BASE}${src}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.blob(); })
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobSrc(objectUrl);
      })
      .catch(() => { if (!cancelled) setError(true); });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (error) return (
    <div className={`${className} bg-gray-100 flex items-center justify-center text-gray-300`}>
      <Camera className="h-6 w-6" />
    </div>
  );
  if (!blobSrc) return <div className={`${className} bg-gray-100 animate-pulse`} />;
  return <img src={blobSrc} className={`${className} object-cover`} alt={alt ?? ''} onError={() => setError(true)} />;
}

// ── Share Job Link ─────────────────────────────────────────────────────────────

function ShareJobLink({ jobId }: { jobId: string }) {
  const [copied, setCopied] = useState(false);
  const code = jobId.slice(-8).toUpperCase();
  const url = `${window.location.origin}/job-portal?code=${code}`;

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-indigo-800">Customer Job Link</p>
          <p className="text-xs text-indigo-600 mt-0.5">Share so they can track progress, see photos &amp; updates</p>
        </div>
        <code className="text-sm font-mono font-bold text-indigo-800 bg-indigo-100 px-2 py-1 rounded-lg">{code}</code>
      </div>
      <button
        onClick={copy}
        className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
          copied ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200 hover:bg-indigo-200'
        }`}
      >
        {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Customer Link</>}
      </button>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobFile {
  id: string;
  fileType: string;
  photoCategory?: string;
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

// ── Start Job Overlay ─────────────────────────────────────────────────────────

function StartJobOverlay({
  jobTitle, address, onStart, onViewOnly, loading,
}: {
  jobTitle: string;
  address: string;
  onStart: () => void;
  onViewOnly: () => void;
  loading: boolean;
}) {
  return (
    <div className="absolute inset-0 bg-white/97 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-6 rounded-b-2xl">
      <div className="text-center space-y-6 max-w-xs w-full">
        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
          <PlayCircle className="h-11 w-11 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Ready to start?</h2>
          <p className="text-gray-700 font-medium">{jobTitle}</p>
          <p className="text-gray-400 text-sm mt-0.5">{address}</p>
        </div>
        <div className="space-y-3 w-full">
          <Button className="w-full py-3 text-base" loading={loading} onClick={onStart}>
            <PlayCircle className="h-5 w-5 mr-2" /> Start Job Now
          </Button>
          <button
            onClick={onViewOnly}
            className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            View Details Only
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Finish Job Wizard ─────────────────────────────────────────────────────────

function FinishWizardOverlay({
  jobId,
  onComplete,
  onCancel,
}: {
  jobId: string;
  onComplete: (status: JobStatus) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0);
  const [pendingStatus, setPendingStatus] = useState<JobStatus | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedCounts, setUploadedCounts] = useState({ after: 0, workOrder: 0, receipt: 0 });
  const afterRef = useRef<HTMLInputElement>(null);
  const workOrderRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const [receiptForm, setReceiptForm] = useState({ amount: '', category: 'materials', vendor: '' });

  const upload = async (files: FileList, fileType: string, extra: Record<string, string> = {}) => {
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileType', fileType);
        if (fileType === 'photo') fd.append('photoCategory', 'after');
        Object.entries(extra).forEach(([k, v]) => fd.append(k, v));
        await api.post(`/job-files/${jobId}`, fd);
      }
      setUploadedCounts(c => ({
        ...c,
        after: fileType === 'photo' ? c.after + files.length : c.after,
        workOrder: fileType === 'work_order' ? c.workOrder + files.length : c.workOrder,
        receipt: fileType === 'receipt' ? c.receipt + files.length : c.receipt,
      }));
    } finally {
      setUploading(false);
    }
  };

  const STEPS = ['After Photos', 'Job Status', 'Work Order', 'Receipts'];

  return (
    <div className="absolute inset-0 bg-white/97 backdrop-blur-sm z-20 flex flex-col rounded-b-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-white">
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 mr-1">
          <X className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800">Finish Job</p>
          <p className="text-xs text-gray-400">{STEPS[step]} ({step + 1}/{STEPS.length})</p>
        </div>
        {/* Step dots */}
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-2 w-2 rounded-full transition-colors ${
              i < step ? 'bg-green-500' : i === step ? 'bg-blue-600' : 'bg-gray-200'
            }`} />
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-5">

        {/* Step 0: After Photos */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Camera className="h-9 w-9 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Upload After Photos</h3>
              <p className="text-sm text-gray-500 mt-1">Show the completed work before wrapping up.</p>
            </div>
            <input ref={afterRef} type="file" accept="image/*" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) upload(e.target.files, 'photo'); e.target.value = ''; }} />
            <button
              onClick={() => afterRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-green-300 rounded-2xl py-8 flex flex-col items-center gap-2 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Camera className="h-8 w-8" />}
              <span className="font-medium">{uploading ? 'Uploading...' : 'Tap to take / choose photos'}</span>
              {uploadedCounts.after > 0 && (
                <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                  {uploadedCounts.after} uploaded ✓
                </span>
              )}
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                Skip Photos
              </Button>
              <Button className="flex-1" onClick={() => setStep(1)}>
                {uploadedCounts.after > 0 ? 'Continue' : 'Continue'} <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Complete or Stage */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="h-9 w-9 text-blue-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">How did it go?</h3>
              <p className="text-sm text-gray-500 mt-1">Is the job fully done or more work needed?</p>
            </div>
            <div className="grid gap-3">
              <button
                onClick={() => { setPendingStatus('completed'); setStep(2); }}
                className="flex items-center gap-4 p-4 bg-green-50 border-2 border-green-200 rounded-2xl hover:border-green-400 hover:bg-green-100 transition-colors text-left"
              >
                <CheckCircle className="h-9 w-9 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-green-800">Job Complete</p>
                  <p className="text-sm text-green-600">All work is done, ready to invoice.</p>
                </div>
              </button>
              <button
                onClick={() => { setPendingStatus('on_hold'); setStep(2); }}
                className="flex items-center gap-4 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl hover:border-amber-400 hover:bg-amber-100 transition-colors text-left"
              >
                <Layers className="h-9 w-9 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-amber-800">Stage Complete</p>
                  <p className="text-sm text-amber-600">This phase is done, more work to come.</p>
                </div>
              </button>
            </div>
            <button onClick={() => setStep(0)} className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Back to photos
            </button>
          </div>
        )}

        {/* Step 2: Work Order */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="h-9 w-9 text-purple-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Upload Work Order?</h3>
              <p className="text-sm text-gray-500 mt-1">Attach a signed work order, estimate, or field form.</p>
            </div>
            <input ref={workOrderRef} type="file" accept="image/*,.pdf" multiple className="hidden"
              onChange={e => { if (e.target.files?.length) upload(e.target.files, 'work_order'); e.target.value = ''; }} />
            <button
              onClick={() => workOrderRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-purple-300 rounded-2xl py-8 flex flex-col items-center gap-2 text-purple-700 hover:bg-purple-50 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-8 w-8" />}
              <span className="font-medium">{uploading ? 'Uploading...' : 'Tap to upload'}</span>
              <span className="text-xs text-purple-500">Photo or PDF</span>
              {uploadedCounts.workOrder > 0 && (
                <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full">
                  {uploadedCounts.workOrder} uploaded ✓
                </span>
              )}
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>Skip for Now</Button>
              <Button className="flex-1" onClick={() => setStep(3)}>
                Continue <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Receipts */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Receipt className="h-9 w-9 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">Any Receipts?</h3>
              <p className="text-sm text-gray-500 mt-1">Upload receipts for materials, supplies, or expenses.</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Amount ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={receiptForm.amount}
                  onChange={e => setReceiptForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Category</label>
                <select value={receiptForm.category}
                  onChange={e => setReceiptForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500">
                  {RECEIPT_CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Vendor / Store (optional)</label>
                <input type="text" placeholder="Home Depot, etc."
                  value={receiptForm.vendor}
                  onChange={e => setReceiptForm(f => ({ ...f, vendor: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <input ref={receiptRef} type="file" accept="image/*,.pdf" multiple className="hidden"
              onChange={e => {
                if (e.target.files?.length) {
                  const extra: Record<string, string> = { receiptCategory: receiptForm.category };
                  if (receiptForm.amount) extra.costAmount = receiptForm.amount;
                  if (receiptForm.vendor) extra.vendorName = receiptForm.vendor;
                  upload(e.target.files, 'receipt', extra);
                }
                e.target.value = '';
              }} />
            <button
              onClick={() => receiptRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-emerald-300 rounded-2xl py-6 flex flex-col items-center gap-2 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Receipt className="h-7 w-7" />}
              <span className="font-medium text-sm">{uploading ? 'Uploading...' : 'Tap to upload receipt'}</span>
              {uploadedCounts.receipt > 0 && (
                <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                  {uploadedCounts.receipt} uploaded ✓
                </span>
              )}
            </button>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => pendingStatus && onComplete(pendingStatus)}>
                No Receipts — Done
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={uploading}
                onClick={() => pendingStatus && onComplete(pendingStatus)}
              >
                <CheckCircle className="h-4 w-4 mr-1.5" />
                {pendingStatus === 'completed' ? 'Mark Complete' : 'Mark Stage Done'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Photos Tab ────────────────────────────────────────────────────────────────

function PhotosTab({ jobId, defaultCategory = 'before', showUploadPrompt = false }: {
  jobId: string;
  defaultCategory?: string;
  showUploadPrompt?: boolean;
}) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadCount, setUploadCount] = useState(0);
  const [category, setCategory] = useState<string>(defaultCategory);
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
    setUploadError('');
    setUploadCount(0);
    try {
      for (const file of Array.from(fileList)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileType', 'photo');
        fd.append('photoCategory', category);
        fd.append('visibility', visibility);
        if (notes.trim()) fd.append('notes', notes.trim());
        await api.post(`/job-files/${jobId}`, fd);
        setUploadCount(n => n + 1);
      }
      setNotes('');
      qc.invalidateQueries({ queryKey: ['job-files', jobId, 'photo'] });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Upload failed';
      setUploadError(msg);
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
      {/* Before-photo prompt when job just started */}
      {showUploadPrompt && (
        <div
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-3 p-4 bg-blue-50 border-2 border-dashed border-blue-300 rounded-2xl cursor-pointer hover:bg-blue-100 transition-colors"
        >
          <Camera className="h-8 w-8 text-blue-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-blue-800">Upload Before Photos</p>
            <p className="text-sm text-blue-600">Tap here to capture the job site before starting work.</p>
          </div>
        </div>
      )}

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

      {uploadError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Upload failed: {uploadError}
        </div>
      )}
      {!uploading && uploadCount > 0 && !uploadError && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {uploadCount} photo{uploadCount > 1 ? 's' : ''} uploaded successfully
        </div>
      )}

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
  const [uploadError, setUploadError] = useState('');
  const [uploadCount, setUploadCount] = useState(0);
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
    setUploadError('');
    setUploadCount(0);
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
        setUploadCount(n => n + 1);
      }
      setForm(f => ({ ...f, costAmount: '', vendorName: '', purchaseDate: '', notes: '' }));
      qc.invalidateQueries({ queryKey: ['job-files', jobId, 'receipt'] });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Upload failed';
      setUploadError(msg);
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

      {uploadError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          Upload failed: {uploadError}
        </div>
      )}
      {!uploading && uploadCount > 0 && !uploadError && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          {uploadCount} receipt{uploadCount > 1 ? 's' : ''} uploaded successfully
        </div>
      )}

      {files.length > 0 && (
        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
          <span className="text-sm text-emerald-700 font-medium flex items-center gap-1.5">
            <DollarSign className="h-4 w-4" /> Total Receipt Costs
          </span>
          <span className="text-lg font-bold text-emerald-700">{fmtUSD(total)}</span>
        </div>
      )}

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

// ── Complete + Invoice Prompt ─────────────────────────────────────────────────

function CompleteInvoicePrompt({
  job,
  onClose,
}: {
  job: {
    id: string;
    title: string;
    customer: { id: string; firstName: string; lastName: string };
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
  };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'choose' | 'create' | 'attach'>('choose');
  const [creating, setCreating] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [createError, setCreateError] = useState('');

  // Create invoice form state
  const defaultItems = job.lineItems.length > 0
    ? job.lineItems.map(li => ({ description: li.description, qty: String(li.quantity), price: (li.unitPrice / 100).toFixed(2) }))
    : [{ description: job.title, qty: '1', price: '' }];
  const [lineItems, setLineItems] = useState(defaultItems);
  const [dueDate, setDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');

  // Attach to existing
  const { data: existingInvoices = [] } = useQuery<Array<{ id: string; invoiceNumber: string; total: number; status: string }>>({
    queryKey: ['invoices', 'customer', job.customer.id],
    queryFn: async () => {
      const { data } = await api.get(`/invoices?customerId=${job.customer.id}&status=draft`);
      return data.data ?? [];
    },
    enabled: mode === 'attach',
  });
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const handleCreate = async () => {
    const items = lineItems.filter(li => li.description.trim() && li.price);
    if (!items.length) { setCreateError('Add at least one line item with amount'); return; }
    setCreating(true);
    setCreateError('');
    try {
      await api.post('/invoices', {
        customerId: job.customer.id,
        jobId: job.id,
        lineItems: items.map(li => ({
          description: li.description,
          quantity: parseFloat(li.qty) || 1,
          unitPrice: Math.round(parseFloat(li.price) * 100),
        })),
        dueDate: dueDate || undefined,
        notes: invoiceNotes || undefined,
      });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    } catch (err: unknown) {
      setCreateError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to create invoice');
    } finally { setCreating(false); }
  };

  const handleAttach = async () => {
    if (!selectedInvoiceId) return;
    setAttaching(true);
    try {
      await api.patch(`/invoices/${selectedInvoiceId}`, { jobId: job.id });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      onClose();
    } catch { /* ignore */ } finally { setAttaching(false); }
  };

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-400 bg-white';

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">Job Completed!</p>
              <p className="text-xs text-gray-500">{job.customer.firstName} {job.customer.lastName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">Would you like to invoice this job?</p>
              <button
                onClick={() => setMode('create')}
                className="w-full flex items-center gap-4 p-4 bg-green-50 border-2 border-green-200 hover:border-green-400 hover:bg-green-100 rounded-2xl transition-colors text-left"
              >
                <Plus className="h-8 w-8 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">Create New Invoice</p>
                  <p className="text-xs text-gray-500 mt-0.5">Generate a fresh invoice for this job</p>
                </div>
              </button>
              <button
                onClick={() => setMode('attach')}
                className="w-full flex items-center gap-4 p-4 bg-blue-50 border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-100 rounded-2xl transition-colors text-left"
              >
                <Link2 className="h-8 w-8 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-gray-900">Attach to Existing Invoice</p>
                  <p className="text-xs text-gray-500 mt-0.5">Link this job to a draft invoice</p>
                </div>
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <button onClick={() => setMode('choose')} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                ← Back
              </button>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
                <div className="space-y-2">
                  {lineItems.map((li, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <input
                        value={li.description}
                        onChange={e => setLineItems(items => items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                        placeholder="Description"
                        className={`${inp} flex-1`}
                      />
                      <input
                        value={li.qty}
                        onChange={e => setLineItems(items => items.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
                        placeholder="Qty"
                        type="number"
                        min="1"
                        className={`${inp} w-16`}
                      />
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          value={li.price}
                          onChange={e => setLineItems(items => items.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                          placeholder="0.00"
                          type="number"
                          min="0"
                          step="0.01"
                          className={`${inp} w-24 pl-6`}
                        />
                      </div>
                      {lineItems.length > 1 && (
                        <button onClick={() => setLineItems(items => items.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 pt-2">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setLineItems(items => [...items, { description: '', qty: '1', price: '' }])}
                    className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add line item
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Due Date</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inp}
                  min={new Date().toISOString().split('T')[0]} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes (optional)</label>
                <textarea value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} rows={2}
                  placeholder="Payment terms, thank you message..." className={`${inp} resize-none`} />
              </div>
              {createError && <p className="text-xs text-red-600 font-medium">{createError}</p>}
            </div>
          )}

          {mode === 'attach' && (
            <div className="space-y-4">
              <button onClick={() => setMode('choose')} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                ← Back
              </button>
              {existingInvoices.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No draft invoices found for this customer.</p>
                  <button onClick={() => setMode('create')} className="mt-3 text-xs text-green-600 hover:underline">
                    Create a new invoice instead
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select a draft invoice to attach this job to</p>
                  {existingInvoices.map(inv => (
                    <label key={inv.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                      selectedInvoiceId === inv.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input type="radio" name="invoice" value={inv.id} checked={selectedInvoiceId === inv.id}
                        onChange={() => setSelectedInvoiceId(inv.id)} className="text-blue-600" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">Invoice #{inv.invoiceNumber}</p>
                        <p className="text-xs text-gray-500">{fmtUSD(inv.total / 100)} · {inv.status}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode === 'create' && (
          <div className="px-5 py-4 border-t flex-shrink-0">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creating ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>
        )}
        {mode === 'attach' && existingInvoices.length > 0 && (
          <div className="px-5 py-4 border-t flex-shrink-0">
            <button
              onClick={handleAttach}
              disabled={!selectedInvoiceId || attaching}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              {attaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              {attaching ? 'Attaching...' : 'Attach to Invoice'}
            </button>
          </div>
        )}
      </div>
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
  const [startDismissed, setStartDismissed] = useState(false);
  const [showFinishWizard, setShowFinishWizard] = useState(false);
  const [photoPrompt, setPhotoPrompt] = useState(false);

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const isTech = user?.role === 'technician';

  // Reset overlays when switching jobs
  useEffect(() => {
    setStartDismissed(false);
    setShowFinishWizard(false);
    setPhotoPrompt(false);
    setTab('details');
  }, [jobId]);

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
    customer: { id: string; firstName: string; lastName: string; phone?: string; email?: string };
    serviceAddress: { street: string; city: string; state: string; zip: string };
    technician?: { id: string; firstName: string; lastName: string; phone?: string };
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

  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false);

  const { mutate: updateStatus, isPending: isUpdatingStatus } = useMutation({
    mutationFn: (status: JobStatus) => api.patch(`/jobs/${jobId}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  });

  const { mutate: completeJob, isPending: isCompletingJob } = useMutation({
    mutationFn: () => api.patch(`/jobs/${jobId}`, { status: 'completed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      setShowInvoicePrompt(true);
    },
  });

  const { mutate: selfAssign, isPending: isSelfAssigning } = useMutation({
    mutationFn: () => api.post(`/jobs/${jobId}/self-assign`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs', jobId] }),
  });

  const { mutate: saveEdit, isPending: isSavingEdit } = useMutation({
    mutationFn: (form: NonNullable<typeof editForm>) => api.patch(`/jobs/${jobId}`, {
      title: form.title, description: form.description || null,
      priority: form.priority, serviceType: form.serviceType,
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

  const handleStartJob = () => {
    updateStatus('in_progress');
    setStartDismissed(true);
    setPhotoPrompt(true);
    setTab('photos');
  };

  const handleFinishComplete = (status: JobStatus) => {
    updateStatus(status);
    setShowFinishWizard(false);
    setPhotoPrompt(false);
    setTab('details');
  };

  const transitions = job ? STATUS_TRANSITIONS[job.status] : [];

  // For techs, show the start overlay on scheduled/en_route jobs they haven't dismissed
  const showStartOverlay = !startDismissed && isTech &&
    job && (job.status === 'scheduled' || job.status === 'en_route');

  const tabs: { id: TabType; label: string; icon?: React.ReactNode; adminOnly?: boolean }[] = [
    { id: 'details' as TabType, label: 'Details' },
    { id: 'edit' as TabType, label: 'Edit', icon: <Edit2 className="h-3 w-3" /> },
    { id: 'photos' as TabType, label: 'Photos', icon: <Camera className="h-3 w-3" /> },
    { id: 'work_orders' as TabType, label: 'Work Orders', icon: <ClipboardList className="h-3 w-3" /> },
    { id: 'receipts' as TabType, label: 'Receipts', icon: <Receipt className="h-3 w-3" /> },
    { id: 'cost_summary' as TabType, label: 'Cost Summary', icon: <DollarSign className="h-3 w-3" />, adminOnly: true },
    { id: 'notes' as TabType, label: 'Notes', icon: <MessageSquare className="h-3 w-3" /> },
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
          <div className="relative space-y-4">
            {/* Start Job Overlay (tech only, scheduled/en_route) */}
            {showStartOverlay && (
              <StartJobOverlay
                jobTitle={job.title}
                address={`${job.serviceAddress.street}, ${job.serviceAddress.city}`}
                onStart={handleStartJob}
                onViewOnly={() => setStartDismissed(true)}
                loading={isUpdatingStatus}
              />
            )}

            {/* Complete + Invoice Prompt */}
            {showInvoicePrompt && job && (
              <CompleteInvoicePrompt
                job={job}
                onClose={() => setShowInvoicePrompt(false)}
              />
            )}

            {/* Finish Job Wizard Overlay */}
            {showFinishWizard && (
              <FinishWizardOverlay
                jobId={job.id}
                onComplete={handleFinishComplete}
                onCancel={() => setShowFinishWizard(false)}
              />
            )}

            {/* Status actions */}
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg items-center">
              {/* Self-assign button for techs not on the job */}
              {isTech && !['completed', 'cancelled'].includes(job.status) && (() => {
                const alreadyOn = job.technician?.id === user?.id ||
                  job.assignedTechnicians?.some(a => a.user.id === user?.id);
                if (alreadyOn) return null;
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    loading={isSelfAssigning}
                    onClick={() => selfAssign()}
                  >
                    <User className="h-4 w-4 mr-1.5" /> Add Me to This Job
                  </Button>
                );
              })()}

              {/* Admin "Complete Job" button — visible on any active status */}
              {isAdmin && !['completed', 'cancelled'].includes(job.status) && (
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                  loading={isCompletingJob}
                  onClick={() => completeJob()}
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" /> Complete Job
                </Button>
              )}

              {/* Finish Job button for techs in_progress */}
              {!isAdmin && job.status === 'in_progress' && (
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  size="sm"
                  onClick={() => setShowFinishWizard(true)}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Finish Job
                </Button>
              )}
              {transitions.length > 0 && (
                <>
                  <span className="text-sm text-gray-500 self-center">
                    {job.status === 'in_progress' ? 'Or move to:' : 'Move to:'}
                  </span>
                  {transitions
                    .filter(s => !(job.status === 'in_progress' && s === 'completed'))
                    .map((s) => (
                      <Button key={s} size="sm"
                        variant={s === 'cancelled' ? 'ghost' : 'outline'}
                        className={s === 'cancelled' ? 'text-destructive hover:text-destructive' : ''}
                        loading={isUpdatingStatus} onClick={() => updateStatus(s)}>
                        {STATUS_LABELS[s]}
                      </Button>
                    ))}
                </>
              )}
            </div>

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

                <ShareJobLink jobId={job.id} />
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

            {tab === 'photos' && <PhotosTab jobId={job.id} defaultCategory="before" showUploadPrompt={photoPrompt} />}
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
