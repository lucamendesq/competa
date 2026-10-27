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
  readonly blockMs?: number;
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

type Entry = { hits: number[]; blockedUntil: number; staleAt: number };

const SWEEP_EVERY_MS = 60_000;

/* ponytail: em memória; vira Redis quando houver mais de uma instância. */
export const makeThrottleStore = (now: () => number = Date.now) => {
  const entries = new Map<string, Entry>();
  let lastSweep = now();

  /* Chave que nunca mais é batida não volta a passar pelo `hit`: sem a varredura, cada IP
   * ou token visto uma vez ficaria no heap para sempre. */
  const sweep = (at: number) => {
    if (at - lastSweep < SWEEP_EVERY_MS) return;
    lastSweep = at;
    for (const [key, entry] of entries) if (entry.staleAt <= at) entries.delete(key);
  };

  const settle = (entry: Entry, bucket: Bucket) => {
    const lastHit = entry.hits.at(-1);
    entry.staleAt = Math.max(
      entry.blockedUntil,
      lastHit === undefined ? 0 : lastHit + bucket.ttlMs,
    );
  };

  return {
    size: () => entries.size,
    /** Janela deslizante + bloqueio: estourado o limite, hits NÃO contam enquanto bloqueado. */
    hit(key: string, bucket: Bucket): ThrottleResult {
      const at = now();
      sweep(at);
      const entry = entries.get(key) ?? { hits: [], blockedUntil: 0, staleAt: 0 };
      entries.set(key, entry);

      if (entry.blockedUntil > at) {
        return { ok: false, retryAfterSec: Math.ceil((entry.blockedUntil - at) / 1000) };
      }

      entry.hits = entry.hits.filter((hitAt) => hitAt > at - bucket.ttlMs);

      if (entry.hits.length >= bucket.limit) {
        const blockMs = bucket.blockMs ?? bucket.ttlMs;
        entry.blockedUntil = at + blockMs;
        entry.hits = [];
        settle(entry, bucket);
        return { ok: false, retryAfterSec: Math.ceil(blockMs / 1000) };
      }

      entry.hits.push(at);
      settle(entry, bucket);
      return {
        ok: true,
        remaining: bucket.limit - entry.hits.length,
        /* Quanto falta para o hit mais ANTIGO sair da janela deslizante, não o fim de uma
         * janela fixa. Nenhum spec assere o header. */
        resetSec: Math.ceil((entry.hits[0] + bucket.ttlMs - at) / 1000),
      };
    },
  };
};

export type ThrottleStore = ReturnType<typeof makeThrottleStore>;

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
