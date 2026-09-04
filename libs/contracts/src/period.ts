import * as z from 'zod';

/** `reference_month` é sempre o dia 1 — aceitamos `YYYY-MM` e `YYYY-MM-DD` e normalizamos. */
export const ReferenceMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/, 'Use YYYY-MM ou YYYY-MM-DD')
  .transform((value) => `${value.slice(0, 7)}-01`);

export const OpenPeriodBody = z.object({
  referenceMonth: ReferenceMonth,
  dueDate: z.iso.date().optional(),
});
export type OpenPeriodBody = z.infer<typeof OpenPeriodBody>;
