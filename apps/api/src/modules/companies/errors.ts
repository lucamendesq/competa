import { AppError } from '../../lib/app-error.js';

/** O Link de Upload de uma Solicitação aberta precisa de um destinatário: sem outro
 *  Responsável na Empresa, não há para quem passá-lo. */
export class ContactHoldsOpenLinks extends AppError {
  readonly _tag = 'ContactHoldsOpenLinks';
  readonly code = 'CONTACT_HOLDS_OPEN_LINKS';
  readonly status = 409;

  constructor() {
    super(
      'Este é o único Responsável e há Solicitação em aberto com o Link enviado a ele. ' +
        'Troque o e-mail dele ou cadastre outro Responsável antes de remover.',
    );
  }
}
