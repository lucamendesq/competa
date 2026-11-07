import { AppError } from '../lib/app-error.js';

export class TooManyRequests extends AppError {
  readonly _tag = 'TooManyRequests';
  readonly code = 'TOO_MANY_REQUESTS';
  readonly status = 429;

  constructor(readonly retryAfterSec: number) {
    super('Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.');
  }
}

export type Bucket = {
  readonly name: string;
  readonly limit: number;
  readonly ttlMs: number;
  /** Chaveia por `ip:token` em vez de só pelo IP. */
  readonly byToken?: boolean;
};

/** Baldes globais: `short` corta rajada, `default` corta abuso sustentado. */
export const GLOBAL_BUCKETS: readonly Bucket[] = [
  { name: 'short', limit: 30, ttlMs: 10_000 },
  { name: 'default', limit: 120, ttlMs: 60_000 },
];

/** Roda ALÉM dos baldes globais, chaveado por `ip:token`. */
export const UPLOAD_PRESIGN_BUCKET: Bucket = {
  name: 'upload-presign',
  limit: 60,
  ttlMs: 60_000,
  byToken: true,
};

/** Reescreve só o balde `default`: o `short` (30/10s) continua valendo ao lado dele. */
export const throttleDefault = (limit: number, ttlMs: number): readonly Bucket[] =>
  GLOBAL_BUCKETS.map((bucket) =>
    bucket.name === 'default' ? { ...bucket, limit, ttlMs } : bucket,
  );

export type ThrottleResult =
  | { readonly ok: true; readonly remaining: number; readonly resetSec: number }
  | { readonly ok: false; readonly retryAfterSec: number };

export const throttleKey = (routeKey: string, bucket: Bucket, tracker: string) =>
  `${routeKey}:${bucket.name}:${tracker}`;

/** A entrada mais à DIREITA do XFF é a que o proxy imediato escreveu; as da esquerda são
 *  do cliente e forjáveis. */
export const callerIp = (
  headers: Readonly<Record<string, string | undefined>>,
  remoteAddress: string | undefined,
  trustProxy: boolean,
): string => {
  if (trustProxy) {
    const forwarded = headers['x-forwarded-for'];
    const last = forwarded?.split(',').pop()?.trim();
    if (last) return last;
  }

  return remoteAddress ?? 'unknown';
};

/* O token vem cru do path, antes de qualquer guard: só entra na chave se tiver a forma de um
 * token emitido (`createToken`, 32 bytes em base64url). Fora disso o balde é o do IP — senão
 * cada token inventado abriria uma chave nova e o limite nunca dispararia. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const uploadTracker = (ip: string, token: string) =>
  TOKEN_SHAPE.test(token) ? `${ip}:${token}` : ip;

/** Janela fixa: estourado o limite, o bloqueio dura o que falta da janela. */
export const throttleResult = (
  bucket: Bucket,
  hits: number,
  secondsLeft: number,
): ThrottleResult =>
  hits <= bucket.limit
    ? { ok: true, remaining: bucket.limit - hits, resetSec: Math.ceil(secondsLeft) }
    : { ok: false, retryAfterSec: Math.max(1, Math.ceil(secondsLeft)) };

/* O balde `default` não sufixa o nome do header, os demais sim: os nomes fazem parte do
 * contrato com os clientes. */
const suffix = (bucket: Bucket) => (bucket.name === 'default' ? '' : `-${bucket.name}`);

export const rateLimitHeaders = (bucket: Bucket, result: ThrottleResult): Record<string, number> =>
  result.ok
    ? {
        [`X-RateLimit-Limit${suffix(bucket)}`]: bucket.limit,
        [`X-RateLimit-Remaining${suffix(bucket)}`]: result.remaining,
        [`X-RateLimit-Reset${suffix(bucket)}`]: result.resetSec,
      }
    : { [`Retry-After${suffix(bucket)}`]: result.retryAfterSec };
