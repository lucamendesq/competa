import { useState } from 'react';
import { Share, Smartphone, SquarePlus } from 'lucide-react';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { useCanInstall, useInstallStore, usePlatform } from '@/shared/pwa/install.store';

const Step = ({ index, children }: { index: number; children: React.ReactNode }) => (
  <li className="flex items-center gap-3">
    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold">
      {index}
    </span>
    <span>{children}</span>
  </li>
);

export function InstallSteps({ isIos, platform }: { isIos: boolean; platform: string }) {
  if (isIos) {
    return (
      <ol className="text-foreground space-y-4 text-sm">
        <Step index={1}>
          Toque no ícone de compartilhar{' '}
          <Share className="inline align-[-2px] h-4 w-4" aria-hidden="true" /> na barra do Safari
        </Step>
        <Step index={2}>
          Role e toque em <strong>"Adicionar à Tela de Início"</strong>{' '}
          <SquarePlus className="inline align-[-2px] h-4 w-4" aria-hidden="true" />
        </Step>
        <Step index={3}>
          Toque em <strong>"Adicionar"</strong> no canto superior
        </Step>
      </ol>
    );
  }
  if (platform === 'android') {
    return (
      <ol className="text-foreground space-y-4 text-sm">
        <Step index={1}>
          Toque no menu de opções (ícone <strong>⋮</strong> no navegador)
        </Step>
        <Step index={2}>
          Toque em <strong>"Instalar aplicativo"</strong> ou{' '}
          <strong>"Adicionar à tela inicial"</strong>
        </Step>
        <Step index={3}>Confirme para instalar</Step>
      </ol>
    );
  }
  return (
    <ol className="text-foreground space-y-4 text-sm">
      <Step index={1}>
        No Chrome ou Edge, clique no ícone de instalar na barra de endereços (ou menu{' '}
        <strong>⋮</strong> &gt; "Instalar")
      </Step>
      <Step index={2}>
        No Safari (macOS), clique em <strong>Arquivo</strong> &gt;{' '}
        <strong>"Adicionar ao Dock"</strong>
      </Step>
      <Step index={3}>Confirme para instalar no seu computador</Step>
    </ol>
  );
}

const descriptionOf = (isIos: boolean, platform: string) => {
  if (isIos) return 'No Safari, siga estes passos:';
  if (platform === 'android') return 'No navegador do seu celular:';
  return 'No seu computador:';
};

export function InstallButton({ variant = 'icon' }: { variant?: 'icon' | 'card' }) {
  const isStandalone = useInstallStore((state) => state.isStandalone);
  const isIos = useInstallStore((state) => state.isIos);
  const promptInstall = useInstallStore((state) => state.promptInstall);
  const canInstall = useCanInstall();
  const platform = usePlatform();
  const [showTutorial, setShowTutorial] = useState(false);

  const onClick = () => {
    if (canInstall) void promptInstall();
    else setShowTutorial(true);
  };

  return (
    <>
      {isStandalone ? null : variant === 'card' ? (
        <Button variant="outline" size="sm" type="button" onClick={onClick}>
          <Smartphone aria-hidden="true" />
          Instalar app
        </Button>
      ) : (
        <button
          type="button"
          className="focus-visible:ring-sidebar-ring inline-flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          title="Instalar aplicativo"
          aria-label="Instalar aplicativo"
          onClick={onClick}
        >
          <Smartphone className="size-5" aria-hidden="true" />
        </button>
      )}
      <Modal
        open={showTutorial}
        onOpenChange={setShowTutorial}
        title={isIos ? 'Instalar na tela de início' : 'Instalar aplicativo'}
        description={descriptionOf(isIos, platform)}
      >
        <InstallSteps isIos={isIos} platform={platform} />
      </Modal>
    </>
  );
}
