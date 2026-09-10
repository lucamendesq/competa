import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { company, contact } from '../../infra/database/schema/index.js';
import { Forbidden, Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toContactScope } from './scope.js';

/** Resolve a sessão do Responsável em `ContactScope`. Sessão de Contador NÃO passa por
 *  aqui: `contact.auth_user_id` é o único vínculo aceito, então não há escalada de
 *  privilégio de um lado para o outro. Empresa inativa perde o acesso — a Contabilidade
 *  desativou a Empresa, o Responsável não tem mais o que enviar. */
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

    const [row] = await this.db
      .select({ contactId: contact.id, companyId: company.id, active: company.active })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(eq(contact.authUserId, session.user.id))
      /* `contact.auth_user_id` é UNIQUE, então isto já devolve no máximo uma linha — a
       * ordenação é para o `limit(1)` não depender disso. O que a unicidade custa é outro
       * problema, e é de produto: a mesma pessoa Responsável por três Empresas só consegue
       * ter conta em UMA delas. Ver "Gestão de equipe" nos próximos passos. */
      .orderBy(asc(contact.createdAt), asc(contact.id))
      .limit(1);

    if (!row) throw new Forbidden('Esta conta não é de um Responsável de Empresa.');
    if (!row.active) throw new Forbidden('Esta empresa está inativa na contabilidade.');

    request.contactScope = toContactScope(row.contactId, row.companyId);

    return true;
  }
}
