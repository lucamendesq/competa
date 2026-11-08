import type {
  ContactBody,
  CreateCompanyBody,
  CreateOverrideBody,
  UpdateCompanyBody,
} from '@competa/contracts';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  activateCompanies,
  applyTemplate,
  sendAccessInvites,
} from '@/features/companies/api/bulk-actions';
import {
  addContact,
  removeContact,
  revokeAccess,
  updateContact,
} from '@/features/companies/api/contacts';
import { createCompany } from '@/features/companies/api/create-company';
import { deactivateCompany } from '@/features/companies/api/deactivate-company';
import { confirmImport, importCsv } from '@/features/companies/api/import-companies';
import { removeOverride, saveOverride } from '@/features/companies/api/overrides';
import { updateCompany } from '@/features/companies/api/update-company';
import type { PendingImportRow } from '@/features/companies/api/company.types';
import { companyKeys } from '@/features/companies/queries/company-keys';

const useInvalidate = () => {
  const queryClient = useQueryClient();
  return (...keys: QueryKey[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
};

export const useCreateCompany = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateCompanyBody) => createCompany(body),
    onSuccess: () => invalidate(companyKeys.lists(), companyKeys.usage()),
  });
};

export const useUpdateCompany = (id: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: UpdateCompanyBody) => updateCompany(id, body),
    onSuccess: () => invalidate(companyKeys.detail(id), companyKeys.lists()),
  });
};

export const useDeactivateCompany = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => deactivateCompany(id),
    onSuccess: () => invalidate(companyKeys.lists(), companyKeys.usage()),
  });
};

export const useAddContact = (companyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ContactBody) => addContact(companyId, body),
    onSuccess: () => invalidate(companyKeys.detail(companyId)),
  });
};

export const useUpdateContact = (companyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ contactId, body }: { contactId: string; body: Partial<ContactBody> }) =>
      updateContact(companyId, contactId, body),
    onSuccess: () => invalidate(companyKeys.detail(companyId)),
  });
};

export const useRemoveContact = (companyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (contactId: string) => removeContact(companyId, contactId),
    onSuccess: () => invalidate(companyKeys.detail(companyId)),
  });
};

export const useRevokeAccess = (companyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (contactId: string) => revokeAccess(companyId, contactId),
    onSuccess: () =>
      invalidate(
        companyKeys.detail(companyId),
        companyKeys.lists(),
        companyKeys.accesses(companyId),
      ),
  });
};

export const useSaveOverride = (companyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: CreateOverrideBody) => saveOverride(companyId, body),
    onSuccess: () => invalidate(companyKeys.checklist(companyId), companyKeys.overrides(companyId)),
  });
};

export const useRemoveOverride = (companyId: string) => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (documentTypeId: string) => removeOverride(companyId, documentTypeId),
    onSuccess: () => invalidate(companyKeys.checklist(companyId), companyKeys.overrides(companyId)),
  });
};

export const useSendAccessInvites = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (companyIds: string[]) => sendAccessInvites(companyIds),
    onSuccess: () => invalidate(companyKeys.lists()),
  });
};

export const useApplyTemplate = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      companyIds,
      checklistTemplateId,
    }: {
      companyIds: string[];
      checklistTemplateId: string;
    }) => applyTemplate(companyIds, checklistTemplateId),
    onSuccess: (_result, { companyIds }) =>
      invalidate(companyKeys.lists(), ...companyIds.map((id) => companyKeys.detail(id))),
  });
};

export const useActivateCompanies = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (companyIds: string[]) => activateCompanies(companyIds),
    onSuccess: () => invalidate(companyKeys.lists(), companyKeys.usage()),
  });
};

export const useImportCsv = () => useMutation({ mutationFn: (csv: string) => importCsv(csv) });

export const useConfirmImport = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ pending, activate }: { pending: PendingImportRow[]; activate: boolean }) =>
      confirmImport(pending, activate),
    onSuccess: () => invalidate(companyKeys.lists(), companyKeys.usage()),
  });
};
