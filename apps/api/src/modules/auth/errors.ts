import { AppError } from '../../lib/app-error.js';

export class InviteNotFound extends AppError {
  readonly code = 'INVITE_NOT_FOUND';
  readonly status = 404;

  constructor() {
    super('Convite não encontrado.');
  }
}

export class InviteExpired extends AppError {
  readonly code = 'INVITE_EXPIRED';
  readonly status = 410;

  constructor() {
    super('Este convite expirou. Peça um novo ao seu contador.');
  }
}

export class InviteAlreadyAccepted extends AppError {
  readonly code = 'INVITE_ALREADY_ACCEPTED';
  readonly status = 409;

  constructor() {
    super('Este convite já foi utilizado.');
  }
}

export class EmailAlreadyRegistered extends AppError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  readonly status = 409;

  constructor() {
    super('Já existe uma conta com este email.');
  }
}

export class InviteEmailMismatch extends AppError {
  readonly code = 'INVITE_EMAIL_MISMATCH';
  readonly status = 422;

  constructor() {
    super('Use o mesmo email para o qual o convite foi enviado.');
  }
}

export class InviteTargetUnsupported extends AppError {
  readonly code = 'INVITE_TARGET_UNSUPPORTED';
  readonly status = 422;

  constructor() {
    super('Este convite é de Responsável: aceite em POST /invites/:token/contact-account.');
  }
}

export class MagicLinkUnavailable extends AppError {
  readonly code = 'MAGIC_LINK_UNAVAILABLE';
  readonly status = 503;

  constructor() {
    super('Não foi possível criar seu acesso agora. Tente de novo em alguns minutos.');
  }
}

export class OnlyOwnerCanInvite extends AppError {
  readonly code = 'ONLY_OWNER_CAN_INVITE';
  readonly status = 403;

  constructor() {
    super('Só o dono da contabilidade pode convidar contadores.');
  }
}

export class OnlyOwnerCanManageTeam extends AppError {
  readonly code = 'ONLY_OWNER_CAN_MANAGE_TEAM';
  readonly status = 403;

  constructor() {
    super('Só o dono da contabilidade pode fazer isso.');
  }
}

export class CannotRemoveOwner extends AppError {
  readonly code = 'CANNOT_REMOVE_OWNER';
  readonly status = 422;

  constructor() {
    super('O dono da contabilidade não pode ser removido.');
  }
}
