import '@fontsource-variable/outfit';
import '@fontsource-variable/plus-jakarta-sans';
import '@/shared/config/env';
import '@competa/contracts';
import '@/main.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from '@/app/providers/app-providers';
import { registerPaymentRequiredRefresh } from '@/app/providers/payment-required';
import { registerSessionExpiry } from '@/app/providers/session-expiry';
import { router } from '@/app/router/router';
import { makeQueryClient } from '@/shared/lib/query-client';

const queryClient = makeQueryClient();
registerSessionExpiry(queryClient, router);
registerPaymentRequiredRefresh(queryClient);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
