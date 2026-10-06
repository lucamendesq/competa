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

export class OverrideRemovesNothing extends AppError {
  readonly code = 'OVERRIDE_REMOVES_NOTHING';
  readonly status = 422;

  constructor() {
    super('Este Tipo de Documento não está no checklist da Empresa: não há o que remover.');
  }
}

export class TemplateNameTaken extends AppError {
  readonly code = 'TEMPLATE_NAME_TAKEN';
  readonly status = 409;

  constructor() {
    super('Já existe um template com este nome. Escolha outro.', [
      { path: ['name'], message: 'Já existe um template com este nome.' },
    ]);
  }
}
