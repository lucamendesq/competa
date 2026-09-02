import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import type { AuthSession } from './auth-provider.js';

/** Injeta a AuthSession gravada pelo TenantGuard em `request.session`.
 *  Tipa como `AuthSession` (o formato que o próprio guard escreve), não como
 *  `UserSession` da lib — que promete `session.session`/`user.emailVerified`
 *  etc. que nunca são gravados, e o compilador não teria como flagar. Lança
 *  em vez de devolver `undefined` tipado, pelo mesmo motivo do CurrentScope. */
export const Session = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession => {
    const session = context.switchToHttp().getRequest().session;
    if (!session) throw new Unauthenticated();
    return session as AuthSession;
  },
);
