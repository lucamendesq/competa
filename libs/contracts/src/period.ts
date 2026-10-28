import * as z from 'zod';

/* Ano de 2000 a 2099: `0000-01` passava na regex e o Postgres recusava a data — 500. */
export const ReferenceMonth = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, 'Use YYYY-MM ou YYYY-MM-DD')
  .transform((value) => `${value.slice(0, 7)}-01`);

/* Prazo antes do mês de referência marcava como atrasado, já na abertura, todo item que
 * herda o prazo da Competência. */
export const OpenPeriodBody = z
  .object({
    referenceMonth: ReferenceMonth,
    dueDate: z.iso.date().optional(),
  })
  .refine((body) => !body.dueDate || body.dueDate >= body.referenceMonth, {
    path: ['dueDate'],
    message: 'O prazo não pode ser anterior ao mês da competência.',
  });
export type OpenPeriodBody = z.infer<typeof OpenPeriodBody>;
