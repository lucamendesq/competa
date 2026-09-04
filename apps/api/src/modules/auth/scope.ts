declare const brand: unique symbol;

export type FirmScope = string & { readonly [brand]: 'FirmScope' };

export type UploadScope = { requestId: string; contactId: string } & {
  readonly [brand]: 'UploadScope';
};

export const toFirmScope = (accountingFirmId: string) => accountingFirmId as FirmScope;

export const toUploadScope = (requestId: string, contactId: string) =>
  ({ requestId, contactId }) as UploadScope;
