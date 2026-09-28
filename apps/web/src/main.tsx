import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/ConfirmDialog';
import './index.css';
import 'leaflet/dist/leaflet.css';

// A tab opened before a deploy still references the previous build's chunk
// names, which no longer exist. Reload once to pick up the new build instead of
// showing "Failed to fetch dynamically imported module".
window.addEventListener('vite:preloadError', (event) => {
  const key = 'fsp_chunk_reload_at';
  let last = 0;
  try { last = Number(sessionStorage.getItem(key) ?? 0); } catch { /* storage blocked */ }
  if (Date.now() - last < 10_000) return; // just reloaded — don't loop
  try { sessionStorage.setItem(key, String(Date.now())); } catch { /* storage blocked */ }
  event.preventDefault();
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
