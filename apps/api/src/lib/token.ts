import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import env from '../config/env.js';

export const createToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/* Token stateless de confirmação de posse do email ("perdi meu link", passo 2): HMAC com
 * o BETTER_AUTH_SECRET — sem tabela nova. O `fingerprint` dos Links de Upload vigentes
 * entra na assinatura, então o token morre assim que cumpre seu papel: rotacionar troca
 * os hashes e o replay deixa de bater. Sem isso, quem interceptasse o link de confirmação
 * matava o acesso do Responsável quantas vezes quisesse dentro do TTL. */
const hmac = (payload: string) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET).update(payload).digest('base64url');

/** Estado dos Links de Upload do email no momento em que o token foi emitido. */
export const recoveryFingerprint = (
  links: { requestId: string; uploadLinkTokenHash: string | null }[],
) =>
  hashToken(
    links
      .map((link) => `${link.requestId}:${link.uploadLinkTokenHash ?? ''}`)
      .sort()
      .join('|'),
  );

export const signRecoveryToken = (email: string, fingerprint: string, ttlMs: number) => {
  const payload = `${Buffer.from(email.toLowerCase()).toString('base64url')}.${fingerprint}.${Date.now() + ttlMs}`;
  return `${payload}.${hmac(payload)}`;
};

/** Devolve email e fingerprint se o token é íntegro e não expirou; senão `null`. */
export const verifyRecoveryToken = (
  token: string,
): { email: string; fingerprint: string } | null => {
  const parts = token.split('.');
  if (parts.length !== 4) return null;

  const [email64, fingerprint, expiresAt, signature] = parts;
  const expected = hmac(`${email64}.${fingerprint}.${expiresAt}`);

  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;

  try {
    return { email: Buffer.from(email64, 'base64url').toString('utf8'), fingerprint };
  } catch {
    return null;
  }
};

/** Comparação de segredo em tempo constante, tolerante a tamanhos diferentes. */
export const secretEquals = (given: string | undefined, expected: string | undefined) => {
  if (!given || !expected) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
};
