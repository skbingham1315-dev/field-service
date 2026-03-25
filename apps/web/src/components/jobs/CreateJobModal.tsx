import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  Button, Input, Textarea, Select,
} from '@fsp/ui';
import { api } from '../../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateJobModal({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    customerId: '',
    serviceAddressId: '',
    technicianId: '',
    serviceType: 'pool',
    title: '',
    description: '',
    priority: 'normal',
    scheduledStart: '',
    scheduledEnd: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      const { data } = await api.get('/users?role=technician');
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
        technicianId: form.technicianId || undefined,
        scheduledStart: form.scheduledStart ? new Date(form.scheduledStart).toISOString() : undefined,
        scheduledEnd: form.scheduledEnd ? new Date(form.scheduledEnd).toISOString() : undefined,
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
    setForm({
      customerId: '', serviceAddressId: '', technicianId: '',
      serviceType: 'pool', title: '', description: '',
      priority: 'normal', scheduledStart: '', scheduledEnd: '',
    });
    setErrors({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Job</DialogTitle>
        </DialogHeader>

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

          <Select
            label="Assign Technician"
            value={form.technicianId}
            onChange={(e) => set('technicianId', e.target.value)}
            placeholder="Unassigned"
          >
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.firstName} {t.lastName}</option>
            ))}
          </Select>

          <div />

          <Input
            label="Scheduled Start"
            type="datetime-local"
            value={form.scheduledStart}
            onChange={(e) => set('scheduledStart', e.target.value)}
          />

          <Input
            label="Scheduled End"
            type="datetime-local"
            value={form.scheduledEnd}
            onChange={(e) => set('scheduledEnd', e.target.value)}
          />

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
