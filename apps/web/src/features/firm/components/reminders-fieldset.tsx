import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { FirmFormValues } from '@/features/firm/components/firm-form-schema';
import { PlanGateNotice } from '@/shared/components/plan-gate-notice';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

type RemindersFieldsetProps = {
  register: UseFormRegister<FirmFormValues>;
  errors: FieldErrors<FirmFormValues>;
  disabled: boolean;
  canTuneReminders: boolean;
};

const FIELDS = [
  {
    name: 'reminderMax',
    label: 'Máximo de lembretes por item',
    min: 0,
    max: 10,
    help: '0 desliga as cobranças automáticas.',
  },
  { name: 'reminderDueSoonDays', label: 'Avisar quantos dias antes do prazo', min: 0, max: 31 },
  { name: 'reminderGapDays', label: 'Intervalo mínimo entre lembretes (dias)', min: 1, max: 31 },
] as const;

export function RemindersFieldset({
  register,
  errors,
  disabled,
  canTuneReminders,
}: RemindersFieldsetProps) {
  return (
    <section className="bg-card border border-border shadow-sm rounded-xl p-6 flex flex-col gap-5">
      <h2 className="text-base font-semibold font-display text-foreground">
        Lembretes automáticos
      </h2>
      <p className="text-muted-foreground text-sm">
        A cobrança automática roda em todos os planos. O que muda aqui é a <strong>cadência</strong>
        : quantos lembretes, a partir de quantos dias do prazo e com que intervalo.
      </p>
      {canTuneReminders ? null : (
        <PlanGateNotice capability="reminderTuning">
          Ajustar a cadência dos lembretes
        </PlanGateNotice>
      )}
      {FIELDS.map((field) => {
        const error = errors[field.name]?.message;
        const help = 'help' in field ? `${field.name}-help` : undefined;
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <Label htmlFor={field.name}>{field.label}</Label>
            <Input
              id={field.name}
              type="number"
              min={field.min}
              max={field.max}
              className="w-28"
              disabled={disabled}
              aria-invalid={error ? true : undefined}
              aria-describedby={
                [help, error ? `${field.name}-error` : undefined].filter(Boolean).join(' ') ||
                undefined
              }
              {...register(field.name)}
            />
            {'help' in field ? (
              <p id={help} className="text-muted-foreground text-xs">
                {field.help}
              </p>
            ) : null}
            {error ? (
              <p id={`${field.name}-error`} className="text-danger text-xs">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
