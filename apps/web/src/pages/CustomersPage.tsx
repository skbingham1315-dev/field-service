import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Phone, Mail, MapPin } from 'lucide-react';
import { Button, Card, CardContent } from '@fsp/ui';
import { api } from '../lib/api';
import { CreateCustomerModal } from '../components/customers/CreateCustomerModal';
import { CustomerDetailModal } from '../components/customers/CustomerDetailModal';

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  lead: 'bg-blue-100 text-blue-700',
};

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  status: string;
  serviceAddresses: Array<{ street: string; city: string; state: string; isPrimary: boolean }>;
}

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, status],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const { data } = await api.get(`/customers?${params}`);
      return data;
    },
  });

  const customers: Customer[] = data?.data ?? [];
  const total: number = data?.meta?.total ?? 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          {!isLoading && <p className="text-sm text-gray-500 mt-0.5">{total} total</p>}
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="lead">Lead</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-16">
            <p className="text-gray-500 text-sm">No customers found.</p>
            {search || status ? (
              <button
                onClick={() => { setSearch(''); setStatus(''); }}
                className="mt-2 text-blue-600 text-sm hover:underline"
              >
                Clear filters
              </button>
            ) : (
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-2" />Add your first customer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((customer) => {
            const address = customer.serviceAddresses.find((a) => a.isPrimary) ?? customer.serviceAddresses[0];
            return (
              <Card
                key={customer.id}
                className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all"
                onClick={() => setSelectedId(customer.id)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-semibold text-sm shrink-0">
                      {customer.firstName[0]}{customer.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {customer.firstName} {customer.lastName}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[customer.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {customer.status}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    {customer.email && (
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                    {address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <span className="text-xs text-gray-400 truncate">
                          {address.street}, {address.city}, {address.state}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {showCreate && <CreateCustomerModal onClose={() => setShowCreate(false)} />}
      {selectedId && <CustomerDetailModal customerId={selectedId} onClose={() => setSelectedId(null)} />}
    </div>
  );
}
