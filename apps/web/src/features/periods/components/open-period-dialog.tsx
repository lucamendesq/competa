import { useState } from 'react';
import { OpenPeriodBody } from '@competa/contracts';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { PeriodOpening } from '@/features/periods/api/period.types';
import { PeriodOpeningSummary } from '@/features/periods/components/period-opening-summary';
import { useOpenPeriod } from '@/features/periods/queries/use-period-mutations';
import { usePeriodPreview } from '@/features/periods/queries/use-period-queries';
import { Callout } from '@/shared/components/callout';
import { Modal } from '@/shared/components/modal';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage } from '@/shared/lib/api-error';
import { cn } from '@/shared/lib/cn';
import { defaultReferenceMonth, MONTH_OPTIONS, monthLabel } from '@/shared/lib/format';

type OpeningForm = { referenceMonth: string; dueDate: string };

const yearOptions = () => {
  const base = Number(defaultReferenceMonth().slice(0, 4));
  return Array.from({ length: 4 }, (_, index) => base - 2 + index);
};

const dueDateErrorOf = ({ referenceMonth, dueDate }: OpeningForm) => {
  const parsed = OpenPeriodBody.safeParse({ referenceMonth, dueDate: dueDate || undefined });
  return parsed.success
    ? null
    : (parsed.error.issues.find((issue) => issue.path[0] === 'dueDate')?.message ?? null);
};

function OpeningFlow({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [result, setResult] = useState<PeriodOpening | null>(null);
  const openPeriod = useOpenPeriod();
  const { register, control, setValue, handleSubmit } = useForm<OpeningForm>({
    defaultValues: { referenceMonth: defaultReferenceMonth(), dueDate: '' },
  });
  const [referenceMonth, dueDate] = useWatch({ control, name: ['referenceMonth', 'dueDate'] });

  const preview = usePeriodPreview(referenceMonth, { enabled: true });
  const recipients = (preview.data?.requests ?? []).map((row) => ({
    id: row.companyId,
    name: row.companyName,
  }));
  const withoutTemplate = (preview.data?.skipped ?? []).filter(
    (row) => row.blockedBy === 'template',
  );
  const existingPeriodId = preview.data?.existingPeriodId ?? null;
  const dueDateError = dueDateErrorOf({ referenceMonth, dueDate });

  const monthPart = referenceMonth.slice(5, 7);
  const yearPart = Number(referenceMonth.slice(0, 4));
  const setMonth = (month: string) =>
    setValue('referenceMonth', `${referenceMonth.slice(0, 4)}-${month}`);
  const setYear = (year: string) =>
    setValue('referenceMonth', `${year}-${referenceMonth.slice(5, 7)}`);

  const review = handleSubmit(() => {
    if (existingPeriodId || dueDateError) return;
    openPeriod.reset();
    setStep('confirm');
  });

  const confirm = () =>
    openPeriod
      .mutateAsync({ referenceMonth, ...(dueDate ? { dueDate } : {}) })
      .then((created) => {
        setResult(created);
        const sent = created.requests.length;
        toast.success(
          sent === 1
            ? 'Competência aberta. 1 link enviado por e-mail.'
            : `Competência aberta. ${sent} links enviados por e-mail.`,
        );
      })
      .catch(() => undefined);

  const openError = openPeriod.error
    ? apiErrorMessage(openPeriod.error, 'Não foi possível abrir a competência.')
    : null;

  if (result) return <PeriodOpeningSummary result={result} onDone={onClose} />;

  return (
    <>
      {openError ? <Callout tone="danger" heading={openError} className="mb-4 mt-2" /> : null}

      {step === 'form' ? (
        <form id="open-period-form" className="mt-4 flex flex-col gap-6" onSubmit={review}>
          <fieldset className="flex flex-col gap-2" aria-labelledby="reference-month-label">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id="reference-month-label" className="text-sm font-medium text-foreground">
                Mês de referência (Competência)
              </span>
              <div className="flex items-center gap-1 bg-sunken p-0.5 rounded-lg border border-border-subtle">
                {yearOptions().map((year) => (
                  <button
                    key={year}
                    type="button"
                    aria-pressed={year === yearPart}
                    className={cn(
                      'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                      year === yearPart
                        ? 'bg-card text-foreground font-semibold shadow-xs'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => setYear(String(year))}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
              {MONTH_OPTIONS.map((month) => (
                <button
                  key={month.value}
                  type="button"
                  aria-pressed={month.value === monthPart}
                  className={cn(
                    'h-9.5 rounded-lg px-2 text-xs font-medium border transition-colors flex items-center justify-center text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    month.value === monthPart
                      ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'border-border bg-surface text-foreground hover:bg-sunken hover:border-border-strong',
                  )}
                  onClick={() => setMonth(month.value)}
                >
                  {month.label}
                </button>
              ))}
            </div>

            <div className="sr-only">
              <select
                aria-label="Mês"
                aria-describedby="month-help"
                value={monthPart}
                tabIndex={-1}
                onChange={(event) => setMonth(event.target.value)}
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Ano"
                aria-describedby="month-help"
                value={yearPart}
                tabIndex={-1}
                onChange={(event) => setYear(event.target.value)}
              >
                {yearOptions().map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <p id="month-help" className="text-muted-foreground text-xs mt-1">
              O mês a que os documentos se referem — normalmente o mês passado.
            </p>
            {existingPeriodId ? (
              <p className="text-danger text-xs font-medium" role="alert">
                A competência {monthLabel(referenceMonth)} já foi aberta.{' '}
                <Link
                  to={`/competencias/${existingPeriodId}/pendencias`}
                  className="underline"
                  onClick={onClose}
                >
                  Ver painel
                </Link>
              </p>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="general-due-date" className="text-sm font-medium text-foreground">
              Prazo geral da competência (opcional)
            </Label>
            <Input
              id="general-due-date"
              type="date"
              aria-describedby="due-date-help"
              aria-invalid={dueDateError ? true : undefined}
              className="bg-surface shadow-xs focus-visible:ring-ring focus-visible:border-primary"
              {...register('dueDate')}
            />
            <p id="due-date-help" className="text-muted-foreground text-xs">
              Usado quando o item não tem prazo próprio.
            </p>
            {dueDateError ? (
              <p className="text-danger text-xs font-medium" role="alert">
                {dueDateError}
              </p>
            ) : null}
          </div>

          <div className="bg-sunken/60 border-border rounded-xl border p-3.5 text-sm text-foreground">
            <p>
              Serão criadas{' '}
              <strong className="tabular-nums font-semibold">{recipients.length}</strong>{' '}
              solicitações para as empresas ativas com template e Responsável cadastrado.
            </p>
          </div>

          {withoutTemplate.length ? (
            <div
              className="rounded-xl border border-warning-border bg-warning-surface p-4 text-sm text-warning-foreground"
              role="note"
            >
              <p className="font-semibold">
                {withoutTemplate.length} empresa(s) não receberão comunicado — sem template de
                checklist:
              </p>
              <ul className="mt-2.5 flex flex-col gap-1.5">
                {withoutTemplate.map((company) => (
                  <li
                    key={company.companyId}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
                  >
                    <span>{company.companyName}</span>
                    <Link
                      to={`/empresas/${company.companyId}/editar`}
                      className="font-semibold underline hover:text-warning-foreground/80"
                      onClick={onClose}
                    >
                      Cadastrar template
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          <div className="border-border bg-sunken/50 rounded-xl border p-4 text-sm text-foreground">
            <p className="font-medium">
              Vamos enviar <strong className="tabular-nums font-bold">{recipients.length}</strong>{' '}
              e-mails agora, de {monthLabel(referenceMonth)}, para o contato principal de{' '}
              <strong className="tabular-nums font-bold">{recipients.length}</strong> empresas.
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Cada Responsável principal recebe o link de envio dele. Isso não se desfaz.
            </p>
          </div>
          <ul className="border-border max-h-64 divide-y divide-border overflow-y-auto rounded-xl border bg-card">
            {recipients.map((company) => (
              <li key={company.id} className="p-3.5 hover:bg-slate-50/75 transition-colors">
                <p className="text-sm font-semibold text-foreground">{company.name}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex flex-wrap justify-end gap-2.5 border-t p-4">
        {step === 'confirm' ? (
          <>
            <Button variant="ghost" type="button" onClick={() => setStep('form')}>
              Voltar
            </Button>
            <Button
              type="button"
              disabled={openPeriod.isPending}
              className="font-medium"
              onClick={confirm}
            >
              {openPeriod.isPending
                ? 'Enviando…'
                : `Confirmar e enviar ${recipients.length} e-mails`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="open-period-form"
              disabled={
                recipients.length === 0 || Boolean(existingPeriodId) || Boolean(dueDateError)
              }
              className="font-medium"
            >
              Revisar envios
            </Button>
          </>
        )}
      </div>
    </>
  );
}

export function OpenPeriodDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Abrir nova competência"
      description="Isto cria um checklist para cada empresa com base no template delas e dispara os emails de solicitação."
    >
      <OpeningFlow onClose={() => onOpenChange(false)} />
    </Modal>
  );
}
