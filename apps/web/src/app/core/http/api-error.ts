import { HttpErrorResponse } from '@angular/common/http';

type ApiErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

export const apiErrorMessage = (
  error: unknown,
  fallback = 'Não foi possível concluir. Tente novamente.',
) => {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Sem conexão com o servidor. Verifique sua internet.';

  const body = error.error as ApiErrorBody | string | null;
  if (typeof body === 'string') return body || fallback;

  return body?.error?.message ?? fallback;
};

export type FailureKind = 'offline' | 'gone' | 'server' | 'other';

/** A tela pública de envio chamava QUALQUER falha de "link expirado" — CORS, 500 e celular
 *  sem sinal davam a mesma mensagem errada, num cartão sem saída. Aqui o status decide. */
export const failureKind = (error: unknown): FailureKind => {
  if (!(error instanceof HttpErrorResponse)) return 'other';
  if (error.status === 0) return 'offline';
  if (error.status === 404 || error.status === 410 || error.status === 403) return 'gone';
  if (error.status >= 500) return 'server';

  return 'other';
};

export const apiFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpErrorResponse)) return {};

  const details = (error.error as ApiErrorBody | null)?.error?.details;
  if (!Array.isArray(details)) return {};

  const entries = details.flatMap((issue) => {
    const path = (issue as { path?: unknown[] }).path;
    const message = (issue as { message?: string }).message;
    if (!Array.isArray(path) || !path.length || !message) return [];
    return [[path.join('.'), message] as const];
  });

  return Object.fromEntries(entries);
};
