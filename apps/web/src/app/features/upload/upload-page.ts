import { Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideCamera,
  lucideCheck,
  lucideCircleCheck,
  lucideClock,
  lucideFile,
  lucideLink2Off,
  lucideLock,
  lucidePartyPopper,
  lucideSmartphone,
  lucideUpload,
  lucideWifiOff,
  lucideX,
} from '@ng-icons/lucide';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { apiErrorCode, apiErrorMessage, failureKind } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { PushService } from '../../shared/push.service';
import { DropZone } from '../../shared/drop-zone';
import { UploadFeedback } from '../../shared/upload-feedback';
import { StatusPill } from '../../shared/status-pill';
import { ResendNotice } from '../../shared/resend-notice';
import { displayItemStatus, itemRejections, needsResend } from '../../shared/item-status';
import { isOverdue, monthLabel, dateBr, fileSize } from '../../shared/format';
import { FileResult, uploadFiles } from '../../shared/upload';
import { UploadService } from './upload.service';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-upload-page',
  imports: [
    NgIcon,
    RouterLink,
    HlmButtonImports,
    DropZone,
    UploadFeedback,
    StatusPill,
    ResendNotice,
    Logo,
  ],
  providers: [
    provideIcons({
      lucideBell,
      lucideCamera,
      lucideCheck,
      lucideCircleCheck,
      lucideClock,
      lucideFile,
      lucideLink2Off,
      lucideLock,
      lucidePartyPopper,
      lucideSmartphone,
      lucideUpload,
      lucideWifiOff,
      lucideX,
    }),
  ],
  templateUrl: './upload-page.html',
})
export class UploadPage {
  readonly token = input.required<string>();

  private readonly service = inject(UploadService);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  /** As ofertas aparecem SÓ depois do envio: antes dele o Responsável quer se livrar da
   *  tarefa, e o benefício ("mês que vem") não é legível (D14, item 5). */
  protected readonly push = inject(PushService);
  protected readonly activatingAccess = signal(false);
  /** O email do contato já tem conta: a ativação sem senha é recusada pela API (AUTHZ-1)
   *  e a oferta vira "entre pela sua conta". */
  protected readonly accountExists = signal(false);

  protected subscribeToPush() {
    return this.push.subscribe((payload) => this.service.subscribePush(this.token(), payload));
  }

  protected async activateAccess() {
    this.activatingAccess.set(true);

    try {
      await this.service.activateAccess(this.token());
      await this.auth.reloadContact();
      await this.router.navigate(['/minha-area/pendencias']);
    } catch (error) {
      if (apiErrorCode(error) === 'EMAIL_ALREADY_REGISTERED') {
        this.accountExists.set(true);
      } else {
        this.toaster.error(apiErrorMessage(error, 'Não foi possível ativar seu acesso.'));
      }
    } finally {
      this.activatingAccess.set(false);
    }
  }

  protected async activateAndSetPassword() {
    this.activatingAccess.set(true);

    try {
      await this.service.activateAccess(this.token());
      await this.auth.reloadContact();
      await this.router.navigate(['/minha-area/definir-senha']);
    } catch (error) {
      if (apiErrorCode(error) === 'EMAIL_ALREADY_REGISTERED') {
        this.accountExists.set(true);
      } else {
        this.toaster.error(apiErrorMessage(error, 'Não foi possível ativar seu acesso.'));
      }
    } finally {
      this.activatingAccess.set(false);
    }
  }

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;
  protected readonly fileSize = fileSize;
  protected readonly isOverdue = isOverdue;
  protected readonly displayItemStatus = displayItemStatus;
  protected readonly needsResend = needsResend;
  protected readonly itemRejections = itemRejections;

  protected readonly checklist = this.service.checklist(() => this.token());

  /** Nem toda falha é link expirado: sem ramificar, CORS e queda de sinal levavam o
   *  Responsável ao cartão de "link expirado", que é beco sem saída. */
  protected readonly failure = computed(() => {
    const error = this.checklist.error();

    return error === undefined ? null : failureKind(error);
  });
  protected readonly closed = computed(() => this.checklist.value()?.status === 'closed');

  protected readonly progress = computed(() => {
    const items = this.checklist.value()?.items ?? [];
    const delivered = items.filter(
      (item) => item.status !== 'pending' && item.status !== 'rejected',
    );

    return {
      total: items.length,
      delivered: delivered.length,
      percent: items.length ? Math.round((delivered.length / items.length) * 100) : 0,
    };
  });

  protected readonly allSent = computed(() => {
    const items = this.checklist.value()?.items ?? [];

    return (
      items.length > 0 &&
      items.every((item) => item.status !== 'pending' && item.status !== 'rejected')
    );
  });

  protected readonly expanded = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly results = signal<FileResult[] | null>(null);
  protected readonly sendProgress = signal({ done: 0, total: 0 });
  protected readonly sendPercent = computed(() => {
    const { done, total } = this.sendProgress();

    return total ? Math.round((done / total) * 100) : 0;
  });

  protected toggle(itemId: string) {
    this.expanded.update((current) => (current === itemId ? null : itemId));
  }

  protected async pick(event: Event, requestItemId: string | null) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];

    input.value = '';
    if (files.length) await this.send(files, requestItemId);
  }

  /** Alvo do último envio: o retry precisa cair no MESMO item (ou no bloco de extras). */
  protected readonly retryTarget = signal<string | null>(null);

  protected async send(files: File[], requestItemId: string | null) {
    this.retryTarget.set(requestItemId);

    this.sending.set(true);
    this.results.set(null);

    try {
      const results = await uploadFiles(files, {
        presign: (files) => this.service.presign(this.token(), { requestItemId, files }),
        send: (uploadUrl, file) => this.service.putFile(uploadUrl, file),
        confirm: (documentIds) => this.service.confirm(this.token(), documentIds),
        describeError: (error) => apiErrorMessage(error, 'Falha ao enviar o arquivo.'),
        onProgress: (done, total) => this.sendProgress.set({ done, total }),
      });

      this.results.set(results);
      this.checklist.reload();

      if (
        requestItemId &&
        this.expanded() === requestItemId &&
        results.every((result) => result.ok)
      ) {
        this.expanded.set(null);
      }
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível enviar os arquivos.'));
    } finally {
      this.sending.set(false);
    }
  }
}
