import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ContactsModule } from '../contacts/contacts.module.js';
import { CompaniesController } from './companies.controller.js';
import { CompanyRepository } from './company.repository.js';

@Module({
  imports: [AuthModule, ContactsModule],
  controllers: [CompaniesController],
  providers: [CompanyRepository],
  exports: [CompanyRepository],
})
export class CompaniesModule {}
