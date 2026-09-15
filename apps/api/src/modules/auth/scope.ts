declare const brand: unique symbol;

export type FirmScope = string & { readonly [brand]: 'FirmScope' };

export type UploadScope = { requestId: string; contactId: string } & {
  readonly [brand]: 'UploadScope';
};

export type ContactMembership = { contactId: string; companyId: string };

/** Um user Responsável tem um `contact` por Empresa: o escopo carrega todos os vínculos
 *  ativos, e cada query da área logada filtra por `companyIds`/`contactIds`. */
export type ContactScope = { memberships: ContactMembership[] } & {
  readonly [brand]: 'ContactScope';
};

export const toFirmScope = (accountingFirmId: string) => accountingFirmId as FirmScope;

export const toContactScope = (memberships: ContactMembership[]) =>
  ({ memberships }) as ContactScope;

export const companyIdsOf = (scope: ContactScope) =>
  scope.memberships.map((row) => row.companyId);

export const contactIdsOf = (scope: ContactScope) =>
  scope.memberships.map((row) => row.contactId);

export const toUploadScope = (requestId: string, contactId: string) =>
  ({ requestId, contactId }) as UploadScope;
