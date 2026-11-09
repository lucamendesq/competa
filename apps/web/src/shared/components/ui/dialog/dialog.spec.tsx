import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';

function Example() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir competência</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir nova competência</DialogTitle>
            <DialogDescription>Escolha o mês de referência.</DialogDescription>
          </DialogHeader>
          <Input aria-label="Mês" />
          <Button>Revisar envios</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('abre com título e descrição acessíveis', async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole('button', { name: 'Abrir competência' }));

    const dialog = screen.getByRole('dialog', { name: 'Abrir nova competência' });
    expect(dialog).toHaveAccessibleDescription('Escolha o mês de referência.');
  });

  it('prende o foco dentro do diálogo', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Abrir competência' }));
    const dialog = screen.getByRole('dialog');

    for (let step = 0; step < 6; step += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });

  it('fecha com Esc e devolve o foco ao gatilho', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole('button', { name: 'Abrir competência' });
    await user.click(trigger);

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('fecha pelo botão "Fechar"', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Abrir competência' }));

    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
