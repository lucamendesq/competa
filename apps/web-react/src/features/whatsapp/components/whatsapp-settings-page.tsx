import { useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { WhatsAppConnection } from '@/features/whatsapp/api/whatsapp.types';
import { TestMessageForm } from '@/features/whatsapp/components/test-message-form';
import {
  useDisconnectWhatsApp,
  useOnboardWhatsApp,
  useWhatsAppStatus,
} from '@/features/whatsapp/queries/use-whatsapp';
import { Callout } from '@/shared/components/callout';
import { ErrorState } from '@/shared/components/error-state';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { useSession } from '@/shared/session';

function ConnectCard({
  disabled,
  pending,
  onConnect,
}: {
  disabled: boolean;
  pending: boolean;
  onConnect: () => void;
}) {
  return (
    <Card className="border border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
          Integrar WhatsApp
        </CardTitle>
        <CardDescription>
          Conecte sua conta Meta (Facebook) para habilitar o envio oficial de mensagens de WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>O envio via WhatsApp aumenta em até 80% a taxa de entrega dos documentos no prazo.</p>
        <div className="rounded-xl border border-warning-border bg-warning-surface p-4 text-warning-foreground">
          <p className="font-semibold text-warning-foreground mb-1">Atenção aos custos</p>
          <p className="leading-relaxed">
            O serviço de mensagens do WhatsApp / Meta Cloud API é cobrado diretamente pela Meta
            (Facebook) através do cartão de crédito cadastrado na sua conta empresarial. A
            assinatura do Competa cobre apenas a plataforma de software.
          </p>
          <p className="mt-2 leading-relaxed">
            No uso típico de um escritório pequeno isso fica em <strong>R$10 a R$20 por mês</strong>
            , e esse valor <strong>não está incluído</strong> no preço do seu plano. Dizemos antes
            para você não ter surpresa no mês 2.
          </p>
        </div>
      </CardContent>
      <CardFooter className="border-t border-border px-6 py-4">
        <Button disabled={disabled || pending} onClick={onConnect}>
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Conectar com o Facebook
        </Button>
      </CardFooter>
    </Card>
  );
}

function ConnectionCard({
  connection,
  disabled,
  onDisconnect,
}: {
  connection: WhatsAppConnection;
  disabled: boolean;
  onDisconnect: () => void;
}) {
  return (
    <Card className="border border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display">
          {connection.status === 'active' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />
          )}
          Integração Ativa
        </CardTitle>
        <CardDescription>Gerencie sua conexão com o WhatsApp Business.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 bg-muted/30 p-3.5 rounded-lg border border-border/60">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Número de Disparo
            </span>
            <p className="text-base font-medium text-foreground">{connection.displayPhoneNumber}</p>
          </div>
          <div className="space-y-1 bg-muted/30 p-3.5 rounded-lg border border-border/60">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Status da Conexão
            </span>
            <p className="text-base font-medium text-foreground capitalize">
              {connection.status.replace('_', ' ')}
            </p>
          </div>
          <div className="space-y-1 bg-muted/30 p-3.5 rounded-lg border border-border/60 md:col-span-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              WABA ID
            </span>
            <p className="text-sm font-mono text-muted-foreground break-all">{connection.wabaId}</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between border-t border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">
          Lembre-se: os custos de disparo são faturados pela Meta.
        </p>
        <Button variant="destructive" disabled={disabled} onClick={onDisconnect}>
          Desconectar
        </Button>
      </CardFooter>
    </Card>
  );
}

export function WhatsAppSettingsPage() {
  const { isOwner } = useSession();
  const status = useWhatsAppStatus();
  const onboard = useOnboardWhatsApp();
  const disconnect = useDisconnectWhatsApp();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const processing = onboard.isPending || disconnect.isPending;

  const connect = () =>
    onboard
      .mutateAsync()
      .then(() =>
        toast.success('WhatsApp Conectado', {
          description: 'A integração foi configurada com sucesso.',
        }),
      )
      .catch(() =>
        toast.error('Erro ao conectar', {
          description: 'Não foi possível configurar a integração.',
        }),
      );

  const remove = () => {
    setConfirmDisconnect(false);
    return disconnect
      .mutateAsync()
      .then(() =>
        toast.success('WhatsApp Desconectado', {
          description: 'A integração foi removida com sucesso.',
        }),
      )
      .catch(() =>
        toast.error('Erro ao desconectar', {
          description: 'Não foi possível remover a integração.',
        }),
      );
  };

  const renderBody = () => {
    if (status.isPending) {
      return (
        <Card
          className="flex justify-center p-12 border border-border shadow-sm rounded-xl"
          role="status"
        >
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Carregando…</span>
        </Card>
      );
    }
    if (status.isError) {
      return (
        <ErrorState
          error={status.error}
          fallback="Não foi possível carregar o status do WhatsApp."
          retry={() => void status.refetch()}
        />
      );
    }
    const connection = status.data;
    return (
      <div className="space-y-6">
        {isOwner ? null : (
          <Callout tone="info" heading="Somente leitura">
            Apenas o dono da Contabilidade pode conectar ou desconectar o WhatsApp.
          </Callout>
        )}
        {connection.status === 'not_connected' ? (
          <ConnectCard
            disabled={!isOwner}
            pending={onboard.isPending}
            onConnect={() => void connect()}
          />
        ) : (
          <ConnectionCard
            connection={connection}
            disabled={!isOwner || processing}
            onDisconnect={() => setConfirmDisconnect(true)}
          />
        )}
        {connection.status === 'active' ? <TestMessageForm /> : null}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-display text-foreground">WhatsApp</h1>
        <p className="text-muted-foreground mt-1">
          Conecte sua conta do WhatsApp Business para enviar lembretes e solicitações aos seus
          clientes.
        </p>
      </div>
      {renderBody()}
      <Modal
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar o WhatsApp?"
        description="Novas solicitações voltarão a ser enviadas apenas por e-mail."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              Desconectar
            </Button>
          </>
        }
      />
    </div>
  );
}
