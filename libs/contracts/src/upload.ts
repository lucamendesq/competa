import * as z from 'zod';
import { optionalText } from './common.js';

/** `strict()`: `requestItemId` é do corpo, não de cada arquivo. Sem isso, cliente que
 *  manda o id dentro do arquivo tem a chave descartada pelo pipe e recebe silenciosamente
 *  um Documento Extra, com o Item continuando pendente. */
export const UploadFile = z
  .object({
    fileName: z.string(),
    contentType: z.string().min(1).max(200),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();
export type UploadFile = z.infer<typeof UploadFile>;

/* O teto de 500 também aqui, e não só no repositório: sem `.max()` a lista só era contida
 * pelo limite de 2 MB de JSON do body parser. */
export const PresignUploadBody = z.object({
  requestItemId: z.uuid().nullish(),
  files: z
    .array(UploadFile)
    .min(1, 'Selecione ao menos um arquivo.')
    .max(500, 'Envie no máximo 500 arquivos por vez.'),
});
export type PresignUploadBody = z.infer<typeof PresignUploadBody>;

export const ConfirmUploadBody = z.object({
  documentIds: z.array(z.uuid()).min(1),
});
export type ConfirmUploadBody = z.infer<typeof ConfirmUploadBody>;

/** Ativar acesso a partir do Link de Upload: um toque, SEM senha. A sessão NÃO nasce aqui
 *  — o Link circula por email encaminhado, histórico e log de proxy, e trocá-lo por cookie
 *  daria o acervo inteiro da Empresa a quem o tivesse. A ativação vincula a conta e manda
 *  um magic link para a caixa do Responsável; o acesso se completa de lá. */
export const ActivateContactAccessBody = z.object({
  name: optionalText(),
});
export type ActivateContactAccessBody = z.infer<typeof ActivateContactAccessBody>;

/* O `endpoint` vem do navegador e é gravado por rota ANÔNIMA (`POST /upload/:token/push`).
 * Sem allowlist, ele é uma URL arbitrária que o servidor vai buscar depois — SSRF cego
 * armazenado, com a rede interna do host ao alcance. Os serviços de push são poucos e
 * conhecidos; qualquer coisa fora disso não é uma inscrição de verdade. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com'];
const PUSH_HOST_SUFFIXES = [
  '.push.services.mozilla.com',
  '.push.apple.com',
  '.notify.windows.com',
  '.push.microsoft.com',
];

export const isPushEndpoint = (value: string) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === 'https:' &&
    (PUSH_HOSTS.includes(url.hostname) ||
      PUSH_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix)))
  );
};

export const PushSubscriptionBody = z.object({
  endpoint: z.url().refine(isPushEndpoint, 'Endpoint de push não reconhecido.'),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionBody = z.infer<typeof PushSubscriptionBody>;

export const MyPresignBody = z.object({
  requestId: z.uuid(),
  requestItemId: z.uuid().nullish(),
  files: z.array(UploadFile).min(1),
});
export type MyPresignBody = z.infer<typeof MyPresignBody>;
