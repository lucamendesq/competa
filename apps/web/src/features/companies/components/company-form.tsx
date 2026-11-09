import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { COMPANY_FLAGS } from '@competa/contracts';
import { useForm, useWatch, type Path } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useTemplateOptions } from '@/features/catalog';
import type { CompanyDetail } from '@/features/companies/api/company.types';
import { ChecklistPreviewPanel } from '@/features/companies/components/checklist-preview-panel';
import {
  CompanyFormSchema,
  CONTACT_EMAIL_REQUIRED,
  contactOf,
  formFieldOf,
  formValuesOf,
  type CompanyFormValues,
} from '@/features/companies/components/company-form-schema';
import { ContactAccessList } from '@/features/companies/components/contact-access-list';
import {
  useAddContact,
  useCreateCompany,
  useRemoveContact,
  useUpdateCompany,
  useUpdateContact,
} from '@/features/companies/queries/use-company-mutations';
import { useAccountantOptions } from '@/features/companies/queries/use-company-queries';
import { Callout } from '@/shared/components/callout';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { apiErrorMessage, apiFieldErrors } from '@/shared/lib/api-error';
import { cnpjInputMask, FLAG_LABEL, phoneInputMask } from '@/shared/lib/format';

const SELECT_CLASS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50';
const INPUT_CLASS = 'focus-visible:ring-ring focus-visible:border-primary shadow-xs';

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="text-danger text-sm">
      {message}
    </p>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-border/80 pb-4">
      <h2 className="font-display text-base font-semibold leading-7 text-foreground">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm leading-6">{description}</p>
    </div>
  );
}

export function CompanyForm({ company }: { company: CompanyDetail | null }) {
  const companyId = company?.id ?? '';
  const navigate = useNavigate();
  const [saveError, setSaveError] = useState<string | null>(null);
  const templates = useTemplateOptions();
  const accountants = useAccountantOptions();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany(companyId);
  const addContact = useAddContact(companyId);
  const updateContact = useUpdateContact(companyId);
  const removeContact = useRemoveContact(companyId);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    trigger,
    formState: { errors, isValid, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(CompanyFormSchema),
    mode: 'onChange',
    defaultValues: formValuesOf(company),
  });
  const [contactName, contactEmail] = useWatch({ control, name: ['contactName', 'contactEmail'] });
  const contactEmailError =
    errors.contactEmail?.message ??
    (contactName.trim() && !contactEmail.trim() ? CONTACT_EMAIL_REQUIRED : undefined);

  const syncContact = async (contact: ReturnType<typeof contactOf>) => {
    const existing = company?.contacts[0];
    if (contact && !existing) {
      await addContact.mutateAsync(contact);
      return;
    }
    if (contact && existing) {
      const updated = await updateContact.mutateAsync({ contactId: existing.id, body: contact });
      if (updated.undeliveredLinks > 0) {
        toast.warning(
          `O novo Responsável não recebeu ${updated.undeliveredLinks} link(s) de envio. ` +
            'Reenvie pela Solicitação.',
        );
      }
      return;
    }
    if (!contact && existing) await removeContact.mutateAsync(existing.id);
  };

  const save = async (values: CompanyFormValues) => {
    const contact = contactOf(values);
    if (company) {
      await updateCompany.mutateAsync({
        name: values.name,
        checklistTemplateId: values.checklistTemplateId || null,
        responsibleAccountantId: values.responsibleAccountantId || null,
        cnpj: values.cnpj || null,
        flags: values.flags,
      });
      await syncContact(contact);
      toast.success('Empresa atualizada.');
      return navigate('/empresas');
    }
    const created = await createCompany.mutateAsync({
      name: values.name,
      flags: values.flags,
      ...(values.checklistTemplateId ? { checklistTemplateId: values.checklistTemplateId } : {}),
      ...(values.responsibleAccountantId
        ? { responsibleAccountantId: values.responsibleAccountantId }
        : {}),
      ...(values.cnpj ? { cnpj: values.cnpj } : {}),
      ...(contact ? { contact } : {}),
    });
    toast.success('Empresa cadastrada.');
    return navigate(
      values.checklistTemplateId ? `/empresas/${created.id}/checklist?created=1` : '/empresas',
    );
  };

  const onSubmit = handleSubmit((values) => {
    setSaveError(null);
    return save(values).catch((error: unknown) => {
      setSaveError(apiErrorMessage(error, 'Não foi possível salvar a empresa.'));
      for (const [path, message] of Object.entries(apiFieldErrors(error))) {
        setError(formFieldOf(path) as Path<CompanyFormValues>, { type: 'server', message });
      }
    });
  });

  return (
    <form
      noValidate
      className="mx-auto mt-8 flex max-w-5xl flex-col items-start gap-8 lg:flex-row"
      onSubmit={onSubmit}
    >
      <div className="flex flex-1 flex-col gap-6 w-full">
        <section className="bg-card border-border shadow-sm rounded-xl p-6 border flex flex-col gap-6">
          <SectionHeading
            title="Dados da empresa"
            description="O nome aparece no link de upload e nos emails enviados para o cliente."
          />
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name" className="font-medium text-foreground">
                Nome da empresa{' '}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
              </Label>
              <Input
                id="name"
                required
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? 'name-error' : undefined}
                className={INPUT_CLASS}
                {...register('name')}
              />
              <FieldError id="name-error" message={errors.name?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cnpj" className="font-medium text-foreground">
                CNPJ (Opcional)
              </Label>
              <Input
                id="cnpj"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                aria-invalid={errors.cnpj ? true : undefined}
                aria-describedby={errors.cnpj ? 'cnpj-error' : undefined}
                className={INPUT_CLASS}
                {...register('cnpj', {
                  onChange: (event: { target: { value: string } }) =>
                    setValue('cnpj', cnpjInputMask(event.target.value), { shouldValidate: true }),
                })}
              />
              <FieldError id="cnpj-error" message={errors.cnpj?.message} />
            </div>
          </div>
        </section>

        <section className="bg-card border-border shadow-sm rounded-xl p-6 border flex flex-col gap-6">
          <SectionHeading
            title="Responsável pelo envio"
            description="Quem recebe os links de cobrança desta empresa."
          />
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contactName" className="font-medium text-foreground">
                Nome do contato
              </Label>
              <Input
                id="contactName"
                placeholder="Ex: João da Silva"
                aria-describedby={errors.contactName ? 'contactName-error' : undefined}
                className={INPUT_CLASS}
                {...register('contactName', {
                  onChange: () => void trigger('contactEmail'),
                })}
              />
              <FieldError id="contactName-error" message={errors.contactName?.message} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contactEmail" className="font-medium text-foreground">
                E-mail
              </Label>
              <Input
                id="contactEmail"
                type="email"
                aria-invalid={contactEmailError ? true : undefined}
                aria-describedby={contactEmailError ? 'contactEmail-error' : undefined}
                className={INPUT_CLASS}
                {...register('contactEmail')}
              />
              <FieldError id="contactEmail-error" message={contactEmailError} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contactPhone" className="font-medium text-foreground">
                WhatsApp (Opcional)
              </Label>
              <Input
                id="contactPhone"
                type="tel"
                placeholder="(00) 00000-0000"
                aria-describedby={errors.contactPhone ? 'contactPhone-error' : undefined}
                className={INPUT_CLASS}
                {...register('contactPhone', {
                  onChange: (event: { target: { value: string } }) =>
                    setValue('contactPhone', phoneInputMask(event.target.value)),
                })}
              />
              <FieldError id="contactPhone-error" message={errors.contactPhone?.message} />
            </div>
          </div>
          {company ? <ContactAccessList companyId={company.id} /> : null}
        </section>

        <section className="bg-card border-border shadow-sm rounded-xl p-6 border flex flex-col gap-6">
          <SectionHeading
            title="Atendimento"
            description="Responsável interno e obrigações da empresa."
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="responsibleAccountantId" className="font-medium text-foreground">
              Contador responsável
            </Label>
            <select
              key={accountants.data ? 'ready' : 'loading'}
              id="responsibleAccountantId"
              className={SELECT_CLASS}
              {...register('responsibleAccountantId')}
            >
              <option value="">Nenhum (qualquer um da equipe pode atender)</option>
              {(accountants.data ?? []).map((accountant) => (
                <option key={accountant.id} value={accountant.id}>
                  {accountant.name}
                </option>
              ))}
            </select>
            <FieldError
              id="responsibleAccountantId-error"
              message={errors.responsibleAccountantId?.message}
            />
          </div>
          <div className="flex flex-col gap-3 pt-2">
            {COMPANY_FLAGS.map((flag) => (
              <div
                key={flag}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-sunken/40 px-3.5 py-2.5 transition-colors hover:bg-sunken/70"
              >
                <input
                  type="checkbox"
                  id={`flag-${flag}`}
                  className="size-4 rounded border-border text-primary focus:ring-ring accent-primary"
                  {...register(`flags.${flag}`)}
                />
                <Label
                  htmlFor={`flag-${flag}`}
                  className="font-medium cursor-pointer text-foreground"
                >
                  {FLAG_LABEL[flag]}
                </Label>
              </div>
            ))}
          </div>
        </section>

        {saveError ? <Callout tone="danger" heading={saveError} /> : null}

        <div className="border-border flex items-center gap-3 border-t pt-4">
          <Button variant="ghost" type="button" onClick={() => void navigate(-1)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting || !isValid || Boolean(contactEmailError)}
            className="shadow-xs font-medium"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar empresa'}
          </Button>
        </div>
      </div>

      <aside
        aria-label="Checklist"
        className="bg-card border-border flex w-full flex-col gap-6 rounded-xl border p-6 shadow-sm lg:sticky lg:top-8 lg:w-[24rem]"
      >
        <div>
          <Label htmlFor="checklistTemplateId" className="mb-2 block font-medium text-foreground">
            Checklist aplicado
          </Label>
          <select
            key={templates.data ? 'ready' : 'loading'}
            id="checklistTemplateId"
            aria-describedby="checklistTemplateId-help"
            className={SELECT_CLASS}
            {...register('checklistTemplateId')}
          >
            <option value="">Sem template de checklist</option>
            {(templates.data ?? []).map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <p id="checklistTemplateId-help" className="text-muted-foreground mt-2 text-xs">
            Empresas sem template não entram no disparo em lote ao abrir uma competência.
          </p>
        </div>
        <ChecklistPreviewPanel
          control={control}
          companyId={companyId}
          savedTemplateId={company?.checklistTemplateId ?? ''}
        />
      </aside>
    </form>
  );
}
