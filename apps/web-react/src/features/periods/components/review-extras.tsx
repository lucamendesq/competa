import type { Dispatch } from 'react';
import { Check, ExternalLink, X } from 'lucide-react';
import type { RequestDocument } from '@/features/periods/api/period.types';
import type { ReviewAction, ReviewDraft } from '@/features/periods/components/review-draft';
import { DocumentMeta } from '@/features/periods/components/review-item';
import { ReviewReason } from '@/features/periods/components/review-reason';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';

type ReviewExtrasProps = {
  documents: RequestDocument[];
  draft: ReviewDraft;
  dispatch: Dispatch<ReviewAction>;
  onOpenDocument: (document: RequestDocument) => void;
};

export function ReviewExtras({ documents, draft, dispatch, onOpenDocument }: ReviewExtrasProps) {
  if (!documents.length) return null;

  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Documentos extras ({documents.length})
      </h2>
      <ul className="bg-card border-border divide-border divide-y rounded-xl border shadow-sm overflow-hidden">
        {documents.map((doc) => {
          const decision = draft.extras.get(doc.id);
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
                    <>
                      <Button
                        variant={decision?.decision === 'accepted' ? 'default' : 'outline'}
                        size="sm"
                        className="shadow-xs font-medium"
                        aria-pressed={decision?.decision === 'accepted'}
                        aria-label={`Aceitar: ${doc.fileName}`}
                        onClick={() =>
                          dispatch({
                            type: 'toggleExtra',
                            documentId: doc.id,
                            decision: 'accepted',
                          })
                        }
                      >
                        <Check className="mr-2 h-4 w-4" aria-hidden="true" /> Aceitar
                      </Button>
                      <Button
                        variant={decision?.decision === 'rejected' ? 'destructive' : 'outline'}
                        size="sm"
                        className="shadow-xs"
                        aria-pressed={decision?.decision === 'rejected'}
                        aria-label={`Recusar: ${doc.fileName}`}
                        onClick={() =>
                          dispatch({
                            type: 'toggleExtra',
                            documentId: doc.id,
                            decision: 'rejected',
                          })
                        }
                      >
                        <X className="mr-2 h-4 w-4" aria-hidden="true" /> Recusar
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              {decision?.decision === 'rejected' ? (
                <ReviewReason
                  id={`extra-reason-${doc.id}`}
                  value={decision.rejectionReason}
                  placeholder="Motivo da recusa"
                  onChange={(reason) =>
                    dispatch({ type: 'setExtraReason', documentId: doc.id, reason })
                  }
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
