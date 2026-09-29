export type MessageToSend = {
  requestId?: string;
  tenantId?: string;
  purpose?: string;
  recipient: string;
  subject: string;
  body: string;
  senderName?: string;
};

/** Provedor de canal (regra 10: API externa só aqui dentro). `send` lança em falha;
 *  quem chama registra a linha `failed` — nunca propaga para o fluxo de negócio. */
export abstract class MessageProvider {
  readonly channel: string = 'email';

  abstract send(message: MessageToSend): Promise<string | undefined | void>;
}
