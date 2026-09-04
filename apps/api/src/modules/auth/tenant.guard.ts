import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant } from '../../infra/database/schema/index.js';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toFirmScope } from './scope.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: Database,
    private readonly auth: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext) {
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

    if (!row) throw new Forbidden('Esta conta não pertence a uma Contabilidade.');

    request.firmScope = toFirmScope(row.accountingFirmId);
    return true;
  }
}
