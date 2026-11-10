import { Download, Eye, File as FileIcon } from 'lucide-react';
import type { MyDocument } from '@/features/contact-area/api/contact-area.types';
import { StatusPill } from '@/shared/components/status-pill';
import { Button } from '@/shared/components/ui/button';
import { dateBr, fileSize } from '@/shared/lib/format';

type PeriodDocumentsProps = {
  documents: MyDocument[];
  showReview: boolean;
  onOpen: (document: MyDocument) => void;
  onDownload: (document: MyDocument) => void;
};

export function PeriodDocuments({
  documents,
  showReview,
  onOpen,
  onDownload,
}: PeriodDocumentsProps) {
  return (
    <ul className="border-border mt-2 divide-y rounded-lg border bg-white">
      {documents.map((document) => (
        <li
          key={document.id}
          className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <FileIcon
              className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-foreground truncate font-medium">{document.fileName}</p>
              <p className="text-muted-foreground text-xs">
                {fileSize(document.sizeBytes)} · {dateBr(document.uploadedAt)}
                {showReview && document.uploadedByName ? ` · ${document.uploadedByName}` : null}
              </p>
              {showReview && document.reviewStatus === 'rejected' && document.rejectionReason ? (
                <p className="text-danger-foreground mt-1 text-xs">
                  Motivo da recusa: {document.rejectionReason}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showReview ? <StatusPill status={document.reviewStatus} /> : null}
            <Button
              variant="outline"
              size="sm"
              aria-label={`Ver ${document.fileName}`}
              onClick={() => onOpen(document)}
            >
              <Eye className="h-4 w-4" aria-hidden="true" />
              Ver
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Baixar ${document.fileName}`}
              onClick={() => onDownload(document)}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Baixar
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
