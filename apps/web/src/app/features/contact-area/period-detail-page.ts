import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCircleCheck,
  lucideFile,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { DropZone } from '../../shared/drop-zone';
import { UploadFeedback } from '../../shared/upload-feedback';
import { StatusPill } from '../../shared/status-pill';
import { ResendNotice } from '../../shared/resend-notice';
import { DueDate } from '../../shared/due-date';
import { displayItemStatus, itemRejections, needsResend } from '../../shared/item-status';
import { isOverdue, monthLabel, dateBr, dateTimeBr, fileSize } from '../../shared/format';
import { FileResult, uploadFiles } from '../../shared/upload';
import { ContactAreaService } from './contact-area.service';

@Component({
  selector: 'app-period-detail-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    DropZone,
    UploadFeedback,
    ErrorState,
    LoadingRows,
    StatusPill,
    DueDate,
    ResendNotice,
  ],
  providers: [
    provideIcons({ lucideArrowLeft, lucideCircleCheck, lucideFile, lucideUpload, lucideX }),
  ],
  templateUrl: './period-detail-page.html',
})
export class PeriodDetailPage {
  readonly periodId = input.required<string>();

  private readonly service = inject(ContactAreaService);
  private readonly toaster = inject(Toaster);

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;
  protected readonly dateTimeBr = dateTimeBr;
  protected readonly fileSize = fileSize;
  protected readonly isOverdue = isOverdue;
  protected readonly displayItemStatus = displayItemStatus;
  protected readonly needsResend = needsResend;
  protected readonly itemRejections = itemRejections;

  protected readonly detail = this.service.monthLabel(() => this.periodId());

  protected readonly closed = computed(() => this.detail.value()?.requestStatus === 'closed');

  protected readonly expanded = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly results = signal<FileResult[] | null>(null);
  protected readonly sendProgress = signal({ done: 0, total: 0 });

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

    const data = this.detail.value();
    if (!data) return;

    this.sending.set(true);
    this.results.set(null);

    try {
      this.results.set(
        await uploadFiles(files, {
          presign: (files) =>
            this.service.presign({ requestId: data.requestId, requestItemId, files }),
          send: (uploadUrl, file) => this.service.putFile(uploadUrl, file),
          confirm: (documentIds) => this.service.confirm(data.requestId, documentIds),
          describeError: (error) => apiErrorMessage(error, 'Falha ao enviar o arquivo.'),
          onProgress: (done, total) => this.sendProgress.set({ done, total }),
        }),
      );

      this.detail.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível enviar os arquivos.'));
    } finally {
      this.sending.set(false);
    }
  }
}
