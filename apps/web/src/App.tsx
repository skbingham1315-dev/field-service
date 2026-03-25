import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ReviewPage } from './pages/ReviewPage';

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // Public review route — no auth required
  const path = window.location.pathname;
  const reviewMatch = path.match(/^\/review\/([^/]+)$/);
  if (reviewMatch) {
    return <ReviewPage token={reviewMatch[1]} />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <DashboardLayout />;
}
