import { useState } from 'react';
import { File as FileIcon, Lock } from 'lucide-react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import type { UploadChecklist } from '@/features/upload/api/upload.types';
import {
  AccessEmailSent,
  AccessOfferCard,
  AllSentBanner,
} from '@/features/upload/components/access-offers';
import { Dropzone, UploadProgress } from '@/features/upload/components/dropzone';
import {
  LinkExpired,
  LinkTemporarilyUnavailable,
} from '@/features/upload/components/link-unavailable';
import { UploadFeedback } from '@/features/upload/components/upload-feedback';
import { UploadHeader } from '@/features/upload/components/upload-header';
import { UploadItem } from '@/features/upload/components/upload-item';
import { UploadProgressRing } from '@/features/upload/components/upload-progress-ring';
import type { FileResult } from '@/shared/upload';
import {
  useActivateAccess,
  useSendFiles,
  useSubscribePush,
  useUploadChecklist,
} from '@/features/upload/queries/use-upload-queries';
import { Callout } from '@/shared/components/callout';
import { LoadingRows } from '@/shared/components/loading-rows';
import { StatusPill } from '@/shared/components/status-pill';
import { ApiError, apiErrorCode, apiErrorMessage, failureKind } from '@/shared/lib/api-error';
import { monthLabel } from '@/shared/lib/format';
import { needsResend } from '@/shared/lib/item-status';
import { usePush } from '@/shared/pwa';

const ACCOUNT_EXISTS_CODES = ['EMAIL_ALREADY_REGISTERED', 'CONTACT_ACCESS_ALREADY_EXISTS'];

const temporarilyUnavailable = (error: unknown) => {
  const kind = failureKind(error);
  return (
    kind === 'offline' || kind === 'server' || (error instanceof ApiError && error.status === 429)
  );
};

const progressOf = (checklist: UploadChecklist) => {
  const delivered = checklist.items.filter(
    (item) => item.status !== 'pending' && item.status !== 'rejected',
  ).length;
  return { total: checklist.items.length, delivered, pending: checklist.items.length - delivered };
};

const sortedItemsOf = (checklist: UploadChecklist) =>
  [...checklist.items].sort(
    (a, b) => (needsResend(a) ? 0 : 1) - (needsResend(b) ? 0 : 1) || a.name.localeCompare(b.name),
  );

function ItemFallback() {
  return (
    <li className="p-4">
      <DropzoneFallback />
    </li>
  );
}

function DropzoneFallback() {
  return (
    <Callout
      tone="danger"
      heading="Não foi possível abrir o envio de arquivos. Recarregue a página e tente de novo."
    />
  );
}

export function UploadPage() {
  const { linkToken = '' } = useParams();
  const checklist = useUploadChecklist(linkToken);
  const upload = useSendFiles(linkToken);
  const subscribePush = useSubscribePush(linkToken);
  const activate = useActivateAccess(linkToken);
  const push = usePush((payload) => subscribePush.mutateAsync(payload));
  const [expanded, setExpanded] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [accessEmailSent, setAccessEmailSent] = useState<string | null>(null);

  const send = (files: File[], requestItemId: string | null) => {
    setTarget(requestItemId);
    setResults(null);
    return upload.sendFiles(files, requestItemId).then((sent) => {
      setResults(sent);
      if (sent.every((row) => row.ok)) {
        toast.success(
          sent.length === 1 ? 'Arquivo enviado com sucesso.' : `${sent.length} arquivos enviados.`,
        );
        if (requestItemId && expanded === requestItemId) setExpanded(null);
      }
    });
  };

  const activateAccess = () =>
    activate
      .mutateAsync({})
      .then((activated) => {
        setAccessEmailSent(activated.email);
        toast.success(
          `Enviamos um link de acesso para ${activated.email}. Abra seu email para entrar.`,
        );
      })
      .catch((error: unknown) => {
        if (ACCOUNT_EXISTS_CODES.includes(apiErrorCode(error) ?? '')) {
          setAccountExists(true);
          toast.info('Seu e-mail já possui uma conta ativa. Acesse em /minha-area/acesso.');
          return;
        }
        toast.error(apiErrorMessage(error, 'Não foi possível enviar o link de acesso.'));
      });

  const renderMain = () => {
    if (checklist.isPending) {
      return (
        <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6" aria-label="Carregando">
          <LoadingRows count={5} />
        </main>
      );
    }
    if (checklist.isError) {
      return temporarilyUnavailable(checklist.error) ? (
        <LinkTemporarilyUnavailable onRetry={() => void checklist.refetch()} />
      ) : (
        <LinkExpired />
      );
    }

    const data = checklist.data;
    const closed = data.status === 'closed';
    const progress = progressOf(data);
    const allSent = progress.total > 0 && progress.pending === 0;
    const allAccepted = data.items.every((item) => item.status === 'accepted');
    const hasSentSomething = progress.delivered > 0 || data.extraDocuments.length > 0;
    const offerAccess = hasSentSomething && !data.hasAccess && !accessEmailSent && !accountExists;
    const sending = upload.isUploading;

    return (
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 pb-12 sm:p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {data.company}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Documentos da competência <strong>{monthLabel(data.referenceMonth)}</strong>
          </p>
          <p className="text-muted-foreground text-xs">Aos cuidados de {data.accountingFirm}</p>
        </div>

        <UploadProgressRing delivered={progress.delivered} total={progress.total} />

        {accessEmailSent ? <AccessEmailSent email={accessEmailSent} /> : null}

        {closed && !allSent ? (
          <div className="bg-muted border-border mb-6 rounded-xl border p-5" role="status">
            <div className="flex items-start gap-4">
              <Lock className="text-muted-foreground mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  Competência encerrada com pendências
                </h2>
                <p className="mt-1 text-sm text-foreground/80">
                  A contabilidade encerrou esta competência com{' '}
                  {progress.pending === 1
                    ? '1 item sem envio'
                    : `${progress.pending} itens sem envio`}
                  . Se ainda tiver algum desses documentos, mande pelo bloco de documento extra no
                  fim da página.
                </p>
              </div>
            </div>
          </div>
        ) : allSent ? (
          <AllSentBanner
            allAccepted={allAccepted}
            showOffers={!data.hasAccess && !accessEmailSent && !push.subscribed}
            accountExists={accountExists}
            pushAvailable={push.available}
            pushSubscribing={push.subscribing}
            activating={activate.isPending}
            onSubscribePush={push.subscribe}
            onActivate={() => void activateAccess()}
          />
        ) : null}

        <ul className="bg-card border-border divide-border divide-y rounded-xl border shadow-sm">
          {sortedItemsOf(data).map((item) => (
            <ErrorBoundary key={item.id} FallbackComponent={ItemFallback}>
              <UploadItem
                item={item}
                expanded={expanded === item.id}
                closed={closed}
                sending={sending}
                sendingHere={sending && target === item.id}
                percent={upload.percent}
                onToggle={() => setExpanded((current) => (current === item.id ? null : item.id))}
                onFiles={(files) => void send(files, item.id)}
              />
            </ErrorBoundary>
          ))}
        </ul>

        {offerAccess && !allSent && !closed ? (
          <AccessOfferCard
            activating={activate.isPending}
            onActivate={() => void activateAccess()}
          />
        ) : null}

        <section className="bg-card border-border mt-6 rounded-xl border p-4 shadow-sm">
          <h2 className="font-display text-base font-semibold text-foreground">
            Enviar documento extra
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Se não estiver na lista acima, envie aqui.
          </p>
          <div className="mt-3">
            {sending && target === null ? (
              <UploadProgress percent={upload.percent} className="min-h-20" />
            ) : (
              <ErrorBoundary FallbackComponent={DropzoneFallback}>
                <Dropzone
                  className="min-h-20 gap-1"
                  title="Arraste os arquivos aqui ou toque para escolher"
                  hint="Documentos extras não passam pela conferência do checklist"
                  disabled={sending}
                  onFiles={(files) => void send(files, null)}
                />
              </ErrorBoundary>
            )}
          </div>
          {data.extraDocuments.length ? (
            <ul className="border-border mt-3 divide-y rounded-lg border bg-white">
              {data.extraDocuments.map((document, index) => (
                <li key={index} className="flex items-center gap-2 p-3 text-sm">
                  <FileIcon className="text-muted-foreground shrink-0 h-4 w-4" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    Documento extra {index + 1}
                  </span>
                  <StatusPill status={document.reviewStatus} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <footer className="mt-8 flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:gap-4">
          {offerAccess ? (
            <>
              <div>
                <span>Ainda não tem acesso? </span>
                <button
                  type="button"
                  className="font-medium text-foreground hover:underline"
                  disabled={activate.isPending}
                  onClick={() => void activateAccess()}
                >
                  Receber link de acesso
                </button>
              </div>
              <span className="hidden sm:inline text-border" aria-hidden="true">
                ·
              </span>
            </>
          ) : null}
          <div>
            <span>Já possui cadastro? </span>
            <Link to="/minha-area/acesso" className="font-medium text-foreground hover:underline">
              Acessar Minha Área
            </Link>
          </div>
        </footer>
      </main>
    );
  };

  return (
    <div className="bg-background flex min-h-dvh flex-col items-center">
      <UploadHeader
        firmName={checklist.data?.accountingFirm}
        logoUrl={checklist.data?.accountingFirmLogoUrl ?? null}
      />
      {renderMain()}
      <UploadFeedback
        results={results}
        onDismiss={() => setResults(null)}
        onRetry={(files) => void send(files, target)}
      />
    </div>
  );
}
