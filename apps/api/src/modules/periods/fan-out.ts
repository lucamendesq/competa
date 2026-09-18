import { itemDueDate } from './due-date.js';

type ChecklistLine = {
  documentTypeId: string;
  name: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: string;
  annualMonth: number | null;
  dueDay: number | null;
  dueMonthOffset: number | null;
  applies: boolean;
};

type CompanyRow = {
  id: string;
  name: string;
  checklistTemplateId: string | null;
  contact?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  };
};

export type RequestPlan = {
  companyId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  token: string;
  tokenHash: string;
  expiresAt: Date;
  items: {
    documentTypeId: string;
    name: string;
    description: string | null;
    acceptedFormats: string[];
    dueDate: string | null;
  }[];
};

/** `on_demand` nunca entra no fan-out (vira override ou Documento Extra); `annual` só na
 *  competência do próprio `annual_month`. `applies` já traduz `condition_flag` vs flags. */
export const entersFanOut = (line: ChecklistLine, referenceMonthNumber: number) =>
  line.applies &&
  (line.periodicity === 'monthly' ||
    (line.periodicity === 'annual' && line.annualMonth === referenceMonthNumber));

const canBeCharged = (row: CompanyRow) =>
  Boolean(row.checklistTemplateId) && Boolean(row.contact?.email);

export const planFanOut = (input: {
  companies: CompanyRow[];
  checklistFor: (companyId: string) => ChecklistLine[];
  referenceMonth: string;
  expiresAt: Date;
  createToken: () => { token: string; tokenHash: string };
}) => {
  const referenceMonthNumber = Number(input.referenceMonth.slice(5, 7));

  const warnings = [
    ...input.companies
      .filter((row) => !row.checklistTemplateId)
      .map((row) => ({
        companyId: row.id,
        companyName: row.name,
        reason: 'Empresa ativa sem template de checklist — não recebe cobrança.',
        blockedBy: 'template' as const,
      })),
    ...input.companies
      .filter((row) => row.checklistTemplateId && !canBeCharged(row))
      .map((row) => ({
        companyId: row.id,
        companyName: row.name,
        reason: 'Empresa ativa sem Responsável cadastrado.',
        blockedBy: 'contact' as const,
      })),
  ];

  const plans: RequestPlan[] = input.companies.filter(canBeCharged).map((row) => ({
    companyId: row.id,
    companyName: row.name,
    contactId: row.contact!.id,
    contactName: row.contact!.name,
    contactEmail: row.contact!.email,
    contactPhone: row.contact!.phone,
    ...input.createToken(),
    expiresAt: input.expiresAt,
    items: input
      .checklistFor(row.id)
      .filter((line) => entersFanOut(line, referenceMonthNumber))
      .map((line) => ({
        documentTypeId: line.documentTypeId,
        name: line.name,
        description: line.description,
        acceptedFormats: line.acceptedFormats,
        dueDate: itemDueDate(input.referenceMonth, line.dueDay, line.dueMonthOffset),
      })),
  }));

  return { plans, warnings };
};
