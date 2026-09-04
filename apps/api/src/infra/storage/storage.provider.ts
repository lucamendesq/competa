export const PRESIGN_TTL_SECONDS = 900;

export type PresignPutInput = { storageKey: string; contentType: string };

export abstract class StorageProvider {
  abstract presignPut(input: PresignPutInput): Promise<string>;
}
