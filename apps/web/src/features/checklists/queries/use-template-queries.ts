import { useQuery } from '@tanstack/react-query';
import { getTemplate } from '@/features/checklists/api/get-template';
import { templateKeys } from '@/features/checklists/queries/template-keys';

export const useTemplate = (id: string) =>
  useQuery({ queryKey: templateKeys.detail(id), queryFn: ({ signal }) => getTemplate(id, signal) });
