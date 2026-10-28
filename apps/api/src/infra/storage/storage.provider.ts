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

/** Chave definitiva de um documento confirmado. Nenhuma URL pré-assinada aponta para ela. */
export const sealedKeyOf = (storageKey: string) => `sealed/${storageKey}`;

export abstract class StorageProvider {
  /** Copia o objeto enviado para `sealedKeyOf(storageKey)` e apaga o original; `undefined`
   *  quando o original não existe. A URL de PUT continua valendo até expirar e pode ser
   *  reenviada: o que a confirmação valida (tamanho, tipo, hash) tem de ser a cópia, que
   *  ninguém mais consegue escrever — senão quem tem o link troca o arquivo já conferido. */
  abstract seal(storageKey: string): Promise<string | undefined>;
  abstract presignPut(input: PresignPutInput): Promise<string>;
  abstract openRead(storageKey: string): Promise<Readable>;
  abstract statSize(storageKey: string): Promise<number | undefined>;
  abstract readHead(storageKey: string, bytes?: number): Promise<Buffer>;
  abstract remove(storageKey: string): Promise<void>;
}
