import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, TrendingUp, Clock, AlertCircle, CheckCircle2, Download, Send, XCircle } from 'lucide-react';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle } from '@fsp/ui';
import { api } from '../lib/api';
import type { InvoiceStatus } from '@fsp/types';
import { CreateInvoiceModal } from '../components/invoices/CreateInvoiceModal';
import { InvoiceDetailModal } from '../components/invoices/InvoiceDetailModal';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
function daysOverdue(dueDate?: string | null): number {
  if (!dueDate) return 0;
  const diff = Date.now() - new Date(dueDate).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

const STATUS_COLORS: Record<InvoiceStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary', sent: 'info', viewed: 'info', paid: 'success', overdue: 'destructive', void: 'secondary',
};

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  total: number;
  amountDue: number;
  amountPaid: number;
  dueDate?: string;
  createdAt: string;
  customer?: { firstName: string; lastName: string };
}

const PAGE_LIMIT = 50;

const QUICK_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Paid', value: 'paid' },
  { label: 'Void', value: 'void' },
] as const;

async function downloadExport(path: string, filename: string) {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function InvoicesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', statusFilter, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT), page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const { data } = await api.get(`/invoices?${params}`);
      return data;
    },
  });

  const invoices: InvoiceRow[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;
  const totalPages: number = data?.meta?.totalPages ?? 1;

  const setStatusFilterAndReset = (v: string) => { setStatusFilter(v); setPage(1); setSelected(new Set()); };
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); };

  // Real stats
  const { data: statsData } = useQuery({
    queryKey: ['invoices', 'stats'],
    queryFn: async () => {
      const { data } = await api.get('/invoices/stats');
      return data.data as {
        outstanding: { total: number; count: number };
        overdue: { total: number; count: number };
        paid: { total: number; count: number };
        all: { total: number; count: number };
      };
    },
  });
  const stats = statsData ?? { outstanding: { total: 0, count: 0 }, overdue: { total: 0, count: 0 }, paid: { total: 0, count: 0 }, all: { total: 0, count: 0 } };

  // Batch actions
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === invoices.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map(i => i.id)));
    }
  };

  const { mutate: batchSend, isPending: isBatchSending } = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      await Promise.allSettled(ids.map(id => api.post(`/invoices/${id}/send`)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`${selected.size} invoice(s) sent`);
      setSelected(new Set());
    },
  });

  const { mutate: batchVoid, isPending: isBatchVoiding } = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      await Promise.allSettled(ids.map(id => api.post(`/invoices/${id}/void`)));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`${selected.size} invoice(s) voided`);
      setSelected(new Set());
    },
  });

  const selectedInvoices = useMemo(() => invoices.filter(i => selected.has(i.id)), [invoices, selected]);
  const canBatchSend = selectedInvoices.some(i => !['paid', 'void'].includes(i.status));
  const canBatchVoid = selectedInvoices.some(i => !['paid', 'void'].includes(i.status));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <div className="flex items-center gap-2">
          {/* QuickBooks Export */}
          <div className="relative">
            <Button variant="outline" onClick={() => setShowExport((v) => !v)}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            {showExport && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExport(false)} />
                <div className="absolute right-0 mt-1 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-56">
                  <p className="px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Download CSV</p>
                  {[
                    { label: 'Customers', path: '/export/quickbooks/customers', file: 'quickbooks_customers.csv' },
                    { label: 'Invoices', path: '/export/quickbooks/invoices', file: 'quickbooks_invoices.csv' },
                    { label: 'Estimates', path: '/export/quickbooks/estimates', file: 'quickbooks_estimates.csv' },
                  ].map(({ label, path, file }) => (
                    <button
                      key={label}
                      disabled={exporting === label}
                      onClick={async () => {
                        setExporting(label);
                        try { await downloadExport(path, file); } finally { setExporting(null); setShowExport(false); }
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between disabled:opacity-50"
                    >
                      {label}
                      {exporting === label && <span className="text-xs text-gray-400">Downloading…</span>}
                    </button>
                  ))}
                  <p className="px-4 pt-2 pb-2 text-xs text-gray-400 border-t mt-1">
                    Import these CSVs in QuickBooks Online under <span className="font-medium">Settings → Import Data</span>
                  </p>
                </div>
              </>
            )}
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="cursor-pointer hover:ring-2 hover:ring-blue-200 transition-all" onClick={() => setStatusFilterAndReset('')}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{formatMoney(stats.outstanding.total)}</p>
            <p className="text-xs text-muted-foreground">{stats.outstanding.count} invoice{stats.outstanding.count !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 hover:ring-red-200 transition-all" onClick={() => setStatusFilterAndReset('overdue')}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-red-600 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Overdue
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-red-700">{formatMoney(stats.overdue.total)}</p>
            <p className="text-xs text-muted-foreground">{stats.overdue.count} invoice{stats.overdue.count !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 hover:ring-green-200 transition-all" onClick={() => setStatusFilterAndReset('paid')}>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Collected
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-green-700">{formatMoney(stats.paid.total)}</p>
            <p className="text-xs text-muted-foreground">{stats.paid.count} invoice{stats.paid.count !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Total Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{formatMoney(stats.all.total)}</p>
            <p className="text-xs text-muted-foreground">{stats.all.count} invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick filter pills + search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilterAndReset(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors font-medium ${
                statusFilter === f.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f.label}
              {f.value === 'overdue' && stats.overdue.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                  {stats.overdue.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search invoices or customers..."
            value={search}
            onChange={(e) => setSearchAndReset(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Batch action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-800">
            {selected.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            {canBatchSend && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (await confirm({ title: 'Batch Send', message: `Send ${selected.size} invoice(s)?`, variant: 'default' })) {
                    batchSend();
                  }
                }}
                loading={isBatchSending}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Send All
              </Button>
            )}
            {canBatchVoid && (
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={async () => {
                  if (await confirm({ title: 'Batch Void', message: `Void ${selected.size} invoice(s)? This cannot be undone.`, variant: 'danger' })) {
                    batchVoid();
                  }
                }}
                loading={isBatchVoiding}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Void All
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Invoice list */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading invoices...</div>
      ) : invoices.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-500 mb-3">No invoices found.</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create your first invoice
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {/* Select all header */}
          <div className="flex items-center gap-3 px-5 py-2 text-xs text-gray-400">
            <input
              type="checkbox"
              checked={selected.size === invoices.length && invoices.length > 0}
              onChange={toggleAll}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
            />
            <span className="flex-1">Invoice</span>
            <span className="w-32 text-right hidden sm:block">Due Date</span>
            <span className="w-28 text-right">Amount</span>
          </div>

          {invoices.map((invoice) => {
            const overdue = daysOverdue(invoice.dueDate);
            const isOverdue = overdue > 0 && ['sent', 'viewed', 'overdue'].includes(invoice.status);

            return (
              <div
                key={invoice.id}
                className={`group flex items-center gap-3 px-5 py-3.5 rounded-xl border transition-all cursor-pointer ${
                  selected.has(invoice.id)
                    ? 'border-blue-300 bg-blue-50'
                    : isOverdue
                      ? 'border-red-100 bg-red-50/30 hover:border-red-200 hover:shadow-sm'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(invoice.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(invoice.id); }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 rounded border-gray-300 accent-blue-600 flex-shrink-0"
                />

                {/* Main content — clickable */}
                <div className="flex items-center gap-4 flex-1 min-w-0" onClick={() => setSelectedId(invoice.id)}>
                  {/* Left: number + customer */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-gray-900 text-sm">
                        {invoice.invoiceNumber}
                      </span>
                      <Badge variant={STATUS_COLORS[invoice.status]}>
                        {invoice.status}
                      </Badge>
                      {isOverdue && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                          <AlertCircle className="h-2.5 w-2.5" />
                          {overdue}d late
                        </span>
                      )}
                      {invoice.amountPaid > 0 && invoice.amountDue > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                          Partial
                        </span>
                      )}
                    </div>
                    {invoice.customer && (
                      <p className="text-sm text-gray-600 mt-0.5 truncate">
                        {invoice.customer.firstName} {invoice.customer.lastName}
                      </p>
                    )}
                  </div>

                  {/* Middle: dates */}
                  <div className="text-sm text-right hidden sm:block w-32 flex-shrink-0">
                    {invoice.dueDate && (
                      <p className={isOverdue ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                        {isOverdue ? `${overdue}d overdue` : `Due ${new Date(invoice.dueDate).toLocaleDateString()}`}
                      </p>
                    )}
                    <p className="text-gray-400 text-xs">{new Date(invoice.createdAt).toLocaleDateString()}</p>
                  </div>

                  {/* Right: amounts */}
                  <div className="text-right min-w-[100px] flex-shrink-0">
                    <p className={`font-semibold ${isOverdue ? 'text-red-700' : 'text-gray-900'}`}>
                      {formatMoney(invoice.total)}
                    </p>
                    {invoice.amountDue > 0 && invoice.status !== 'draft' && (
                      <p className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-blue-700'}`}>
                        {formatMoney(invoice.amountDue)} due
                      </p>
                    )}
                    {invoice.status === 'paid' && (
                      <p className="text-xs text-green-700 font-medium">Paid</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * PAGE_LIMIT + 1}–{Math.min(page * PAGE_LIMIT, total)} of {total} invoices
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Previous
            </Button>
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      <CreateInvoiceModal open={showCreate} onClose={() => setShowCreate(false)} />
      <InvoiceDetailModal
        invoiceId={selectedId}
        onClose={() => setSelectedId(null)}
        onDuplicated={(id) => { setSelectedId(id); qc.invalidateQueries({ queryKey: ['invoices'] }); }}
      />
    </div>
  );
}
