import type { Readable } from 'node:stream';

export const PRESIGN_TTL_SECONDS = 900;

export type PresignPutInput = { storageKey: string; contentType: string };

export abstract class StorageProvider {
  abstract presignPut(input: PresignPutInput): Promise<string>;
  /** Leitura em stream — o zip da Competência não pode carregar arquivo em memória. */
  abstract openRead(storageKey: string): Promise<Readable>;
}
