import { Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useContactProfileSuspense, useMeSuspense } from '@/features/auth';
import { Spinner } from '@/shared/components/spinner';

const ACCOUNTANT_HOME = '/competencias';
const CONTACT_HOME = '/minha-area/pendencias';

function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

function ContactOr({ fallback }: { fallback: string }) {
  const contact = useContactProfileSuspense();
  const location = useLocation();
  if (contact) return <Outlet />;
  return <Navigate to={fallback} replace state={{ from: location }} />;
}

function RedirectToContactHome({ fallback }: { fallback: string }) {
  const contact = useContactProfileSuspense();
  const location = useLocation();
  return <Navigate to={contact ? CONTACT_HOME : fallback} replace state={{ from: location }} />;
}

function AccountantGate() {
  const accountant = useMeSuspense();
  if (accountant) return <Outlet />;
  return <RedirectToContactHome fallback="/entrar" />;
}

function GuestGate() {
  const accountant = useMeSuspense();
  if (accountant) return <Navigate to={ACCOUNTANT_HOME} replace />;
  return <GuestContactGate />;
}

function GuestContactGate() {
  const contact = useContactProfileSuspense();
  if (contact) return <Navigate to={CONTACT_HOME} replace />;
  return <Outlet />;
}

export function RequireAccountant() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AccountantGate />
    </Suspense>
  );
}

export function RequireContact() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <ContactOr fallback="/minha-area/acesso" />
    </Suspense>
  );
}

export function GuestOnly() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <GuestGate />
    </Suspense>
  );
}
