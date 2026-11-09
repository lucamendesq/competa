import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers/app-providers';
import { routes } from '@/app/router/routes';
import { makeQueryClient } from '@/shared/lib/query-client';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const ACTIVE = { status: 'active', displayPhoneNumber: '+55 11 4000-0000', wabaId: 'waba_123' };

const setup = ({ owner = true, connected = false } = {}) => {
  const state = { connected, tests: [] as unknown[], disconnects: 0 };
  server.use(
    http.get(apiUrl('/auth/me'), () => {
      const session = accountantSession();
      return HttpResponse.json(
        envelope({ ...session, accountant: { ...session.accountant, owner } }),
      );
    }),
    http.get(apiUrl('/whatsapp/status'), () =>
      HttpResponse.json(envelope(state.connected ? ACTIVE : { status: 'not_connected' })),
    ),
    http.post(apiUrl('/whatsapp/onboard'), () => {
      state.connected = true;
      return HttpResponse.json(envelope(ACTIVE));
    }),
    http.post(apiUrl('/whatsapp/test'), async ({ request }) => {
      state.tests.push(await request.json());
      return HttpResponse.json(envelope({ sent: true }));
    }),
    http.delete(apiUrl('/whatsapp'), () => {
      state.disconnects += 1;
      state.connected = false;
      return HttpResponse.json(envelope({ disconnected: true }));
    }),
  );
  const router = createMemoryRouter(routes, { initialEntries: ['/configuracoes/whatsapp'] });
  render(
    <AppProviders queryClient={makeQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return state;
};

describe('WhatsAppSettingsPage', () => {
  it('dono conecta e o status é refeito', async () => {
    setup();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Conectar com o Facebook' }));

    expect(await screen.findByText('WhatsApp Conectado')).toBeInTheDocument();
    expect(await screen.findByText('+55 11 4000-0000')).toBeInTheDocument();
    expect(screen.getByText('Disparo de Teste')).toBeInTheDocument();
  });

  it('dono desconecta depois de confirmar', async () => {
    const state = setup({ connected: true });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Desconectar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desconectar o WhatsApp?' });
    await user.click(within(dialog).getByRole('button', { name: 'Desconectar' }));

    expect(await screen.findByText('WhatsApp Desconectado')).toBeInTheDocument();
    expect(state.disconnects).toBe(1);
    expect(
      await screen.findByRole('button', { name: 'Conectar com o Facebook' }),
    ).toBeInTheDocument();
  });

  it('membro vê conectar desabilitado', async () => {
    setup({ owner: false });

    expect(await screen.findByRole('button', { name: 'Conectar com o Facebook' })).toBeDisabled();
    expect(screen.getByText('Somente leitura')).toBeInTheDocument();
  });

  it('membro não desconecta, mas envia a mensagem de teste', async () => {
    const state = setup({ owner: false, connected: true });
    const user = userEvent.setup();

    expect(await screen.findByRole('button', { name: 'Desconectar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Telefone para o teste'), '5511999999999');
    await user.click(screen.getByRole('button', { name: 'Testar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enviar mensagem de teste?' });
    await user.click(within(dialog).getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('Mensagem enviada')).toBeInTheDocument();
    expect(state.tests).toEqual([{ phone: '5511999999999' }]);
    expect(screen.getByLabelText('Telefone para o teste')).toHaveValue('');
  });
});
