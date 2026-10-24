import type { NextFunction, Request, Response } from 'express';
import { FORBIDDEN_ORIGIN, originAllowed } from '../http/origin-check.js';

/* Gêmeo Express do `src/http/origin-check.ts`: a REGRA (quem passa) mora lá e é
 * compartilhada — aqui só muda a escrita, que depende do `res.json()` do Express. Morre
 * junto com o Nest. */
export const originCheck =
  (allowedOrigins: string[]) => (req: Request, res: Response, next: NextFunction) => {
    if (originAllowed(req.method, req.headers.origin, allowedOrigins)) return next();

    return res.status(403).json(FORBIDDEN_ORIGIN);
  };
