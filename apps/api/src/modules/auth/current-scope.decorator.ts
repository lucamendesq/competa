import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import type { FirmScope } from './scope.js';

/** Injeta o FirmScope produzido pelo TenantGuard. Verifica em runtime porque
 *  `request.firmScope` é `any` — sem o check, uma rota anônima ou uma mudança
 *  na ordem dos guards entregaria `undefined` tipado como `FirmScope`. */
export const CurrentScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): FirmScope => {
    const scope = context.switchToHttp().getRequest().firmScope;
    if (!scope) throw new Unauthenticated();
    return scope as FirmScope;
  },
);
