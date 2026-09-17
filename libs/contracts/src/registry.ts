import * as z from 'zod';

export const DOCUMENT_CATEGORIES = [
  'fiscal',
  'financial',
  'expense',
  'payroll',
  'tax',
  'corporate',
] as const;
export const PERIODICITIES = ['monthly', 'annual', 'on_demand'] as const;
export const OVERRIDE_ACTIONS = ['add', 'remove'] as const;
export const COMPANY_FLAGS = ['has_employees', 'accepts_card_payments', 'has_inventory'] as const;

export const DocumentCategory = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof DocumentCategory>;

export const Periodicity = z.enum(PERIODICITIES);
export type Periodicity = z.infer<typeof Periodicity>;

export const CompanyFlag = z.enum(COMPANY_FLAGS);
export type CompanyFlag = z.infer<typeof CompanyFlag>;

export const CompanyFlags = z.object({
  has_employees: z.boolean().optional(),
  accepts_card_payments: z.boolean().optional(),
  has_inventory: z.boolean().optional(),
});
export type CompanyFlags = z.infer<typeof CompanyFlags>;

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

export const CompanyIdParam = z.object({ companyId: z.uuid() });
export type CompanyIdParam = z.infer<typeof CompanyIdParam>;
