import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, X, Trash2 } from 'lucide-react';
import { Button, Badge, Card, CardContent, CardHeader, CardTitle, Dialog } from '@fsp/ui';
import { api } from '../lib/api';

const fmt = (c: number) =>
  '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type EstimateStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted' | 'void';

const STATUS_COLORS: Record<EstimateStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary',
  sent: 'info',
  accepted: 'success',
  rejected: 'destructive',
  converted: 'success',
  void: 'secondary',
};

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
}

interface EstimateRow {
  id: string;
  invoiceNumber: string;
  status: EstimateStatus;
  total: number;
  createdAt: string;
  dueDate?: string;
  customer?: { firstName: string; lastName: string };
}

interface EstimateDetail extends EstimateRow {
  lineItems: LineItem[];
  notes?: string;
  subtotal: number;
  taxAmount: number;
}

function CreateEstimateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0, taxable: false },
  ]);

  const { data: customersData } = useQuery({
    queryKey: ['customers', 'select'],
    queryFn: async () => {
      const { data } = await api.get('/customers?limit=100');
      return data;
    },
    enabled: open,
  });
  const customers: Customer[] = customersData?.data ?? [];

  const { mutate: createEstimate, isPending } = useMutation({
    mutationFn: () =>
      api.post('/estimates', {
        customerId: customerId || undefined,
        lineItems,
        notes: notes || undefined,
        dueDate: dueDate || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estimates'] });
      onClose();
      setCustomerId('');
      setNotes('');
      setDueDate('');
      setLineItems([{ description: '', quantity: 1, unitPrice: 0, taxable: false }]);
    },
  });

  const updateItem = (index: number, field: keyof LineItem, value: string | number | boolean) => {
    setLineItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () =>
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unitPrice: 0, taxable: false }]);

  const removeItem = (index: number) =>
    setLineItems((prev) => prev.filter((_, i) => i !== index));

  const subtotal = lineItems.reduce((s, item) => s + item.quantity * item.unitPrice, 0);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">New Estimate</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
                  <span className="col-span-5">Description</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-3 text-center">Unit Price</span>
                  <span className="col-span-1 text-center">Tax</span>
                  <span className="col-span-1" />
                </div>
                {lineItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(i, 'description', e.target.value)}
                      className="col-span-5 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                      className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="0.00"
                      value={item.unitPrice === 0 ? '' : (item.unitPrice / 100).toFixed(2)}
                      onChange={(e) => updateItem(i, 'unitPrice', Math.round(Number(e.target.value) * 100))}
                      className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="checkbox"
                      checked={item.taxable}
                      onChange={(e) => updateItem(i, 'taxable', e.target.checked)}
                      className="col-span-1 mx-auto h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeItem(i)}
                      disabled={lineItems.length === 1}
                      className="col-span-1 text-gray-300 hover:text-red-500 disabled:opacity-30 flex justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={addItem}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                + Add line item
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Internal notes or terms..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="text-right text-sm font-medium text-gray-700">
              Subtotal: <span className="text-gray-900 font-semibold ml-2">{fmt(subtotal)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => createEstimate()} disabled={isPending || !customerId}>
              {isPending ? 'Creating...' : 'Create Estimate'}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function EstimateDetailModal({
  estimateId,
  onClose,
  onConverted,
}: {
  estimateId: string | null;
  onClose: () => void;
  onConverted?: () => void;
}) {
  const qc = useQueryClient();

  const { data: estimate, isLoading } = useQuery<EstimateDetail>({
    queryKey: ['estimates', estimateId],
    queryFn: async () => {
      const { data } = await api.get(`/estimates/${estimateId}`);
      return data.data;
    },
    enabled: !!estimateId,
  });

  const { mutate: patchStatus, isPending: patching } = useMutation({
    mutationFn: (status: string) => api.patch(`/estimates/${estimateId}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estimates'] });
      qc.invalidateQueries({ queryKey: ['estimates', estimateId] });
    },
  });

  const { mutate: convertToInvoice, isPending: converting } = useMutation({
    mutationFn: () => api.post(`/estimates/${estimateId}/convert`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['estimates'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      onConverted?.();
      onClose();
    },
  });

  if (!estimateId) return null;

  return (
    <Dialog open={!!estimateId} onOpenChange={(v) => !v && onClose()}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {isLoading ? 'Loading...' : estimate?.invoiceNumber ?? 'Estimate'}
              </h2>
              {estimate && (
                <Badge variant={STATUS_COLORS[estimate.status]}>{estimate.status}</Badge>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-gray-100 animate-pulse rounded-lg" />
                ))}
              </div>
            ) : estimate ? (
              <>
                {estimate.customer && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Customer</p>
                    <p className="text-sm font-medium text-gray-900">
                      {estimate.customer.firstName} {estimate.customer.lastName}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Line Items</p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 font-medium text-gray-500">Description</th>
                        <th className="text-center py-2 font-medium text-gray-500 w-16">Qty</th>
                        <th className="text-right py-2 font-medium text-gray-500 w-24">Unit</th>
                        <th className="text-right py-2 font-medium text-gray-500 w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {estimate.lineItems.map((item, i) => (
                        <tr key={i}>
                          <td className="py-2 text-gray-800">
                            {item.description}
                            {item.taxable && <span className="ml-1 text-xs text-gray-400">(tax)</span>}
                          </td>
                          <td className="py-2 text-center text-gray-600">{item.quantity}</td>
                          <td className="py-2 text-right text-gray-600">{fmt(item.unitPrice)}</td>
                          <td className="py-2 text-right font-medium text-gray-900">
                            {fmt(item.quantity * item.unitPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span>{fmt(estimate.subtotal ?? 0)}</span>
                  </div>
                  {(estimate.taxAmount ?? 0) > 0 && (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tax</span>
                      <span>{fmt(estimate.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold text-gray-900 pt-1 border-t border-gray-200">
                    <span>Total</span>
                    <span>{fmt(estimate.total)}</span>
                  </div>
                </div>

                {estimate.notes && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{estimate.notes}</p>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {estimate && (
            <div className="flex flex-wrap justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
              {estimate.status === 'draft' && (
                <Button
                  variant="outline"
                  onClick={() => patchStatus('sent')}
                  disabled={patching}
                >
                  Send
                </Button>
              )}
              {!['converted', 'void'].includes(estimate.status) && (
                <Button
                  onClick={() => convertToInvoice()}
                  disabled={converting || patching}
                >
                  {converting ? 'Converting...' : 'Convert to Invoice'}
                </Button>
              )}
              {!['converted', 'void'].includes(estimate.status) && (
                <Button
                  variant="outline"
                  onClick={() => patchStatus('void')}
                  disabled={patching}
                  className="text-red-600 border-red-200 hover:bg-red-50"
                >
                  Void
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

const EST_PAGE_LIMIT = 50;

export function EstimatesPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['estimates', statusFilter, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(EST_PAGE_LIMIT), page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('search', search);
      const { data } = await api.get(`/estimates?${params}`);
      return data;
    },
  });

  const estimates: EstimateRow[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;
  const totalPages: number = data?.meta?.totalPages ?? 1;

  const setStatusAndReset = (v: string) => { setStatusFilter(v); setPage(1); };
  const setSearchAndReset = (v: string) => { setSearch(v); setPage(1); };

  const draft = estimates.filter((e) => e.status === 'draft');
  const sent = estimates.filter((e) => e.status === 'sent');
  const converted = estimates.filter((e) => e.status === 'converted');

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Estimates</h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Estimate
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{estimates.length}</p>
            <p className="text-xs text-muted-foreground">All estimates</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-gray-500">Draft</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold">{draft.length}</p>
            <p className="text-xs text-muted-foreground">Pending send</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-blue-600">Sent</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-blue-700">{sent.length}</p>
            <p className="text-xs text-muted-foreground">Awaiting response</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-green-700">Converted</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-xl font-bold text-green-700">{converted.length}</p>
            <p className="text-xs text-muted-foreground">To invoices</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search estimates or customers..."
            value={search}
            onChange={(e) => setSearchAndReset(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusAndReset(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="converted">Converted</option>
          <option value="void">Void</option>
        </select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : estimates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-500 mb-3">No estimates found.</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create your first estimate
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {estimates.map((estimate) => (
            <Card
              key={estimate.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedId(estimate.id)}
            >
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-gray-900 text-sm">
                        {estimate.invoiceNumber}
                      </span>
                      <Badge variant={STATUS_COLORS[estimate.status]}>{estimate.status}</Badge>
                    </div>
                    {estimate.customer && (
                      <p className="text-sm text-gray-600 mt-0.5">
                        {estimate.customer.firstName} {estimate.customer.lastName}
                      </p>
                    )}
                  </div>
                  <div className="text-sm text-gray-400 text-right hidden sm:block">
                    {estimate.dueDate && (
                      <p>Expires {new Date(estimate.dueDate).toLocaleDateString()}</p>
                    )}
                    <p>{new Date(estimate.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="text-right min-w-[90px]">
                    <p className="font-semibold text-gray-900">{fmt(estimate.total)}</p>
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
            Showing {(page - 1) * EST_PAGE_LIMIT + 1}–{Math.min(page * EST_PAGE_LIMIT, total)} of {total} estimates
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

      <CreateEstimateModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EstimateDetailModal
        estimateId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
