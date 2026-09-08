import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucideCamera,
  lucideFingerprint,
  lucideCircleCheck,
  lucidePartyPopper,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { DropZone } from '../../shared/drop-zone';
import { UploadFeedback } from '../../shared/upload-feedback';
import { StatusPill } from '../../shared/status-pill';
import { ResendNotice } from '../../shared/resend-notice';
import { DueDate } from '../../shared/due-date';
import { displayItemStatus, itemRejections, needsResend } from '../../shared/item-status';
import { isOverdue, monthLabel, dateBr } from '../../shared/format';
import { FileResult, uploadFiles } from '../../shared/upload';
import { PasskeyService } from './passkey.service';
import { PushService } from '../../shared/push.service';
import { ContactAreaService } from './contact-area.service';

@Component({
  selector: 'app-pending-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    DropZone,
    UploadFeedback,
    EmptyState,
    ErrorState,
    LoadingRows,
    StatusPill,
    DueDate,
    ResendNotice,
  ],
  providers: [
    provideIcons({
      lucideBell,
      lucideCamera,
      lucideFingerprint,
      lucideCircleCheck,
      lucidePartyPopper,
      lucideUpload,
      lucideX,
    }),
  ],
  templateUrl: './pending-page.html',
})
export class PendingPage {
  private readonly service = inject(ContactAreaService);
  protected readonly push = inject(PushService);

  protected subscribeToPush() {
    return this.push.subscribe((payload) => this.service.subscribePush(payload));
  }
  protected readonly passkey = inject(PasskeyService);
  private readonly toaster = inject(Toaster);

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;
  protected readonly isOverdue = isOverdue;
  protected readonly displayItemStatus = displayItemStatus;
  protected readonly needsResend = needsResend;
  protected readonly itemRejections = itemRejections;

  protected readonly pending = this.service.pending();

  protected readonly byPeriod = computed(() => {
    const pendingCount = this.pending.value() ?? [];
    const groups = new Map<
      string,
      { referenceMonth: string; periodId: string; items: typeof pendingCount }
    >();

    for (const row of pendingCount) {
      const group = groups.get(row.periodId) ?? {
        referenceMonth: row.referenceMonth,
        periodId: row.periodId,
        items: [],
      };

      group.items = [...group.items, row];
      groups.set(row.periodId, group);
    }

    return [...groups.values()].sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));
  });

  protected readonly expanded = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly results = signal<FileResult[] | null>(null);
  protected readonly sendProgress = signal({ done: 0, total: 0 });

  protected toggle(itemId: string) {
    this.expanded.update((current) => (current === itemId ? null : itemId));
  }

  protected async pick(event: Event, requestId: string, requestItemId: string) {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];

    input.value = '';
    if (files.length) await this.send(files, requestId, requestItemId);
  }

  /** Alvo do último envio: o retry precisa cair no MESMO item. */
  private readonly retryTarget = signal<{ requestId: string; requestItemId: string } | null>(null);

  protected retrySend(files: File[]) {
    const target = this.retryTarget();

    return target ? this.send(files, target.requestId, target.requestItemId) : undefined;
  }

  protected async send(files: File[], requestId: string, requestItemId: string) {
    this.retryTarget.set({ requestId, requestItemId });

    this.sending.set(true);
    this.results.set(null);

    try {
      this.results.set(
        await uploadFiles(files, {
          presign: (files) => this.service.presign({ requestId, requestItemId, files }),
          send: (uploadUrl, file) => this.service.putFile(uploadUrl, file),
          confirm: (documentIds) => this.service.confirm(requestId, documentIds),
          describeError: (error) => apiErrorMessage(error, 'Falha ao enviar o arquivo.'),
          onProgress: (done, total) => this.sendProgress.set({ done, total }),
        }),
      );

      this.pending.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível enviar os arquivos.'));
    } finally {
      this.sending.set(false);
    }
  }
}
