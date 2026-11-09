import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { companyKeys } from '@/features/companies/queries/company-keys';
import {
  useActivateCompanies,
  useAddContact,
  useApplyTemplate,
  useConfirmImport,
  useCreateCompany,
  useDeactivateCompany,
  useImportCsv,
  useRemoveContact,
  useRemoveOverride,
  useRevokeAccess,
  useSaveOverride,
  useSendAccessInvites,
  useUpdateCompany,
  useUpdateContact,
} from '@/features/companies/queries/use-company-mutations';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders } from '@/testing/test-utils';

const ok = () => HttpResponse.json(envelope({}));

const invalidatedBy = async (
  hook: () => { mutateAsync: (variables: never) => Promise<unknown> },
  variables?: unknown,
) => {
  const { result, queryClient } = renderHookWithProviders(hook);
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  await act(() => result.current.mutateAsync(variables as never));
  return spy.mock.calls.map(([filters]) => filters?.queryKey);
};

describe('mutations de companies', () => {
  it.each([
    [
      'criar',
      () => useCreateCompany(),
      'post',
      '/companies',
      { name: 'X' },
      [companyKeys.lists(), companyKeys.usage()],
    ],
    [
      'editar',
      () => useUpdateCompany('c1'),
      'patch',
      '/companies/c1',
      { name: 'X' },
      [companyKeys.detail('c1'), companyKeys.lists()],
    ],
    [
      'desativar',
      () => useDeactivateCompany(),
      'delete',
      '/companies/c1',
      'c1',
      [companyKeys.lists(), companyKeys.usage()],
    ],
    [
      'adicionar Responsável',
      () => useAddContact('c1'),
      'post',
      '/companies/c1/contacts',
      { name: 'A', email: 'a@b.com' },
      [companyKeys.detail('c1')],
    ],
    [
      'editar Responsável',
      () => useUpdateContact('c1'),
      'patch',
      '/companies/c1/contacts/k1',
      { contactId: 'k1', body: { name: 'A' } },
      [companyKeys.detail('c1')],
    ],
    [
      'remover Responsável',
      () => useRemoveContact('c1'),
      'delete',
      '/companies/c1/contacts/k1',
      'k1',
      [companyKeys.detail('c1')],
    ],
    [
      'revogar acesso',
      () => useRevokeAccess('c1'),
      'delete',
      '/companies/c1/contacts/k1/access',
      'k1',
      [companyKeys.detail('c1'), companyKeys.lists(), companyKeys.accesses('c1')],
    ],
    [
      'salvar override',
      () => useSaveOverride('c1'),
      'put',
      '/companies/c1/checklist-overrides',
      { documentTypeId: 'd', action: 'add' },
      [companyKeys.checklist('c1'), companyKeys.overrides('c1')],
    ],
    [
      'remover override',
      () => useRemoveOverride('c1'),
      'delete',
      '/companies/c1/checklist-overrides/d1',
      'd1',
      [companyKeys.checklist('c1'), companyKeys.overrides('c1')],
    ],
    [
      'convidar para o app',
      () => useSendAccessInvites(),
      'post',
      '/companies/access-invites',
      ['c1'],
      [companyKeys.lists()],
    ],
    [
      'aplicar template',
      () => useApplyTemplate(),
      'post',
      '/companies/apply-template',
      { companyIds: ['c1', 'c2'], checklistTemplateId: 't' },
      [companyKeys.lists(), companyKeys.detail('c1'), companyKeys.detail('c2')],
    ],
    [
      'ativar',
      () => useActivateCompanies(),
      'post',
      '/companies/activate',
      ['c1'],
      [companyKeys.lists(), companyKeys.usage()],
    ],
    [
      'confirmar importação',
      () => useConfirmImport(),
      'post',
      '/companies/import/confirm',
      { pending: [], activate: false },
      [companyKeys.lists(), companyKeys.usage()],
    ],
    ['prévia da importação', () => useImportCsv(), 'post', '/companies/import', 'nome\nX', []],
  ] as const)(
    '%s invalida exatamente as keys do ticket',
    async (_label, hook, method, path, variables, expected) => {
      server.use(http[method](apiUrl(path), ok));

      expect(await invalidatedBy(hook as never, variables)).toEqual(expected);
    },
  );
});

describe('companyKeys', () => {
  it('cada busca tem sua key', () => {
    expect(companyKeys.list({ page: 1, perPage: 20, search: 'a' })).not.toEqual(
      companyKeys.list({ page: 1, perPage: 20, search: 'ab' }),
    );
  });
});
