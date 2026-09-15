import type { NextFunction, Request, Response } from 'express';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Barreira CSRF complementar ao cookie `lax`: navegador manda `Origin` em toda requisição
 *  mutante cross-site, então Origin presente e fora da allowlist é forjado ou hostil.
 *  Origin ausente (curl, apps nativos, rotas token-based fora do navegador) passa — o que
 *  interessa barrar é o form-POST cross-site, que sempre carrega Origin. */
export const originCheck =
  (allowedOrigins: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING.has(req.method)) return next();

    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
      return res
        .status(403)
        .json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origem não permitida.' } });
    }

    next();
  };
