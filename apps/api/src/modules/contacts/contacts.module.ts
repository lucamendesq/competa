import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { RequestsModule } from '../requests/requests.module.js';
import { UploadModule } from '../requests/upload.module.js';
import { ContactGuard } from '../auth/contact.guard.js';
import { ContactUploadGuard } from '../auth/contact-upload.guard.js';
import { AccessRecoveryController } from './access-recovery.controller.js';
import {
  ContactAccessController,
  ContactInviteAccountController,
} from './contact-access.controller.js';
import { ContactRepository } from './contact.repository.js';
import { ContactUploadController, ContactsController } from './contacts.controller.js';

@Module({
  imports: [AuthModule, UploadModule, RequestsModule, StorageModule],
  controllers: [
    ContactsController,
    ContactUploadController,
    ContactAccessController,
    ContactInviteAccountController,
    AccessRecoveryController,
  ],

  providers: [ContactRepository, ContactGuard, ContactUploadGuard],
  exports: [ContactRepository],
})
export class ContactsModule {}
