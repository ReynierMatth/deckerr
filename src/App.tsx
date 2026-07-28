import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { PriceSourceProvider } from './contexts/PriceSourceContext';
import { ToastProvider } from './contexts/ToastContext';
import { queryClient } from './lib/queryClient';
import { router } from './router';

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PriceSourceProvider>
            <ToastProvider>
              <RouterProvider router={router} />
            </ToastProvider>
          </PriceSourceProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
