import { useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { toast } from 'sonner';
import type { MyPendingItem } from '@/features/contact-area/api/contact-area.types';
import { PendingRow } from '@/features/contact-area/components/pending-row';
import { useMyPending, useSendMyFiles } from '@/features/contact-area/queries/use-contact-area';
import { ErrorState } from '@/shared/components/error-state';
import { LoadingRows } from '@/shared/components/loading-rows';
import { monthLabel } from '@/shared/lib/format';
import { UploadFeedback, type FileResult } from '@/shared/upload';

type PendingGroup = {
  key: string;
  companyName: string;
  referenceMonth: string;
  requestId: string;
  items: MyPendingItem[];
};

const groupsOf = (rows: MyPendingItem[]) => {
  const groups = new Map<string, PendingGroup>();
  for (const row of rows) {
    const key = `${row.companyId}-${row.periodId}`;
    const group = groups.get(key) ?? {
      key,
      companyName: row.companyName,
      referenceMonth: row.referenceMonth,
      requestId: row.requestId,
      items: [],
    };
    group.items.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
};

type Target = { requestId: string; requestItemId: string };

export function ContactPendingPage() {
  const pending = useMyPending();
  const upload = useSendMyFiles();
  const [target, setTarget] = useState<Target | null>(null);
  const [results, setResults] = useState<FileResult[] | null>(null);

  const send = (files: File[], next: Target) => {
    setTarget(next);
    setResults(null);
    return upload.sendFiles(files, next).then((sent) => {
      setResults(sent);
      if (sent.every((row) => row.ok)) {
        toast.success(
          sent.length === 1 ? 'Arquivo enviado com sucesso.' : `${sent.length} arquivos enviados.`,
        );
      }
    });
  };

  const renderBody = () => {
    if (pending.isPending) return <LoadingRows count={4} />;
    if (pending.isError) {
      return (
        <ErrorState
          error={pending.error}
          fallback="Não foi possível carregar as pendências."
          retry={() => void pending.refetch()}
        />
      );
    }
    const groups = groupsOf(pending.data);
    if (groups.length === 0) {
      return (
        <div className="bg-primary/10 border-primary/20 rounded-xl border p-5">
          <div className="flex items-start gap-4">
            <PartyPopper className="text-primary mt-1 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-foreground text-base font-semibold tracking-tight">
                Tudo certo por aqui!
              </h2>
              <p className="text-foreground/80 mt-1 text-sm">
                Nenhuma empresa sua tem documento pendente neste momento.
              </p>
            </div>
          </div>
        </div>
      );
    }
    return groups.map((group) => (
      <section key={group.key} className="flex flex-col gap-3">
        <h2 className="font-display text-foreground text-base font-semibold tracking-tight">
          {group.companyName}{' '}
          <span className="text-muted-foreground font-sans text-sm font-normal">
            — Competência {monthLabel(group.referenceMonth)}
          </span>
        </h2>
        <ul className="bg-card border-border divide-border divide-y rounded-xl border shadow-sm">
          {group.items.map((row) => (
            <PendingRow
              key={row.item.id}
              item={row.item}
              sending={upload.isUploading && target?.requestItemId === row.item.id}
              percent={upload.percent}
              onFiles={(files) =>
                void send(files, { requestId: group.requestId, requestItemId: row.item.id })
              }
            />
          ))}
        </ul>
      </section>
    ));
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-foreground text-2xl font-bold tracking-tight">
        O que falta
      </h1>
      {renderBody()}
      <UploadFeedback
        results={results}
        onDismiss={() => setResults(null)}
        onRetry={(files) => {
          if (target) void send(files, target);
        }}
      />
    </div>
  );
}
