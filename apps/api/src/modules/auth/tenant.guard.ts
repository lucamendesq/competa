import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { CONTACT_ROUTE } from './contact-route.decorator.js';
import { SESSION_ROUTE } from './session-route.decorator.js';
import { toFirmScope } from './scope.js';
import { AccountantRepository } from './accountant.repository.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accountants: AccountantRepository,
    private readonly auth: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isAnonymous = this.reflector.getAllAndOverride<boolean>('PUBLIC', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isAnonymous) return true;

    const isContactRoute = this.reflector.getAllAndOverride<boolean>(CONTACT_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isContactRoute) return true;

    const isSessionRoute = this.reflector.getAllAndOverride<boolean>(SESSION_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isSessionRoute) return true;

    const request = context.switchToHttp().getRequest();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new Unauthenticated();

    request.session = session;

    const row = await this.accountants.findByAuthUserId(session.user.id);

    if (!row) throw new Forbidden('Esta conta não pertence a uma Contabilidade.');

    request.firmScope = toFirmScope(row.accountingFirmId);
    request.accountantId = row.id;
    return true;
  }
}
