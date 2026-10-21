import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';

/** Nome do plano resolvido pelo `TenantGuard` na mesma consulta da sessão. Para rotas em que
 *  o gate depende de QUAIS campos vieram no corpo, e por isso não cabe no `@RequiresPlan`. */
export const CurrentPlan = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const planName = context.switchToHttp().getRequest().planName;
  if (!planName) throw new Unauthenticated();

  return planName as string;
});
