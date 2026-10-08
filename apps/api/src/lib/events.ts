/** Contrato dos eventos síncronos entre módulos (`@nestjs/event-emitter`).
 *  Direção: registry → collection → messaging. Nomes PascalCase, verbo no
 *  passado. Este arquivo é a única fonte dos payloads: quem emite e quem
 *  escuta importam daqui — nunca redeclaram a forma.
 *
 *  `uploadUrl` viaja no evento porque o token em claro só existe no momento
 *  em que é gerado (o banco guarda apenas o hash) — messaging não tem como
 *  reconstruí-lo depois. */

export type RequestCreatedEvent = {
  requestId: string;
  periodId: string;
  referenceMonth: string;
  periodDueDate: string | null;
  companyId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  uploadUrl: string;
  itemCount: number;
};

/** Item rejeitado na revisão volta para `pending` e o Link é reenviado SÓ por
 *  email (invariante do domínio). `uploadUrl` é o link já rotacionado. */
export type ItemReopenedEvent = {
  requestId: string;
  requestItemId: string;
  itemName: string;
  rejectionReason: string | null;
  companyName: string;
  contactName: string;
  contactEmail: string;
  uploadUrl: string;
};

/** Revisão publicada em lote. É o evento que substitui N `ItemReopened` numa revisão com
 *  várias rejeições: um email só, listando o que foi aceito e o que precisa voltar.
 *  `uploadUrl` só existe quando houve rejeição de Item (aí o Link é rotacionado uma vez;
 *  rejeitar Extra não reabre nada e não invalida o link). */
export type ReviewPublishedEvent = {
  requestId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  acceptedItemNames: string[];
  /* Sem `fileName`: nome de arquivo é conteúdo de documento e não sai do perímetro
   * autenticado (email e push são canais abertos). */
  rejected: { itemName: string | null; rejectionReason: string }[];
  uploadUrl: string | null;
};

export type RequestCompletedEvent = {
  requestId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
};

/** Prazo estourado, agrupado por Solicitação: uma varredura manda UM email ao Responsável
 *  e um por Contador, listando todos os Itens vencidos. Por item eram N emails para cada
 *  lado numa varredura só — volume que queima a reputação do remetente. */
export type DeadlineMissedEvent = {
  requestId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  uploadUrl: string;
  accountantEmails: string[];
  overdueItems: { name: string; dueDate: string }[];
};

export type ReminderDueEvent = {
  requestId: string;
  referenceMonth: string;
  periodDueDate: string | null;
  companyName: string;
  contactName: string;
  contactEmail: string;
  uploadUrl: string;
  pendingItems: { name: string; dueDate: string | null }[];
};

export type InviteCreatedEvent = {
  email: string;
  firmName: string;
  inviteUrl: string;
  expiresAt: Date;
};

export type ContactInvitedEvent = {
  contactId: string;
  contactName: string;
  contactEmail: string;
  companyName: string;
  firmName: string;
  inviteUrl: string;
  expiresAt: Date;
};

/** Reenvia o Link de Upload de uma Solicitação aberta — pelo "perdi meu link" do
 *  Responsável ou pelo botão do Contador no painel. Não gera login e NÃO notifica o
 *  Contador (D14, item 6). `uploadUrl` já é o link rotacionado. */
export type UploadLinkResentEvent = {
  requestId: string;
  referenceMonth: string;
  periodDueDate: string | null;
  companyName: string;
  contactName: string;
  contactEmail: string;
  uploadUrl: string;
};

/** Passo 1 do "perdi meu link" sem acesso: email de confirmação de posse antes de
 *  rotacionar o token (AUTHZ-3). Sem requestId: a confirmação é da pessoa, não da
 *  Solicitação. */
export type AccessRecoveryRequestedEvent = {
  email: string;
  contactName: string;
  confirmUrl: string;
};

export const EVENTS = {
  AccessRecoveryRequested: 'AccessRecoveryRequested',
  InviteCreated: 'InviteCreated',
  ContactInvited: 'ContactInvited',
  UploadLinkResent: 'UploadLinkResent',
  RequestCreated: 'RequestCreated',
  ItemReopened: 'ItemReopened',
  ReviewPublished: 'ReviewPublished',
  RequestCompleted: 'RequestCompleted',
  DeadlineMissed: 'DeadlineMissed',
  ReminderDue: 'ReminderDue',
} as const;

export type EventPayloads = {
  AccessRecoveryRequested: AccessRecoveryRequestedEvent;
  InviteCreated: InviteCreatedEvent;
  ContactInvited: ContactInvitedEvent;
  UploadLinkResent: UploadLinkResentEvent;
  RequestCreated: RequestCreatedEvent;
  ItemReopened: ItemReopenedEvent;
  ReviewPublished: ReviewPublishedEvent;
  RequestCompleted: RequestCompletedEvent;
  DeadlineMissed: DeadlineMissedEvent;
  ReminderDue: ReminderDueEvent;
};
