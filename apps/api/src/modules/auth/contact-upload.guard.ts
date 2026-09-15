import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { company, contact, request } from '../../infra/database/schema/index.js';
import { Forbidden, NotFound, Unauthenticated, ValidationError } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toUploadScope } from './scope.js';

/** Upload logado do Responsável (Fase 10). Produz o MESMO `UploadScope` do fluxo por link,
 *  a partir da sessão em vez do token — assim a área logada reaproveita o pipeline de envio
 *  inteiro (formato, limite, conferência de tamanho) sem duplicar regra.
 *
 *  Um join só resolve o contato certo para o `requestId` do corpo: a Solicitação aponta a
 *  Empresa, que aponta o `contact` deste user — multi-empresa sem ambiguidade. */
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

    const requestId = http.body?.requestId;
    if (typeof requestId !== 'string') {
      throw new ValidationError('Informe a Solicitação (requestId) do envio.');
    }

    const [owned] = await this.db
      .select({ requestId: request.id, contactId: contact.id, active: company.active })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .innerJoin(request, eq(request.companyId, company.id))
      .where(and(eq(contact.authUserId, session.user.id), eq(request.id, requestId)))
      .limit(1);

    /* Distinguir "não é Responsável" de "Solicitação de outra Empresa": o primeiro é 403
     * (conta errada), o segundo é 404 (não existe para ele). */
    if (!owned) {
      const [me] = await this.db
        .select({ id: contact.id })
        .from(contact)
        .where(eq(contact.authUserId, session.user.id))
        .limit(1);

      if (!me) throw new Forbidden('Esta conta não é de um Responsável de Empresa.');
      throw new NotFound('Solicitação não encontrada.');
    }

    if (!owned.active) throw new Forbidden('Esta empresa está inativa na contabilidade.');

    http.uploadScope = toUploadScope(owned.requestId, owned.contactId);

    return true;
  }
}
