import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import App from './App.jsx';
import OfflineRuntime from './offline/OfflineRuntime';
import { shouldRetryRead } from '../../shared/offline/readSnapshots';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => shouldRetryRead(failureCount, error, 1),
      staleTime: 0,
      refetchOnWindowFocus: false,
      networkMode: 'always',
    },
    mutations: { retry: false, networkMode: 'always' },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <OfflineRuntime />
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
