import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toContactScope } from './scope.js';
import { ContactRepository } from '../contacts/contact.repository.js';

/** Resolve a sessão do Responsável em `ContactScope`. Sessão de Contador NÃO passa por
 *  aqui: `contact.auth_user_id` é o único vínculo aceito, então não há escalada de
 *  privilégio de um lado para o outro. O mesmo user pode ser Responsável por N Empresas —
 *  o escopo carrega todos os vínculos; Empresa inativa fica de fora, e sem nenhuma ativa o
 *  acesso cai. */
@Injectable()
export class ContactGuard implements CanActivate {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly auth: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new Unauthenticated();

    request.session = session;

    const rows = await this.contacts.findMembershipsByAuthUser(session.user.id);

    if (!rows.length) throw new Forbidden('Esta conta não é de um Responsável de Empresa.');

    const memberships = rows
      .filter((row) => row.active)
      .map(({ contactId, companyId }) => ({ contactId, companyId }));

    if (!memberships.length) throw new Forbidden('Esta empresa está inativa na contabilidade.');

    request.contactScope = toContactScope(memberships);

    return true;
  }
}
