import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { Cnpj, COMPANY_FLAGS, CompanyFlags } from '@contabilidade/contracts';
import * as z from 'zod';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideCircleAlert, lucideTriangleAlert } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { apiErrorMessage, apiFieldErrors } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { ErrorState } from '../../shared/error-state';
import { Callout } from '../../shared/callout';
import { LoadingRows } from '../../shared/loading-rows';
import { PageHeader } from '../../shared/page-header';
import { CATEGORY_LABEL, FLAG_LABEL, PERIODICITY_LABEL } from '../../shared/format';
import { ChecklistsService } from '../checklists/checklists.service';
import { CompaniesService } from './companies.service';

const CompanyForm = z
  .object({
    name: z.string().trim().min(1, 'Informe o nome da empresa.'),
    checklistTemplateId: z.uuid('Escolha o tipo de empresa.'),
    cnpj: z.union([Cnpj, z.literal('')]),
    contactName: z.string().trim(),
    contactEmail: z.union([z.email('E-mail inválido.'), z.literal('')]),
    contactPhone: z.string().trim(),
  })
  .refine((value) => !value.contactName || value.contactEmail !== '', {
    message: 'Sem e-mail o Responsável não recebe o link de cobrança.',
    path: ['contactEmail'],
  });

@Component({
  selector: 'app-company-form-page',
  imports: [
    RouterLink,
    FormField,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmLabel,
    PageHeader,
    ErrorState,
    LoadingRows,
    Callout,
  ],
  providers: [provideIcons({ lucideCheck, lucideCircleAlert, lucideTriangleAlert })],
  templateUrl: './company-form-page.html',
})
export class CompanyFormPage {
  readonly companyId = input<string>();

  private readonly service = inject(CompaniesService);
  private readonly checklists = inject(ChecklistsService);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);

  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly PERIODICITY_LABEL = PERIODICITY_LABEL;
  protected readonly availableFlags = COMPANY_FLAGS.map((flag) => ({
    key: flag,
    label: FLAG_LABEL[flag],
  }));

  protected readonly editing = computed(() => this.companyId() !== undefined);
  protected readonly company = this.service.detail(() => this.companyId());
  protected readonly templates = this.checklists.templates();

  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<Record<string, string>>({});

  protected readonly flags = linkedSignal<CompanyFlags>(
    () => this.company.value()?.flags ?? ({} as CompanyFlags),
  );

  protected readonly data = linkedSignal(() => {
    const loaded = this.company.value();
    const contact = loaded?.contacts[0];

    return {
      name: loaded?.name ?? '',
      checklistTemplateId: loaded?.checklistTemplateId ?? '',
      cnpj: loaded?.cnpj ?? '',
      contactName: contact?.name ?? '',
      contactEmail: contact?.email ?? '',
      contactPhone: contact?.phone ?? '',
    };
  });

  protected readonly f = form(this.data, (path) => validateStandardSchema(path, CompanyForm));

  private readonly templateId = computed(() => this.data().checklistTemplateId || undefined);
  private readonly selectedTemplate = this.checklists.template(this.templateId);

  /** Espelha `appliesToFlags` da API: item com `conditionFlag` só entra se a flag estiver
   *  ligada. Sem isso a prévia mentiria sobre o que será cobrado. */
  protected readonly preview = computed(() => {
    const items = (this.selectedTemplate.value()?.items ?? []).filter(
      (item) =>
        item.conditionFlag === null ||
        this.flags()[item.conditionFlag as keyof CompanyFlags] === true,
    );

    const byCategory = new Map<string, typeof items>();
    for (const item of items) {
      byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
    }

    return { total: items.length, groups: [...byCategory.entries()] };
  });

  protected readonly countByTemplate = computed(
    () => new Map(this.templates.value()?.map((template) => [template.id, template.itemCount])),
  );

  protected toggleFlag(flag: string) {
    this.flags.update((current) => ({
      ...current,
      [flag]: !current[flag as keyof CompanyFlags],
    }));
  }

  protected flagOn(flag: string) {
    return this.flags()[flag as keyof CompanyFlags] === true;
  }

  protected selectTemplate(templateId: string) {
    this.data.update((current) => ({ ...current, checklistTemplateId: templateId }));
  }

  protected save() {
    this.error.set(null);
    this.fieldErrors.set({});

    return submit(this.f, async (formTree) => {
      const values = formTree().value();
      const contact = values.contactEmail
        ? {
            name: values.contactName || values.name,
            email: values.contactEmail,
            phone: values.contactPhone || undefined,
          }
        : undefined;

      try {
        const id = this.companyId();

        if (id) {
          await this.service.update(id, {
            name: values.name,
            checklistTemplateId: values.checklistTemplateId,
            cnpj: values.cnpj || null,
            flags: this.flags(),
          });

          await this.syncContact(id, contact);
          this.toaster.success('Empresa atualizada.');
        } else {
          const created = await this.service.create({
            name: values.name,
            checklistTemplateId: values.checklistTemplateId,
            cnpj: values.cnpj || undefined,
            flags: this.flags(),
            contact: contact,
          });
          this.toaster.success('Empresa cadastrada.');

          /* Próximo passo em vez de voltar para a lista: o template é um ponto de partida,
           * e é aqui que o Contador tira o documento que esta empresa não tem (antes ele
           * precisava criar um template novo só para isso). */
          await this.router.navigate(['/empresas', created.id, 'checklist'], {
            queryParams: { created: 1 },
          });

          return undefined;
        }

        await this.router.navigate(['/empresas']);
      } catch (error) {
        this.error.set(apiErrorMessage(error, 'Não foi possível salvar a empresa.'));
        this.fieldErrors.set(apiFieldErrors(error));
      }

      return undefined;
    });
  }

  private async syncContact(
    companyId: string,
    contact?: { name: string; email: string; phone?: string },
  ) {
    const existing = this.company.value()?.contacts[0];

    if (contact && !existing) {
      await this.service.addContact(companyId, contact);
      return;
    }

    if (contact && existing) {
      await this.service.updateContact(companyId, existing.id, contact);
      return;
    }

    if (!contact && existing) {
      await this.service.removeContact(companyId, existing.id);
    }
  }
}
