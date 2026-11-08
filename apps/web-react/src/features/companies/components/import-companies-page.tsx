import { useReducer, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { ImportResult } from '@/features/companies/api/company.types';
import { ImportColumns } from '@/features/companies/components/import-columns';
import { ImportPreviewTable } from '@/features/companies/components/import-preview-table';
import { ActivationSplit, InvitesPanel } from '@/features/companies/components/import-report';
import {
  importReducer,
  initialImportState,
  pendingLinesOf,
  skippedReasons,
  splitOf,
} from '@/features/companies/components/import-state';
import { SpreadsheetDropzone } from '@/features/companies/components/spreadsheet-dropzone';
import {
  useConfirmImport,
  useImportCsv,
  useSendAccessInvites,
} from '@/features/companies/queries/use-company-mutations';
import { usePlanUsage } from '@/features/companies/queries/use-company-queries';
import {
  readSpreadsheet,
  SpreadsheetError,
  templateCsv,
} from '@/features/companies/utils/spreadsheet';
import { Callout } from '@/shared/components/callout';
import { Modal } from '@/shared/components/modal';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage } from '@/shared/lib/api-error';

const createdIdsOf = (result: ImportResult) =>
  result.lines.flatMap((line) => (line.status === 'created' ? [line.companyId] : []));

const downloadTemplate = () => {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-empresas.csv';
  anchor.click();
  URL.revokeObjectURL(url);
};

function DropzoneFallback() {
  return (
    <Callout
      tone="danger"
      heading="Não foi possível abrir o leitor de planilhas. Recarregue a página e tente de novo."
    />
  );
}

export function ImportCompaniesPage() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(importReducer, initialImportState);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const confirmInFlight = useRef<Promise<string[]> | null>(null);
  const usage = usePlanUsage();
  const importCsv = useImportCsv();
  const confirmImport = useConfirmImport();
  const sendInvites = useSendAccessInvites();
  const [finishing, setFinishing] = useState(false);

  const onFile = (file: File) => {
    dispatch({ type: 'reading' });
    return readSpreadsheet(file)
      .then((read) => dispatch({ type: 'fileRead', file: read }))
      .catch((error: unknown) =>
        dispatch({
          type: 'failed',
          error:
            error instanceof SpreadsheetError ? error.message : 'Não foi possível ler a planilha.',
        }),
      );
  };

  const submitFile = () => {
    if (state.status !== 'idle' || !state.file) return;
    return importCsv
      .mutateAsync(state.file.content)
      .then((preview) => dispatch({ type: 'previewed', preview }))
      .catch((error: unknown) =>
        dispatch({
          type: 'failed',
          error: apiErrorMessage(error, 'Não foi possível ler a planilha.'),
        }),
      );
  };

  if (state.status === 'idle' || state.status === 'reading') {
    const { file, error } = state;
    return (
      <>
        <ImportHeader />
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <section className="flex flex-col gap-4">
            {error ? <Callout tone="danger" heading={error} /> : null}
            <ErrorBoundary FallbackComponent={DropzoneFallback}>
              <SpreadsheetDropzone file={file} onFile={(chosen) => void onFile(chosen)} />
            </ErrorBoundary>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="outline"
                className="shadow-xs font-medium"
                onClick={downloadTemplate}
              >
                <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Baixar planilha modelo
              </Button>
              <div className="flex flex-col items-end gap-1">
                <Button
                  disabled={!file || importCsv.isPending || state.status === 'reading'}
                  className="shadow-xs font-medium"
                  aria-describedby="import-help"
                  onClick={() => void submitFile()}
                >
                  {importCsv.isPending ? 'Importando…' : 'Importar empresas'}
                </Button>
                <p id="import-help" className="text-muted-foreground text-xs">
                  {file
                    ? `${file.name} pronto para importar.`
                    : 'Escolha a planilha acima para liberar a importação.'}
                </p>
              </div>
            </div>
          </section>
          <ImportColumns />
        </div>
      </>
    );
  }

  const { preview, invites } = state;
  const confirmed = state.status === 'done' ? state.confirmed : null;
  const pending = pendingLinesOf(preview);
  const split = splitOf(pending, usage.data, state.activateChoice);
  const actionableCount = confirmed ? confirmed.created + confirmed.updated : pending.length;
  const busy = finishing || sendInvites.isPending || confirmImport.isPending;
  const errorLines = preview.lines.filter((line) => line.status === 'error');
  const lines = [...errorLines, ...(confirmed ? confirmed.lines : pending)].sort(
    (a, b) => a.line - b.line,
  );

  const confirmOnce = async () => {
    if (confirmed) return createdIdsOf(confirmed);
    if (!pending.length) return [];
    const result = await confirmImport.mutateAsync({
      pending: pending.map(({ line, body }) => ({ line, body })),
      activate: split.activate,
    });
    dispatch({ type: 'confirmed', confirmed: result });
    const updated = result.updated ? ` ${result.updated} já cadastrada(s) atualizada(s).` : '';
    toast.success(
      `${result.created} ${result.created === 1 ? 'empresa nova' : 'empresas novas'}` +
        ` — ${result.activated} ativa(s), ${result.created - result.activated} inativa(s).` +
        updated,
    );
    return createdIdsOf(result);
  };

  const ensureConfirmed = () => {
    confirmInFlight.current ??= confirmOnce().finally(() => {
      confirmInFlight.current = null;
    });
    return confirmInFlight.current;
  };

  const invite = () =>
    ensureConfirmed()
      .then((companyIds) => sendInvites.mutateAsync(companyIds))
      .then((result) => {
        dispatch({
          type: 'invitesSent',
          invites: { invited: result.invited, skipped: skippedReasons(result.results) },
        });
        const sent =
          result.invited === 1
            ? '1 convite de acesso enviado.'
            : `${result.invited} convites de acesso enviados.`;
        if (result.invited) toast.success(sent);
        else toast.info(sent);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível enviar os convites.')),
      );

  const finish = () => {
    setFinishing(true);
    return ensureConfirmed()
      .then(() => navigate('/empresas'))
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível concluir a importação.')),
      )
      .finally(() => setFinishing(false));
  };

  const restart = () => {
    if (confirmed) dispatch({ type: 'discard' });
    else setConfirmRestart(true);
  };

  const finishLabel = finishing
    ? 'Importando…'
    : confirmed || !actionableCount
      ? 'Concluir'
      : actionableCount === 1
        ? 'Importar 1 empresa'
        : `Importar ${actionableCount} empresas`;

  return (
    <>
      <ImportHeader />
      <section className="mt-8 flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">
              Resumo da importação
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {confirmed ? (
                <>
                  {confirmed.created + confirmed.updated} importadas &middot; {confirmed.failed} com
                  erro &middot; {confirmed.total} linhas lidas
                </>
              ) : (
                <>
                  {actionableCount} prontas para importar &middot; {preview.failed} com erro
                  &middot; {preview.total} linhas lidas — nada foi criado ainda
                </>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="shadow-xs" onClick={restart}>
              Importar outra planilha
            </Button>
            <Button disabled={busy} className="shadow-xs font-medium" onClick={() => void finish()}>
              {finishLabel}
            </Button>
          </div>
        </div>

        {!confirmed && split.ready ? (
          <ActivationSplit
            split={split}
            usage={usage.data}
            onActivateChange={(activate) => dispatch({ type: 'setActivate', activate })}
          />
        ) : null}

        {actionableCount ? (
          <InvitesPanel
            invites={invites}
            confirmed={confirmed !== null}
            count={actionableCount}
            busy={busy}
            inviting={sendInvites.isPending}
            onInvite={() => void invite()}
          />
        ) : null}

        <ImportPreviewTable lines={lines} />
      </section>

      <Modal
        open={confirmRestart}
        onOpenChange={setConfirmRestart}
        title="Descartar esta planilha?"
        description="As empresas lidas ainda não foram criadas. Ao trocar de planilha você perde o que foi lido e precisa enviar tudo de novo."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRestart(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmRestart(false);
                dispatch({ type: 'discard' });
              }}
            >
              Descartar
            </Button>
          </>
        }
      />
    </>
  );
}

function ImportHeader() {
  return (
    <PageHeader
      title="Importar Empresas"
      description="Adicione suas empresas em lote, importando do sistema contábil."
    >
      <Button variant="outline" asChild className="shadow-xs">
        <Link to="/empresas">Voltar</Link>
      </Button>
    </PageHeader>
  );
}
