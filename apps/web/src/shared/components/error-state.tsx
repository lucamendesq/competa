import { apiErrorMessage, failureKind } from '@/shared/lib/api-error';

const OFFLINE_MESSAGE = 'Sem conexão com o servidor. Verifique sua internet.';

type ErrorStateProps = {
  error?: unknown;
  retry: () => void;
  fallback?: string;
};

export function ErrorState({
  error,
  retry,
  fallback = 'Erro inesperado. Tente novamente.',
}: ErrorStateProps) {
  const message =
    failureKind(error) === 'offline' ? OFFLINE_MESSAGE : apiErrorMessage(error, fallback);

  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <p className="text-foreground text-base font-medium">Não foi possível carregar</p>
      <p className="text-muted-foreground max-w-md text-sm">{message}</p>
      <button
        type="button"
        className="border-border hover:bg-muted focus-visible:ring-ring mt-1 inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        onClick={() => retry()}
      >
        Tentar novamente
      </button>
    </div>
  );
}
