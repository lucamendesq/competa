declare const brand: unique symbol;

export type FirmScope = string & { readonly [brand]: 'FirmScope' };

export type UploadScope = { requestId: string; contactId: string } & {
  readonly [brand]: 'UploadScope';
};

/** Sessão do Responsável (Fase 10). Autoriza leitura e envio **da Empresa dele** — a
 *  visibilidade é por Empresa, com o histórico de quem enviou preservado (decisão de
 *  2026-09-04, `docs/domain.md`). Nunca serve conteúdo de documento. */
export type ContactScope = { contactId: string; companyId: string } & {
  readonly [brand]: 'ContactScope';
};

export const toFirmScope = (accountingFirmId: string) => accountingFirmId as FirmScope;

export const toContactScope = (contactId: string, companyId: string) =>
  ({ contactId, companyId }) as ContactScope;

export const toUploadScope = (requestId: string, contactId: string) =>
  ({ requestId, contactId }) as UploadScope;
