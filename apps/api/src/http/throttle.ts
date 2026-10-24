import { AppError } from '../lib/app-error.js';

export class TooManyRequests extends AppError {
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
  readonly blockMs?: number;
};

/** Baldes globais do `ThrottlerModule`: `short` corta rajada, `default` corta abuso sustentado. */
export const GLOBAL_BUCKETS: readonly Bucket[] = [
  { name: 'short', limit: 30, ttlMs: 10_000 },
  { name: 'default', limit: 120, ttlMs: 60_000 },
];

/** `UploadThrottlerGuard`: roda ALÉM dos baldes globais, chaveado por `ip:token`. */
export const UPLOAD_PRESIGN_BUCKET: Bucket = {
  name: 'upload-presign',
  limit: 60,
  ttlMs: 60_000,
};

export type ThrottleResult =
  | { readonly ok: true; readonly remaining: number; readonly resetSec: number }
  | { readonly ok: false; readonly retryAfterSec: number };

/** Mesma granularidade do `sha256(Class-handler-throttler-tracker)` do Nest: um balde por
 *  rota, por nome de balde, por cliente. */
export const throttleKey = (routeKey: string, bucket: Bucket, tracker: string) =>
  `${routeKey}:${bucket.name}:${tracker}`;

/** Equivale a `trust proxy: 1` do Express: a entrada mais à DIREITA do XFF é a que o proxy
 *  imediato escreveu; as da esquerda são do cliente e forjáveis. */
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

export const uploadTracker = (ip: string, token: string) => `${ip}:${token}`;

type Entry = { hits: number[]; blockedUntil: number };

/* ponytail: in-memory, como o storage default do @nestjs/throttler. Redis quando houver
 * mais de uma instância. */
export const makeThrottleStore = (now: () => number = Date.now) => {
  const entries = new Map<string, Entry>();

  return {
    /** Janela deslizante + bloqueio: estourado o limite, hits NÃO contam enquanto bloqueado. */
    hit(key: string, bucket: Bucket): ThrottleResult {
      const at = now();
      const entry = entries.get(key) ?? { hits: [], blockedUntil: 0 };
      entries.set(key, entry);

      if (entry.blockedUntil > at) {
        return { ok: false, retryAfterSec: Math.ceil((entry.blockedUntil - at) / 1000) };
      }

      entry.hits = entry.hits.filter((hitAt) => hitAt > at - bucket.ttlMs);

      if (entry.hits.length >= bucket.limit) {
        const blockMs = bucket.blockMs ?? bucket.ttlMs;
        entry.blockedUntil = at + blockMs;
        entry.hits = [];
        return { ok: false, retryAfterSec: Math.ceil(blockMs / 1000) };
      }

      entry.hits.push(at);
      return {
        ok: true,
        remaining: bucket.limit - entry.hits.length,
        /* Quanto falta para o hit mais ANTIGO sair da janela. Diverge do Nest, que guarda
         * um `expiresAt` FIXO por janela: aqui a janela é deslizante, então os dois valores
         * se separam conforme hits envelhecem. Nenhum spec assere o header. */
        resetSec: Math.ceil((entry.hits[0] + bucket.ttlMs - at) / 1000),
      };
    },
  };
};

export type ThrottleStore = ReturnType<typeof makeThrottleStore>;

/* `getThrottlerSuffix` do @nestjs/throttler: o balde `default` não sufixa, os demais sim. */
const suffix = (bucket: Bucket) => (bucket.name === 'default' ? '' : `-${bucket.name}`);

/** Mesmos headers que o `ThrottlerGuard` escreve em TODA resposta (`setHeaders` default). */
export const rateLimitHeaders = (bucket: Bucket, result: ThrottleResult): Record<string, number> =>
  result.ok
    ? {
        [`X-RateLimit-Limit${suffix(bucket)}`]: bucket.limit,
        [`X-RateLimit-Remaining${suffix(bucket)}`]: result.remaining,
        [`X-RateLimit-Reset${suffix(bucket)}`]: result.resetSec,
      }
    : { [`Retry-After${suffix(bucket)}`]: result.retryAfterSec };
