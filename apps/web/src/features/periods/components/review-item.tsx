import type { Dispatch } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import type { RequestDocument, RequestItem } from '@/features/periods/api/period.types';
import type { ReviewAction, ReviewDraft } from '@/features/periods/components/review-draft';
import { ReviewReason } from '@/features/periods/components/review-reason';
import { DueDate } from '@/shared/components/due-date';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import { dateTimeBr, fileSize } from '@/shared/lib/format';
import { wasResent } from '@/shared/lib/item-status';

type ReviewItemProps = {
  item: RequestItem;
  draft: ReviewDraft;
  dispatch: Dispatch<ReviewAction>;
  closed: boolean;
  onOpenDocument: (document: RequestDocument) => void;
};

export function DocumentMeta({ document }: { document: RequestDocument }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">{document.fileName}</p>
      <p className="text-muted-foreground text-xs mt-0.5">
        {fileSize(document.sizeBytes)} · {dateTimeBr(document.uploadedAt)}
      </p>
    </div>
  );
}

export function ReviewItem({ item, draft, dispatch, closed, onOpenDocument }: ReviewItemProps) {
  const pendingIds = item.documents
    .filter((doc) => doc.reviewStatus === 'pending')
    .map((doc) => doc.id);
  const blocked = pendingIds.some((id) => draft.rejections.has(id));
  const accepted = draft.acceptedItemIds.has(item.id);

  return (
    <article className="bg-card border-border rounded-xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold font-display text-foreground">
            {item.name}
            {wasResent(item) ? <StatusPill status="resent" /> : null}
          </h3>
          <DueDate date={item.dueDate} />
        </div>
        <Button
          variant={accepted ? 'default' : 'outline'}
          size="sm"
          className="shadow-xs font-medium"
          aria-pressed={accepted}
          aria-label={`${accepted ? 'Aceite marcado' : 'Aceitar item'}: ${item.name}`}
          disabled={closed || blocked}
          onClick={() =>
            dispatch({ type: 'toggleAccept', itemId: item.id, documentIds: pendingIds })
          }
        >
          <Check className="mr-2 h-4 w-4" aria-hidden="true" />
          {accepted ? 'Aceite marcado' : 'Aceitar item'}
        </Button>
      </div>

      <ul className="border-border divide-border mt-4 divide-y rounded-xl border bg-card overflow-hidden">
        {item.documents.map((doc) => {
          const rejecting = draft.rejections.has(doc.id);
          return (
            <li
              key={doc.id}
              className="flex flex-col gap-3 p-3.5 hover:bg-slate-50/75 transition-colors"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <DocumentMeta document={doc} />
                <div className="flex items-center gap-2">
                  {doc.reviewStatus !== 'pending' ? <StatusPill status={doc.reviewStatus} /> : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hover:bg-sunken text-muted-foreground hover:text-foreground"
                    aria-label={`Abrir ${doc.fileName}`}
                    onClick={() => onOpenDocument(doc)}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" /> Abrir
                  </Button>
                  {doc.reviewStatus === 'pending' ? (
                    <Button
                      variant={rejecting ? 'destructive' : 'outline'}
                      size="sm"
                      className="shadow-xs"
                      aria-pressed={rejecting}
                      aria-label={`${rejecting ? 'Recusa marcada' : 'Recusar'}: ${doc.fileName}`}
                      disabled={closed}
                      onClick={() =>
                        dispatch({ type: 'toggleRejection', itemId: item.id, documentId: doc.id })
                      }
                    >
                      <X className="mr-2 h-4 w-4" aria-hidden="true" />
                      {rejecting ? 'Recusa marcada' : 'Recusar'}
                    </Button>
                  ) : null}
                </div>
              </div>
              {rejecting ? (
                <ReviewReason
                  id={`reason-${doc.id}`}
                  value={draft.rejections.get(doc.id) ?? ''}
                  placeholder="Motivo da recusa (o Responsável recebe este texto)"
                  onChange={(reason) =>
                    dispatch({ type: 'setRejection', documentId: doc.id, reason })
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
