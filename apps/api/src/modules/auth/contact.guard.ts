import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { company, contact } from '../../infra/database/schema/index.js';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toContactScope } from './scope.js';

/** Resolve a sessão do Responsável em `ContactScope`. Sessão de Contador NÃO passa por
 *  aqui: `contact.auth_user_id` é o único vínculo aceito, então não há escalada de
 *  privilégio de um lado para o outro. O mesmo user pode ser Responsável por N Empresas —
 *  o escopo carrega todos os vínculos; Empresa inativa fica de fora, e sem nenhuma ativa o
 *  acesso cai. */
@Injectable()
export class ContactGuard implements CanActivate {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new Unauthenticated();

    request.session = session;

    const rows = await this.db
      .select({ contactId: contact.id, companyId: company.id, active: company.active })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(eq(contact.authUserId, session.user.id))
      // ordem estável: a "primeira" empresa (profile, desempates) não muda entre requests
      .orderBy(asc(contact.createdAt), asc(contact.id));

    if (!rows.length) throw new Forbidden('Esta conta não é de um Responsável de Empresa.');

    const memberships = rows
      .filter((row) => row.active)
      .map(({ contactId, companyId }) => ({ contactId, companyId }));

    if (!memberships.length) throw new Forbidden('Esta empresa está inativa na contabilidade.');

    request.contactScope = toContactScope(memberships);

    return true;
  }
}
