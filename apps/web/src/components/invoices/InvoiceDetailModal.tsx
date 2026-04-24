import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, DollarSign, XCircle, CheckCircle2,
  Phone, Mail, Calendar, Pencil, Plus, Trash2, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  Button, Badge, Input, Textarea,
} from '@fsp/ui';
import { RecordPaymentModal } from './RecordPaymentModal';
import { api } from '../../lib/api';
import type { InvoiceStatus } from '@fsp/types';
import { useAuthStore } from '../../store/authStore';

interface EditLineItem {
  id?: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}
function formatDate(d?: string | Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_COLORS: Record<InvoiceStatus, 'default' | 'info' | 'warning' | 'success' | 'destructive' | 'secondary'> = {
  draft: 'secondary', sent: 'info', viewed: 'info', paid: 'success', overdue: 'destructive', void: 'secondary',
};

interface Props {
  invoiceId: string | null;
  onClose: () => void;
}

export function InvoiceDetailModal({ invoiceId, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [showPayment, setShowPayment] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDueDate, setEditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<EditLineItem[]>([]);

  const startEdit = () => {
    if (!invoice) return;
    setEditDueDate(invoice.dueDate ? invoice.dueDate.slice(0, 10) : '');
    setEditNotes(invoice.notes ?? '');
    setEditItems(invoice.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: String(li.quantity),
      unitPrice: (li.unitPrice / 100).toFixed(2),
      taxable: li.taxable,
    })));
    setEditing(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: async () => {
      const { data } = await api.get(`/invoices/${invoiceId}`);
      return data.data;
    },
    enabled: !!invoiceId,
  });

  const invoice = data as {
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    amountPaid: number;
    amountDue: number;
    dueDate?: string;
    issuedAt?: string;
    paidAt?: string;
    notes?: string;
    createdAt: string;
    customer: { id: string; firstName: string; lastName: string; email?: string; phone?: string };
    lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number; total: number; taxable: boolean }>;
    payments: Array<{ id: string; amount: number; method: string; notes?: string; paidAt: string }>;
  } | undefined;

  const { mutate: sendInvoice, isPending: isSending } = useMutation({
    mutationFn: () => api.post(`/invoices/${invoiceId}/send`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invoices'] }),
  });

  const { mutate: voidInvoice, isPending: isVoiding } = useMutation({
    mutationFn: () => api.post(`/invoices/${invoiceId}/void`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invoices'] }); onClose(); },
  });

  const { mutate: saveEdit, isPending: isSaving } = useMutation({
    mutationFn: () => api.patch(`/invoices/${invoiceId}`, {
      dueDate: editDueDate || undefined,
      notes: editNotes || undefined,
      lineItems: editItems.map((li) => ({
        description: li.description,
        quantity: parseFloat(li.quantity) || 1,
        unitPrice: Math.round(parseFloat(li.unitPrice) * 100),
        taxable: li.taxable,
      })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoices', invoiceId] });
      setEditing(false);
    },
  });

  const canEdit = invoice && !['paid', 'void'].includes(invoice.status);
  const canSend = invoice && !['paid', 'void'].includes(invoice.status);
  const canPay = invoice && invoice.status !== 'void' && invoice.amountDue > 0;
  const canVoid = invoice && !['paid', 'void'].includes(invoice.status) &&
    ['owner', 'admin'].includes(user?.role ?? '');

  return (
    <>
      <Dialog open={!!invoiceId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <DialogTitle>{invoice?.invoiceNumber ?? '...'}</DialogTitle>
              {invoice && <Badge variant={STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>}
            </div>
          </DialogHeader>

          {isLoading && (
            <div className="py-12 text-center text-muted-foreground">Loading invoice...</div>
          )}

          {invoice && (
            <div className="space-y-6">
              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {canEdit && !editing && (
                  <Button size="sm" variant="outline" onClick={startEdit}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                )}
                {canSend && !editing && (
                  <Button size="sm" variant="outline" onClick={() => sendInvoice()} loading={isSending}>
                    <Send className="h-3.5 w-3.5 mr-1.5" />
                    {invoice.status === 'draft' ? 'Mark as Sent' : 'Resend'}
                  </Button>
                )}
                {canPay && !editing && (
                  <Button size="sm" onClick={() => setShowPayment(true)}>
                    <DollarSign className="h-3.5 w-3.5 mr-1.5" />
                    Record Payment
                  </Button>
                )}
                {invoice.status === 'paid' && (
                  <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Paid {formatDate(invoice.paidAt)}
                  </div>
                )}
                <div className="flex-1" />
                {canVoid && !editing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm('Void this invoice? This cannot be undone.')) voidInvoice();
                    }}
                    loading={isVoiding}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Void
                  </Button>
                )}
              </div>

              {/* Edit form */}
              {editing && (
                <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-4">
                  <p className="text-sm font-semibold text-blue-800">Editing Invoice</p>

                  {/* Line items */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-blue-700 uppercase tracking-wide">Line Items</p>
                    {editItems.map((li, i) => (
                      <div key={i} className="grid grid-cols-[1fr_70px_90px_36px_28px] gap-2 items-end">
                        <Input
                          placeholder="Description"
                          value={li.description}
                          onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, description: e.target.value } : x))}
                        />
                        <Input
                          placeholder="Qty"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={li.quantity}
                          onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, quantity: e.target.value } : x))}
                        />
                        <Input
                          placeholder="Price ($)"
                          type="number"
                          min="0"
                          step="0.01"
                          value={li.unitPrice}
                          onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, unitPrice: e.target.value } : x))}
                        />
                        <div className="flex items-center justify-center h-9">
                          <input
                            type="checkbox"
                            checked={li.taxable}
                            onChange={(e) => setEditItems((p) => p.map((x, idx) => idx === i ? { ...x, taxable: e.target.checked } : x))}
                            title="Taxable"
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </div>
                        <button
                          onClick={() => setEditItems((p) => p.filter((_, idx) => idx !== i))}
                          disabled={editItems.length === 1}
                          className="h-9 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-30"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setEditItems((p) => [...p, { description: '', quantity: '1', unitPrice: '', taxable: true }])}
                      className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Line Item
                    </button>
                  </div>

                  {/* Due date + notes */}
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Due Date"
                      type="date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                    />
                    <div />
                  </div>
                  <Textarea
                    label="Notes"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                  />

                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => saveEdit()} loading={isSaving}>Save Changes</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Customer + dates */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg text-sm">
                <div>
                  <p className="font-semibold text-gray-900 text-base">
                    {invoice.customer.firstName} {invoice.customer.lastName}
                  </p>
                  {invoice.customer.email && (
                    <div className="flex items-center gap-1.5 text-gray-600 mt-1">
                      <Mail className="h-3.5 w-3.5" />
                      {invoice.customer.email}
                    </div>
                  )}
                  {invoice.customer.phone && (
                    <div className="flex items-center gap-1.5 text-gray-600 mt-0.5">
                      <Phone className="h-3.5 w-3.5" />
                      {invoice.customer.phone}
                    </div>
                  )}
                </div>
                <div className="text-right space-y-1 text-gray-600">
                  <div className="flex items-center justify-end gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Issued: {formatDate(invoice.issuedAt ?? invoice.createdAt)}
                  </div>
                  {invoice.dueDate && (
                    <div className={`flex items-center justify-end gap-1.5 ${invoice.status === 'overdue' ? 'text-red-600 font-medium' : ''}`}>
                      <Calendar className="h-3.5 w-3.5" />
                      Due: {formatDate(invoice.dueDate)}
                    </div>
                  )}
                </div>
              </div>

              {/* Line items */}
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-2">Line Items</p>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-gray-600">Description</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-16">Qty</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-24">Unit Price</th>
                        <th className="text-right px-4 py-2.5 font-medium text-gray-600 w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {invoice.lineItems.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3 text-gray-900">
                            {item.description}
                            {!item.taxable && (
                              <span className="ml-2 text-xs text-gray-400">(non-taxable)</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMoney(item.unitPrice)}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatMoney(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatMoney(invoice.subtotal)}</span>
                  </div>
                  {invoice.taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax</span>
                      <span>{formatMoney(invoice.taxAmount)}</span>
                    </div>
                  )}
                  {invoice.discountAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Discount</span>
                      <span>−{formatMoney(invoice.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-gray-900 border-t pt-1.5">
                    <span>Total</span>
                    <span>{formatMoney(invoice.total)}</span>
                  </div>
                  {invoice.amountPaid > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Paid</span>
                      <span>−{formatMoney(invoice.amountPaid)}</span>
                    </div>
                  )}
                  {invoice.amountDue > 0 && (
                    <div className="flex justify-between font-bold text-base border-t pt-1.5">
                      <span>Amount Due</span>
                      <span className="text-blue-700">{formatMoney(invoice.amountDue)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment history */}
              {invoice.payments.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Payment History</p>
                  <div className="space-y-2">
                    {invoice.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg text-sm">
                        <div>
                          <span className="font-medium text-green-900">{formatMoney(p.amount)}</span>
                          <span className="text-green-700 ml-2 capitalize">{p.method}</span>
                          {p.notes && <span className="text-green-600 ml-2">· {p.notes}</span>}
                        </div>
                        <span className="text-green-700">{formatDate(p.paidAt)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {invoice.notes && (
                <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                  <p className="font-medium text-gray-700 mb-1">Notes</p>
                  <p>{invoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {invoice && (
        <RecordPaymentModal
          invoice={showPayment ? { id: invoice.id, invoiceNumber: invoice.invoiceNumber, amountDue: invoice.amountDue } : null}
          onClose={() => {
            setShowPayment(false);
            qc.invalidateQueries({ queryKey: ['invoices', invoiceId] });
          }}
        />
      )}
    </>
  );
}
