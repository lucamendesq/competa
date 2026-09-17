import { AppError } from '../../lib/app-error.js';

export class TemplateImmutable extends AppError {
  readonly code = 'TEMPLATE_IMMUTABLE';
  readonly status = 409;

  constructor() {
    super('Este é um template do produto. Derive uma cópia para editar.');
  }
}

export class TemplateAlreadyOwned extends AppError {
  readonly code = 'TEMPLATE_ALREADY_OWNED';
  readonly status = 409;

  constructor() {
    super('Este template já é da sua Contabilidade — edite-o direto.');
  }
}

export class DocumentTypeNotVisible extends AppError {
  readonly code = 'DOCUMENT_TYPE_NOT_VISIBLE';
  readonly status = 422;

  constructor() {
    super('Tipo de documento inexistente ou de outra Contabilidade.');
  }
}

export class TemplateItemDuplicated extends AppError {
  readonly code = 'TEMPLATE_ITEM_DUPLICATED';
  readonly status = 409;

  constructor() {
    super('Este Tipo de Documento já está no template. Edite o item existente.');
  }
}

export class TemplateInUse extends AppError {
  readonly code = 'TEMPLATE_IN_USE';
  readonly status = 409;

  constructor(count: number) {
    super(
      `Este modelo está em uso por ${count} ${count === 1 ? 'empresa' : 'empresas'}. Desvincule-as antes de excluir.`,
    );
  }
}
