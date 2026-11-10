import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ErrorState } from '@/shared/components/error-state';
import { ApiError } from '@/shared/lib/api-error';

describe('ErrorState', () => {
  it('sem conexão mostra a mensagem de offline e o retry chama a função', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new TypeError('Failed to fetch')} retry={retry} />);

    expect(
      screen.getByText('Sem conexão com o servidor. Verifique sua internet.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('mostra a mensagem do servidor quando existe', () => {
    const error = new ApiError(403, { error: { code: 'FORBIDDEN', message: 'Sem acesso.' } }, 'x');
    render(<ErrorState error={error} retry={() => undefined} />);

    expect(screen.getByText('Sem acesso.')).toBeInTheDocument();
  });

  it('cai no texto padrão sem detalhes do erro', () => {
    render(<ErrorState error={new ApiError(500, null, 'x')} retry={() => undefined} />);

    expect(screen.getByText('Erro inesperado. Tente novamente.')).toBeInTheDocument();
  });
});
