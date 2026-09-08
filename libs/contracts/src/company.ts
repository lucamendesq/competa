import * as z from 'zod';
import { CompanyFlags } from './registry.js';
import { PaginationQuery } from './pagination.js';

/** Dígitos verificadores do CNPJ (módulo 11). Sem isto, 14 dígitos inventados entram na
 *  base e só viram problema meses depois, na entrega ao fisco. */
const cnpjCheckDigitsMatch = (digits: string) => {
  const checkDigit = (slice: string) => {
    let weight = slice.length - 7;
    let sum = 0;

    for (const digit of slice) {
      sum += Number(digit) * weight;
      weight = weight - 1 < 2 ? 9 : weight - 1;
    }

    const rest = sum % 11;

    return rest < 2 ? 0 : 11 - rest;
  };

  return (
    checkDigit(digits.slice(0, 12)) === Number(digits[12]) &&
    checkDigit(digits.slice(0, 13)) === Number(digits[13])
  );
};

export const Cnpj = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length === 14, 'CNPJ deve ter 14 dígitos')
  // 00000000000000 passa no módulo 11 e não é CNPJ
  .refine((v) => !/^(\d)\1{13}$/.test(v), 'CNPJ inválido')
  .refine(cnpjCheckDigitsMatch, 'CNPJ inválido: dígitos verificadores não conferem');

export const ContactBody = z.object({
  name: z.string().trim().min(1, 'Informe o nome do Responsável.'),
  // a mensagem chega ao usuário (formulário do Angular e relatório de importação)
  email: z.email('E-mail inválido.'),
  phone: z.string().trim().min(8, 'Telefone incompleto.').optional(),
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
