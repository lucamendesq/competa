import { COMPANY_FLAGS, CreateCompanyBody, email, type CompanyFlag } from '@competa/contracts';
import * as z from 'zod';
import type { CompanyDetail } from '@/features/companies/api/company.types';
import { cnpjInputMask, phoneInputMask } from '@/shared/lib/format';

export const CONTACT_EMAIL_REQUIRED = 'Sem e-mail o Responsável não recebe o link de cobrança.';

const optionalUuid = (message: string) =>
  z.string().refine((value) => value === '' || z.uuid().safeParse(value).success, { message });

export const CompanyFormSchema = z
  .object({
    name: CreateCompanyBody.shape.name,
    checklistTemplateId: optionalUuid('Checklist inválido.'),
    responsibleAccountantId: optionalUuid('Contador inválido.'),
    cnpj: z.string().refine(
      (value) => {
        const digits = value.replace(/\D/g, '');
        return digits === '' || digits.length === 14;
      },
      { message: 'CNPJ incompleto.' },
    ),
    contactName: z.string().trim(),
    contactEmail: z.string().refine((value) => value === '' || email().safeParse(value).success, {
      message: 'E-mail inválido.',
    }),
    contactPhone: z.string().trim(),
    flags: z.record(z.enum(COMPANY_FLAGS), z.boolean()),
  })
  .refine((value) => !value.contactName || value.contactEmail !== '', {
    message: CONTACT_EMAIL_REQUIRED,
    path: ['contactEmail'],
  });
export type CompanyFormValues = z.infer<typeof CompanyFormSchema>;

export const flagsFrom = (
  loaded: { [flag in CompanyFlag]?: boolean | undefined } | null | undefined,
) =>
  Object.fromEntries(COMPANY_FLAGS.map((flag) => [flag, loaded?.[flag] === true])) as Record<
    CompanyFlag,
    boolean
  >;

export const formValuesOf = (company: CompanyDetail | null): CompanyFormValues => {
  const contact = company?.contacts[0];
  return {
    name: company?.name ?? '',
    checklistTemplateId: company?.checklistTemplateId ?? '',
    responsibleAccountantId: company?.responsibleAccountantId ?? '',
    cnpj: cnpjInputMask(company?.cnpj ?? ''),
    contactName: contact?.name ?? '',
    contactEmail: contact?.email ?? '',
    contactPhone: phoneInputMask(contact?.phone ?? ''),
    flags: flagsFrom(company?.flags),
  };
};

const SERVER_FIELD_ALIAS: Record<string, string> = {
  'contact.name': 'contactName',
  'contact.email': 'contactEmail',
  'contact.phone': 'contactPhone',
};

export const formFieldOf = (path: string) => SERVER_FIELD_ALIAS[path] ?? path;

export const contactOf = (values: CompanyFormValues) =>
  values.contactEmail
    ? {
        name: values.contactName || values.name,
        email: values.contactEmail,
        ...(values.contactPhone ? { phone: values.contactPhone } : {}),
      }
    : undefined;
