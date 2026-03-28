import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  Calendar,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
  Receipt,
  Map,
  CreditCard,
  DollarSign,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { DashboardPage } from '../pages/DashboardPage';
import { CustomersPage } from '../pages/CustomersPage';
import { JobsPage } from '../pages/JobsPage';
import { SchedulePage } from '../pages/SchedulePage';
import { InvoicesPage } from '../pages/InvoicesPage';
import { EstimatesPage } from '../pages/EstimatesPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TechnicianPage } from '../pages/TechnicianPage';
import { SalesPage } from '../pages/SalesPage';
import { MapPage } from '../pages/MapPage';
import { BillingPage } from '../pages/BillingPage';
import { TeamPage } from '../pages/TeamPage';
import { PayrollPage } from '../pages/PayrollPage';
import { AIAssistant } from '../components/AIAssistant';
import { useLocationSharing } from '../hooks/useLocationSharing';

type Page = 'dashboard' | 'customers' | 'jobs' | 'schedule' | 'map' | 'invoices' | 'estimates' | 'team' | 'payroll' | 'billing' | 'settings';

const NAV_ITEMS: Array<{ id: Page; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'map', label: 'Live Map', icon: Map },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'estimates', label: 'Estimates', icon: Receipt },
  { id: 'team', label: 'Team', icon: Users },
  { id: 'payroll', label: 'Payroll', icon: DollarSign },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lm-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lm-g)" />
      <path d="M16 7C12.134 7 9 10.134 9 14c0 4.9 7 11 7 11s7-6.1 7-11c0-3.866-3.134-7-7-7z" fill="white" />
      <path d="M13.5 14l2 2 3.5-3.5" stroke="#6366f1" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DashboardLayout() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();

  // Share GPS for field roles (triggers browser permission prompt automatically)
  useLocationSharing();

  if (user?.role === 'technician') {
    return <><TechnicianPage /><AIAssistant /></>;
  }
  if (user?.role === 'sales') {
    return <><SalesPage /><AIAssistant /></>;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'customers': return <CustomersPage />;
      case 'jobs': return <JobsPage />;
      case 'schedule': return <SchedulePage />;
      case 'map': return <MapPage />;
      case 'invoices': return <InvoicesPage />;
      case 'estimates': return <EstimatesPage />;
      case 'team': return <TeamPage />;
      case 'payroll': return <PayrollPage />;
      case 'billing': return <BillingPage />;
      case 'settings': return <SettingsPage />;
    }
  };

  return (
    <div className="flex h-screen bg-[#f4f5f8] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[232px] bg-[#0c0e16] text-white flex flex-col transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-[60px] px-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="font-display font-bold text-white text-lg tracking-tight">FieldOps</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-500 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = currentPage === id;
            return (
              <button
                key={id}
                onClick={() => { setCurrentPage(id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-white/[0.09] text-white'
                    : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                }`}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${active ? 'text-violet-400' : ''}`} />
                {label}
              </button>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-2.5 border-t border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-lg shadow-indigo-900/40">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-slate-500 capitalize leading-tight">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 text-slate-600 hover:text-slate-300 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden h-14 bg-white border-b border-gray-200 flex items-center px-4 shadow-sm">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-900">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <LogoMark size={22} />
            <span className="font-display font-bold text-gray-900 text-base">FieldOps</span>
          </div>
        </header>

        <main className={`flex-1 min-h-0 ${(currentPage === 'schedule' || currentPage === 'map') ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          {renderPage()}
        </main>
      </div>
      <AIAssistant />
    </div>
  );
}
