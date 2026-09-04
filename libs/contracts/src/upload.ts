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

/** Criar acesso a partir do Link de Upload: o token já prova posse do email do Responsável
 *  (decisão da Fase 10), então não há senha nem convite — só a confirmação do nome. */
export const CreateContactAccessBody = z.object({
  name: z.string().trim().min(1).optional(),
});
export type CreateContactAccessBody = z.infer<typeof CreateContactAccessBody>;

/** Inscrição de Web Push do navegador do Responsável. */
export const PushSubscriptionBody = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

/** Upload logado: mesmo formato do fluxo por link, sem o token na URL. */
export const MyPresignBody = z.object({
  requestId: z.uuid(),
  requestItemId: z.uuid().nullish(),
  files: z.array(UploadFile).min(1),
});
export type MyPresignBody = z.infer<typeof MyPresignBody>;
