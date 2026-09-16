import * as z from 'zod';
import { COMPANY_FLAGS, OVERRIDE_ACTIONS, Periodicity } from './registry.js';

const scheduling = {
  periodicity: Periodicity.default('monthly'),
  annualMonth: z.number().int().min(1).max(12).nullish(),
  dueDay: z.number().int().min(1).max(31).nullish(),
  dueMonthOffset: z.number().int().min(0).max(11).default(1),
  conditionFlag: z.enum(COMPANY_FLAGS).nullish(),
  required: z.boolean().default(true),
};

const annualNeedsMonth = <T extends { periodicity?: string; annualMonth?: number | null }>(v: T) =>
  v.periodicity !== 'annual' || v.annualMonth != null;
const annualMessage = { message: 'Item anual exige annualMonth.', path: ['annualMonth'] };

export const DeriveTemplateBody = z.object({ name: z.string().trim().min(1).optional() });
export type DeriveTemplateBody = z.infer<typeof DeriveTemplateBody>;

/** Renomear o modelo próprio: o nome era escolhido só na duplicação e não havia como
 *  corrigi-lo depois. */
export const UpdateTemplateBody = z.object({ name: z.string().trim().min(1).max(120) });
export type UpdateTemplateBody = z.infer<typeof UpdateTemplateBody>;

export const CreateTemplateItemBody = z
  .object({ documentTypeId: z.uuid(), ...scheduling })
  .refine(annualNeedsMonth, annualMessage);
export type CreateTemplateItemBody = z.infer<typeof CreateTemplateItemBody>;

export const UpdateTemplateItemBody = z
  .object({
    periodicity: Periodicity,
    annualMonth: z.number().int().min(1).max(12).nullable(),
    dueDay: z.number().int().min(1).max(31).nullable(),
    dueMonthOffset: z.number().int().min(0).max(11),
    conditionFlag: z.enum(COMPANY_FLAGS).nullable(),
    required: z.boolean(),
  })
  .partial()
  .refine(annualNeedsMonth, annualMessage);
export type UpdateTemplateItemBody = z.infer<typeof UpdateTemplateItemBody>;

export const TemplateItemParam = z.object({ id: z.uuid(), itemId: z.uuid() });
export type TemplateItemParam = z.infer<typeof TemplateItemParam>;

export const CreateOverrideBody = z
  .object({ documentTypeId: z.uuid(), action: z.enum(OVERRIDE_ACTIONS), ...scheduling })
  .refine(annualNeedsMonth, annualMessage);
export type CreateOverrideBody = z.infer<typeof CreateOverrideBody>;

export const OverrideParam = z.object({ companyId: z.uuid(), documentTypeId: z.uuid() });
export type OverrideParam = z.infer<typeof OverrideParam>;
