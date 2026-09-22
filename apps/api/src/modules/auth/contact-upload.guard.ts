import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Forbidden, NotFound, Unauthenticated, ValidationError } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';
import { toUploadScope } from './scope.js';
import { ContactRepository } from '../contacts/contact.repository.js';

/** Upload logado do Responsável (Fase 10). Produz o MESMO `UploadScope` do fluxo por link,
 *  a partir da sessão em vez do token — assim a área logada reaproveita o pipeline de envio
 *  inteiro (formato, limite, conferência de tamanho) sem duplicar regra.
 *
 *  Um join só resolve o contato certo para o `requestId` do corpo: a Solicitação aponta a
 *  Empresa, que aponta o `contact` deste user — multi-empresa sem ambiguidade. */
@Injectable()
export class ContactUploadGuard implements CanActivate {
  constructor(
    private readonly contacts: ContactRepository,
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

    const owned = await this.contacts.findUploadOwnership(session.user.id, requestId);

    /* Distinguir "não é Responsável" de "Solicitação de outra Empresa": o primeiro é 403
     * (conta errada), o segundo é 404 (não existe para ele). */
    if (!owned) {
      const exists = await this.contacts.existsByAuthUser(session.user.id);
      if (!exists) throw new Forbidden('Esta conta não é de um Responsável de Empresa.');
      throw new NotFound('Solicitação não encontrada.');
    }

    if (!owned.active) throw new Forbidden('Esta empresa está inativa na contabilidade.');

    http.uploadScope = toUploadScope(owned.requestId, owned.contactId);

    return true;
  }
}

