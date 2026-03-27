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
import { AIAssistant } from '../components/AIAssistant';
import { useLocationSharing } from '../hooks/useLocationSharing';

type Page = 'dashboard' | 'customers' | 'jobs' | 'schedule' | 'map' | 'invoices' | 'estimates' | 'settings';

const NAV_ITEMS: Array<{ id: Page; label: string; icon: React.ElementType }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'map', label: 'Live Map', icon: Map },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'invoices', label: 'Invoices', icon: FileText },
  { id: 'estimates', label: 'Estimates', icon: Receipt },
  { id: 'settings', label: 'Settings', icon: Settings },
];

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
  // Note: useLocationSharing is a no-op for owner/admin/dispatcher roles

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage />;
      case 'customers': return <CustomersPage />;
      case 'jobs': return <JobsPage />;
      case 'schedule': return <SchedulePage />;
      case 'map': return <MapPage />;
      case 'invoices': return <InvoicesPage />;
      case 'estimates': return <EstimatesPage />;
      case 'settings': return <SettingsPage />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-white flex flex-col transform transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-700">
          <span className="font-bold text-lg">FSP</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setCurrentPage(id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentPage === id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-sm font-semibold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="lg:hidden h-16 bg-white border-b flex items-center px-4">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-500 hover:text-gray-900">
            <Menu className="h-6 w-6" />
          </button>
          <span className="ml-4 font-semibold capitalize">{currentPage}</span>
        </header>

        <main className={`flex-1 min-h-0 ${(currentPage === 'schedule' || currentPage === 'map') ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
          {renderPage()}
        </main>
      </div>
      <AIAssistant />
    </div>
  );
}
