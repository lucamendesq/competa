declare const brand: unique symbol;

/** Escopo do tenant. Só os guards deste diretório constroem — fazer o cast
 *  em qualquer outro lugar é bug de segurança (LGPD/sigilo), não de estilo. */
export type FirmScope = string & { readonly [brand]: 'FirmScope' };

/** Escopo do Link de Upload: preso a UMA Solicitação e só-escrita. */
export type UploadScope = { requestId: string; contactId: string } & {
  readonly [brand]: 'UploadScope';
};

export const toFirmScope = (accountingFirmId: string) => accountingFirmId as FirmScope;

export const toUploadScope = (requestId: string, contactId: string) =>
  ({ requestId, contactId }) as UploadScope;
