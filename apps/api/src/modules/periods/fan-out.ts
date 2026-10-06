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
  required: boolean;
  applies: boolean;
};

type CompanyRow = {
  id: string;
  name: string;
  checklistTemplateId: string | null;
  contactCount?: number;
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
    required: boolean;
    dueDate: string | null;
  }[];
};

/** `on_demand` nunca entra no fan-out (vira override ou Documento Extra); `annual` só na
 *  competência do próprio `annual_month`. `applies` já traduz `condition_flag` vs flags. */
export const entersFanOut = (line: ChecklistLine, referenceMonthNumber: number) =>
  line.applies &&
  (line.periodicity === 'monthly' ||
    (line.periodicity === 'annual' && line.annualMonth === referenceMonthNumber));

export const planFanOut = (input: {
  companies: CompanyRow[];
  checklistFor: (companyId: string) => ChecklistLine[];
  referenceMonth: string;
  expiresAt: Date;
  createToken: () => { token: string; tokenHash: string };
}) => {
  const referenceMonthNumber = Number(input.referenceMonth.slice(5, 7));

  /* O que decide se a Empresa entra é o checklist EFETIVO ter item nesta competência, não
   * ela ter um template. Empresa sem template mas com overrides de adição tem checklist na
   * tela e era descartada aqui; empresa com template cujo checklist resolve para zero
   * itens recebia Solicitação vazia e um email inútil. */
  const prepared = input.companies.map((row) => ({
    row,
    items: input
      .checklistFor(row.id)
      .filter((line) => entersFanOut(line, referenceMonthNumber))
      .map((line) => ({
        documentTypeId: line.documentTypeId,
        name: line.name,
        description: line.description,
        acceptedFormats: line.acceptedFormats,
        required: line.required,
        dueDate: itemDueDate(input.referenceMonth, line.dueDay, line.dueMonthOffset),
      })),
  }));

  const warnings = [
    ...prepared
      .filter(({ items }) => items.length === 0)
      .map(({ row }) => ({
        companyId: row.id,
        companyName: row.name,
        reason: row.checklistTemplateId
          ? 'Checklist da Empresa não tem nenhum item nesta competência — não recebe cobrança.'
          : 'Empresa ativa sem template de checklist — não recebe cobrança.',
        blockedBy: 'template' as const,
      })),
    ...prepared
      .filter(({ row, items }) => items.length > 0 && !row.contact?.email)
      .map(({ row }) => ({
        companyId: row.id,
        companyName: row.name,
        reason: 'Empresa ativa sem Responsável cadastrado.',
        blockedBy: 'contact' as const,
      })),
    /* Um Link de Upload por Solicitação é constraint do banco (`upload_link_request_uidx`):
     * com mais de um Responsável, só o mais antigo recebe. Avisar em vez de silenciar. */
    ...prepared
      .filter(({ row, items }) => items.length > 0 && (row.contactCount ?? 0) > 1)
      .map(({ row }) => ({
        companyId: row.id,
        companyName: row.name,
        reason: `Empresa tem ${row.contactCount} Responsáveis; o link vai só para ${row.contact?.name ?? 'o primeiro cadastrado'}.`,
        blockedBy: 'contact' as const,
      })),
  ];

  const plans: RequestPlan[] = prepared
    .filter(({ row, items }) => items.length > 0 && row.contact?.email)
    .map(({ row, items }) => ({
      companyId: row.id,
      companyName: row.name,
      contactId: row.contact!.id,
      contactName: row.contact!.name,
      contactEmail: row.contact!.email,
      contactPhone: row.contact!.phone,
      ...input.createToken(),
      expiresAt: input.expiresAt,
      items,
    }));

  return { plans, warnings };
};
