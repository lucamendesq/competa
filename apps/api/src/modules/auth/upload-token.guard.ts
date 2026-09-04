import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '../../lib/app-error.js';
import { hashToken } from '../../lib/token.js';
import { UploadLinkRepository } from '../requests/upload-link.repository.js';
import { toUploadScope, type UploadScope } from './scope.js';

/** Mensagem única para link inexistente, expirado ou revogado: dizer qual dos três
 *  daria a quem tenta adivinhar um oráculo sobre tokens válidos. */
export class InvalidUploadLink extends AppError {
  readonly code = 'UPLOAD_LINK_INVALID';
  readonly status = 404;

  constructor() {
    super('Este link de envio não está disponível. Peça um novo à sua contabilidade.');
  }
}

@Injectable()
export class UploadTokenGuard implements CanActivate {
  constructor(private readonly links: UploadLinkRepository) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<{ params: { token?: string }; uploadScope?: UploadScope }>();

    const token = request.params.token;
    if (!token) throw new InvalidUploadLink();

    const link = await this.links.findByTokenHash(hashToken(token));
    if (!link || link.revoked || link.expiresAt.getTime() <= Date.now()) {
      throw new InvalidUploadLink();
    }

    request.uploadScope = toUploadScope(link.requestId, link.contactId);
    return true;
  }
}
