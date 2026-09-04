import * as z from 'zod';

/** Contratos do fluxo público de upload (Fase 4). */
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

/** `requestItemId` ausente/nulo = Documento Extra. */
export const PresignUploadBody = z.object({
  requestItemId: z.uuid().nullish(),
  files: z.array(UploadFile).min(1),
});
export type PresignUploadBody = z.infer<typeof PresignUploadBody>;

export const ConfirmUploadBody = z.object({
  documentIds: z.array(z.uuid()).min(1),
});
export type ConfirmUploadBody = z.infer<typeof ConfirmUploadBody>;
