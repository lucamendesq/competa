import { Cause, Schema } from 'effect';

/** Banco fora de alcance ou transação que perdeu a corrida: nada de errado com o pedido.
 *  `retryable` diz se repetir a mesma operação tem chance de passar. A borda responde 503. */
export class DbUnavailable extends Schema.TaggedError<DbUnavailable>()('DbUnavailable', {
  retryable: Schema.Boolean,
  cause: Schema.Defect(),
}) {}

/** Violação de unicidade, para quem a traduz em erro de domínio (nome repetido, CNPJ já
 *  cadastrado). Quem não a espera a recebe como defeito. */
export class UniqueViolation extends Schema.TaggedError<UniqueViolation>()('UniqueViolation', {
  constraint: Schema.optional(Schema.String),
  cause: Schema.Defect(),
}) {}

type DriverInfo = { code?: string; constraint?: string; errno?: string; message: string };

/* O drizzle embrulha o erro do pg (DrizzleQueryError > DatabaseError): o `code` está na
 * cadeia de `cause`, não no erro de fora. */
const driverInfo = (error: unknown): DriverInfo => {
  let current: unknown = error;
  const messages: string[] = [];

  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    messages.push(current.message);
    const { code, constraint } = current as { code?: unknown; constraint?: unknown };
    if (typeof code === 'string') {
      return {
        ...(/^[0-9A-Z]{5}$/.test(code) ? { code } : { errno: code }),
        ...(typeof constraint === 'string' ? { constraint } : {}),
        message: messages.join(' > '),
      };
    }
    current = current.cause;
  }

  return { message: messages.join(' > ') };
};

/* 08: conexão; 57P01-03: servidor derrubando; 53300: sem conexão livre; 57014:
 * statement_timeout. 40001/40P01 (serialização, deadlock) são os únicos em que repetir a
 * MESMA transação é o remédio documentado. */
const RETRYABLE_SQLSTATE = new Set(['40001', '40P01']);
const UNAVAILABLE_SQLSTATE = new Set(['57P01', '57P02', '57P03', '53300', '57014']);
const UNAVAILABLE_ERRNO = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
]);
const POOL_EXHAUSTED = /timeout exceeded when trying to connect/;
const CONNECTION_LOST = /Connection terminated/;

/** O que fazer com um erro que saiu do driver: falha tipada, ou `undefined` para defeito. */
export const classify = (error: unknown): DbUnavailable | UniqueViolation | undefined => {
  const { code, constraint, errno, message } = driverInfo(error);

  if (code === '23505') return new UniqueViolation({ constraint, cause: error });
  if (code !== undefined && RETRYABLE_SQLSTATE.has(code)) {
    return new DbUnavailable({ retryable: true, cause: error });
  }
  if (
    (code !== undefined && (code.startsWith('08') || UNAVAILABLE_SQLSTATE.has(code))) ||
    (errno !== undefined && UNAVAILABLE_ERRNO.has(errno)) ||
    POOL_EXHAUSTED.test(message) ||
    CONNECTION_LOST.test(message)
  ) {
    /* Não conseguir conexão é transitório; a conexão cair NO MEIO deixa o estado incerto. */
    return new DbUnavailable({
      retryable: errno === 'ECONNREFUSED' || POOL_EXHAUSTED.test(message),
      cause: error,
    });
  }

  return undefined;
};

/** O erro cru do driver, para log e Sentry: as falhas tipadas do banco são desembrulhadas,
 *  então quem lê o log vê o que o pg disse. */
export const squashError = (cause: Cause.Cause<unknown>): unknown => {
  const error = Cause.squash(cause);

  return error instanceof DbUnavailable || error instanceof UniqueViolation ? error.cause : error;
};
