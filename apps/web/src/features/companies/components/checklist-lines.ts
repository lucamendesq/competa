import type { EffectiveChecklist, Override } from '@/features/companies/api/company.types';

export type ChecklistRow = {
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: string;
  dueDay: number | null;
  included: boolean;
  source: 'template' | 'adicionado' | 'removido';
  applicable: boolean;
  conditionFlag: string | null;
};

export const checklistRows = (
  effective: EffectiveChecklist | undefined,
  overrides: Override[] | undefined,
) => {
  const fromEffective: ChecklistRow[] = (effective?.items ?? []).map((item) => ({
    documentTypeId: item.documentTypeId,
    name: item.name,
    category: item.category,
    description: item.description,
    acceptedFormats: item.acceptedFormats,
    periodicity: item.periodicity,
    dueDay: item.dueDay,
    included: true,
    source: item.source === 'override' ? 'adicionado' : 'template',
    applicable: item.applies,
    conditionFlag: item.conditionFlag,
  }));
  const fromRemoved: ChecklistRow[] = (overrides ?? [])
    .filter((override) => override.action === 'remove')
    .map((override) => ({
      documentTypeId: override.documentTypeId,
      name: override.name,
      category: override.category,
      description: override.description,
      acceptedFormats: override.acceptedFormats,
      periodicity: override.periodicity ?? 'monthly',
      dueDay: override.dueDay,
      included: false,
      source: 'removido',
      applicable: true,
      conditionFlag: override.conditionFlag,
    }));
  return [...fromEffective, ...fromRemoved].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
};

export const groupByCategory = (rows: ChecklistRow[]) => {
  const groups = new Map<string, ChecklistRow[]>();
  for (const row of rows) groups.set(row.category, [...(groups.get(row.category) ?? []), row]);
  return [...groups];
};
