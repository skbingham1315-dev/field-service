import { useState } from 'react';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ReviewPage } from './pages/ReviewPage';

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [showSignup, setShowSignup] = useState(false);

  // Public review route — no auth required
  const path = window.location.pathname;
  const reviewMatch = path.match(/^\/review\/([^/]+)$/);
  if (reviewMatch) {
    return <ReviewPage token={reviewMatch[1]} />;
  }

  if (!isAuthenticated) {
    if (showSignup) {
      return <SignupPage onLogin={() => setShowSignup(false)} />;
    }
    return <LoginPage onSignup={() => setShowSignup(true)} />;
  }

  return <DashboardLayout />;
}
