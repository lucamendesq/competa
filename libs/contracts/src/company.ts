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

export const Phone = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 8, 'Telefone incompleto.');

export const ContactBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome do Responsável.')
    .max(255, 'O nome do Responsável deve ter no máximo 255 caracteres.'),
  email: z.email('E-mail inválido.'),
  phone: Phone.optional(),
});
export type ContactBody = z.infer<typeof ContactBody>;

export const CreateCompanyBody = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe o nome da Empresa.')
    .max(255, 'O nome da Empresa deve ter no máximo 255 caracteres.'),
  checklistTemplateId: z.uuid().optional(),
  cnpj: Cnpj.optional(),
  flags: CompanyFlags.default({}),
  contact: ContactBody.optional(),
});
export type CreateCompanyBody = z.infer<typeof CreateCompanyBody>;

export const UpdateCompanyBody = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Informe o nome da Empresa.')
      .max(255, 'O nome da Empresa deve ter no máximo 255 caracteres.'),
    checklistTemplateId: z.uuid().nullable(),
    cnpj: Cnpj.nullable(),
    flags: CompanyFlags,
    active: z.boolean(),
  })
  .partial();
export type UpdateCompanyBody = z.infer<typeof UpdateCompanyBody>;

export const ApplyTemplateBody = z.object({
  companyIds: z.array(z.uuid()).min(1).max(500),
  checklistTemplateId: z.uuid(),
});
export type ApplyTemplateBody = z.infer<typeof ApplyTemplateBody>;

export const CompanyQuery = PaginationQuery.extend({
  active: z.stringbool().optional(),
  search: z.string().trim().optional(),
});
export type CompanyQuery = z.infer<typeof CompanyQuery>;

/** Teto de linhas por importação. O corpo aceita 2 MB, o que dá ~40 mil linhas: sem cap,
 *  uma importação dessas roda por minutos, estoura o timeout no meio e deixa o tenant com
 *  metade da carteira dentro. Carteira maior que isso entra em lotes. */
export const MAX_IMPORT_ROWS = 1000;

export const ImportCompaniesBody = z.object({
  // ~1 KB por linha com folga; o cap exato de linhas é conferido depois do parse
  csv: z
    .string()
    .min(1)
    .max(MAX_IMPORT_ROWS * 1024, 'Arquivo grande demais. Importe em lotes menores.'),
});
export type ImportCompaniesBody = z.infer<typeof ImportCompaniesBody>;

/** O front reenvia exatamente o que recebeu de `/companies/import` (as linhas já
 *  validadas) — nada é gravado até este passo. */
export const ImportConfirmBody = z.object({
  pending: z
    .array(z.object({ line: z.number(), body: CreateCompanyBody }))
    .min(1)
    .max(MAX_IMPORT_ROWS),
});
export type ImportConfirmBody = z.infer<typeof ImportConfirmBody>;
