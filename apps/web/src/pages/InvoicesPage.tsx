import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, TrendingUp, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle } from '@fsp/ui';
import { api } from '../lib/api';
import type { InvoiceStatus } from '@fsp/types';
import { CreateInvoiceModal } from '../components/invoices/CreateInvoiceModal';
import { InvoiceDetailModal } from '../components/invoices/InvoiceDetailModal';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
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

export function InvoicesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Reset to page 1 when filters change
  const setStatusFilterAndReset = (v: string) => { setStatusFilter(v); setPage(1); };
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); };

  // Summary stats (current page only — use status filter for full accuracy)
  const outstanding = invoices.filter((i) => ['sent', 'viewed', 'overdue'].includes(i.status));
  const totalOutstanding = outstanding.reduce((s, i) => s + i.amountDue, 0);
  const overdue = invoices.filter((i) => i.status === 'overdue');
  const paid = invoices.filter((i) => i.status === 'paid');
  const totalPaid = paid.reduce((s, i) => s + i.amountPaid, 0);

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Invoice
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{formatMoney(totalOutstanding)}</p>
            <p className="text-xs text-muted-foreground">{outstanding.length} invoice{outstanding.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-red-600 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Overdue
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-red-700">
              {formatMoney(overdue.reduce((s, i) => s + i.amountDue, 0))}
            </p>
            <p className="text-xs text-muted-foreground">{overdue.length} invoice{overdue.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-green-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Collected
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-green-700">{formatMoney(totalPaid)}</p>
            <p className="text-xs text-muted-foreground">{paid.length} invoice{paid.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" /> Total Invoiced
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">
              {formatMoney(invoices.filter(i => i.status !== 'void').reduce((s, i) => s + i.total, 0))}
            </p>
            <p className="text-xs text-muted-foreground">{invoices.filter(i => i.status !== 'void').length} invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilterAndReset(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="void">Void</option>
        </select>
      </div>

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
        <div className="space-y-2">
          {invoices.map((invoice) => (
            <Card
              key={invoice.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedId(invoice.id)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  {/* Left: number + customer */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-gray-900 text-sm">
                        {invoice.invoiceNumber}
                      </span>
                      <Badge variant={STATUS_COLORS[invoice.status]}>
                        {invoice.status}
                      </Badge>
                    </div>
                    {invoice.customer && (
                      <p className="text-sm text-gray-600 mt-0.5">
                        {invoice.customer.firstName} {invoice.customer.lastName}
                      </p>
                    )}
                  </div>

                  {/* Middle: dates */}
                  <div className="text-sm text-gray-400 text-right hidden sm:block">
                    {invoice.dueDate && (
                      <p className={invoice.status === 'overdue' ? 'text-red-600 font-medium' : ''}>
                        Due {new Date(invoice.dueDate).toLocaleDateString()}
                      </p>
                    )}
                    <p>{new Date(invoice.createdAt).toLocaleDateString()}</p>
                  </div>

                  {/* Right: amounts */}
                  <div className="text-right min-w-[100px]">
                    <p className="font-semibold text-gray-900">{formatMoney(invoice.total)}</p>
                    {invoice.amountDue > 0 && invoice.status !== 'draft' && (
                      <p className="text-xs text-blue-700 font-medium">
                        {formatMoney(invoice.amountDue)} due
                      </p>
                    )}
                    {invoice.status === 'paid' && (
                      <p className="text-xs text-green-700 font-medium">Paid ✓</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
      <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}
