import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import {
  getTemplates,
  getTemplateDetail,
  getDocumentTypes,
  renameTemplate,
  deriveTemplate, createTemplate,
  addItemToTemplate,
  updateTemplateItem,
  removeTemplateItem,
  deleteTemplate,
} from '../api/checklists';
import type { CreateTemplateItemBody, UpdateTemplateItemBody } from '@competa/contracts';
import { computed, type Ref } from 'vue';

export function useChecklistsFeature() {
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () => getTemplates(),
  });

  const renameTemplateMutation = useMutation({
    mutationFn: (params: { id: string; name: string }) => renameTemplate(params.id, params.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (name: string) => createTemplate(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const deriveTemplateMutation = useMutation({
    mutationFn: (params: { id: string; name?: string }) => deriveTemplate(params.id, params.name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  });

  return {
    templatesQuery,
    renameTemplateMutation,
    createTemplateMutation,
    deriveTemplateMutation,
    deleteTemplateMutation,
  };
}

export function useTemplateDetailFeature(id: Ref<string | undefined>) {
  const queryClient = useQueryClient();

  const queryKey = computed(() => ['templateDetail', id.value]);

  const detailQuery = useQuery({
    queryKey,
    queryFn: () => (id.value ? getTemplateDetail(id.value) : undefined),
    enabled: computed(() => !!id.value),
  });

  const addItemMutation = useMutation({
    mutationFn: (body: CreateTemplateItemBody) => addItemToTemplate(id.value!, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey.value }),
  });

  const updateItemMutation = useMutation({
    mutationFn: (params: { itemId: string; body: UpdateTemplateItemBody }) =>
      updateTemplateItem(id.value!, params.itemId, params.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey.value }),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => removeTemplateItem(id.value!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey.value }),
  });

  return {
    detailQuery,
    addItemMutation,
    updateItemMutation,
    removeItemMutation,
  };
}

export function useDocumentTypesFeature(
  page: Ref<number>,
  perPage: Ref<number>,
  category: Ref<string | undefined> = computed(() => undefined),
) {
  const queryKey = computed(() => [
    'documentTypes',
    { page: page.value, perPage: perPage.value, category: category.value },
  ]);

  const documentTypesQuery = useQuery({
    queryKey,
    queryFn: () =>
      getDocumentTypes({ page: page.value, perPage: perPage.value, category: category.value }),
    placeholderData: (prev) => prev,
  });

  return { documentTypesQuery };
}
