import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';

/** Id do `accountant` da sessão (posto pelo TenantGuard) — para colunas de autoria. */
export const CurrentAccountantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const accountantId = context.switchToHttp().getRequest().accountantId;
    if (!accountantId) throw new Unauthenticated();
    return accountantId as string;
  },
);
