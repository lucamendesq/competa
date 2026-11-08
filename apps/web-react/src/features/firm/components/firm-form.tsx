import { zodResolver } from '@hookform/resolvers/zod';
import { UpdateFirmBody } from '@competa/contracts';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { toast } from 'sonner';
import type { Firm } from '@/features/firm/api/firm.types';
import {
  bodyOf,
  changedFields,
  firmFormSchema,
  formValuesOf,
  type FirmFormValues,
} from '@/features/firm/components/firm-form-schema';
import { RemindersFieldset } from '@/features/firm/components/reminders-fieldset';
import { useUpdateFirm } from '@/features/firm/queries/use-update-firm';
import { Callout } from '@/shared/components/callout';
import { PlanGateNotice } from '@/shared/components/plan-gate-notice';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage, apiFieldErrors } from '@/shared/lib/api-error';
import { useSession } from '@/shared/session';

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return message ? (
    <p id={id} className="text-danger text-xs">
      {message}
    </p>
  ) : null;
}

export function FirmForm({ firm }: { firm: Firm }) {
  const session = useSession();
  const isOwner = session.isOwner;
  const canBrand = session.can('branding');
  const canTuneReminders = session.can('reminderTuning');
  const updateFirm = useUpdateFirm();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FirmFormValues>({
    resolver: zodResolver(firmFormSchema(canTuneReminders)),
    defaultValues: formValuesOf(firm, canTuneReminders),
  });
  const [name, logoUrl] = useWatch({ control, name: ['name', 'logoUrl'] });

  const onSubmit = handleSubmit(async (values) => {
    const body = UpdateFirmBody.parse(bodyOf(values, canTuneReminders));
    const changed = changedFields(body, firm);
    if (Object.keys(changed).length === 0) {
      toast.success('Nada para salvar.');
      return;
    }
    await updateFirm.mutateAsync(changed).then(
      () => toast.success('Configurações salvas.'),
      (error: unknown) => {
        for (const [path, message] of Object.entries(apiFieldErrors(error))) {
          setError(path as Path<FirmFormValues>, { type: 'server', message });
        }
        toast.error(apiErrorMessage(error, 'Não foi possível salvar as configurações.'));
      },
    );
  });

  const describedBy = (field: keyof FirmFormValues, help?: string) =>
    [help, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <form noValidate className="flex flex-col gap-8" onSubmit={onSubmit}>
      {isOwner ? null : (
        <Callout tone="info" heading="Somente leitura">
          Apenas o dono da Contabilidade pode alterar estas configurações.
        </Callout>
      )}

      <section className="bg-card border border-border shadow-sm rounded-xl p-6 flex flex-col gap-5">
        <h2 className="text-base font-semibold font-display text-foreground">Perfil</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firmName">Nome da Contabilidade</Label>
          <Input
            id="firmName"
            maxLength={120}
            disabled={!isOwner}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={describedBy('name')}
            {...register('name')}
          />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firmContactEmail">E-mail de contato</Label>
          <Input
            id="firmContactEmail"
            type="email"
            disabled={!isOwner}
            placeholder="contato@suacontabilidade.com.br"
            aria-invalid={errors.contactEmail ? true : undefined}
            aria-describedby={describedBy('contactEmail', 'firmContactEmail-help')}
            {...register('contactEmail')}
          />
          <p id="firmContactEmail-help" className="text-muted-foreground text-xs">
            Aparece como resposta nos e-mails enviados aos Responsáveis.
          </p>
          <FieldError id="contactEmail-error" message={errors.contactEmail?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firmCnpj">CNPJ da Contabilidade</Label>
          <Input
            id="firmCnpj"
            inputMode="numeric"
            disabled={!isOwner}
            placeholder="00.000.000/0001-00"
            aria-invalid={errors.cnpj ? true : undefined}
            aria-describedby={describedBy('cnpj', 'firmCnpj-help')}
            {...register('cnpj')}
          />
          <p id="firmCnpj-help" className="text-muted-foreground text-xs">
            É o documento do pagador na fatura: obrigatório para assinar um plano.
          </p>
          <FieldError id="cnpj-error" message={errors.cnpj?.message} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="firmLogoUrl">URL do logo</Label>
          <Input
            id="firmLogoUrl"
            disabled={!isOwner || !canBrand}
            placeholder="https://..."
            aria-invalid={errors.logoUrl ? true : undefined}
            aria-describedby={describedBy('logoUrl', 'firmLogoUrl-help')}
            {...register('logoUrl')}
          />
          <p id="firmLogoUrl-help" className="text-muted-foreground text-xs">
            Aparece no topo do Link de Upload e no cabeçalho dos e-mails. Endereço{' '}
            <code>https://</code> de uma imagem já publicada.
          </p>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`Logo de ${name}`}
              className="border-border bg-card mt-1 h-10 w-auto max-w-[200px] self-start rounded-md border object-contain p-1"
              referrerPolicy="no-referrer"
            />
          ) : null}
          {canBrand ? null : (
            <PlanGateNotice capability="branding">
              Sua marca no Link de Upload e nos e-mails
            </PlanGateNotice>
          )}
          <FieldError id="logoUrl-error" message={errors.logoUrl?.message} />
        </div>
      </section>

      <RemindersFieldset
        register={register}
        errors={errors}
        disabled={!isOwner || !canTuneReminders}
        canTuneReminders={canTuneReminders}
      />

      {isOwner ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
