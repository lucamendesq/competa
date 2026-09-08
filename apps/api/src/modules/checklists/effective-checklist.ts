import type { CompanyFlags, Periodicity } from '@contabilidade/contracts';

export type ChecklistLine = {
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: Periodicity;
  annualMonth: number | null;
  dueDay: number | null;
  dueMonthOffset: number;
  conditionFlag: string | null;
  required: boolean;
};

export type EffectiveLine = ChecklistLine & { source: 'template' | 'override' };

type OverrideRow = {
  documentTypeId: string;
  action: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity?: string | null;
  annualMonth?: number | null;
  dueDay?: number | null;
  dueMonthOffset?: number | null;
  conditionFlag?: string | null;
  required?: boolean | null;
};

export const mergeEffectiveChecklist = (
  templateLines: ChecklistLine[],
  overrides: OverrideRow[],
): EffectiveLine[] => {
  const removed = new Set(
    overrides.filter((o) => o.action === 'remove').map((o) => o.documentTypeId),
  );

  const kept: EffectiveLine[] = templateLines
    .filter((line) => !removed.has(line.documentTypeId))
    .map((line) => ({ ...line, source: 'template' }));

  const added: EffectiveLine[] = overrides
    .filter((o) => o.action === 'add')
    .map((o) => ({
      documentTypeId: o.documentTypeId,
      name: o.name,
      category: o.category,
      description: o.description,
      acceptedFormats: o.acceptedFormats,
      periodicity: (o.periodicity ?? 'monthly') as Periodicity,
      annualMonth: o.annualMonth ?? null,
      dueDay: o.dueDay ?? null,
      dueMonthOffset: o.dueMonthOffset ?? 1,
      conditionFlag: o.conditionFlag ?? null,
      required: o.required ?? true,
      source: 'override',
    }));

  const overridden = new Set(added.map((line) => line.documentTypeId));

  return [...kept.filter((line) => !overridden.has(line.documentTypeId)), ...added].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
};

export const appliesToFlags = (line: EffectiveLine, flags: CompanyFlags) =>
  line.conditionFlag === null || flags[line.conditionFlag as keyof CompanyFlags] === true;
