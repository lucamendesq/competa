import { SetMetadata, UseGuards, applyDecorators } from '@nestjs/common';
import { ContactGuard } from './contact.guard.js';

export const CONTACT_ROUTE = 'CONTACT_ROUTE';

/** Marca a rota como do Responsável: o `TenantGuard` global cede a vez e o `ContactGuard`
 *  resolve a sessão em `ContactScope`. Um decorator só, para não existir rota marcada sem
 *  guard (que passaria sem escopo nenhum). */
export const ContactRoute = () =>
  applyDecorators(SetMetadata(CONTACT_ROUTE, true), UseGuards(ContactGuard));
