import * as z from 'zod';

/** PATCH /accounting-firm — nome e preferências de lembrete (só o dono). Parcial: manda o
 *  que mudou. As faixas espelham o CHECK `accounting_firm_reminder_chk`. */
export const UpdateFirmBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    reminderMax: z.int().min(0).max(10),
    reminderDueSoonDays: z.int().min(0).max(31),
    reminderGapDays: z.int().min(1).max(31),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { message: 'Nada para atualizar.' });
export type UpdateFirmBody = z.infer<typeof UpdateFirmBody>;
