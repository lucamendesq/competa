import { planGateMessage, planRequiredFor, type PlanCapability } from '@competa/contracts';
import { AppError } from '../../lib/app-error.js';

/** Mensagem única para link inexistente, expirado ou revogado: dizer qual dos três
 *  daria a quem tenta adivinhar um oráculo sobre tokens válidos. */
export class InvalidUploadLink extends AppError {
  readonly _tag = 'InvalidUploadLink';
  readonly code = 'UPLOAD_LINK_INVALID';
  readonly status = 404;

  constructor() {
    super('Este link de envio não está disponível. Peça um novo à sua contabilidade.');
  }
}

export class InviteNotFound extends AppError {
  readonly _tag = 'InviteNotFound';
  readonly code = 'INVITE_NOT_FOUND';
  readonly status = 404;

  constructor() {
    super('Convite não encontrado.');
  }
}

export class InviteExpired extends AppError {
  readonly _tag = 'InviteExpired';
  readonly code = 'INVITE_EXPIRED';
  readonly status = 410;

  constructor() {
    super('Este convite expirou. Peça um novo ao seu contador.');
  }
}

export class InviteAlreadyAccepted extends AppError {
  readonly _tag = 'InviteAlreadyAccepted';
  readonly code = 'INVITE_ALREADY_ACCEPTED';
  readonly status = 409;

  constructor() {
    super('Este convite já foi utilizado.');
  }
}

export class EmailAlreadyRegistered extends AppError {
  readonly _tag = 'EmailAlreadyRegistered';
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  readonly status = 409;

  constructor() {
    super('Já existe uma conta com este email.');
  }
}

/** Cadastro público nunca confirma se um email já tem conta: a resposta é a mesma para
 *  email duplicado e para qualquer outra recusa, senão o formulário aberto vira oráculo
 *  de "quem é cliente da Competa". */
export class SignupRejected extends AppError {
  readonly _tag = 'SignupRejected';
  readonly code = 'SIGNUP_REJECTED';
  readonly status = 422;

  constructor() {
    super('Não foi possível criar a conta com esses dados. Verifique e tente novamente.');
  }
}

export class InviteAlreadyPending extends AppError {
  readonly _tag = 'InviteAlreadyPending';
  readonly code = 'INVITE_ALREADY_PENDING';
  readonly status = 409;

  constructor() {
    super('Já existe um convite pendente para este email.');
  }
}

export class InviteEmailMismatch extends AppError {
  readonly _tag = 'InviteEmailMismatch';
  readonly code = 'INVITE_EMAIL_MISMATCH';
  readonly status = 422;

  constructor() {
    super('Use o mesmo email para o qual o convite foi enviado.');
  }
}

export class InviteTargetUnsupported extends AppError {
  readonly _tag = 'InviteTargetUnsupported';
  readonly code = 'INVITE_TARGET_UNSUPPORTED';
  readonly status = 422;

  constructor(inviteFor: 'contact' | 'accountant') {
    super(
      inviteFor === 'contact'
        ? 'Este convite é de Responsável: aceite em POST /invites/:token/contact-account.'
        : 'Este convite é de Contador: aceite em POST /auth/sign-up.',
    );
  }
}

export class MagicLinkUnavailable extends AppError {
  readonly _tag = 'MagicLinkUnavailable';
  readonly code = 'MAGIC_LINK_UNAVAILABLE';
  readonly status = 503;

  constructor() {
    super('Não foi possível criar seu acesso agora. Tente de novo em alguns minutos.');
  }
}

export class OnlyOwnerCanInvite extends AppError {
  readonly _tag = 'OnlyOwnerCanInvite';
  readonly code = 'ONLY_OWNER_CAN_INVITE';
  readonly status = 403;

  constructor() {
    super('Só o dono da contabilidade pode convidar contadores.');
  }
}

export class OnlyOwnerCanManageTeam extends AppError {
  readonly _tag = 'OnlyOwnerCanManageTeam';
  readonly code = 'ONLY_OWNER_CAN_MANAGE_TEAM';
  readonly status = 403;

  constructor() {
    super('Só o dono da contabilidade pode fazer isso.');
  }
}

export class CannotRemoveOwner extends AppError {
  readonly _tag = 'CannotRemoveOwner';
  readonly code = 'CANNOT_REMOVE_OWNER';
  readonly status = 422;

  constructor() {
    super('O dono da contabilidade não pode ser removido.');
  }
}

/** 402 e não 403: a web traduz em CTA de upgrade, e o `details` diz exatamente qual gate
 *  foi batido e para qual plano subir (D18 §3). */
export class PlanCapabilityRequired extends AppError {
  readonly _tag = 'PlanCapabilityRequired';
  readonly code = 'PLAN_CAPABILITY_REQUIRED';
  readonly status = 402;

  constructor(capability: PlanCapability) {
    super(planGateMessage(capability), { capability, requiredPlan: planRequiredFor(capability) });
  }
}
