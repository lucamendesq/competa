export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

export const apiErrorMessage = (
  error: unknown,
  fallback = 'Não foi possível concluir. Tente novamente.',
) => {
  if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
    return 'Sem conexão com o servidor. Verifique sua internet.';
  }
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 0) return 'Sem conexão com o servidor. Verifique sua internet.';

  const body = error.body as ApiErrorBody | string | null;
  if (typeof body === 'string') return body || fallback;

  return body?.error?.message ?? fallback;
};

export const apiErrorCode = (error: unknown): string | undefined => {
  if (!(error instanceof ApiError)) return undefined;

  const body = error.body as ApiErrorBody | string | null;
  if (typeof body === 'string' || !body) return undefined;

  return body.error?.code;
};

export type FailureKind = 'offline' | 'gone' | 'server' | 'other';

export const failureKind = (error: unknown): FailureKind => {
  if (error instanceof TypeError && error.message.includes('Failed to fetch')) return 'offline';
  if (!(error instanceof ApiError)) return 'other';
  
  if (error.status === 0) return 'offline';
  if (error.status === 404 || error.status === 410 || error.status === 403) return 'gone';
  if (error.status >= 500) return 'server';

  return 'other';
};

export const apiFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiError)) return {};

  const details = (error.body as ApiErrorBody | null)?.error?.details;
  if (!Array.isArray(details)) return {};

  const entries = details.flatMap((issue) => {
    const path = (issue as { path?: unknown[] }).path;
    const message = (issue as { message?: string }).message;
    if (!Array.isArray(path) || !path.length || !message) return [];
    return [[path.join('.'), message] as const];
  });

  return Object.fromEntries(entries);
};
