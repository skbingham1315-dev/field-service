import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button, Input } from '@fsp/ui';
import { api } from '../../lib/api';

interface Props {
  onClose: () => void;
}

export function CreateCustomerModal({ onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    notes: '',
  });
  const [address, setAddress] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
    label: 'Home',
    isPrimary: true,
  });
  const [includeAddress, setIncludeAddress] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setAddr = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddress((a) => ({ ...a, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { ...form };
      if (includeAddress && address.street && address.city && address.state && address.zip) {
        payload.serviceAddresses = [address];
      }
      const { data } = await api.post('/customers', payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      setError(err.response?.data?.message ?? 'Failed to create customer');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError('First and last name are required');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">New Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <Input value={form.firstName} onChange={set('firstName')} placeholder="Jane" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <Input value={form.lastName} onChange={set('lastName')} placeholder="Smith" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="jane@example.com" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="(555) 123-4567" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any notes about this customer..."
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="border-t pt-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAddress}
                onChange={(e) => setIncludeAddress(e.target.checked)}
                className="rounded"
              />
              Add service address
            </label>
          </div>

          {includeAddress && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <Input value={address.label} onChange={setAddr('label')} placeholder="Home" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Street *</label>
                  <Input value={address.street} onChange={setAddr('street')} placeholder="123 Main St" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City *</label>
                  <Input value={address.city} onChange={setAddr('city')} placeholder="Austin" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">State *</label>
                  <Input value={address.state} onChange={setAddr('state')} placeholder="TX" maxLength={2} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">ZIP *</label>
                  <Input value={address.zip} onChange={setAddr('zip')} placeholder="78701" />
                </div>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating...' : 'Create Customer'}
          </Button>
        </div>
      </div>
    </div>
  );
}
