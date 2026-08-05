import { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus, ChevronDown, ChevronUp, BookOpen, X, Search, Briefcase } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea,
} from '@fsp/ui';
import { api } from '../../lib/api';
import { useToast } from '../Toast';
import { CustomerAutocomplete, type CustomerOption as Customer } from '../CustomerAutocomplete';

// ── Service Item Picker ─────────────────────────────────────────────────────

interface ServiceItem {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  taxable: boolean;
  category: string | null;
}

function ItemPickerPopover({
  onSelect,
  onClose,
}: {
  onSelect: (item: ServiceItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const { data: items = [] } = useQuery<ServiceItem[]>({
    queryKey: ['service-items', search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : '';
      const { data } = await api.get(`/service-items${params}`);
      return data.data;
    },
  });

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, ServiceItem[]>();
    for (const item of items) {
      const cat = item.category || 'Uncategorized';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [items]);

  return (
    <div className="absolute z-50 top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
      <div className="p-2 border-b border-gray-100 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-gray-400" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search catalog..."
          className="flex-1 text-sm outline-none"
        />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {items.length === 0 && (
          <p className="px-4 py-3 text-xs text-gray-400 text-center">
            {search ? 'No items match' : 'No catalog items yet — add them in Settings'}
          </p>
        )}
        {Array.from(grouped).map(([cat, catItems]) => (
          <div key={cat}>
            <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">{cat}</p>
            {catItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { onSelect(item); onClose(); }}
                className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.name}</p>
                  {item.description && <p className="text-xs text-gray-400 truncate max-w-[200px]">{item.description}</p>}
                </div>
                <span className="text-sm font-semibold text-gray-700 ml-2">${(item.unitPrice / 100).toFixed(2)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// CustomerAutocomplete imported from shared component

// ── Description Autocomplete (inline catalog suggestions) ───────────────────

function DescriptionAutocomplete({
  value,
  onChange,
  onSelectItem,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectItem: (item: ServiceItem) => void;
  error?: string;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: suggestions = [] } = useQuery<ServiceItem[]>({
    queryKey: ['service-items-autocomplete', value],
    queryFn: async () => {
      if (!value || value.length < 2) return [];
      const { data } = await api.get(`/service-items?search=${encodeURIComponent(value)}`);
      return data.data;
    },
    enabled: value.length >= 2 && focused,
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showSuggestions = focused && suggestions.length > 0 && value.length >= 2;

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        placeholder="Start typing to search catalog..."
        className={`w-full px-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
          error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
        } focus:ring-2`}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
      {showSuggestions && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto">
          {suggestions.map(item => (
            <button
              key={item.id}
              onMouseDown={(e) => { e.preventDefault(); onSelectItem(item); setFocused(false); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                {item.category && <p className="text-[10px] text-gray-400">{item.category}</p>}
              </div>
              <span className="text-sm font-semibold text-gray-600 ml-2 flex-shrink-0">${(item.unitPrice / 100).toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface NewCustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  taxable: boolean;
}

const emptyItem = (): LineItem => ({ description: '', quantity: '1', unitPrice: '', taxable: true });

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Main Modal ──────────────────────────────────────────────────────────────

export function CreateInvoiceModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [jobId, setJobId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyItem()]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCust, setNewCust] = useState<NewCustomerForm>({ firstName: '', lastName: '', email: '', phone: '' });
  const [newCustError, setNewCustError] = useState('');
  const [pickerOpenIdx, setPickerOpenIdx] = useState<number | null>(null);
  const [downPayType, setDownPayType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [downPayValue, setDownPayValue] = useState('');
  const [downPayDueDate, setDownPayDueDate] = useState('');

  // Fetch customers
  const { data: customersData } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/customers?limit=500');
      return data;
    },
    enabled: open,
  });
  const customers: Customer[] = customersData?.data ?? [];

  // Fetch jobs for selected customer
  const { data: jobsData } = useQuery({
    queryKey: ['customer-jobs', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/jobs?customerId=${customerId}&limit=50`);
      return data;
    },
    enabled: !!customerId,
  });
  const jobs: Array<{ id: string; title: string; status: string }> = jobsData?.data ?? [];

  // New customer mutation
  const { mutate: saveNewCustomer, isPending: savingCust } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/customers', newCust);
      return data.data as Customer;
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

  // Calculations
  const subtotalCents = Math.round(lineItems.reduce((sum, li) => {
    const q = parseFloat(li.quantity) || 0;
    const p = parseFloat(li.unitPrice) || 0;
    return sum + q * p;
  }, 0) * 100);

  const discountCents = (() => {
    if (discountType === 'none') return 0;
    const v = parseFloat(discountValue) || 0;
    if (discountType === 'percent') return Math.round(subtotalCents * (v / 100));
    return Math.round(v * 100);
  })();

  const totalAfterDiscount = subtotalCents - discountCents;

  const downPaymentAmountCents = (() => {
    if (downPayType === 'none') return undefined;
    const v = parseFloat(downPayValue) || 0;
    if (downPayType === 'percent') return Math.round(totalAfterDiscount * (v / 100));
    return Math.round(v * 100);
  })();

  const toast = useToast();
  const { mutate: createInvoice, isPending } = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        customerId,
        ...(jobId ? { jobId } : {}),
        lineItems: lineItems.map((li) => ({
          description: li.description,
          quantity: parseFloat(li.quantity) || 1,
          unitPrice: Math.round(parseFloat(li.unitPrice) * 100),
          taxable: li.taxable,
        })),
        dueDate: dueDate || undefined,
        notes: notes || undefined,
        ...(discountCents > 0 ? { discountAmount: discountCents } : {}),
      };
      if (downPaymentAmountCents != null) {
        payload.downPaymentAmount = downPaymentAmountCents;
        if (downPayDueDate) payload.downPaymentDueDate = downPayDueDate;
      }
      const { data } = await api.post('/invoices', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice created');
      handleClose();
    },
    onError: () => toast.error('Failed to create invoice'),
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!customerId) e.customerId = 'Select a customer';
    lineItems.forEach((li, i) => {
      if (!li.description.trim()) e[`desc-${i}`] = 'Description required';
      if (!li.unitPrice || parseFloat(li.unitPrice) <= 0) e[`price-${i}`] = 'Enter a price';
      if (parseFloat(li.quantity) <= 0) e[`qty-${i}`] = 'Must be > 0';
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) createInvoice();
  };

  const handleClose = () => {
    setCustomerId('');
    setJobId('');
    setLineItems([emptyItem()]);
    setDueDate('');
    setNotes('');
    setDiscountType('none');
    setDiscountValue('');
    setErrors({});
    setShowNewCustomer(false);
    setNewCust({ firstName: '', lastName: '', email: '', phone: '' });
    setNewCustError('');
    setPickerOpenIdx(null);
    setDownPayType('none');
    setDownPayValue('');
    setDownPayDueDate('');
    onClose();
  };

  const applyServiceItem = (idx: number, item: ServiceItem) => {
    setLineItems((prev) => prev.map((li, i) =>
      i === idx
        ? { ...li, description: item.name, unitPrice: (item.unitPrice / 100).toFixed(2), taxable: item.taxable }
        : li
    ));
  };

  const updateItem = (i: number, field: keyof LineItem, value: string | boolean) => {
    setLineItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, [field]: value } : li)));
  };

  const subtotal = subtotalCents / 100;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Customer Autocomplete */}
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <CustomerAutocomplete
                  value={customerId}
                  onChange={setCustomerId}
                  customers={customers}
                  error={errors.customerId}
                />
              </div>
              <button
                type="button"
                onClick={() => setShowNewCustomer((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
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
                  <Input placeholder="First Name *" value={newCust.firstName} onChange={(e) => setNewCust((p) => ({ ...p, firstName: e.target.value }))} />
                  <Input placeholder="Last Name *" value={newCust.lastName} onChange={(e) => setNewCust((p) => ({ ...p, lastName: e.target.value }))} />
                  <Input placeholder="Email" type="email" value={newCust.email} onChange={(e) => setNewCust((p) => ({ ...p, email: e.target.value }))} />
                  <Input placeholder="Phone" type="tel" value={newCust.phone} onChange={(e) => setNewCust((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                {newCustError && <p className="text-xs text-red-600">{newCustError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNewCustomer} loading={savingCust}>Save Customer</Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowNewCustomer(false)}>Cancel</Button>
                </div>
              </div>
            )}
          </div>

          {/* Job Attachment (shows when customer selected) */}
          {customerId && jobs.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Briefcase className="h-3.5 w-3.5 inline mr-1" />
                Link to Job <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No job linked</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.status.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Due date */}
          <Input
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />

          {/* Line items */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Line Items *</p>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={i} className="relative">
                  <div className="grid grid-cols-[1fr_70px_90px_36px_32px_32px] gap-1.5 items-end">
                    <DescriptionAutocomplete
                      value={li.description}
                      onChange={(v) => updateItem(i, 'description', v)}
                      onSelectItem={(item) => applyServiceItem(i, item)}
                      error={errors[`desc-${i}`]}
                    />
                    <Input
                      placeholder="Qty"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={li.quantity}
                      onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                      error={errors[`qty-${i}`]}
                    />
                    <Input
                      placeholder="Price $"
                      type="number"
                      min="0"
                      step="0.01"
                      value={li.unitPrice}
                      onChange={(e) => updateItem(i, 'unitPrice', e.target.value)}
                      error={errors[`price-${i}`]}
                    />
                    <div className="flex items-center justify-center h-9" title="Taxable">
                      <input
                        type="checkbox"
                        checked={li.taxable}
                        onChange={(e) => updateItem(i, 'taxable', e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 accent-blue-600"
                      />
                    </div>
                    <button
                      onClick={() => setPickerOpenIdx(pickerOpenIdx === i ? null : i)}
                      title="Pick from catalog"
                      className="h-9 w-8 flex items-center justify-center rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <BookOpen className="h-4 w-4 text-blue-400" />
                    </button>
                    <button
                      onClick={() => setLineItems((p) => p.filter((_, idx) => idx !== i))}
                      disabled={lineItems.length === 1}
                      className="h-9 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                  {pickerOpenIdx === i && (
                    <ItemPickerPopover
                      onSelect={(item) => applyServiceItem(i, item)}
                      onClose={() => setPickerOpenIdx(null)}
                    />
                  )}
                </div>
              ))}
              <p className="text-[11px] text-gray-400 pl-1">Tax = checkbox | Catalog = book icon</p>
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

          {/* Totals preview */}
          <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-1.5">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {/* Discount */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-gray-600">Discount</span>
                <div className="flex gap-1">
                  {(['none', 'percent', 'fixed'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => { setDiscountType(t); setDiscountValue(''); }}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        discountType === t
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                      }`}
                    >
                      {t === 'none' ? 'None' : t === 'percent' ? '%' : '$'}
                    </button>
                  ))}
                </div>
                {discountType !== 'none' && (
                  <input
                    type="number"
                    min="0"
                    step={discountType === 'percent' ? '1' : '0.01'}
                    max={discountType === 'percent' ? '100' : undefined}
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === 'percent' ? '10' : '50.00'}
                    className="w-20 px-2 py-0.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>
              <span className={discountCents > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                {discountCents > 0 ? `-$${(discountCents / 100).toFixed(2)}` : '$0.00'}
              </span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900 pt-1.5 border-t border-gray-200">
              <span>Total (excl. tax)</span>
              <span>${(totalAfterDiscount / 100).toFixed(2)}</span>
            </div>
            <p className="text-[11px] text-gray-400">Tax calculated automatically based on your tenant rate</p>
          </div>

          {/* Down payment */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Down Payment</p>
            <div className="flex gap-2 mb-2">
              {(['none', 'percent', 'fixed'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setDownPayType(t); setDownPayValue(''); }}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    downPayType === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {t === 'none' ? 'None' : t === 'percent' ? '% of total' : 'Fixed $'}
                </button>
              ))}
            </div>
            {downPayType !== 'none' && (
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={downPayType === 'percent' ? 'Percentage (%)' : 'Amount ($)'}
                  type="number"
                  min="0"
                  step={downPayType === 'percent' ? '1' : '0.01'}
                  max={downPayType === 'percent' ? '100' : undefined}
                  value={downPayValue}
                  onChange={(e) => setDownPayValue(e.target.value)}
                  placeholder={downPayType === 'percent' ? '50' : '500.00'}
                />
                <Input
                  label="Down Payment Due Date"
                  type="date"
                  value={downPayDueDate}
                  onChange={(e) => setDownPayDueDate(e.target.value)}
                />
              </div>
            )}
            {downPayType !== 'none' && downPaymentAmountCents != null && downPaymentAmountCents > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                Down payment: ${(downPaymentAmountCents / 100).toFixed(2)} — remaining balance due after
              </p>
            )}
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
