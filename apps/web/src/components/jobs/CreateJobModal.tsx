import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, Select,
} from '@fsp/ui';
import { api } from '../../lib/api';
import { Upload, Sparkles, X, Calendar, Clock, Plus, MapPin, Building2, Home, AlertCircle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateJobModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    customerId: '',
    serviceAddressId: '',
    serviceType: 'pool',
    title: '',
    description: '',
    priority: 'normal',
    scheduledStart: '',
    scheduledEnd: '',
  });
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [scheduleMode, setScheduleMode] = useState<'open' | 'now'>('open');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiHint, setAiHint] = useState<{ customerName?: string; address?: string; addressMatched?: boolean } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({
    street: '', city: '', state: '', zip: '', label: '', isPrimary: false, locationType: '' as '' | 'job_site' | 'primary',
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setAddr = (k: string, v: string | boolean) => setNewAddr((a) => ({ ...a, [k]: v }));

  const addAddressMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/customers/${form.customerId}/addresses`, {
        street: newAddr.street.trim(),
        city: newAddr.city.trim(),
        state: newAddr.state.trim(),
        zip: newAddr.zip.trim(),
        label: newAddr.label.trim() || undefined,
        isPrimary: newAddr.locationType === 'primary',
      });
      return data.data as { id: string; street: string; city: string };
    },
    onSuccess: (addr) => {
      qc.invalidateQueries({ queryKey: ['customers', 'all'] });
      set('serviceAddressId', addr.id);
      setShowAddAddress(false);
      setNewAddr({ street: '', city: '', state: '', zip: '', label: '', isPrimary: false, locationType: '' });
    },
  });

  const { data: custData } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data } = await api.get('/customers?limit=200');
      return data;
    },
    enabled: open,
  });
  const customers: Array<{ id: string; firstName: string; lastName: string; serviceAddresses: Array<{ id: string; label?: string; street: string; city: string; isPrimary: boolean }> }> =
    custData?.data ?? [];

  const { data: techData } = useQuery({
    queryKey: ['users', 'technicians'],
    queryFn: async () => {
      const { data } = await api.get('/users?hasRole=technician');
      return data;
    },
    enabled: open,
  });
  const technicians: Array<{ id: string; firstName: string; lastName: string }> = techData?.data ?? [];

  const selectedCustomer = customers.find((c) => c.id === form.customerId);
  const addresses = selectedCustomer?.serviceAddresses ?? [];

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/jobs', {
        ...form,
        scheduledStart: scheduleMode === 'now' && form.scheduledStart ? new Date(form.scheduledStart).toISOString() : undefined,
        scheduledEnd: scheduleMode === 'now' && form.scheduledEnd ? new Date(form.scheduledEnd).toISOString() : undefined,
        technicianId: selectedTechIds[0] || undefined,
        technicianIds: selectedTechIds.length > 0 ? selectedTechIds : undefined,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] });
      handleClose();
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customerId) e.customerId = 'Required';
    if (!form.serviceAddressId) e.serviceAddressId = 'Required';
    if (!form.title.trim()) e.title = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleClose = () => {
    setForm({ customerId: '', serviceAddressId: '', serviceType: 'pool', title: '', description: '', priority: 'normal', scheduledStart: '', scheduledEnd: '' });
    setSelectedTechIds([]);
    setErrors({});
    setAiHint(null);
    setScheduleMode('open');
    setShowAddAddress(false);
    setNewAddr({ street: '', city: '', state: '', zip: '', label: '', isPrimary: false, locationType: '' });
    onClose();
  };

  const toggleTech = (id: string) =>
    setSelectedTechIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const parseFile = useCallback(async (file: File) => {
    setAiParsing(true);
    setAiHint(null);
    setAiError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post('/jobs/ai-parse', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const extracted = data.data as Record<string, string>;

      // Pre-fill form fields
      const updates: Partial<typeof form> = {};
      if (extracted.title) updates.title = extracted.title;
      if (extracted.description) updates.description = extracted.description;
      if (extracted.serviceType && ['pool', 'pest_control', 'turf', 'handyman'].includes(extracted.serviceType)) {
        updates.serviceType = extracted.serviceType;
      }
      if (extracted.priority && ['low', 'normal', 'high', 'urgent'].includes(extracted.priority)) {
        updates.priority = extracted.priority;
      }
      if (extracted.scheduledDate) {
        const time = extracted.scheduledTime ?? '09:00';
        updates.scheduledStart = `${extracted.scheduledDate}T${time}`;
        setScheduleMode('now');
      }
      setForm((f) => ({ ...f, ...updates }));

      // Try to match customer by name — multi-strategy fuzzy match
      let matchedCustomer: typeof customers[0] | undefined;
      if (extracted.customerName) {
        const raw = extracted.customerName.toLowerCase().trim();
        // Tokenize: split on spaces and hyphens so "Sosa-Regan" → ["sosa","regan"]
        const tokens = raw.split(/[\s\-]+/).filter(Boolean);

        const score = (c: typeof customers[0]) => {
          const full = `${c.firstName} ${c.lastName}`.toLowerCase();
          const first = c.firstName.toLowerCase();
          const last = c.lastName.toLowerCase();
          const lastTokens = last.split(/[\s\-]+/);
          if (full === raw) return 100;                          // exact full match
          if (full.includes(raw) || raw.includes(full)) return 90; // substring either way
          if (lastTokens.some(lt => tokens.includes(lt))) return 70; // last name token match
          if (tokens.includes(first)) return 60;                // first name token match
          // partial: any extracted token matches any customer name token
          const custTokens = full.split(/[\s\-]+/);
          const overlap = tokens.filter(t => t.length > 2 && custTokens.some(ct => ct.includes(t) || t.includes(ct)));
          if (overlap.length >= 2) return 50;
          if (overlap.length === 1 && tokens.length === 1) return 40;
          return 0;
        };

        const scored = customers.map(c => ({ c, s: score(c) })).filter(x => x.s >= 40);
        scored.sort((a, b) => b.s - a.s);
        matchedCustomer = scored[0]?.c;
      }

      const extractedAddress = [extracted.street, extracted.city, extracted.state, extracted.zip].filter(Boolean).join(', ');
      const hasAddress = !!(extracted.street || extracted.city);
      let addressMatched = false;

      if (matchedCustomer) {
        // Try to find the extracted address among the customer's service addresses
        let matchedAddr = matchedCustomer.serviceAddresses.find((a) => {
          if (!extracted.street) return false;
          return a.street.toLowerCase().includes(extracted.street.toLowerCase().slice(0, 8)) ||
            extracted.street.toLowerCase().includes(a.street.toLowerCase().slice(0, 8));
        });
        // Fall back to primary address if no street match
        if (!matchedAddr) matchedAddr = matchedCustomer.serviceAddresses.find((a) => a.isPrimary) ?? matchedCustomer.serviceAddresses[0];
        if (matchedAddr) addressMatched = true;

        setForm((f) => ({
          ...f, ...updates,
          customerId: matchedCustomer!.id,
          serviceAddressId: matchedAddr?.id ?? '',
        }));
      } else {
        setForm((f) => ({ ...f, ...updates }));
      }

      setAiHint({
        customerName: extracted.customerName,
        address: hasAddress ? extractedAddress : undefined,
        addressMatched,
      });

      // If address was found but not matched, pre-fill the new address form so user can quickly save it
      if (hasAddress && !addressMatched) {
        setNewAddr(a => ({
          ...a,
          street: extracted.street ?? '',
          city: extracted.city ?? '',
          state: extracted.state ?? '',
          zip: extracted.zip ?? '',
        }));
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? 'AI parsing failed';
      const isCredits = msg.toLowerCase().includes('credit') || msg.toLowerCase().includes('balance');
      setAiError(isCredits
        ? 'AI credits are out — top up at console.anthropic.com to use this feature. Fill in manually below.'
        : 'Could not read the file — fill in manually below.');
    } finally {
      setAiParsing(false);
    }
  }, [customers]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Job</DialogTitle>
        </DialogHeader>

        {/* AI File Drop Zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !aiParsing && fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
          {aiParsing ? (
            <div className="flex flex-col items-center gap-2 text-blue-600">
              <Sparkles className="h-7 w-7 animate-pulse" />
              <p className="text-sm font-medium">AI is reading your file...</p>
            </div>
          ) : aiError ? (
            <div className="flex flex-col items-center gap-2 text-amber-700">
              <AlertCircle className="h-7 w-7" />
              <p className="text-sm font-medium text-center">{aiError}</p>
              <p className="text-xs text-gray-400">Click to try another file</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-500">
              <Upload className="h-7 w-7" />
              <p className="text-sm font-medium">Drop a photo or work order to auto-fill</p>
              <p className="text-xs text-gray-400">JPG, PNG, WEBP, PDF · AI will extract job details</p>
            </div>
          )}
        </div>

        {/* AI result hint */}
        {aiHint && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <Sparkles className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
            <div className="flex-1 space-y-0.5">
              <span className="font-medium">AI filled in what it found.</span>
              {aiHint.customerName && <span> Customer: <strong>{aiHint.customerName}</strong>.</span>}
              {aiHint.address && !aiHint.addressMatched && (
                <span className="text-amber-700"> Address found (<strong>{aiHint.address}</strong>) — not on file yet, select or add below.</span>
              )}
              {aiHint.address && aiHint.addressMatched && (
                <span> Address: <strong>{aiHint.address}</strong>.</span>
              )}
              <span className="text-blue-600"> Review and adjust below.</span>
            </div>
            <button onClick={() => setAiHint(null)} className="text-blue-400 hover:text-blue-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Select
              label="Customer *"
              value={form.customerId}
              onChange={(e) => { set('customerId', e.target.value); set('serviceAddressId', ''); }}
              placeholder="Select customer..."
              error={errors.customerId}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </Select>
          </div>

          <div className="col-span-2 space-y-2">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select
                  label="Service Address *"
                  value={form.serviceAddressId}
                  onChange={(e) => set('serviceAddressId', e.target.value)}
                  placeholder="Select address..."
                  disabled={!form.customerId}
                  error={errors.serviceAddressId}
                >
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label ? `${a.label} — ` : ''}{a.street}, {a.city}
                    </option>
                  ))}
                </Select>
              </div>
              {form.customerId && !showAddAddress && (
                <button
                  type="button"
                  onClick={() => setShowAddAddress(true)}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap mb-0.5"
                >
                  <Plus className="h-3.5 w-3.5" /> New Address
                </button>
              )}
            </div>

            {/* Inline add address form */}
            {showAddAddress && (
              <div className="border border-blue-200 bg-blue-50/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" /> Add New Address
                  </p>
                  <button onClick={() => setShowAddAddress(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Location type */}
                <div>
                  <p className="text-xs text-gray-600 mb-2 font-medium">What type of address is this?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAddr('locationType', 'job_site')}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-colors ${
                        newAddr.locationType === 'job_site'
                          ? 'border-blue-500 bg-blue-50 text-blue-800'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                      }`}
                    >
                      <Building2 className="h-5 w-5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">Job Site</p>
                        <p className="text-xs opacity-70">Property, rental, or work location</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddr('locationType', 'primary')}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 text-left transition-colors ${
                        newAddr.locationType === 'primary'
                          ? 'border-blue-500 bg-blue-50 text-blue-800'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'
                      }`}
                    >
                      <Home className="h-5 w-5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">Primary Address</p>
                        <p className="text-xs opacity-70">Customer's main / billing address</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-medium">Label / Nickname (optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Back unit, Building B, Suite 204"
                    value={newAddr.label}
                    onChange={e => setAddr('label', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1 font-medium">Street *</label>
                  <input
                    type="text"
                    placeholder="123 Main St"
                    value={newAddr.street}
                    onChange={e => setAddr('street', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-xs text-gray-600 mb-1 font-medium">City *</label>
                    <input
                      type="text"
                      placeholder="Scottsdale"
                      value={newAddr.city}
                      onChange={e => setAddr('city', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">State</label>
                    <input
                      type="text"
                      placeholder="AZ"
                      maxLength={2}
                      value={newAddr.state}
                      onChange={e => setAddr('state', e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1 font-medium">Zip</label>
                    <input
                      type="text"
                      placeholder="85255"
                      value={newAddr.zip}
                      onChange={e => setAddr('zip', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <Button
                  className="w-full"
                  loading={addAddressMutation.isPending}
                  disabled={!newAddr.street.trim() || !newAddr.city.trim() || !newAddr.locationType}
                  onClick={() => addAddressMutation.mutate()}
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Save Address & Select It
                </Button>
                {!newAddr.locationType && (
                  <p className="text-xs text-center text-amber-600">Select Job Site or Primary Address above to continue</p>
                )}
              </div>
            )}
          </div>

          <div className="col-span-2">
            <Input
              label="Job Title *"
              placeholder="e.g. Monthly pool cleaning"
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              error={errors.title}
            />
          </div>

          <Select
            label="Service Type"
            value={form.serviceType}
            onChange={(e) => set('serviceType', e.target.value)}
          >
            <option value="pool">Pool</option>
            <option value="pest_control">Pest Control</option>
            <option value="turf">Turf</option>
            <option value="handyman">Handyman</option>
          </Select>

          <Select
            label="Priority"
            value={form.priority}
            onChange={(e) => set('priority', e.target.value)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>

          <div className="col-span-2">
            <p className="text-sm font-medium text-gray-700 mb-1.5">Assign Technicians</p>
            {technicians.length === 0 ? (
              <p className="text-sm text-gray-400">No technicians available</p>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {technicians.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedTechIds.includes(t.id)}
                      onChange={() => toggleTech(t.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-800">{t.firstName} {t.lastName}</span>
                    {selectedTechIds[0] === t.id && (
                      <span className="ml-auto text-xs text-blue-600 font-medium">Lead</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Schedule toggle */}
          <div className="col-span-2">
            <p className="text-sm font-medium text-gray-700 mb-2">Scheduling</p>
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setScheduleMode('open')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  scheduleMode === 'open'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                <Clock className="h-4 w-4" />
                Leave Open
              </button>
              <button
                type="button"
                onClick={() => setScheduleMode('now')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  scheduleMode === 'now'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
              >
                <Calendar className="h-4 w-4" />
                Schedule Now
              </button>
            </div>
            {scheduleMode === 'open' && (
              <p className="text-xs text-gray-400">Job will be created without a date — schedule it later from the job detail.</p>
            )}
            {scheduleMode === 'now' && (
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start"
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(e) => set('scheduledStart', e.target.value)}
                />
                <Input
                  label="End"
                  type="datetime-local"
                  value={form.scheduledEnd}
                  onChange={(e) => set('scheduledEnd', e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="col-span-2">
            <Textarea
              label="Description"
              placeholder="Job details, special instructions..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={() => validate() && mutate()} loading={isPending}>Create Job</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
