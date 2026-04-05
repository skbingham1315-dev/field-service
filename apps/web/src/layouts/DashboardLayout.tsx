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
  ArrowLeft,
  ChevronDown,
  BookUser,
  HardHat,
  ClipboardList,
  Globe,
  Building2,
  Star,
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
import { ContactsPage } from '../pages/ContactsPage';
import { CRMJobsPage } from '../pages/CRMJobsPage';
import { SubsPage } from '../pages/SubsPage';
import { ConnectPage } from '../pages/ConnectPage';
import { PropertyManagementPage } from '../pages/PropertyManagementPage';
import { ReviewsPage } from '../pages/ReviewsPage';
import { AIAssistant } from '../components/AIAssistant';
import { useLocationSharing } from '../hooks/useLocationSharing';

type Page = 'dashboard' | 'customers' | 'jobs' | 'schedule' | 'map' | 'invoices' | 'estimates' | 'team' | 'payroll' | 'billing' | 'settings' | 'contacts' | 'crm-jobs' | 'subs' | 'connect' | 'properties' | 'reviews';
type ViewAs = 'owner' | 'technician' | 'sales' | 'dispatcher';

const VIEW_OPTIONS: Array<{ id: ViewAs; label: string; desc: string; color: string }> = [
  { id: 'owner',      label: 'Owner',      desc: 'Full dashboard',     color: 'text-violet-400' },
  { id: 'dispatcher', label: 'Dispatcher', desc: 'Schedule & jobs',    color: 'text-blue-400' },
  { id: 'technician', label: 'Tech',       desc: 'Mobile job view',    color: 'text-amber-400' },
  { id: 'sales',      label: 'Sales',      desc: 'Leads & pipeline',   color: 'text-emerald-400' },
];

const NAV_ITEMS: Array<{ id: Page; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { id: 'jobs',      label: 'Jobs',       icon: Briefcase },
  { id: 'schedule',  label: 'Schedule',   icon: Calendar },
  { id: 'map',       label: 'Live Map',   icon: Map },
  { id: 'customers', label: 'Customers',  icon: Users },
  { id: 'invoices',  label: 'Invoices',   icon: FileText },
  { id: 'estimates', label: 'Estimates',  icon: Receipt },
  { id: 'team',      label: 'Team',       icon: Users },
  { id: 'payroll',   label: 'Payroll',    icon: DollarSign },
  { id: 'contacts',  label: 'Contacts',   icon: BookUser },
  { id: 'crm-jobs',  label: 'CRM Jobs',   icon: ClipboardList },
  { id: 'subs',      label: 'Subs',       icon: HardHat },
  { id: 'connect',     label: 'Connect',    icon: Globe },
  { id: 'properties',  label: 'Properties', icon: Building2 },
  { id: 'reviews',     label: 'Reviews',    icon: Star },
  { id: 'billing',     label: 'Billing',    icon: CreditCard },
  { id: 'settings',    label: 'Settings',   icon: Settings },
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
  const [viewAs, setViewAs] = useState<ViewAs>('owner');
  const [viewPickerOpen, setViewPickerOpen] = useState(false);
  const { user, logout } = useAuthStore();

  useLocationSharing();

  const isOwner = user?.role === 'owner' || user?.role === 'admin';
  const activeView = VIEW_OPTIONS.find(v => v.id === viewAs)!;

  // Real technician / sales get their dedicated UI (no role switcher)
  if (user?.role === 'technician') return <><TechnicianPage /><AIAssistant /></>;
  if (user?.role === 'sales') return <><SalesPage /><AIAssistant /></>;

  // Owner previewing another role — show that role's full-screen UI + exit bar
  if (isOwner && viewAs === 'technician') {
    return (
      <div className="relative min-h-screen">
        <TechnicianPage />
        <AIAssistant />
        <PreviewBar label="Tech view" onExit={() => setViewAs('owner')} />
      </div>
    );
  }
  if (isOwner && viewAs === 'sales') {
    return (
      <div className="relative min-h-screen">
        <SalesPage />
        <AIAssistant />
        <PreviewBar label="Sales view" onExit={() => setViewAs('owner')} />
      </div>
    );
  }

  // Dispatcher view: owner stays in main layout but lands on Schedule
  const effectivePage: Page = (isOwner && viewAs === 'dispatcher' && currentPage === 'dashboard')
    ? 'schedule'
    : currentPage;

  const renderPage = () => {
    const p = effectivePage;
    switch (p) {
      case 'dashboard':  return <DashboardPage />;
      case 'customers':  return <CustomersPage />;
      case 'jobs':       return <JobsPage />;
      case 'schedule':   return <SchedulePage />;
      case 'map':        return <MapPage />;
      case 'invoices':   return <InvoicesPage />;
      case 'estimates':  return <EstimatesPage />;
      case 'team':       return <TeamPage />;
      case 'payroll':    return <PayrollPage />;
      case 'contacts':   return <ContactsPage />;
      case 'crm-jobs':   return <CRMJobsPage />;
      case 'subs':       return <SubsPage />;
      case 'connect':     return <ConnectPage />;
      case 'properties':  return <PropertyManagementPage />;
      case 'reviews':     return <ReviewsPage />;
      case 'billing':     return <BillingPage />;
      case 'settings':   return <SettingsPage />;
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

        {/* Role view switcher (owners only) */}
        {isOwner && (
          <div className="px-2.5 pt-3 pb-1 flex-shrink-0">
            <button
              onClick={() => setViewPickerOpen(v => !v)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
            >
              <div className="h-6 w-6 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                <span className={`text-[10px] font-bold ${activeView.color}`}>
                  {activeView.label[0]}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-white leading-tight">{activeView.label} View</p>
                <p className="text-[10px] text-slate-500 leading-tight">{activeView.desc}</p>
              </div>
              <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform flex-shrink-0 ${viewPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {viewPickerOpen && (
              <div className="mt-1 bg-[#13151f] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                {VIEW_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setViewAs(opt.id);
                      setViewPickerOpen(false);
                      if (opt.id === 'dispatcher') setCurrentPage('schedule');
                      else if (opt.id === 'owner') setCurrentPage('dashboard');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-white/5 ${
                      viewAs === opt.id ? 'bg-white/[0.07]' : ''
                    }`}
                  >
                    <span className={`text-xs font-bold w-5 ${opt.color}`}>{opt.label[0]}</span>
                    <div className="flex-1 text-left">
                      <p className="text-xs font-semibold text-white leading-tight">{opt.label}</p>
                      <p className="text-[10px] text-slate-500">{opt.desc}</p>
                    </div>
                    {viewAs === opt.id && <span className="h-1.5 w-1.5 rounded-full bg-violet-400 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = effectivePage === id;
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
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors">
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

        {/* Dispatcher preview banner */}
        {isOwner && viewAs === 'dispatcher' && (
          <div className="bg-blue-50 border-b border-blue-100 px-4 py-2 flex items-center justify-between flex-shrink-0">
            <span className="text-xs text-blue-700 font-medium">Previewing dispatcher view — your permissions are unchanged</span>
            <button onClick={() => { setViewAs('owner'); setCurrentPage('dashboard'); }}
              className="text-xs text-blue-700 font-semibold hover:text-blue-900 flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back to owner
            </button>
          </div>
        )}

        <main className={`flex-1 min-h-0 ${(effectivePage === 'schedule' || effectivePage === 'map') ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          {renderPage()}
        </main>
      </div>
      <AIAssistant />
    </div>
  );
}

function PreviewBar({ label, onExit }: { label: string; onExit: () => void }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0c0e16]/95 backdrop-blur-sm border-t border-white/10 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span className="text-sm text-slate-300">
          Previewing <span className="text-white font-semibold">{label}</span> — your admin permissions are unchanged
        </span>
      </div>
      <button
        onClick={onExit}
        className="flex items-center gap-1.5 text-sm text-violet-400 hover:text-violet-300 font-semibold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Owner view
      </button>
    </div>
  );
}
