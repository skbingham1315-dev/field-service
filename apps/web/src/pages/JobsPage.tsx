import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, MapPin, User, Calendar, Trash2, Receipt, Upload, Loader2 } from 'lucide-react';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { Button, Badge, Card, CardContent, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@fsp/ui';
import { api } from '../lib/api';
import type { JobStatus } from '@fsp/types';
import { CreateJobModal } from '../components/jobs/CreateJobModal';
import { JobDetailModal } from '../components/jobs/JobDetailModal';

// ── Quick Receipt Modal ───────────────────────────────────────────────────────

const RECEIPT_CATEGORIES = ['materials', 'fuel', 'dump_fees', 'equipment', 'subcontractor', 'misc'] as const;

function QuickReceiptModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [form, setForm] = useState({
    jobId: '', costAmount: '', receiptCategory: 'materials',
    vendorName: '', purchaseDate: '', notes: '',
  });

  const { data: jobsData } = useQuery({
    queryKey: ['jobs', 'active-for-receipt'],
    queryFn: () => api.get('/jobs?limit=50').then(r => r.data.data as Array<{ id: string; title: string; customer?: { firstName: string; lastName: string } }>),
    enabled: open,
  });
  const jobs = jobsData ?? [];

  const inp = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500';

  const handleUpload = async (files: FileList) => {
    if (!form.jobId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('fileType', 'receipt');
        fd.append('receiptCategory', form.receiptCategory);
        if (form.costAmount) fd.append('costAmount', form.costAmount);
        if (form.vendorName) fd.append('vendorName', form.vendorName);
        if (form.purchaseDate) fd.append('purchaseDate', form.purchaseDate);
        if (form.notes) fd.append('notes', form.notes);
        await api.post(`/job-files/${form.jobId}`, fd);
        setUploaded(u => u + 1);
      }
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setForm({ jobId: '', costAmount: '', receiptCategory: 'materials', vendorName: '', purchaseDate: '', notes: '' });
    setUploaded(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && handleClose()}>
      <DialogContent size="sm" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600" /> Submit Receipt
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Attach to Job *</label>
            <select value={form.jobId} onChange={e => setForm(f => ({ ...f, jobId: e.target.value }))}
              className={`${inp} bg-white`}>
              <option value="">Select a job...</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>
                  {j.title}{j.customer ? ` — ${j.customer.firstName} ${j.customer.lastName}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount ($)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00"
                value={form.costAmount} onChange={e => setForm(f => ({ ...f, costAmount: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select value={form.receiptCategory} onChange={e => setForm(f => ({ ...f, receiptCategory: e.target.value }))}
                className={`${inp} bg-white`}>
                {RECEIPT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vendor / Store</label>
              <input type="text" placeholder="Home Depot, etc."
                value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))}
                className={inp} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Purchase Date</label>
              <input type="date" value={form.purchaseDate}
                onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))}
                className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Note (optional)</label>
            <input type="text" placeholder="What was this for?"
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={inp} />
          </div>

          <input ref={fileRef} type="file" accept="image/*,.pdf" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ''; }} />

          <button
            onClick={() => !form.jobId ? undefined : fileRef.current?.click()}
            disabled={!form.jobId || uploading}
            className={`w-full border-2 border-dashed rounded-2xl py-6 flex flex-col items-center gap-2 transition-colors ${
              form.jobId
                ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 cursor-pointer'
                : 'border-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {uploading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
            <span className="font-medium text-sm">
              {uploading ? 'Uploading...' : form.jobId ? 'Tap to upload receipt photo or PDF' : 'Select a job first'}
            </span>
            {uploaded > 0 && (
              <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                {uploaded} receipt{uploaded > 1 ? 's' : ''} uploaded ✓
              </span>
            )}
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {uploaded > 0 ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLORS: Record<JobStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  scheduled: 'info',
  en_route: 'warning',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'destructive',
  on_hold: 'secondary',
};

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: 'Draft', scheduled: 'Scheduled', en_route: 'En Route',
  in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', cancelled: 'Cancelled',
};

interface JobRow {
  id: string;
  title: string;
  status: JobStatus;
  priority: string;
  serviceType: string;
  scheduledStart?: string;
  customer?: { firstName: string; lastName: string };
  serviceAddress?: { street: string; city: string };
  technician?: { firstName: string; lastName: string };
  assignedTechnicians?: Array<{ user: { firstName: string; lastName: string } }>;
}

export function JobsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { confirm } = useConfirm();
  const toast = useToast();

  const handleDelete = async (e: React.MouseEvent, jobId: string) => {
    e.stopPropagation();
    const ok = await confirm({ title: 'Delete Job', message: 'This cannot be undone. All associated data will be removed.', variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/jobs/${jobId}`);
      qc.invalidateQueries({ queryKey: ['jobs'] });
      toast.success('Job deleted');
    } catch { toast.error('Failed to delete job'); }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['jobs', search, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/jobs?${params}`);
      return data;
    },
  });

  const jobs: JobRow[] = (data?.data ?? []).filter((job: JobRow) =>
    search
      ? job.title.toLowerCase().includes(search.toLowerCase()) ||
        `${job.customer?.firstName ?? ''} ${job.customer?.lastName ?? ''}`.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowReceipt(true)}>
            <Receipt className="h-4 w-4 mr-2" />
            Submit Receipt
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search jobs or customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="en_route">En Route</option>
          <option value="in_progress">In Progress</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {/* Job list */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading jobs...</div>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-500 mb-3">No jobs found.</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create your first job
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedId(job.id)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{job.title}</span>
                      <Badge variant={STATUS_COLORS[job.status]}>
                        {STATUS_LABELS[job.status]}
                      </Badge>
                      {job.priority === 'urgent' && <Badge variant="destructive">Urgent</Badge>}
                      {job.priority === 'high' && <Badge variant="warning">High</Badge>}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-sm text-gray-500">
                      {job.customer && (
                        <span className="flex items-center gap-1">
                          <User className="h-3.5 w-3.5" />
                          {job.customer.firstName} {job.customer.lastName}
                        </span>
                      )}
                      {job.serviceAddress && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {job.serviceAddress.street}, {job.serviceAddress.city}
                        </span>
                      )}
                      {((job.assignedTechnicians && job.assignedTechnicians.length > 0) || job.technician) && (
                        <span className="flex items-center gap-1 text-blue-600">
                          <User className="h-3.5 w-3.5" />
                          {job.assignedTechnicians && job.assignedTechnicians.length > 0
                            ? job.assignedTechnicians.map((a: any) => `${a.user.firstName} ${a.user.lastName}`).join(', ')
                            : `${job.technician?.firstName} ${job.technician?.lastName}`}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-3 flex-shrink-0">
                    {job.scheduledStart && (
                      <div className="text-right text-sm text-gray-400 whitespace-nowrap">
                        <div className="flex items-center gap-1 justify-end">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(job.scheduledStart).toLocaleDateString()}
                        </div>
                        <div>
                          {new Date(job.scheduledStart).toLocaleTimeString([], {
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, job.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete job"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateJobModal open={showCreate} onClose={() => setShowCreate(false)} />
      <QuickReceiptModal open={showReceipt} onClose={() => setShowReceipt(false)} />
      <JobDetailModal jobId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
