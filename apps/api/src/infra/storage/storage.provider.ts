import type { Readable } from 'node:stream';

export const PRESIGN_TTL_SECONDS = 900;

/** `sizeBytes` entra na assinatura: sem isso o cliente declara 10 MB e sobe 2 GB — o
 *  limite de 100 MB viraria pedido, não regra. */
export type PresignPutInput = {
  storageKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256?: string;
};

export abstract class StorageProvider {
  abstract presignPut(input: PresignPutInput): Promise<string>;
  abstract openRead(storageKey: string): Promise<Readable>;
  abstract statSize(storageKey: string): Promise<number | undefined>;
  abstract readHead(storageKey: string, bytes?: number): Promise<Buffer>;
  abstract remove(storageKey: string): Promise<void>;
}
