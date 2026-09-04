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
  /** prazo geral da Competência (fallback dos itens sem prazo próprio) */
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

export type RequestCompletedEvent = {
  requestId: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
};

/** Estouro de prazo de um Item: avisa Responsável E Contador. */
export type DeadlineMissedEvent = {
  requestId: string;
  requestItemId: string;
  itemName: string;
  dueDate: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  uploadUrl: string;
  /** emails dos Contadores da Contabilidade dona */
  accountantEmails: string[];
};

/** Convite de Contador emitido (registry → messaging). `inviteUrl` viaja no evento pelo
 *  mesmo motivo do Link de Upload: o token em claro só existe na emissão. */
export type InviteCreatedEvent = {
  email: string;
  firmName: string;
  inviteUrl: string;
  expiresAt: Date;
};

export const EVENTS = {
  InviteCreated: 'InviteCreated',
  RequestCreated: 'RequestCreated',
  ItemReopened: 'ItemReopened',
  RequestCompleted: 'RequestCompleted',
  DeadlineMissed: 'DeadlineMissed',
} as const;

export type EventPayloads = {
  InviteCreated: InviteCreatedEvent;
  RequestCreated: RequestCreatedEvent;
  ItemReopened: ItemReopenedEvent;
  RequestCompleted: RequestCompletedEvent;
  DeadlineMissed: DeadlineMissedEvent;
};
