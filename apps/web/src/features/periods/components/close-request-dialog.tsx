import { toast } from 'sonner';
import { useCloseRequest } from '@/features/periods/queries/use-period-mutations';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';

export type ClosingRequest = {
  requestId: string;
  periodId: string;
  companyName: string;
  unaccepted: number;
  toReview: number;
  extrasToReview: number;
};

type CloseRequestDialogProps = {
  request: ClosingRequest | null;
  onOpenChange: (open: boolean) => void;
};

export function CloseRequestDialog({ request, onOpenChange }: CloseRequestDialogProps) {
  const closeRequest = useCloseRequest();

  const confirm = (target: ClosingRequest) =>
    closeRequest
      .mutateAsync({ requestId: target.requestId, periodId: target.periodId })
      .then((result) => {
        toast.success(result.warning ?? `Solicitação de ${target.companyName} encerrada.`);
        onOpenChange(false);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível encerrar a solicitação.')),
      );

  return (
    <Modal
      open={request !== null}
      onOpenChange={onOpenChange}
      title={`Encerrar a solicitação de ${request?.companyName ?? ''}?`}
      description="Encerrar é a palavra final para esta empresa nesta competência, mesmo com pendências."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={closeRequest.isPending}
            onClick={() => request && confirm(request)}
          >
            {closeRequest.isPending ? 'Encerrando...' : 'Encerrar solicitação'}
          </Button>
        </>
      }
    >
      {request ? (
        <div className="flex flex-col gap-3 text-sm text-foreground">
          {request.unaccepted ? (
            <p>
              <strong className="tabular-nums">{request.unaccepted}</strong> item(ns) ainda sem
              aceite.
            </p>
          ) : (
            <p>Todos os itens já foram aceitos.</p>
          )}
          {request.toReview ? (
            <p className="rounded-lg border border-danger-border bg-danger-surface p-3 text-danger-foreground">
              <strong className="tabular-nums">{request.toReview}</strong> item(ns) já enviado(s) e
              ainda não conferido(s). Depois de encerrar, esses documentos não poderão mais ser
              aceitos e ficam fora do zip final.
            </p>
          ) : null}
          {request.extrasToReview ? (
            <p className="rounded-lg border border-danger-border bg-danger-surface p-3 text-danger-foreground">
              <strong className="tabular-nums">{request.extrasToReview}</strong> documento(s)
              extra(s) ainda não conferido(s). Depois de encerrar, eles ficam fora do zip final até
              você aceitá-los.
            </p>
          ) : null}
          <p>
            O Responsável não poderá mais enviar documentos nos itens — apenas documentos extras.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
