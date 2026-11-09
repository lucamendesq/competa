import { useEffect } from 'react';
import { useBlocker } from 'react-router';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';

export function LeaveGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [when]);

  return (
    <Modal
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      title="Sair sem salvar?"
      description="Você possui alterações no template que não foram salvas."
      footer={
        <>
          <Button variant="ghost" onClick={() => blocker.reset?.()}>
            Ficar
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Sair e descartar
          </Button>
        </>
      }
    />
  );
}
