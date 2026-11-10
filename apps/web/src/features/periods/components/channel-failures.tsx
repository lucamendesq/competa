import { Mail, MailWarning } from 'lucide-react';
import { failedChannels, type PanelLine } from '@/features/periods/components/panel-lines';
import { Button } from '@/shared/components/ui/button';

type ChannelFailuresProps = { line: PanelLine; resending: boolean; onResend: () => void };

export function ChannelFailures({ line, resending, onResend }: ChannelFailuresProps) {
  if (!line.channelFailures.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-danger-border bg-danger-surface p-4 text-sm text-danger-foreground">
      <div className="flex gap-3">
        <MailWarning className="text-danger mt-0.5 shrink-0 size-5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger-foreground">
            Falha na entrega de notificações ({failedChannels(line).join(', ')})
          </p>
          <p className="mt-1 text-xs text-danger-foreground/90 leading-relaxed">
            A última cobrança automática não pôde ser entregue. Verifique se o e-mail ou número de
            telefone estão corretos no cadastro da empresa.
          </p>
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              className="border-danger-border bg-white text-danger-foreground hover:bg-danger-surface shadow-xs"
              disabled={resending}
              onClick={onResend}
            >
              <Mail className="mr-2 h-4 w-4 text-danger" aria-hidden="true" />
              {resending ? 'Reenviando...' : 'Gerar novo link e reenviar e-mail'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
