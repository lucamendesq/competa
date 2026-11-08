import { useReducer, useState } from 'react';
import { ExternalLink, Lock, Undo2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import type {
  RequestDetail,
  RequestDocument,
  RequestItem,
} from '@/features/periods/api/period.types';
import { CloseRequestDialog } from '@/features/periods/components/close-request-dialog';
import { ResendNotice } from '@/shared/components/resend-notice';
import {
  decisionCount,
  emptyDraft,
  missingReason,
  reviewDraftReducer,
  toReviewBatch,
} from '@/features/periods/components/review-draft';
import { ReviewExtras } from '@/features/periods/components/review-extras';
import { ReviewItem } from '@/features/periods/components/review-item';
import {
  useOpenDocument,
  usePublishReview,
  useUndoAccept,
} from '@/features/periods/queries/use-period-mutations';
import { useRequestDetail } from '@/features/periods/queries/use-period-queries';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { NotFoundState } from '@/shared/components/not-found-state';
import { PageHeader } from '@/shared/components/page-header';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import { apiErrorMessage, isNotFound } from '@/shared/lib/api-error';
import { dateTimeBr, fileSize, monthLabel } from '@/shared/lib/format';
import { displayItemStatus, needsResend } from '@/shared/lib/item-status';

const OBJECT_URL_TTL_MS = 60_000;

export function RequestReviewPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const detail = useRequestDetail(id);
  const [draft, dispatch] = useReducer(reviewDraftReducer, emptyDraft);
  const [confirmClose, setConfirmClose] = useState(false);
  const publishReview = usePublishReview();
  const undoAccept = useUndoAccept();
  const openDocument = useOpenDocument();

  const request: RequestDetail | undefined = detail.data;
  const closed = request?.status === 'closed';
  const reviewable = request?.items.filter((item) => item.status === 'submitted') ?? [];
  const settled = request?.items.filter((item) => item.status !== 'submitted') ?? [];
  const pendingDecisions = decisionCount(draft);
  const reasonMissing = missingReason(draft);

  const onOpenDocument = (document: RequestDocument) =>
    openDocument
      .mutateAsync(document.id)
      .then(({ objectUrl }) => {
        window.open(objectUrl, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(objectUrl), OBJECT_URL_TTL_MS);
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível abrir o documento.')),
      );

  const onUndoAccept = (item: RequestItem) =>
    request &&
    undoAccept
      .mutateAsync({ requestId: id, periodId: request.periodId, requestItemId: item.id })
      .then(() =>
        toast.success(`Aceite de "${item.name}" desfeito — item voltou a aguardar conferência.`),
      )
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível desfazer o aceite.')),
      );

  const onPublish = () => {
    if (!request || pendingDecisions === 0 || reasonMissing) return;
    publishReview
      .mutateAsync({ requestId: id, periodId: request.periodId, body: toReviewBatch(draft) })
      .then((result) => {
        dispatch({ type: 'reset' });
        toast.success(
          result.completed
            ? 'Revisão publicada. Solicitação completa.'
            : `Revisão publicada: ${result.acceptedItems} aceite(s), ${result.rejectedDocuments} recusa(s).`,
        );
      })
      .catch((error: unknown) =>
        toast.error(apiErrorMessage(error, 'Não foi possível publicar a revisão.')),
      );
  };

  const renderBody = () => {
    if (detail.isPending) return <LoadingRows count={6} />;
    if (isNotFound(detail.error)) {
      return (
        <NotFoundState
          title="Solicitação não encontrada"
          to="/competencias"
          backLabel="Ver competências"
        />
      );
    }
    if (detail.isError)
      return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;

    return (
      <>
        {closed ? (
          <div className="border-border bg-sunken/60 mb-6 rounded-xl border p-4 text-sm text-muted-foreground">
            Solicitação encerrada: não é mais possível revisar documentos.
          </div>
        ) : null}

        {reviewable.length ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Aguardando conferência ({reviewable.length})
            </h2>
            {reviewable.map((item) => (
              <ReviewItem
                key={item.id}
                item={item}
                draft={draft}
                dispatch={dispatch}
                closed={closed}
                onOpenDocument={(doc) => void onOpenDocument(doc)}
              />
            ))}
          </section>
        ) : (
          <section className="border-border bg-card rounded-xl border-2 border-dashed p-12 text-center shadow-xs">
            <p className="text-muted-foreground text-sm">
              Nenhum documento aguardando conferência.
            </p>
          </section>
        )}

        <ReviewExtras
          documents={detail.data.extraDocuments}
          draft={draft}
          dispatch={dispatch}
          onOpenDocument={(doc) => void onOpenDocument(doc)}
        />

        {settled.length ? (
          <section className="mt-8 flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Demais itens ({settled.length})
            </h2>
            <ul className="bg-card border-border divide-border divide-y rounded-xl border shadow-sm overflow-hidden">
              {settled.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 p-3.5 hover:bg-slate-50/75 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <StatusPill status={displayItemStatus(item)} />
                      {item.status === 'accepted' && !closed ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="hover:bg-sunken text-muted-foreground hover:text-foreground text-xs"
                          aria-label={`Desfazer aceite: ${item.name}`}
                          disabled={
                            undoAccept.isPending && undoAccept.variables?.requestItemId === item.id
                          }
                          onClick={() => void onUndoAccept(item)}
                        >
                          <Undo2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                          {undoAccept.isPending && undoAccept.variables?.requestItemId === item.id
                            ? 'Desfazendo...'
                            : 'Desfazer aceite'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {needsResend(item) ? <ResendNotice item={item} /> : null}
                  {item.documents.length ? (
                    <ul className="flex flex-col gap-1">
                      {item.documents.map((doc) => (
                        <li
                          key={doc.id}
                          className="flex flex-wrap items-center justify-between gap-2 pl-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-foreground">
                              {doc.fileName}
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {fileSize(doc.sizeBytes)} · {dateTimeBr(doc.uploadedAt)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.reviewStatus !== 'pending' && doc.reviewStatus !== item.status ? (
                              <StatusPill status={doc.reviewStatus} />
                            ) : null}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="hover:bg-sunken text-muted-foreground hover:text-foreground text-xs"
                              aria-label={`Abrir ${doc.fileName}`}
                              onClick={() => void onOpenDocument(doc)}
                            >
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />{' '}
                              Abrir
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </>
    );
  };

  return (
    <>
      <PageHeader
        title={`Conferir documentos${request ? ` — ${request.companyName}` : ''}`}
        description={
          request
            ? `Competência ${monthLabel(request.referenceMonth)}`
            : 'Aceite ou recuse os documentos enviados.'
        }
      >
        <Button variant="outline" className="shadow-xs" onClick={() => void navigate(-1)}>
          Voltar
        </Button>
        {request && !closed ? (
          <Button
            variant="outline"
            className="text-danger hover:text-danger hover:bg-danger-surface border-border ml-2 shadow-xs"
            onClick={() => setConfirmClose(true)}
          >
            <Lock className="mr-2 h-4 w-4" aria-hidden="true" /> Encerrar
          </Button>
        ) : null}
      </PageHeader>

      <div className="mt-8 pb-24">{renderBody()}</div>

      <CloseRequestDialog
        request={
          confirmClose && request
            ? {
                requestId: id,
                periodId: request.periodId,
                companyName: request.companyName,
                unaccepted: request.items.filter((item) => item.status !== 'accepted').length,
                toReview: reviewable.length,
              }
            : null
        }
        onOpenChange={setConfirmClose}
      />

      {pendingDecisions > 0 ? (
        <div className="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-4 shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
          <div className="mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-sm font-medium text-foreground" role="status">
              {pendingDecisions} decisão(ões) não publicada(s)
              {reasonMissing ? (
                <span className="text-danger font-normal ml-1">— informe o motivo das recusas</span>
              ) : null}
            </span>
            <div className="flex items-center gap-2.5">
              <Button
                variant="ghost"
                disabled={publishReview.isPending}
                onClick={() => dispatch({ type: 'reset' })}
              >
                Descartar
              </Button>
              <Button
                disabled={publishReview.isPending || reasonMissing}
                className="bg-brand-strong hover:bg-brand-strong/90 text-white font-medium shadow-xs"
                onClick={onPublish}
              >
                {publishReview.isPending ? 'Publicando...' : 'Publicar revisão'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
