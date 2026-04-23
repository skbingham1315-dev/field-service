import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, Select,
} from '@fsp/ui';
import { api } from '../../lib/api';

interface NewCustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string; // dollars, converted to cents on submit
  taxable: boolean;
}

const emptyItem = (): LineItem => ({ description: '', quantity: '1', unitPrice: '', taxable: true });

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateInvoiceModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyItem()]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState<NewCustomerForm>({ firstName: '', lastName: '', email: '', phone: '' });
  const [newCustError, setNewCustError] = useState('');

  const { data: customersData } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/customers?limit=200');
      return data;
    },
    enabled: open,
  });
  const customers: Array<{ id: string; firstName: string; lastName: string }> =
    customersData?.data ?? [];

  const { mutate: saveNewCustomer, isPending: savingCust } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/customers', newCust);
      return data.data as { id: string; firstName: string; lastName: string };
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['customers', 'all'] });
      setCustomerId(created.id);
      setShowNewCustomer(false);
      setNewCust({ firstName: '', lastName: '', email: '', phone: '' });
      setNewCustError('');
    },
    onError: (e: any) => setNewCustError(e.response?.data?.message ?? 'Failed to create customer'),
  });

  const handleSaveNewCustomer = () => {
    if (!newCust.firstName.trim() || !newCust.lastName.trim()) {
      setNewCustError('First and last name are required');
      return;
    }
    setNewCustError('');
    saveNewCustomer();
  };

  const { mutate: createInvoice, isPending } = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId,
        lineItems: lineItems.map((li) => ({
          description: li.description,
          quantity: parseFloat(li.quantity) || 1,
          unitPrice: Math.round(parseFloat(li.unitPrice) * 100),
          taxable: li.taxable,
        })),
        dueDate: dueDate || undefined,
        notes: notes || undefined,
      };
      const { data } = await api.post('/invoices', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      handleClose();
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = 'Customer is required';
    lineItems.forEach((li, i) => {
      if (!li.description) e[`desc-${i}`] = 'Required';
      if (!li.unitPrice || parseFloat(li.unitPrice) <= 0) e[`price-${i}`] = 'Required';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) createInvoice();
  };

  const handleClose = () => {
    setCustomerId('');
    setLineItems([emptyItem()]);
    setDueDate('');
    setNotes('');
    setErrors({});
    setShowNewCustomer(false);
    setNewCust({ firstName: '', lastName: '', email: '', phone: '' });
    setNewCustError('');
    onClose();
  };

  const updateItem = (i: number, field: keyof LineItem, value: string | boolean) => {
    setLineItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, [field]: value } : li)));
  };

  const subtotal = lineItems.reduce((sum, li) => {
    const q = parseFloat(li.quantity) || 0;
    const p = parseFloat(li.unitPrice) || 0;
    return sum + q * p;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer */}
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Customer *"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  placeholder="Select a customer..."
                  error={errors.customerId}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCustomer((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap mb-0.5"
              >
                <UserPlus className="h-4 w-4" />
                New
                {showNewCustomer ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>

            {showNewCustomer && (
              <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">New Customer</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="First Name *"
                    value={newCust.firstName}
                    onChange={(e) => setNewCust((p) => ({ ...p, firstName: e.target.value }))}
                  />
                  <Input
                    placeholder="Last Name *"
                    value={newCust.lastName}
                    onChange={(e) => setNewCust((p) => ({ ...p, lastName: e.target.value }))}
                  />
                  <Input
                    placeholder="Email"
                    type="email"
                    value={newCust.email}
                    onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))}
                  />
                  <Input
                    placeholder="Phone"
                    type="tel"
                    value={newCust.phone}
                    onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                {newCustError && <p className="text-xs text-red-600">{newCustError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNewCustomer} loading={savingCust}>
                    Save Customer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewCustomer(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Due date */}
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          {/* Line items */}
          <div>
            <p className="text-sm font-medium text-foreground mb-2">Line Items *</p>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_100px_40px_32px] gap-2 items-end">
                  <Input
                    placeholder="Description"
                    value={li.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    error={errors[`desc-${i}`]}
                  />
                  <Input
                    placeholder="Qty"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={li.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                  />
                  <Input
                    placeholder="Price ($)"
                    type="number"
                    min="0"
                    step="0.01"
                    value={li.unitPrice}
                    onChange={(e) => updateItem(i, 'unitPrice', e.target.value)}
                    error={errors[`price-${i}`]}
                  />
                  <div className="flex items-center justify-center h-9">
                    <input
                      type="checkbox"
                      checked={li.taxable}
                      onChange={(e) => updateItem(i, 'taxable', e.target.checked)}
                      title="Taxable"
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setLineItems((p) => p.filter((_, idx) => idx !== i))}
                    disabled={lineItems.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-gray-400" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-1 text-xs text-gray-400 pl-1">
                <span className="mr-auto">Checkbox = taxable</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setLineItems((p) => [...p, emptyItem()])}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Line Item
            </Button>
          </div>

          {/* Subtotal preview */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t">
              <span>Total (excl. tax)</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Notes */}
          <Textarea
            label="Notes"
            placeholder="Payment terms, additional info..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={isPending}>Create Invoice</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
