import { isRouteErrorResponse, useRouteError } from 'react-router';
import { RootErrorFallback } from '@/app/providers/root-error-fallback';
import { NotFoundPage } from '@/app/routes/not-found';
import { ErrorState } from '@/shared/components/error-state';
import { ApiError } from '@/shared/lib/api-error';

export function RouteErrorState() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (error instanceof ApiError || error instanceof TypeError) {
    return <ErrorState error={error} retry={() => window.location.reload()} />;
  }
  return <RootErrorFallback />;
}
