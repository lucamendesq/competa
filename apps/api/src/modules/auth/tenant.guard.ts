import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant } from '../../infra/database/schema/index.js';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toFirmScope } from './scope.js';

/** Único guard global: nenhuma rota depende de ordem entre dois APP_GUARD
 *  (era exatamente esse o bug — o AuthGuard do Better Auth podia rodar
 *  depois deste, deixando `request.session` vazio no caminho positivo).
 *  Resolve a sessão via AuthProvider, depois a Contabilidade do Contador
 *  logado, e anexa `request.session` (lido pelo nosso `@Session()`, não o
 *  do pacote) e o FirmScope.
 *
 *  Só entende a metadata `'PUBLIC'` (`@AllowAnonymous()`). O `'OPTIONAL'`
 *  (`@OptionalAuth()`) que o AuthGuard da lib tratava não é suportado — hoje
 *  nada usa; se alguém aplicar, a rota vira 401 em vez de passar anônima. */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
    private readonly auth: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext) {
    // 'PUBLIC' é a chave que @AllowAnonymous() grava (SetMetadata("PUBLIC", true))
    const isAnonymous = this.reflector.getAllAndOverride<boolean>('PUBLIC', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAnonymous) return true;

    const request = context.switchToHttp().getRequest();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new Unauthenticated();

    request.session = session;

    const [row] = await this.db
      .select({ accountingFirmId: accountant.accountingFirmId })
      .from(accountant)
      .where(eq(accountant.authUserId, session.user.id))
      .limit(1);

    // Responsável com App loga mas não é Contador — painel é fora do alcance dele
    if (!row) throw new Forbidden('Esta conta não pertence a uma Contabilidade.');

    request.firmScope = toFirmScope(row.accountingFirmId);
    return true;
  }
}
