import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { PanelLayout, type PanelLayoutProps } from '@/shared/components/layout/panel-layout';

const mount = (props: Partial<PanelLayoutProps> = {}, path = '/competencias') => {
  const onSignOut = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <PanelLayout
            firmName="Contabilidade Exemplo"
            accountantName="Ana Maria Dono"
            accountantEmail="dono@exemplo.com.br"
            isOwner
            isOverdue={false}
            busy={false}
            onSignOut={onSignOut}
            {...props}
          >
            <h1>conteúdo</h1>
          </PanelLayout>
        ),
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return { onSignOut, router };
};

describe('PanelLayout', () => {
  it('abre e fecha o menu mobile pelo botão e pelo overlay', async () => {
    const user = userEvent.setup();
    mount();
    const toggle = screen.getByRole('button', { name: 'Abrir menu' });
    const nav = screen.getByRole('navigation', { name: 'Navegação principal', hidden: true });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'menu-lateral');
    expect(nav).toHaveClass('invisible');

    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Fechar menu', expanded: true })).toBeInTheDocument();
    expect(nav).not.toHaveClass('invisible');

    const overlay = screen
      .getAllByRole('button', { name: 'Fechar menu' })
      .find((el) => !el.hasAttribute('aria-expanded'))!;
    await user.click(overlay);
    expect(screen.getByRole('button', { name: 'Abrir menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(nav).toHaveClass('invisible');
  });

  it('marca o link ativo', () => {
    mount({}, '/empresas');

    expect(screen.getByRole('link', { name: 'Empresas', hidden: true })).toHaveClass(
      'bg-brand-light',
      'text-brand-strong',
    );
    expect(screen.getByRole('link', { name: 'Competências', hidden: true })).not.toHaveClass(
      'bg-brand-light',
    );
  });

  it('mostra iniciais e o menu de perfil; "Convidar contador" só para o dono', async () => {
    const user = userEvent.setup();
    const { onSignOut } = mount({ isOwner: false });

    expect(screen.getByText('AM')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Ana Maria Dono/, hidden: true }));
    expect(
      screen.queryByRole('link', { name: 'Convidar contador', hidden: true }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sair', hidden: true }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('dono vê "Convidar contador"', async () => {
    const user = userEvent.setup();
    mount({ isOwner: true });

    await user.click(screen.getByRole('button', { name: /Ana Maria Dono/, hidden: true }));

    expect(screen.getByRole('link', { name: 'Convidar contador', hidden: true })).toHaveAttribute(
      'href',
      '/configuracoes/contadores',
    );
  });

  it('o aviso de inadimplência aparece só com isOverdue', () => {
    mount({ isOverdue: true });

    expect(screen.getByRole('alert')).toHaveTextContent('Sua assinatura está pendente');
    expect(screen.getByRole('link', { name: 'Regularizar agora' })).toHaveAttribute(
      'href',
      '/configuracoes/plano',
    );
  });

  it('sem isOverdue não há aviso', () => {
    mount({ isOverdue: false });

    expect(screen.queryByText('Sua assinatura está pendente')).not.toBeInTheDocument();
  });

  it('o skip link é o primeiro foco e aponta para #conteudo', async () => {
    const user = userEvent.setup();
    mount();

    await user.tab();

    const skip = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute('href', '#conteudo');
    expect(document.getElementById('conteudo')?.tagName).toBe('MAIN');
  });

  it('marca o conteúdo como ocupado enquanto há escrita em voo', () => {
    mount({ busy: true });

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });
});
