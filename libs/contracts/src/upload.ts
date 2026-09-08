import * as z from 'zod';
import { optionalText } from './common.js';

/** `strict()`: `requestItemId` é do corpo, não de cada arquivo. Sem isso, cliente que
 *  manda o id dentro do arquivo tem a chave descartada pelo pipe e recebe silenciosamente
 *  um Documento Extra, com o Item continuando pendente. */
export const UploadFile = z
  .object({
    fileName: z.string().min(1).max(255),
    contentType: z.string().min(1).max(200),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type UploadFile = z.infer<typeof UploadFile>;

export const PresignUploadBody = z.object({
  requestItemId: z.uuid().nullish(),
  files: z.array(UploadFile).min(1),
});
export type PresignUploadBody = z.infer<typeof PresignUploadBody>;

export const ConfirmUploadBody = z.object({
  documentIds: z.array(z.uuid()).min(1),
});
export type ConfirmUploadBody = z.infer<typeof ConfirmUploadBody>;

/** Ativar acesso a partir do Link de Upload: um toque, SEM senha. O token já provou posse
 *  da caixa e o fan-out manda um link novo todo mês (e o "perdi meu link" reenvia), então
 *  esta porta nunca fecha — não há por que cobrar uma credencial que se usa 1×/mês. */
export const ActivateContactAccessBody = z.object({
  name: optionalText(),
});
export type ActivateContactAccessBody = z.infer<typeof ActivateContactAccessBody>;

export const PushSubscriptionBody = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

export const MyPresignBody = z.object({
  requestId: z.uuid(),
  requestItemId: z.uuid().nullish(),
  files: z.array(UploadFile).min(1),
});
export type MyPresignBody = z.infer<typeof MyPresignBody>;
