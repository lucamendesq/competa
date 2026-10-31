import * as z from 'zod';
import { email, newPassword, plainName } from './common.js';
import { Cnpj } from './company.js';

/** Campo de texto opcional: vazio chega como `''` e vale como ausente. */
const optionalCnpj = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  Cnpj.optional(),
);

/** Cadência (docs/domain.md, risco 2) que vale sem a capability `reminderTuning`: o cron
 *  usa estes valores e a tela de Configurações os mostra no lugar dos gravados. */
export type ReminderSettings = {
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  reminderMax: 2,
  reminderDueSoonDays: 3,
  reminderGapDays: 3,
};

/** PATCH /accounting-firm — nome e preferências de lembrete (só o dono). Parcial: manda o
 *  que mudou. As faixas espelham o CHECK `accounting_firm_reminder_chk`. */
export const UpdateFirmBody = z
  .object({
    name: plainName(
      120,
      'Informe o nome da Contabilidade.',
      'O nome da Contabilidade deve ter no máximo 120 caracteres.',
    ),
    reminderMax: z.int().min(0).max(10),
    reminderDueSoonDays: z.int().min(0).max(31),
    reminderGapDays: z.int().min(1).max(31),
    /* A URL é escolhida pelo tenant e vai parar numa página pública e no corpo de e-mails:
     * só `https`. `http` vira aviso de conteúdo misto, e qualquer outro esquema
     * (`javascript:`, `data:`) é vetor de XSS no `src` da imagem. */
    logoUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(
        (url) => url.startsWith('https://'),
        'O endereço do logo precisa começar com https://',
      )
      .nullable()
      .or(z.literal('').transform(() => null)),
    contactEmail: email()
      .max(255)
      .nullable()
      .or(z.literal('').transform(() => null)),
    /* Sem `nullable`: o CNPJ pode ser corrigido, não apagado — o gateway já tem uma
     * cobrança emitida nele. */
    cnpj: Cnpj,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nada para atualizar.' });
export type UpdateFirmBody = z.infer<typeof UpdateFirmBody>;

export const PublicSignUpBody = z.object({
  /* Mesma régua do PATCH /accounting-firm: sem teto o nome entrava com milhares de
   * caracteres, e um NUL virava 500 no Postgres. */
  firmName: plainName(
    120,
    'Nome da contabilidade é obrigatório.',
    'O nome da Contabilidade deve ter no máximo 120 caracteres.',
  ),
  userName: plainName(
    255,
    'Seu nome é obrigatório.',
    'Seu nome deve ter no máximo 255 caracteres.',
  ),
  email: email(),
  password: newPassword('A senha precisa ter no mínimo 8 caracteres.'),
  cnpj: optionalCnpj,
});
export type PublicSignUpBody = z.infer<typeof PublicSignUpBody>;

export const RegisterFirmBody = PublicSignUpBody;
export type RegisterFirmBody = PublicSignUpBody;
