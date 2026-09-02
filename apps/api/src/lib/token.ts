import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de convite e de Link de Upload: 32 bytes aleatórios em
 *  base64url. Só o hash é persistido — o claro existe uma única vez. */
export const createToken = () => {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
};

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
