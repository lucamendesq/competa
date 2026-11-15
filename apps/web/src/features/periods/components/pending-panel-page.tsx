import { useState } from 'react';
import { planGateMessage } from '@competa/contracts';
import { BellRing, FileArchive, Lock, PartyPopper, Plus } from 'lucide-react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  CloseRequestDialog,
  type ClosingRequest,
} from '@/features/periods/components/close-request-dialog';
import { PanelFilters } from '@/features/periods/components/panel-filters';
import {
  accountantOptions,
  closeImpact,
  deliveryProgress,
  statusCounts,
  statusFilterOf,
  toLines,
  visibleLines,
  type PanelLine,
} from '@/features/periods/components/panel-lines';
import { PanelRowCard } from '@/features/periods/components/panel-row';
import {
  useAddMissingRequests,
  useClosePeriod,
  useDownloadPeriodZip,
  useDownloadRequestZip,
  useResendUploadLink,
  useRunReminders,
  useUploadLink,
} from '@/features/periods/queries/use-period-mutations';
import {
  useCompanyCnpjs,
  usePendingPanel,
  usePeriodDetail,
} from '@/features/periods/queries/use-period-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { Modal } from '@/shared/components/modal';
import { NotFoundState } from '@/shared/components/not-found-state';
import { PageHeader } from '@/shared/components/page-header';
import { PlanGateNotice } from '@/shared/components/plan-gate-notice';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import { useCopy } from '@/shared/hooks/use-copy';
import { apiErrorMessage, isNotFound } from '@/shared/lib/api-error';
import { monthLabel, slug } from '@/shared/lib/format';
import { useSession } from '@/shared/session';

const reminderMessage = ({
  scanned,
  sent,
  busy,
}: {
  scanned: number;
  sent: number;
  busy: boolean;
}) => {
  if (busy)
    return {
      tone: 'info',
      text: 'Já há uma cobrança em andamento. Confira em instantes.',
    } as const;
  if (scanned === 0)
    return { tone: 'info', text: 'Nenhuma Solicitação com pendência para cobrar.' } as const;
  if (sent === 0) {
    return {
      tone: 'info',
      text: `Nenhum lembrete enviado: as ${scanned} Solicitação(ões) com pendência já foram cobradas há poucos dias, atingiram o limite de lembretes ou ainda estão longe do prazo.`,
    } as const;
  }
  return {
    tone: 'success',
    text:
      sent === scanned
        ? `${sent} lembrete(s) enviado(s).`
        : `${sent} lembrete(s) enviado(s). As outras ${scanned - sent} Solicitação(ões) já foram cobradas há poucos dias, atingiram o limite de lembretes ou ainda estão longe do prazo.`,
  } as const;
};

export function PendingPanelPage() {
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const accountant = searchParams.get('contador') ?? 'all';
  const status = statusFilterOf(searchParams.get('status'));
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [closingRequest, setClosingRequest] = useState<ClosingRequest | null>(null);
  const [confirmClosePeriod, setConfirmClosePeriod] = useState(false);

  const session = useSession();
  const canPeriodZip = session.can('periodZip');
  const detail = usePeriodDetail(id);
  const panel = usePendingPanel(id);
  const cnpjs = useCompanyCnpjs();
  const runReminders = useRunReminders(id);
  const addMissing = useAddMissingRequests(id);
  const closePeriod = useClosePeriod();
  const downloadPeriodZip = useDownloadPeriodZip();
  const downloadRequestZip = useDownloadRequestZip();
  const uploadLink = useUploadLink();
  const resendLink = useResendUploadLink();
  const { copiedKey, copy } = useCopy();

  const notFound = isNotFound(detail.error) || isNotFound(panel.error);
  const referenceMonth = detail.data?.referenceMonth ?? '';

  const setParam = (key: string, value: string | null) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });

  const toggle = (companyId: string) => {
    const next = new Set(expanded);
    if (next.has(companyId)) next.delete(companyId);
    else next.add(companyId);
    setExpanded(next);
  };

  const onDownloadPeriodZip = () =>
    downloadPeriodZip
      .mutateAsync({ periodId: id, referenceMonth })
      .then(() => toast.success('Download da competência concluído.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.')),
      );

  const onDownloadCompanyZip = (line: PanelLine) => {
    const month = referenceMonth.slice(0, 7);
    return downloadRequestZip
      .mutateAsync({
        requestId: line.requestId,
        filename: `${slug(line.companyName)}${month ? `-${month}` : ''}.zip`,
      })
      .then(() => toast.success(`Download de ${line.companyName} concluído.`))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.')),
      );
  };

  const onCopyLink = (line: PanelLine) =>
    uploadLink
      .mutateAsync(line.requestId)
      .then((link) =>
        copy(
          link.uploadUrl,
          `Novo link de ${line.companyName} copiado. O link anterior continua valendo por até 48 h.`,
          line.requestId,
        ),
      )
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível gerar o link.')),
      );

  const onResend = (line: PanelLine) =>
    resendLink
      .mutateAsync({ requestId: line.requestId, periodId: id })
      .then((link) =>
        toast.success(`Link de ${line.companyName} enviado para ${link.contactEmail}.`),
      )
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível reenviar o link.')),
      );

  const onRunReminders = () =>
    runReminders
      .mutateAsync()
      .then((result) => {
        const message = reminderMessage(result);
        if (message.tone === 'success') toast.success(message.text);
        else toast.info(message.text);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível disparar os lembretes.')),
      );

  const onIncludeNewCompanies = () =>
    addMissing
      .mutateAsync()
      .then(({ requests, warnings }) => {
        if (requests.length) {
          toast.success(
            requests.length === 1
              ? `Link enviado para ${requests[0]!.companyName}.`
              : `${requests.length} empresas incluídas e links enviados.`,
          );
          return;
        }
        toast.info(
          warnings.length
            ? `Nenhuma empresa incluída: ${warnings.map((warning) => `${warning.companyName} (${warning.reason})`).join('; ')}.`
            : 'Todas as empresas ativas já estão nesta competência.',
        );
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível incluir as empresas novas.')),
      );

  const onClosePeriod = () =>
    closePeriod
      .mutateAsync(id)
      .then((result) => toast.success(result.warning ?? 'Competência encerrada.'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível encerrar a competência.')),
      )
      .finally(() => setConfirmClosePeriod(false));

  const lines = panel.data ? toLines(panel.data, cnpjs.data ?? new Map()) : [];
  const impact = closeImpact(lines);

  const renderBody = () => {
    if (notFound) {
      return (
        <NotFoundState
          title="Competência não encontrada"
          to="/competencias"
          backLabel="Ver competências"
        />
      );
    }
    if (panel.isPending) return <LoadingRows count={10} />;
    if (panel.isError) return <ErrorState error={panel.error} retry={() => void panel.refetch()} />;

    const progress = deliveryProgress(lines);
    const allDelivered = lines.length > 0 && lines.every((line) => line.missing.length === 0);
    const visible = visibleLines(lines, { search, status, accountant });

    return (
      <>
        {detail.data?.status === 'closed' ? (
          <div className="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between shadow-sm">
            <div>
              <h2 className="text-base font-semibold font-display text-foreground">
                Competência encerrada
              </h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Os itens pendentes e rejeitados não podem mais receber arquivos.
              </p>
            </div>
            <StatusPill status="closed" />
          </div>
        ) : allDelivered ? (
          <div className="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-success-border bg-success-surface p-5 sm:p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/15 text-success shrink-0">
              <PartyPopper className="h-6 w-6 text-success" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold font-display text-success-foreground">
                Zero pendências! 🎉
              </h2>
              <p className="mt-1 text-sm text-success-foreground">
                Todos os {progress.total} documentos exigidos pelas solicitações ativas foram
                enviados e conferidos.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold font-display text-foreground">
                  Progresso geral da competência
                </h2>
                <p className="text-muted-foreground mt-1 text-sm flex items-center gap-1.5">
                  <span className="font-display font-bold text-foreground tabular-nums">
                    {progress.accepted}
                  </span>
                  de
                  <span className="font-display font-bold text-foreground tabular-nums">
                    {progress.total}
                  </span>
                  documentos entregues e conferidos
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-display text-2xl font-bold text-brand tabular-nums">
                  {progress.percent}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="shadow-xs"
                  disabled={runReminders.isPending}
                  onClick={onRunReminders}
                >
                  <BellRing className="mr-2 h-4 w-4" aria-hidden="true" />
                  {runReminders.isPending ? 'Disparando...' : 'Cobrar atrasados'}
                </Button>
              </div>
            </div>
            <div
              className="bg-sunken mt-2 h-3 w-full overflow-hidden rounded-full p-0.5 border border-border-subtle"
              role="progressbar"
              aria-label="Documentos entregues e conferidos"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
            >
              <div
                className="bg-brand h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        <PanelFilters
          search={search}
          onSearchChange={setSearch}
          accountant={accountant}
          accountantOptions={accountantOptions(lines)}
          onAccountantChange={(value) => setParam('contador', value === 'all' ? null : value)}
          status={status}
          counts={statusCounts(lines)}
          onStatusChange={(value) => setParam('status', value === 'all' ? null : value)}
        />

        {visible.length === 0 ? (
          <section className="border-border bg-card rounded-xl border-2 border-dashed p-12 text-center shadow-xs">
            <p className="text-muted-foreground text-sm">
              {lines.length
                ? 'Nenhuma empresa encontrada com essa busca ou filtro.'
                : 'Nenhuma empresa nesta competência.'}
            </p>
          </section>
        ) : (
          <ul className="space-y-3">
            {visible.map((line) => (
              <PanelRowCard
                key={line.requestId}
                line={line}
                expanded={expanded.has(line.companyId)}
                copied={copiedKey === line.requestId}
                copying={uploadLink.isPending && uploadLink.variables === line.requestId}
                resending={
                  resendLink.isPending && resendLink.variables?.requestId === line.requestId
                }
                onToggle={() => toggle(line.companyId)}
                onCopyLink={() => void onCopyLink(line)}
                onDownloadZip={() => void onDownloadCompanyZip(line)}
                onClose={() =>
                  setClosingRequest({
                    requestId: line.requestId,
                    periodId: id,
                    companyName: line.companyName,
                    unaccepted: line.missing.length,
                    toReview: line.toReview.length,
                    extrasToReview: line.pendingExtraCount,
                  })
                }
                onResend={() => void onResend(line)}
              />
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <>
      {!canPeriodZip && !notFound ? (
        <PlanGateNotice capability="periodZip" className="mb-4">
          Baixar o zip da competência inteira (o zip por empresa continua liberado)
        </PlanGateNotice>
      ) : null}

      <PageHeader
        title={`Cobrança da competência ${referenceMonth ? monthLabel(referenceMonth) : ''}`}
        description="Acompanhe o painel de pendências desta competência."
      >
        {notFound ? null : (
          <span
            className="mr-2 inline-block"
            title={canPeriodZip ? undefined : planGateMessage('periodZip')}
          >
            <Button
              variant="outline"
              className="shadow-xs"
              disabled={!canPeriodZip || downloadPeriodZip.isPending}
              onClick={() => void onDownloadPeriodZip()}
            >
              <FileArchive className="mr-2 h-4 w-4" aria-hidden="true" /> Baixar Tudo (.zip)
            </Button>
          </span>
        )}
        {detail.data?.status === 'open' ? (
          <>
            <Button
              variant="outline"
              className="mr-2 shadow-xs"
              disabled={addMissing.isPending}
              onClick={() => void onIncludeNewCompanies()}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              {addMissing.isPending ? 'Incluindo...' : 'Incluir empresas novas'}
            </Button>
            <Button
              variant="outline"
              className="text-danger hover:text-danger hover:bg-danger-surface border-border shadow-xs"
              onClick={() => setConfirmClosePeriod(true)}
            >
              <Lock className="mr-2 h-4 w-4" aria-hidden="true" /> Encerrar
            </Button>
          </>
        ) : null}
      </PageHeader>

      <div className="mt-8">{renderBody()}</div>

      <CloseRequestDialog
        request={closingRequest}
        onOpenChange={(open) => {
          if (!open) setClosingRequest(null);
        }}
      />

      <Modal
        open={confirmClosePeriod}
        onOpenChange={setConfirmClosePeriod}
        title="Encerrar competência?"
        description="Encerrar é a palavra final: as solicitações desta competência também são encerradas, mesmo com pendências."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClosePeriod(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={closePeriod.isPending}
              onClick={() => void onClosePeriod()}
            >
              {closePeriod.isPending ? 'Encerrando...' : 'Encerrar competência'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-foreground">
          {impact.unaccepted ? (
            <p>
              <strong className="tabular-nums">{impact.unaccepted}</strong> item(ns) ainda sem
              aceite em <strong className="tabular-nums">{impact.companies}</strong> empresa(s).
            </p>
          ) : (
            <p>Todos os itens desta competência já foram aceitos.</p>
          )}
          {impact.toReview ? (
            <p className="rounded-lg border border-danger-border bg-danger-surface p-3 text-danger-foreground">
              <strong className="tabular-nums">{impact.toReview}</strong> item(ns) já enviado(s) e
              ainda não conferido(s). Depois de encerrar, esses documentos não poderão mais ser
              aceitos e ficam fora do zip final. Confira-os antes de encerrar.
            </p>
          ) : null}
          {impact.extrasToReview ? (
            <p className="rounded-lg border border-danger-border bg-danger-surface p-3 text-danger-foreground">
              <strong className="tabular-nums">{impact.extrasToReview}</strong> documento(s)
              extra(s) ainda não conferido(s). Depois de encerrar, eles ficam fora do zip final até
              você aceitá-los.
            </p>
          ) : null}
          <p>
            Os Responsáveis não poderão mais enviar documentos nos itens — apenas documentos extras.
          </p>
        </div>
      </Modal>
    </>
  );
}
