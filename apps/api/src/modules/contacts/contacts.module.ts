import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UploadModule } from '../requests/upload.module.js';
import { ContactGuard } from '../auth/contact.guard.js';
import { ContactUploadGuard } from '../auth/contact-upload.guard.js';
import { ContactAccessAdminController, ContactAccessController } from './contact-access.controller.js';
import { ContactRepository } from './contact.repository.js';
import { ContactUploadController, ContactsController } from './contacts.controller.js';

/** Fase 10 — área do Responsável: criar acesso pelo Link, ler o que falta e o histórico
 *  (com autoria), enviar logado, push e revogação pelo Contador.
 *  Importa `UploadModule` porque o envio logado reaproveita o pipeline da Fase 4. */
@Module({
  imports: [AuthModule, UploadModule],
  controllers: [
    ContactsController,
    ContactUploadController,
    ContactAccessController,
    ContactAccessAdminController,
  ],
  providers: [ContactRepository, ContactGuard, ContactUploadGuard],
  exports: [ContactRepository],
})
export class ContactsModule {}
