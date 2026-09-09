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
  rejected: { itemName: string | null; fileName: string; rejectionReason: string }[];
  uploadUrl: string | null;
};

export type RequestCompletedEvent = {
  requestId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
};

export type DeadlineMissedEvent = {
  requestId: string;
  requestItemId: string;
  itemName: string;
  dueDate: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  uploadUrl: string;
  accountantEmails: string[];
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

export const EVENTS = {
  InviteCreated: 'InviteCreated',
  ContactInvited: 'ContactInvited',
  UploadLinkResent: 'UploadLinkResent',
  RequestCreated: 'RequestCreated',
  ItemReopened: 'ItemReopened',
  ReviewPublished: 'ReviewPublished',
  RequestCompleted: 'RequestCompleted',
  DeadlineMissed: 'DeadlineMissed',
} as const;

export type EventPayloads = {
  InviteCreated: InviteCreatedEvent;
  ContactInvited: ContactInvitedEvent;
  UploadLinkResent: UploadLinkResentEvent;
  RequestCreated: RequestCreatedEvent;
  ItemReopened: ItemReopenedEvent;
  ReviewPublished: ReviewPublishedEvent;
  RequestCompleted: RequestCompletedEvent;
  DeadlineMissed: DeadlineMissedEvent;
};
