import { useState, useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { ReviewPage } from './pages/ReviewPage';
import { PortalApp } from './pages/PortalApp';
import { CheckCircle, X } from 'lucide-react';

function BillingSuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg flex items-center gap-3 text-sm font-medium">
      <CheckCircle className="h-5 w-5 flex-shrink-0" />
      <span>You're all set! Your subscription is active. Welcome aboard 🎉</span>
      <button onClick={onDismiss} className="ml-2 text-white/70 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function App() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [showSignup, setShowSignup] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      setBillingSuccess(true);
      // Clean the URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Public routes — no auth required
  const path = window.location.pathname;

  // Customer portal: /portal/:tenantSlug/*
  if (path.startsWith('/portal/')) {
    return <PortalApp />;
  }

  const reviewMatch = path.match(/^\/review\/([^/]+)$/);
  if (reviewMatch) {
    return <ReviewPage token={reviewMatch[1]} />;
  }

  if (path === '/reset-password') {
    return <ResetPasswordPage onLogin={() => { window.history.replaceState({}, '', '/'); window.location.reload(); }} />;
  }

  if (!isAuthenticated) {
    if (showSignup) {
      return <SignupPage onLogin={() => setShowSignup(false)} />;
    }
    if (showForgot) {
      return <ForgotPasswordPage onBack={() => setShowForgot(false)} />;
    }
    return <LoginPage onSignup={() => setShowSignup(true)} onForgotPassword={() => setShowForgot(true)} />;
  }

  return (
    <>
      {billingSuccess && <BillingSuccessBanner onDismiss={() => setBillingSuccess(false)} />}
      <DashboardLayout />
    </>
  );
}
