import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X } from 'lucide-react';

export interface CustomerOption {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  customers: CustomerOption[];
  error?: string;
  label?: string;
}

export function CustomerAutocomplete({ value, onChange, customers, error, label = 'Customer *' }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = customers.find(c => c.id === value);

  // Sort alphabetically and filter by search
  const filtered = useMemo(() => {
    const sorted = [...customers].sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
    );
    if (!search) return sorted;
    const q = search.toLowerCase();
    return sorted.filter(c =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q)
    );
  }, [customers, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      {selected && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setSearch(''); }}
          className="w-full text-left px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white hover:border-blue-400 transition-colors flex items-center justify-between"
        >
          <span className="font-medium">{selected.firstName} {selected.lastName}</span>
          <X className="h-3.5 w-3.5 text-gray-400" onClick={(e) => { e.stopPropagation(); onChange(''); }} />
        </button>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search by name, email, or phone..."
            className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm outline-none transition-colors ${
              error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'
            } focus:ring-2`}
          />
        </div>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-400 text-center">No customers found</p>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onChange(c.id); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors ${c.id === value ? 'bg-blue-50' : ''}`}
            >
              <p className="text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</p>
              <p className="text-xs text-gray-400">
                {[c.email, c.phone].filter(Boolean).join(' · ') || 'No contact info'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
