import { X } from 'lucide-react';
import { Link } from 'react-router';
import type { FileResult } from '@/shared/upload/use-upload';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';

type UploadFeedbackProps = {
  results: FileResult[] | null;
  onDismiss: () => void;
  onRetry: (files: File[]) => void;
};

export function UploadFeedback({ results, onDismiss, onRetry }: UploadFeedbackProps) {
  const refused = (results ?? []).filter((result) => !result.ok);
  const retriable = refused.flatMap((result) =>
    result.retriable && result.file ? [result.file] : [],
  );
  const sentCount = (results ?? []).filter((result) => result.ok).length;
  const allRetriable = retriable.length === refused.length;

  const linkReplaced = refused.some((result) => result.linkReplaced);

  const title = linkReplaced
    ? 'O link de envio mudou'
    : allRetriable
      ? 'O envio não completou'
      : 'Alguns arquivos não foram aceitos';
  const description = linkReplaced
    ? `O link mudou enquanto você enviava. Receba o link atual e envie ${
        refused.length === 1 ? 'o arquivo' : 'os arquivos'
      } de novo.`
    : allRetriable
      ? refused.length === 1
        ? '1 arquivo não chegou'
        : `${refused.length} arquivos não chegaram`
      : refused.length === 1
        ? '1 arquivo precisa ser enviado de outra forma'
        : `${refused.length} arquivos precisam ser enviados de outra forma`;

  return (
    <Modal
      open={refused.length > 0}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
      title={title}
      description={description}
      footer={
        linkReplaced ? (
          <Button asChild>
            <Link to="/perdi-meu-link">Receber o link atual</Link>
          </Button>
        ) : retriable.length ? (
          <>
            <Button onClick={() => onRetry(retriable)}>Tentar de novo ({retriable.length})</Button>
            <Button variant="ghost" onClick={onDismiss}>
              Deixar para depois
            </Button>
          </>
        ) : (
          <Button onClick={onDismiss}>Entendi</Button>
        )
      }
    >
      <ul className="divide-border divide-y">
        {refused.map((result, index) => (
          <li key={index} className="flex items-start gap-3 py-3">
            <X className="mt-0.5 shrink-0 h-4 w-4 text-danger-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{result.fileName}</p>
              <p className="mt-0.5 text-xs text-danger-foreground font-medium">{result.reason}</p>
            </div>
          </li>
        ))}
      </ul>
      {sentCount ? (
        <p className="text-muted-foreground mt-4 text-sm">
          Os outros {sentCount} chegaram e já estão na lista.
        </p>
      ) : null}
    </Modal>
  );
}
