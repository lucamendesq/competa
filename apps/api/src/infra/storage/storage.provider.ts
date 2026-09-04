import type { Readable } from 'node:stream';

export const PRESIGN_TTL_SECONDS = 900;

/** `sizeBytes` entra na assinatura: sem isso o cliente declara 10 MB e sobe 2 GB — o
 *  limite de 100 MB viraria pedido, não regra. */
export type PresignPutInput = { storageKey: string; contentType: string; sizeBytes: number };

export abstract class StorageProvider {
  abstract presignPut(input: PresignPutInput): Promise<string>;
  /** Leitura em stream — o zip da Competência não pode carregar arquivo em memória. */
  abstract openRead(storageKey: string): Promise<Readable>;
  /** Tamanho real no storage; `undefined` quando o objeto não existe (presign sem PUT). */
  abstract statSize(storageKey: string): Promise<number | undefined>;
  /** Remove o objeto — usado quando a confirmação recusa o arquivo. */
  abstract remove(storageKey: string): Promise<void>;
}
