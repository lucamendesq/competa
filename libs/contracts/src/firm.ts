import * as z from 'zod';
import { email, plainName } from './common.js';

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
    logoUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .nullable()
      .or(z.literal('').transform(() => null)),
    contactEmail: email()
      .max(255)
      .nullable()
      .or(z.literal('').transform(() => null)),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nada para atualizar.' });
export type UpdateFirmBody = z.infer<typeof UpdateFirmBody>;

export const PublicSignUpBody = z.object({
  firmName: z.string().trim().min(1, 'Nome da contabilidade é obrigatório.'),
  userName: z.string().trim().min(1, 'Seu nome é obrigatório.'),
  email: email(),
  password: z.string().min(8, 'A senha precisa ter no mínimo 8 caracteres.'),
});
export type PublicSignUpBody = z.infer<typeof PublicSignUpBody>;
