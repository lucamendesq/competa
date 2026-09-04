import * as z from 'zod';
import { CompanyFlags } from './registry.js';
import { PaginationQuery } from './pagination.js';

export const Cnpj = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 14, 'CNPJ deve ter 14 dígitos');

export const ContactBody = z.object({
  name: z.string().trim().min(1),
  email: z.email(),
  phone: z.string().trim().min(8).optional(),
});
export type ContactBody = z.infer<typeof ContactBody>;

export const CreateCompanyBody = z.object({
  name: z.string().trim().min(1),
  checklistTemplateId: z.uuid(),
  cnpj: Cnpj.optional(),
  flags: CompanyFlags.default({}),
  contact: ContactBody.optional(),
});
export type CreateCompanyBody = z.infer<typeof CreateCompanyBody>;

export const UpdateCompanyBody = z
  .object({
    name: z.string().trim().min(1),
    checklistTemplateId: z.uuid(),
    cnpj: Cnpj.nullable(),
    flags: CompanyFlags,
    active: z.boolean(),
  })
  .partial();
export type UpdateCompanyBody = z.infer<typeof UpdateCompanyBody>;

export const CompanyQuery = PaginationQuery.extend({
  active: z.stringbool().optional(),
});
export type CompanyQuery = z.infer<typeof CompanyQuery>;

export const ImportCompaniesBody = z.object({
  csv: z.string().min(1),
});
export type ImportCompaniesBody = z.infer<typeof ImportCompaniesBody>;
