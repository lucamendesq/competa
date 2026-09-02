import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant } from '../../infra/database/schema/index.js';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { toFirmScope } from './scope.js';

/** Roda depois do AuthGuard do Better Auth (que põe `session` no request).
 *  Resolve a Contabilidade do Contador logado e anexa o FirmScope. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
  ) {}

  async canActivate(context: ExecutionContext) {
    // 'PUBLIC' é a chave que @AllowAnonymous() grava (SetMetadata("PUBLIC", true))
    const isAnonymous = this.reflector.getAllAndOverride<boolean>('PUBLIC', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAnonymous) return true;

    const request = context.switchToHttp().getRequest();
    const authUserId = request.session?.user?.id;

    // Não confie na ordem dos guards globais: se este rodar antes do AuthGuard,
    // devolver `true` deixaria a rota seguir com firmScope undefined.
    if (!authUserId) throw new Unauthenticated();

    const [row] = await this.db
      .select({ accountingFirmId: accountant.accountingFirmId })
      .from(accountant)
      .where(eq(accountant.authUserId, authUserId))
      .limit(1);

    // Responsável com App loga mas não é Contador — painel é fora do alcance dele
    if (!row) throw new Forbidden('Esta conta não pertence a uma Contabilidade.');

    request.firmScope = toFirmScope(row.accountingFirmId);
    return true;
  }
}
