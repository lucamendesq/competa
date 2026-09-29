import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import {
  getCompaniesList,
  getCompanyDetail,
  getEffectiveChecklist,
  getOverrides,
  createCompany,
  updateCompany,
  deactivateCompany,
  addContact,
  updateContact,
  removeContact,
  saveOverride,
  removerOverride,
  sendAccessInvites,
  applyTemplate,
} from '../api/companies';
import type {
  CreateCompanyBody,
  UpdateCompanyBody,
  ContactBody,
  CreateOverrideBody,
} from '@competa/contracts';
import { computed, type Ref } from 'vue';

export function useCompaniesFeature(
  page: Ref<number>,
  perPage: Ref<number>,
  active: Ref<string | undefined> = computed(() => undefined),
  search: Ref<string | undefined> = computed(() => undefined),
) {
  const queryKey = computed(() => [
    'companies',
    { page: page.value, perPage: perPage.value, active: active.value, search: search.value },
  ]);
  const queryClient = useQueryClient();

  const companiesQuery = useQuery({
    queryKey,
    queryFn: () =>
      getCompaniesList({
        page: page.value,
        perPage: perPage.value,
        active: active.value,
        search: search.value,
      }),
    placeholderData: (prev) => prev,
  });

  const sendAccessInvitesMutation = useMutation({
    mutationFn: (companyIds: string[]) => sendAccessInvites(companyIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  const applyTemplateMutation = useMutation({
    mutationFn: (params: { companyIds: string[]; checklistTemplateId: string }) =>
      applyTemplate(params.companyIds, params.checklistTemplateId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  return {
    companiesQuery,
    sendAccessInvitesMutation,
    applyTemplateMutation,
  };
}

export function useCompanyDetailFeature(id: Ref<string | undefined>) {
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: computed(() => ['company', id.value]),
    queryFn: () => (id.value ? getCompanyDetail(id.value) : undefined),
    enabled: computed(() => !!id.value),
  });

  const createCompanyMutation = useMutation({
    mutationFn: (body: CreateCompanyBody) => createCompany(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  const updateCompanyMutation = useMutation({
    mutationFn: (body: UpdateCompanyBody) => updateCompany(id.value!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company', id.value] });
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });

  const deactivateCompanyMutation = useMutation({
    mutationFn: () => deactivateCompany(id.value!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  const addContactMutation = useMutation({
    mutationFn: (body: ContactBody) => addContact(id.value!, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company', id.value] }),
  });

  const updateContactMutation = useMutation({
    mutationFn: (params: { contactId: string; body: Partial<ContactBody> }) =>
      updateContact(id.value!, params.contactId, params.body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company', id.value] }),
  });

  const removeContactMutation = useMutation({
    mutationFn: (contactId: string) => removeContact(id.value!, contactId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company', id.value] }),
  });

  return {
    detailQuery,
    createCompanyMutation,
    updateCompanyMutation,
    deactivateCompanyMutation,
    addContactMutation,
    updateContactMutation,
    removeContactMutation,
  };
}

export function useCompanyChecklistFeature(id: Ref<string | undefined>) {
  const queryClient = useQueryClient();

  const effectiveChecklistQuery = useQuery({
    queryKey: computed(() => ['companyChecklist', id.value]),
    queryFn: () => (id.value ? getEffectiveChecklist(id.value) : undefined),
    enabled: computed(() => !!id.value),
  });

  const overridesQuery = useQuery({
    queryKey: computed(() => ['companyOverrides', id.value]),
    queryFn: () => (id.value ? getOverrides(id.value) : undefined),
    enabled: computed(() => !!id.value),
  });

  const saveOverrideMutation = useMutation({
    mutationFn: (body: CreateOverrideBody) => saveOverride(id.value!, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companyChecklist', id.value] });
      queryClient.invalidateQueries({ queryKey: ['companyOverrides', id.value] });
    },
  });

  const removeOverrideMutation = useMutation({
    mutationFn: (documentTypeId: string) => removerOverride(id.value!, documentTypeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companyChecklist', id.value] });
      queryClient.invalidateQueries({ queryKey: ['companyOverrides', id.value] });
    },
  });

  return {
    effectiveChecklistQuery,
    overridesQuery,
    saveOverrideMutation,
    removeOverrideMutation,
  };
}
