import { useState, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, Select,
} from '@fsp/ui';
import { api } from '../../lib/api';
import { Upload, Sparkles, X, Calendar, Clock } from 'lucide-react';

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
  const [aiHint, setAiHint] = useState<{ customerName?: string; address?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
    onClose();
  };

  const toggleTech = (id: string) =>
    setSelectedTechIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const parseFile = useCallback(async (file: File) => {
    setAiParsing(true);
    setAiHint(null);
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

      // Try to match customer by name
      if (extracted.customerName) {
        const lower = extracted.customerName.toLowerCase();
        const match = customers.find((c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(lower) ||
          lower.includes(c.firstName.toLowerCase())
        );
        if (match) {
          setForm((f) => ({ ...f, ...updates, customerId: match.id }));
          const primary = match.serviceAddresses.find((a) => a.isPrimary) ?? match.serviceAddresses[0];
          if (primary) setForm((f) => ({ ...f, ...updates, customerId: match.id, serviceAddressId: primary.id }));
        }
      }

      // Show address hint if extracted but no match
      const hasAddress = extracted.street || extracted.city;
      setAiHint({
        customerName: extracted.customerName,
        address: hasAddress
          ? [extracted.street, extracted.city, extracted.state, extracted.zip].filter(Boolean).join(', ')
          : undefined,
      });
    } catch {
      // silently fail — form stays blank for manual entry
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
            <div className="flex-1">
              <span className="font-medium">AI filled in what it found.</span>
              {aiHint.customerName && <span> Customer: <strong>{aiHint.customerName}</strong>.</span>}
              {aiHint.address && <span> Address: <strong>{aiHint.address}</strong>.</span>}
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

          <div className="col-span-2">
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
