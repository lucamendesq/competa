import { Check, Copy } from 'lucide-react';
import type { PeriodOpening } from '@/features/periods/api/period.types';
import { Callout } from '@/shared/components/callout';
import { Button } from '@/shared/components/ui/button';
import { useCopy } from '@/shared/hooks/use-copy';

export function PeriodOpeningSummary({
  result,
  onDone,
}: {
  result: PeriodOpening;
  onDone: () => void;
}) {
  const { copiedKey, copy } = useCopy();

  return (
    <>
      <Callout tone="success" heading="Competência aberta com sucesso" className="mt-4">
        <p>Os emails foram enviados e os contatos já podem acessar os links.</p>
      </Callout>

      <ul className="border-border max-h-64 divide-y divide-border overflow-y-auto rounded-xl border mt-4 bg-card">
        {result.requests.map((request) => (
          <li key={request.id} className="p-3.5 hover:bg-slate-50/75 transition-colors">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{request.companyName}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {request.itemCount} documentos exigidos
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="hover:bg-sunken text-foreground"
                aria-label={`Copiar link de ${request.companyName}`}
                onClick={() =>
                  copy(request.uploadUrl, `Link de ${request.companyName} copiado.`, request.id)
                }
              >
                {copiedKey === request.id ? (
                  <Check className="mr-2 h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {copiedKey === request.id ? 'Copiado!' : 'Link'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex justify-end border-t p-4">
        <Button onClick={onDone} className="font-medium">
          Entendi
        </Button>
      </div>
    </>
  );
}
