import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuthStore } from './store/authStore';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CheckCircle, X } from 'lucide-react';

// Lazy-loaded chunks — split heavy components to reduce initial bundle
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then(m => ({ default: m.ReviewPage })));
const PayPage = lazy(() => import('./pages/PayPage').then(m => ({ default: m.PayPage })));
const PortalApp = lazy(() => import('./pages/PortalApp').then(m => ({ default: m.PortalApp })));
const CustomerJobPortal = lazy(() => import('./pages/CustomerJobPortal').then(m => ({ default: m.CustomerJobPortal })));

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
  const validateSession = useAuthStore((s) => s.validateSession);
  const [showSignup, setShowSignup] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState(false);
  // Force re-render on popstate so path-based routes respond to browser back/forward
  const [, setNavTick] = useState(0);

  // Validate persisted session on app load — catches stale/wrong tokens
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('billing') === 'success') {
      setBillingSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    const onPop = () => setNavTick(n => n + 1);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Public routes — no auth required
  const path = window.location.pathname;

  const LazyFallback = <div className="flex items-center justify-center min-h-screen text-gray-400">Loading...</div>;

  // Customer job portal (simple job code + email access)
  if (path === '/job-portal') {
    return <ErrorBoundary><Suspense fallback={LazyFallback}><CustomerJobPortal /></Suspense></ErrorBoundary>;
  }

  // Customer portal: /portal/:tenantSlug/*
  if (path.startsWith('/portal/')) {
    return <ErrorBoundary><Suspense fallback={LazyFallback}><PortalApp /></Suspense></ErrorBoundary>;
  }

  const payMatch = path.match(/^\/pay\/([^/]+)$/);
  if (payMatch) {
    return <ErrorBoundary><Suspense fallback={LazyFallback}><PayPage token={payMatch[1]} /></Suspense></ErrorBoundary>;
  }

  const reviewMatch = path.match(/^\/review\/([^/]+)$/);
  if (reviewMatch) {
    return <ErrorBoundary><Suspense fallback={LazyFallback}><ReviewPage token={reviewMatch[1]} /></Suspense></ErrorBoundary>;
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
    <ErrorBoundary>
      {billingSuccess && <BillingSuccessBanner onDismiss={() => setBillingSuccess(false)} />}
      <Suspense fallback={LazyFallback}>
        <DashboardLayout />
      </Suspense>
    </ErrorBoundary>
  );
}
