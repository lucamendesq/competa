import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { catalogKeys } from '@/features/catalog';
import { templateKeys } from '@/features/checklists/queries/template-keys';
import {
  useAddTemplateItem,
  useCreateTemplate,
  useDeleteTemplate,
  useDeriveTemplate,
  useRemoveTemplateItem,
  useRenameTemplate,
  useUpdateTemplateItem,
} from '@/features/checklists/queries/use-template-mutations';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';
import { renderHookWithProviders } from '@/testing/test-utils';

const ok = () => HttpResponse.json(envelope({}));

const run = async (
  hook: () => { mutateAsync: (variables: never) => Promise<unknown> },
  variables: unknown,
) => {
  const { result, queryClient } = renderHookWithProviders(hook);
  const invalidated = vi.spyOn(queryClient, 'invalidateQueries');
  const removed = vi.spyOn(queryClient, 'removeQueries');
  await act(() => result.current.mutateAsync(variables as never));
  return {
    invalidated: invalidated.mock.calls.map(([filters]) => filters?.queryKey),
    removed: removed.mock.calls.map(([filters]) => filters?.queryKey),
  };
};

const itemKeys = [
  templateKeys.detail('t1'),
  catalogKeys.templates(),
  catalogKeys.templatePreview('t1'),
];

describe('mutations de checklists', () => {
  it.each([
    [
      'criar',
      () => useCreateTemplate(),
      'post',
      '/checklist-templates',
      'Novo',
      [catalogKeys.templates()],
    ],
    [
      'renomear',
      () => useRenameTemplate('t1'),
      'patch',
      '/checklist-templates/t1',
      'Outro',
      [templateKeys.detail('t1'), catalogKeys.templates()],
    ],
    [
      'derivar',
      () => useDeriveTemplate(),
      'post',
      '/checklist-templates/t1/derive',
      { id: 't1' },
      [catalogKeys.templates()],
    ],
    [
      'adicionar item',
      () => useAddTemplateItem('t1'),
      'post',
      '/checklist-templates/t1/items',
      { documentTypeId: 'd1' },
      itemKeys,
    ],
    [
      'editar item',
      () => useUpdateTemplateItem('t1'),
      'patch',
      '/checklist-templates/t1/items/i1',
      { itemId: 'i1', body: { required: false } },
      itemKeys,
    ],
    [
      'remover item',
      () => useRemoveTemplateItem('t1'),
      'delete',
      '/checklist-templates/t1/items/i1',
      'i1',
      itemKeys,
    ],
  ] as const)(
    '%s invalida as keys certas',
    async (_label, hook, method, path, variables, expected) => {
      server.use(http[method](apiUrl(path), ok));

      expect((await run(hook as never, variables)).invalidated).toEqual(expected);
    },
  );

  it('excluir remove o detalhe e invalida a lista do catálogo', async () => {
    server.use(http.delete(apiUrl('/checklist-templates/t1'), ok));

    const calls = await run(() => useDeleteTemplate(), 't1');

    expect(calls.removed).toEqual([templateKeys.detail('t1')]);
    expect(calls.invalidated).toEqual([catalogKeys.templates()]);
  });

  it('derivar com nome manda o nome no corpo', async () => {
    let received: unknown;
    server.use(
      http.post(apiUrl('/checklist-templates/t1/derive'), async ({ request }) => {
        received = await request.json();
        return ok();
      }),
    );

    await run(() => useDeriveTemplate(), { id: 't1', name: 'Meu' });

    expect(received).toEqual({ name: 'Meu' });
  });
});
