import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Phone, Mail, MapPin, Edit2, Trash2, Plus, MessageSquare,
  Briefcase, FileText, Save, Send,
} from 'lucide-react';
import { Button, Badge, Input } from '@fsp/ui';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';

type Tab = 'profile' | 'addresses' | 'jobs' | 'invoices' | 'sms';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  lead: 'bg-blue-100 text-blue-700',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

const INV_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-600',
  void: 'bg-gray-100 text-gray-500',
  partial: 'bg-yellow-100 text-yellow-700',
};

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags: string[];
  status: string;
  createdAt: string;
  serviceAddresses: ServiceAddress[];
  jobs?: Job[];
  invoices?: Invoice[];
}

interface ServiceAddress {
  id: string;
  label?: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  isPrimary: boolean;
  accessInstructions?: string;
}

interface Job {
  id: string;
  title: string;
  status: string;
  scheduledStart?: string;
  serviceAddress?: { street: string; city: string };
  technician?: { firstName: string; lastName: string };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  amountDue: number;
  dueDate?: string;
  createdAt: string;
}

interface SmsMsg {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  createdAt: string;
  from: string;
  to: string;
}

interface Props {
  customerId: string;
  onClose: () => void;
}

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function CustomerDetailModal({ customerId, onClose }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('profile');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [smsMessage, setSmsMessage] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  const [addingAddress, setAddingAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({ label: 'Home', street: '', city: '', state: '', zip: '', isPrimary: false });

  const { data, isLoading } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/customers/${customerId}`);
      return data.data as Customer;
    },
  });

  const customer = data;

  const { data: smsHistory, refetch: refetchSms } = useQuery({
    queryKey: ['customer-sms', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/customers/${customerId}/sms`);
      return data.data as SmsMsg[];
    },
    enabled: tab === 'sms',
    refetchInterval: tab === 'sms' ? 10000 : false,
  });

  useEffect(() => {
    if (tab !== 'sms' || !customer?.id) return;
    const socket = getSocket();
    const handler = (event: { customerId: string }) => {
      if (event.customerId === customer.id) {
        refetchSms();
      }
    };
    socket.on('sms:received', handler);
    return () => {
      socket.off('sms:received', handler);
    };
  }, [tab, customer?.id, refetchSms]);

  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Customer>) => {
      const { data } = await api.patch(`/customers/${customerId}`, payload);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      setEditing(false);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/customers/${customerId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      onClose();
    },
  });

  const addAddressMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/customers/${customerId}/addresses`, newAddr);
      return data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      setAddingAddress(false);
      setNewAddr({ label: 'Home', street: '', city: '', state: '', zip: '', isPrimary: false });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: string) => {
      await api.delete(`/customers/${customerId}/addresses/${addressId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
    },
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (addressId: string) => {
      await api.patch(`/customers/${customerId}/addresses/${addressId}`, { isPrimary: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
    },
  });

  const smsMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/customers/${customerId}/sms`, { message: smsMessage });
      return data;
    },
    onSuccess: () => {
      setSmsSent(true);
      setSmsMessage('');
      refetchSms();
    },
  });

  const startEdit = () => {
    if (!customer) return;
    setEditForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email ?? '',
      phone: customer.phone ?? '',
      notes: customer.notes ?? '',
      status: customer.status,
    });
    setEditing(true);
  };

  const setEF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditForm((f) => ({ ...f, [k]: e.target.value }));

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'profile', label: 'Profile', icon: Edit2 },
    { id: 'addresses', label: 'Addresses', icon: MapPin },
    { id: 'jobs', label: 'Jobs', icon: Briefcase },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'sms', label: 'SMS', icon: MessageSquare },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          {isLoading || !customer ? (
            <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
          ) : (
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold">
                {customer.firstName[0]}{customer.lastName[0]}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{customer.firstName} {customer.lastName}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[customer.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {customer.status}
                </span>
              </div>
            </div>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading || !customer ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              {/* PROFILE TAB */}
              {tab === 'profile' && (
                <div className="space-y-6">
                  {editing ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                          <Input value={editForm.firstName ?? ''} onChange={setEF('firstName')} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                          <Input value={editForm.lastName ?? ''} onChange={setEF('lastName')} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <Input type="email" value={editForm.email ?? ''} onChange={setEF('email')} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <Input type="tel" value={editForm.phone ?? ''} onChange={setEF('phone')} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                        <select
                          value={editForm.status ?? 'active'}
                          onChange={setEF('status')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                          <option value="lead">Lead</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                          value={editForm.notes ?? ''}
                          onChange={setEF('notes')}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => updateMutation.mutate(editForm)}
                          disabled={updateMutation.isPending}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {updateMutation.isPending ? 'Saving...' : 'Save'}
                        </Button>
                        <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Email</p>
                          {customer.email
                            ? <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"><Mail className="h-4 w-4" />{customer.email}</a>
                            : <p className="text-sm text-gray-400">—</p>
                          }
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Phone</p>
                          {customer.phone
                            ? <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"><Phone className="h-4 w-4" />{customer.phone}</a>
                            : <p className="text-sm text-gray-400">—</p>
                          }
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Customer Since</p>
                          <p className="text-sm">{new Date(customer.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {customer.tags.length > 0
                              ? customer.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)
                              : <p className="text-sm text-gray-400">None</p>
                            }
                          </div>
                        </div>
                      </div>
                      {customer.notes && (
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">Notes</p>
                          <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{customer.notes}</p>
                        </div>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" onClick={startEdit}>
                          <Edit2 className="h-4 w-4 mr-1" />Edit
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (confirm(`Deactivate ${customer.firstName} ${customer.lastName}?`)) {
                              deactivateMutation.mutate();
                            }
                          }}
                          className="text-red-600 hover:bg-red-50 border-red-200"
                          disabled={deactivateMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />Deactivate
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ADDRESSES TAB */}
              {tab === 'addresses' && (
                <div className="space-y-4">
                  {customer.serviceAddresses.map((addr) => (
                    <div key={addr.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-sm">{addr.label || 'Address'}</span>
                          {addr.isPrimary && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Primary</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {!addr.isPrimary && (
                            <button
                              onClick={() => setPrimaryMutation.mutate(addr.id)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Set primary
                            </button>
                          )}
                          <button
                            onClick={() => {
                              if (confirm('Delete this address?')) deleteAddressMutation.mutate(addr.id);
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700">{addr.street}</p>
                      <p className="text-sm text-gray-600">{addr.city}, {addr.state} {addr.zip}</p>
                      {addr.accessInstructions && (
                        <p className="text-xs text-gray-500 italic">Access: {addr.accessInstructions}</p>
                      )}
                    </div>
                  ))}

                  {addingAddress ? (
                    <div className="border-2 border-dashed border-blue-300 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium text-gray-700">New Address</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <Input
                            placeholder="Label (e.g. Home, Office)"
                            value={newAddr.label}
                            onChange={(e) => setNewAddr((a) => ({ ...a, label: e.target.value }))}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            placeholder="Street address *"
                            value={newAddr.street}
                            onChange={(e) => setNewAddr((a) => ({ ...a, street: e.target.value }))}
                          />
                        </div>
                        <Input
                          placeholder="City *"
                          value={newAddr.city}
                          onChange={(e) => setNewAddr((a) => ({ ...a, city: e.target.value }))}
                        />
                        <Input
                          placeholder="State *"
                          value={newAddr.state}
                          onChange={(e) => setNewAddr((a) => ({ ...a, state: e.target.value }))}
                          maxLength={2}
                        />
                        <Input
                          placeholder="ZIP *"
                          value={newAddr.zip}
                          onChange={(e) => setNewAddr((a) => ({ ...a, zip: e.target.value }))}
                        />
                        <label className="flex items-center gap-2 text-sm text-gray-700 self-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newAddr.isPrimary}
                            onChange={(e) => setNewAddr((a) => ({ ...a, isPrimary: e.target.checked }))}
                          />
                          Set as primary
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={() => addAddressMutation.mutate()} disabled={addAddressMutation.isPending}>
                          {addAddressMutation.isPending ? 'Adding...' : 'Add Address'}
                        </Button>
                        <Button variant="outline" onClick={() => setAddingAddress(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingAddress(true)}
                      className="w-full border-2 border-dashed border-gray-300 rounded-lg p-4 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2 transition-colors"
                    >
                      <Plus className="h-4 w-4" />Add address
                    </button>
                  )}
                </div>
              )}

              {/* JOBS TAB */}
              {tab === 'jobs' && (
                <div className="space-y-3">
                  {(!customer.jobs || customer.jobs.length === 0) ? (
                    <p className="text-center text-gray-500 py-8">No jobs found</p>
                  ) : (
                    customer.jobs.map((job) => (
                      <div key={job.id} className="border rounded-lg p-4 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm text-gray-900">{job.title}</p>
                          {job.scheduledStart && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(job.scheduledStart).toLocaleDateString()} {new Date(job.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          )}
                          {job.technician && (
                            <p className="text-xs text-gray-500">Tech: {job.technician.firstName} {job.technician.lastName}</p>
                          )}
                          {job.serviceAddress && (
                            <p className="text-xs text-gray-400">{job.serviceAddress.street}, {job.serviceAddress.city}</p>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${JOB_STATUS_COLORS[job.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {job.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* INVOICES TAB */}
              {tab === 'invoices' && (
                <div className="space-y-3">
                  {(!customer.invoices || customer.invoices.length === 0) ? (
                    <p className="text-center text-gray-500 py-8">No invoices found</p>
                  ) : (
                    customer.invoices.map((inv) => (
                      <div key={inv.id} className="border rounded-lg p-4 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-sm text-gray-900">{inv.invoiceNumber}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {new Date(inv.createdAt).toLocaleDateString()}
                            {inv.dueDate && ` · Due ${new Date(inv.dueDate).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{fmt(inv.total)}</p>
                          {inv.amountDue > 0 && inv.status !== 'paid' && (
                            <p className="text-xs text-red-600">Due: {fmt(inv.amountDue)}</p>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${INV_STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {inv.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* SMS TAB */}
              {tab === 'sms' && (
                <div className="flex flex-col h-full" style={{ minHeight: 380 }}>
                  {!customer.phone ? (
                    <div className="text-center py-8">
                      <Phone className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500 text-sm">No phone number on file.</p>
                      <p className="text-gray-400 text-xs mt-1">Edit the profile to add a phone number first.</p>
                    </div>
                  ) : (
                    <>
                      {/* Chat header */}
                      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-3">
                        <Phone className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-gray-700 font-medium">{customer.phone}</span>
                      </div>

                      {/* Message thread — scrollable, max height */}
                      <div className="flex-1 overflow-y-auto space-y-2 mb-3 max-h-64 pr-1">
                        {(!smsHistory || smsHistory.length === 0) ? (
                          <p className="text-center text-sm text-gray-400 py-8">No messages yet. Send the first one below.</p>
                        ) : (
                          smsHistory.map((msg) => (
                            <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-snug ${
                                msg.direction === 'outbound'
                                  ? 'bg-blue-600 text-white rounded-br-sm'
                                  : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                              }`}>
                                <p>{msg.body}</p>
                                <p className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                                  {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                  {' · '}
                                  {new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {msg.direction === 'outbound' && msg.status !== 'sent' && msg.status !== 'delivered' && (
                                    <span className="ml-1 opacity-70">· {msg.status}</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* smsSent success flash */}
                      {smsSent && (
                        <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 mb-2">
                          Message sent!
                        </div>
                      )}

                      {/* Compose area */}
                      <div className="flex gap-2 items-end">
                        <textarea
                          value={smsMessage}
                          onChange={(e) => { setSmsMessage(e.target.value); setSmsSent(false); }}
                          placeholder="Type a message..."
                          rows={2}
                          maxLength={1600}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (smsMessage.trim() && !smsMutation.isPending) smsMutation.mutate();
                            }
                          }}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <button
                          onClick={() => smsMutation.mutate()}
                          disabled={!smsMessage.trim() || smsMutation.isPending}
                          className="h-10 w-10 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-colors flex-shrink-0"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1 text-right">{smsMessage.length}/1600 · Enter to send · Shift+Enter for new line</p>

                      {smsMutation.isError && (
                        <p className="text-sm text-red-600 mt-2">Failed to send message. Please try again.</p>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
