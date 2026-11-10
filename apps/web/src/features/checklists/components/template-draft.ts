import type { CompanyFlag, Periodicity } from '@competa/contracts';
import type { CatalogDocument } from '@/features/catalog';
import type { TemplateDetail, TemplateItem } from '@/features/checklists/api/template.types';

export type DraftItem = Omit<TemplateItem, 'category'> & { category: string; added: boolean };

export type TemplateDraft = {
  name: string;
  items: DraftItem[];
  removedIds: string[];
  nextTempId: number;
  nameError: string | null;
};

export type DraftAction =
  | { type: 'reset'; template: TemplateDetail }
  | { type: 'rename'; name: string }
  | { type: 'nameError'; message: string }
  | { type: 'patch'; itemId: string; change: Partial<DraftItem> }
  | { type: 'add'; document: CatalogDocument }
  | { type: 'remove'; item: DraftItem };

export const draftOf = (template: TemplateDetail): TemplateDraft => ({
  name: template.name,
  items: template.items.map((item) => ({ ...item, added: false })),
  removedIds: [],
  nextTempId: 0,
  nameError: null,
});

export function draftReducer(draft: TemplateDraft, action: DraftAction): TemplateDraft {
  switch (action.type) {
    case 'reset':
      return draftOf(action.template);
    case 'rename':
      return { ...draft, name: action.name, nameError: null };
    case 'nameError':
      return { ...draft, nameError: action.message };
    case 'patch':
      return {
        ...draft,
        items: draft.items.map((item) =>
          item.id === action.itemId ? { ...item, ...action.change } : item,
        ),
      };
    case 'add': {
      const nextTempId = draft.nextTempId + 1;
      return {
        ...draft,
        nextTempId,
        items: [
          ...draft.items,
          {
            id: `novo-${nextTempId}`,
            documentTypeId: action.document.id,
            name: action.document.name,
            category: action.document.category,
            description: null,
            acceptedFormats: action.document.acceptedFormats,
            periodicity: 'monthly',
            annualMonth: null,
            dueDay: null,
            dueMonthOffset: 1,
            conditionFlag: null,
            required: true,
            added: true,
          },
        ],
      };
    }
    case 'remove':
      return action.item.added
        ? { ...draft, items: draft.items.filter((row) => row.id !== action.item.id) }
        : { ...draft, removedIds: [...draft.removedIds, action.item.id] };
  }
}

export const visibleItemsOf = (draft: TemplateDraft) =>
  draft.items.filter((item) => !draft.removedIds.includes(item.id));

export const isItemDirty = (item: DraftItem, saved: TemplateDetail) => {
  const original = saved.items.find((row) => row.id === item.id);
  if (!original) return true;
  return (
    original.periodicity !== item.periodicity ||
    original.annualMonth !== item.annualMonth ||
    original.dueDay !== item.dueDay ||
    original.dueMonthOffset !== item.dueMonthOffset ||
    original.conditionFlag !== item.conditionFlag ||
    original.required !== item.required
  );
};

export const pendingCountOf = (draft: TemplateDraft, saved: TemplateDetail) =>
  (draft.name.trim() !== saved.name ? 1 : 0) +
  visibleItemsOf(draft).filter((item) => isItemDirty(item, saved)).length +
  draft.removedIds.length;

export const schedulingOf = (item: DraftItem) => ({
  periodicity: item.periodicity as Periodicity,
  annualMonth: item.annualMonth,
  dueDay: item.dueDay,
  dueMonthOffset: item.dueMonthOffset,
  conditionFlag: item.conditionFlag as CompanyFlag | null,
  required: item.required,
});
