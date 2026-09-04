import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle, seconds } from '@nestjs/throttler';
import { CreateContactAccessBody, IdParam } from '@contabilidade/contracts';
import * as z from 'zod';
import { NotFound } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { AuthProvider } from '../auth/auth-provider.js';
import { CurrentScope } from '../auth/current-scope.decorator.js';
import type { FirmScope, UploadScope } from '../auth/scope.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import { UploadLinkRepository } from '../requests/upload-link.repository.js';
import { ContactRepository } from './contact.repository.js';
import { AccessAlreadyExists } from './errors.js';

/** Criação de acesso a partir do Link de Upload (Fase 10, F10-1). O token do Link já prova
 *  posse do email do Responsável — mesma força de um magic link —, então não há senha nem
 *  convite: ele clica em "criar meu acesso" na própria página de envio. */
@Controller('upload/:token/account')
@AllowAnonymous()
@UseGuards(UploadTokenGuard)
export class ContactAccessController {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly links: UploadLinkRepository,
    private readonly auth: AuthProvider,
  ) {}

  /* Limite apertado: é rota pública que cria usuário. */
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post()
  async create(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(CreateContactAccessBody)) body: CreateContactAccessBody,
  ) {
    const owner = await this.links.findContact(scope);
    if (!owner) throw new NotFound('Solicitação não encontrada.');
    if (owner.authUserId) throw new AccessAlreadyExists();

    const created = await this.auth.createPasswordlessUser({
      name: body.name?.trim() || owner.name,
      email: owner.email,
    });

    await this.contacts.linkAuthUser(owner.id, created.userId);

    /* Sessão NÃO é criada aqui: o front conclui a entrada por passkey (registro no
     * aparelho) ou por magic link no email do próprio Responsável. Assim a criação de
     * conta não vira, por si só, uma sessão emitida a partir de um link que circula. */
    return { email: owner.email, name: created.name, nextStep: 'passkey_or_magic_link' as const };
  }
}

const ContactAccessParam = z.object({ id: z.uuid(), contactId: z.uuid() });
type ContactAccessParam = z.infer<typeof ContactAccessParam>;

/** Revogação pelo Contador (F10-7). Conceder acesso sem poder revogar é defeito de
 *  segurança, não falta de feature. */
@Controller('companies/:id/contacts')
export class ContactAccessAdminController {
  constructor(private readonly contacts: ContactRepository) {}

  @Get('access')
  async list(@CurrentScope() scope: FirmScope, @Param(zodPipe(IdParam)) params: IdParam) {
    return this.contacts.withAccess(scope, params.id);
  }

  @Delete(':contactId/access')
  async revoke(
    @CurrentScope() scope: FirmScope,
    @Param(zodPipe(ContactAccessParam)) params: ContactAccessParam,
  ) {
    const result = await this.contacts.revokeAccess(scope, params.id, params.contactId);
    if (!result) throw new NotFound('Responsável não encontrado.');

    return result;
  }
}
