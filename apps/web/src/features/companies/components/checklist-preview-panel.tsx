import type { Control } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import { useTemplatePreview } from '@/features/catalog';
import type { CompanyFormValues } from '@/features/companies/components/company-form-schema';
import {
  buildPreview,
  EffectiveChecklistPreview,
  type PreviewLine,
} from '@/features/companies/components/effective-checklist-preview';
import { useEffectiveChecklist } from '@/features/companies/queries/use-company-queries';

type ChecklistPreviewPanelProps = {
  control: Control<CompanyFormValues>;
  companyId: string;
  savedTemplateId: string;
};

export function ChecklistPreviewPanel({
  control,
  companyId,
  savedTemplateId,
}: ChecklistPreviewPanelProps) {
  const [templateId, flags] = useWatch({ control, name: ['checklistTemplateId', 'flags'] });
  const fromOverrides = companyId !== '' && templateId === savedTemplateId;
  const effective = useEffectiveChecklist(fromOverrides ? companyId : '');
  const template = useTemplatePreview(fromOverrides ? '' : templateId);

  const lines: PreviewLine[] = fromOverrides
    ? (effective.data?.items ?? []).map((item) => ({
        key: item.documentTypeId,
        name: item.name,
        category: item.category,
        periodicity: item.periodicity,
        conditionFlag: item.conditionFlag,
        fromOverride: item.source === 'override',
      }))
    : (template.data?.items ?? []).map((item) => ({
        key: item.id,
        name: item.name,
        category: item.category,
        periodicity: item.periodicity,
        conditionFlag: item.conditionFlag,
        fromOverride: false,
      }));
  const loading = fromOverrides ? effective.isLoading : template.isLoading;
  const preview = buildPreview(lines, flags);

  if (loading || (templateId === '' && preview.total === 0)) return null;
  return <EffectiveChecklistPreview preview={preview} />;
}
