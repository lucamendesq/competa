import type { CreateTemplateItemBody, UpdateTemplateItemBody } from '@competa/contracts';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { catalogKeys } from '@/features/catalog';
import { addTemplateItem } from '@/features/checklists/api/add-template-item';
import { createTemplate } from '@/features/checklists/api/create-template';
import { deleteTemplate } from '@/features/checklists/api/delete-template';
import { deriveTemplate } from '@/features/checklists/api/derive-template';
import { removeTemplateItem } from '@/features/checklists/api/remove-template-item';
import { renameTemplate } from '@/features/checklists/api/rename-template';
import { updateTemplateItem } from '@/features/checklists/api/update-template-item';
import { templateKeys } from '@/features/checklists/queries/template-keys';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return (...keys: QueryKey[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
};

export const useCreateTemplate = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => createTemplate(name),
    onSuccess: () => invalidate(catalogKeys.templates()),
  });
};

export const useRenameTemplate = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => renameTemplate(id, name),
    onSuccess: () => invalidate(templateKeys.detail(id), catalogKeys.templates()),
  });
};

export const useDeriveTemplate = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name?: string }) => deriveTemplate(id, name),
    onSuccess: () => invalidate(catalogKeys.templates()),
  });
};

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: templateKeys.detail(id) });
      return invalidate(catalogKeys.templates());
    },
  });
};

const useItemMutation = <Variables>(
  templateId: string,
  mutationFn: (variables: Variables) => Promise<unknown>,
) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      invalidate(
        templateKeys.detail(templateId),
        catalogKeys.templates(),
        catalogKeys.templatePreview(templateId),
      ),
  });
};

export const useAddTemplateItem = (templateId: string) =>
  useItemMutation(templateId, (body: CreateTemplateItemBody) => addTemplateItem(templateId, body));

export const useUpdateTemplateItem = (templateId: string) =>
  useItemMutation(
    templateId,
    ({ itemId, body }: { itemId: string; body: UpdateTemplateItemBody }) =>
      updateTemplateItem(templateId, itemId, body),
  );

export const useRemoveTemplateItem = (templateId: string) =>
  useItemMutation(templateId, (itemId: string) => removeTemplateItem(templateId, itemId));
