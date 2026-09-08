import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { company, contact, request } from '../../infra/database/schema/index.js';
import { Forbidden, NotFound, Unauthenticated, ValidationError } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toContactScope, toUploadScope } from './scope.js';

/** Upload logado do Responsável (Fase 10). Produz o MESMO `UploadScope` do fluxo por link,
 *  a partir da sessão em vez do token — assim a área logada reaproveita o pipeline de envio
 *  inteiro (formato, limite, conferência de tamanho) sem duplicar regra.
 *
 *  O escopo continua nascendo aqui, em `modules/auth/`: a Solicitação do corpo é conferida
 *  contra a Empresa do Responsável ANTES de virar escopo. */
@Injectable()
export class ContactUploadGuard implements CanActivate {
  constructor(
    private readonly db: Database,
    private readonly auth: AuthProvider,
  ) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp().getRequest();
    const session = await this.auth.getSession(http.headers);
    if (!session) throw new Unauthenticated();

    http.session = session;

    const [me] = await this.db
      .select({ contactId: contact.id, companyId: company.id, active: company.active })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(eq(contact.authUserId, session.user.id))
      .limit(1);

    if (!me) throw new Forbidden('Esta conta não é de um Responsável de Empresa.');
    if (!me.active) throw new Forbidden('Esta empresa está inativa na contabilidade.');

    const requestId = http.body?.requestId;
    if (typeof requestId !== 'string') {
      throw new ValidationError('Informe a Solicitação (requestId) do envio.');
    }

    const [owned] = await this.db
      .select({ id: request.id })
      .from(request)
      .where(and(eq(request.id, requestId), eq(request.companyId, me.companyId)))
      .limit(1);

    // Solicitação de outra Empresa não existe para este Responsável
    if (!owned) throw new NotFound('Solicitação não encontrada.');

    http.contactScope = toContactScope(me.contactId, me.companyId);
    http.uploadScope = toUploadScope(owned.id, me.contactId);

    return true;
  }
}
