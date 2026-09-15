import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import env from '../config/env.js';

export const createToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/* Token stateless de confirmação de posse do email ("perdi meu link", passo 2): HMAC com
 * o BETTER_AUTH_SECRET — sem tabela nova. Replay dentro do TTL só re-rotaciona o link do
 * próprio dono do email, e o cooldown de 15min segue valendo. */
const hmac = (payload: string) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET).update(payload).digest('base64url');

export const signRecoveryToken = (email: string, ttlMs: number) => {
  const payload = `${Buffer.from(email.toLowerCase()).toString('base64url')}.${Date.now() + ttlMs}`;
  return `${payload}.${hmac(payload)}`;
};

/** Devolve o email se o token é íntegro e não expirou; senão `null`. */
export const verifyRecoveryToken = (token: string): string | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [email64, expiresAt, signature] = parts;
  const expected = hmac(`${email64}.${expiresAt}`);

  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return null;

  try {
    return Buffer.from(email64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
};
