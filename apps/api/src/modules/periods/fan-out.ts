import { itemDueDate } from './due-date.js';

/** Uma linha do checklist efetivo, do jeito que o ChecklistRepository devolve. */
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

type CompanyRow = { id: string; name: string; contact?: { id: string } };

export type RequestPlan = {
  companyId: string;
  companyName: string;
  contactId: string;
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

/** Decide, sem tocar no banco, o que a abertura vai gravar: uma Solicitação por Empresa
 *  ativa com Responsável, com os itens já filtrados e o prazo congelado. Empresa ativa sem
 *  Responsável não gera Solicitação — vira aviso para o Contador (invariante do domínio). */
export const planFanOut = (input: {
  companies: CompanyRow[];
  checklistFor: (companyId: string) => ChecklistLine[];
  referenceMonth: string;
  expiresAt: Date;
  createToken: () => { token: string; tokenHash: string };
}) => {
  const referenceMonthNumber = Number(input.referenceMonth.slice(5, 7));

  const warnings = input.companies
    .filter((row) => !row.contact)
    .map((row) => ({
      companyId: row.id,
      companyName: row.name,
      reason: 'Empresa ativa sem Responsável com email — nenhuma Solicitação foi criada.',
    }));

  const plans: RequestPlan[] = input.companies
    .filter((row) => row.contact)
    .map((row) => ({
      companyId: row.id,
      companyName: row.name,
      contactId: row.contact!.id,
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
