import { Module } from '@nestjs/common';
import { ChecklistRepository } from './checklist.repository.js';
import { ChecklistOverridesController } from './checklist-overrides.controller.js';
import { ChecklistTemplatesController } from './checklist-templates.controller.js';
import { DocumentTypesController } from './document-types.controller.js';

@Module({
  controllers: [
    DocumentTypesController,
    ChecklistTemplatesController,
    ChecklistOverridesController,
  ],
  providers: [ChecklistRepository],
  exports: [ChecklistRepository],
})
export class ChecklistsModule {}
