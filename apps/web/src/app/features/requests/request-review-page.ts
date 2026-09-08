import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DomSanitizer, type SafeResourceUrl, type SafeUrl } from '@angular/platform-browser';
import { FormField, form, minLength, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowLeft,
  lucideCheck,
  lucideCheckCheck,
  lucideDownload,
  lucideEye,
  lucideFile,
  lucideFileArchive,
  lucideLock,
  lucideRotateCcw,
  lucideSend,
  lucideTriangleAlert,
  lucideX,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTextarea } from '@spartan-ng/helm/textarea';
import { Api } from '../../core/http/api';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { StatusPill } from '../../shared/status-pill';
import { DueDate } from '../../shared/due-date';
import {
  displayItemStatus,
  itemRejections,
  needsResend,
  wasResent,
} from '../../shared/item-status';
import { isOverdue, monthLabel, dateBr, dateTimeBr, slug, fileSize } from '../../shared/format';
import { RequestDocument, RequestsService } from './requests.service';

@Component({
  selector: 'app-request-review-page',
  imports: [
    RouterLink,
    FormField,
    NgIcon,
    HlmButtonImports,
    HlmLabel,
    HlmTextarea,
    PageHeader,
    ErrorState,
    LoadingRows,
    Modal,
    StatusPill,
    DueDate,
  ],
  providers: [
    provideIcons({
      lucideArrowLeft,
      lucideCheck,
      lucideCheckCheck,
      lucideDownload,
      lucideEye,
      lucideFile,
      lucideFileArchive,
      lucideLock,
      lucideRotateCcw,
      lucideSend,
      lucideTriangleAlert,
      lucideX,
    }),
  ],
  templateUrl: './request-review-page.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class RequestReviewPage {
  readonly requestId = input.required<string>();

  private readonly service = inject(RequestsService);
  private readonly api = inject(Api);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly toaster = inject(Toaster);

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;
  protected readonly dateTimeBr = dateTimeBr;
  protected readonly fileSize = fileSize;
  protected readonly isOverdue = isOverdue;
  protected readonly displayItemStatus = displayItemStatus;
  protected readonly wasResent = wasResent;
  protected readonly needsResend = needsResend;
  protected readonly itemRejections = itemRejections;

  protected readonly request = this.service.request(() => this.requestId());

  protected readonly selectedItemId = linkedSignal<string | undefined>(
    () => this.request.value()?.items[0]?.id,
  );

  protected readonly selectedItem = computed(() =>
    this.request.value()?.items.find((item) => item.id === this.selectedItemId()),
  );

  protected readonly closed = computed(() => this.request.value()?.status === 'closed');

  protected readonly pendingCount = computed(
    () => this.request.value()?.items.filter((item) => item.status !== 'accepted').length ?? 0,
  );

  protected readonly acting = signal(false);

  protected readonly rejectingDocument = signal<RequestDocument | null>(null);
  protected readonly reason = signal({ rejectionReason: '' });
  protected readonly rejectionForm = form(this.reason, (path) => {
    required(path.rejectionReason, { message: 'Informe o motivo da rejeição.' });
    minLength(path.rejectionReason, 3, { message: 'Descreva o motivo com mais detalhe.' });
  });

  protected readonly confirmClose = signal(false);

  /* --- Saída com rascunho pendente ------------------------------------------------------
   * O guard da rota (requests.routes.ts) chama `confirmLeave()`; a promessa fica pendurada
   * até o Contador responder no modal. `beforeunload` cobre fechar a aba, onde só o
   * diálogo nativo do navegador é permitido. */
  private readonly leaveDecision = signal<((leave: boolean) => void) | null>(null);
  protected readonly confirmingLeave = computed(() => this.leaveDecision() !== null);

  confirmLeave(): boolean | Promise<boolean> {
    if (!this.stagedCount()) return true;

    return new Promise<boolean>((resolve) => this.leaveDecision.set(resolve));
  }

  protected resolveLeave(leave: boolean) {
    const decide = this.leaveDecision();
    this.leaveDecision.set(null);
    decide?.(leave);
  }

  protected onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.stagedCount()) event.preventDefault();
  }

  protected select(itemId: string) {
    this.selectedItemId.set(itemId);
  }

  /* --- Rascunho da revisão -------------------------------------------------------------
   * O Contador marca aceites e rejeições e publica de uma vez: cinco rejeições mandavam
   * cinco emails ao Responsável. O rascunho vive só nesta tela (nada é gravado antes de
   * publicar) — sair da tela descarta, e a barra fixa deixa isso visível.
   * ponytail: rascunho em memória; persistir só se alguém reclamar de perder marcação. */
  protected readonly stagedAccepts = signal<ReadonlySet<string>>(new Set());
  protected readonly stagedRejections = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly extras = signal<
    ReadonlyMap<string, { decision: 'accepted' | 'rejected'; rejectionReason?: string }>
  >(new Map());

  protected readonly stagedCount = computed(
    () => this.stagedAccepts().size + this.stagedRejections().size + this.extras().size,
  );

  /** Se o publicar vai disparar email: é o que o Contador precisa saber antes de clicar.
   *  A regra é a do backend — rejeição manda o email do lote, e aceitar o último item
   *  pendente manda o de sucesso. */
  protected readonly willSendEmail = computed(() => {
    const hasRejection =
      this.stagedRejections().size > 0 ||
      [...this.extras().values()].some((extra) => extra.decision === 'rejected');
    if (hasRejection) return true;

    const itens = this.request.value()?.items ?? [];

    return (
      this.stagedAccepts().size > 0 &&
      itens.length > 0 &&
      itens.every((item) => item.status === 'accepted' || this.stagedAccepts().has(item.id))
    );
  });

  protected readonly acceptableItems = computed(
    () => this.request.value()?.items.filter((item) => item.status === 'submitted') ?? [],
  );

  protected isAcceptStaged(itemId: string) {
    return this.stagedAccepts().has(itemId);
  }

  protected stagedRejectionReason(documentId: string) {
    return (
      this.stagedRejections().get(documentId) ?? this.extras().get(documentId)?.rejectionReason
    );
  }

  protected stagedExtraDecision(documentId: string) {
    return this.extras().get(documentId)?.decision;
  }

  protected toggleAccept(itemId: string) {
    this.stagedAccepts.update((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);

      return next;
    });

    if (!this.stagedAccepts().has(itemId)) return;

    // aceitar o Item aceita os arquivos dele: rejeição marcada no mesmo Item se contradiz
    const documents = this.request
      .value()
      ?.items.find((item) => item.id === itemId)
      ?.documents.map((document) => document.id);

    this.stagedRejections.update((current) => {
      const next = new Map(current);
      for (const id of documents ?? []) next.delete(id);

      return next;
    });
  }

  protected stageAllAccepts() {
    this.stagedAccepts.update((current) => {
      const next = new Set(current);
      for (const item of this.acceptableItems()) next.add(item.id);

      return next;
    });
  }

  protected unstageDocument(documentId: string) {
    this.stagedRejections.update((current) => {
      const next = new Map(current);
      next.delete(documentId);

      return next;
    });
    this.extras.update((current) => {
      const next = new Map(current);
      next.delete(documentId);

      return next;
    });
  }

  protected discardDraft() {
    this.stagedAccepts.set(new Set());
    this.stagedRejections.set(new Map());
    this.extras.set(new Map());
  }

  protected stageExtraAccept(documentId: string) {
    this.extras.update((current) => new Map(current).set(documentId, { decision: 'accepted' }));
  }

  protected async publishReview() {
    if (!this.stagedCount()) return;

    this.acting.set(true);

    try {
      const result = await this.service.publishReview(this.requestId(), {
        acceptItemIds: [...this.stagedAccepts()],
        rejectDocuments: [...this.stagedRejections()].map(([documentId, rejectionReason]) => ({
          documentId,
          rejectionReason,
        })),
        reviewExtras: [...this.extras()].map(([documentId, decision]) => ({
          documentId,
          ...decision,
        })),
      });

      this.discardDraft();
      this.toaster.success(
        result.emailSent
          ? 'Revisão publicada. O Responsável recebeu um email com o resultado.'
          : 'Revisão publicada.',
      );
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível publicar a revisão.'));
    } finally {
      this.acting.set(false);
      this.request.reload();
    }
  }

  /* --- Preview -------------------------------------------------------------------------
   * Aceitar sem ver o arquivo era o normal desta tela: o único caminho até o conteúdo era
   * o zip da empresa inteira. */
  /** O objectUrl passa pelo sanitizer: `blob:` não está na lista segura do Angular, e sem
   *  isso o `<iframe>`/`<img>` recebe "unsafe:blob:…" e não mostra nada. A origem é a
   *  nossa própria API (blob baixado com a sessão), não entrada de usuário. */
  protected readonly preview = signal<{
    document: RequestDocument;
    objectUrl: string;
    frameUrl: SafeResourceUrl;
    imageUrl: SafeUrl;
    type: string;
  } | null>(null);
  protected readonly openingPreview = signal<string | null>(null);

  protected async openPreview(document: RequestDocument) {
    this.closePreview();
    this.openingPreview.set(document.id);

    try {
      const { objectUrl, type } = await this.api.blobUrl(`/documents/${document.id}/content`);

      this.preview.set({
        document,
        objectUrl,
        frameUrl: this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl),
        imageUrl: this.sanitizer.bypassSecurityTrustUrl(objectUrl),
        type,
      });
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível abrir o arquivo.'));
    } finally {
      this.openingPreview.set(null);
    }
  }

  /** `revokeObjectURL` sempre: sem isso cada arquivo aberto fica na memória da aba até o
   *  reload da página. */
  protected closePreview() {
    const current = this.preview();
    if (!current) return;

    URL.revokeObjectURL(current.objectUrl);
    this.preview.set(null);
  }

  protected readonly previewKind = computed(() => {
    const type = this.preview()?.type ?? '';

    if (type.startsWith('image/')) return 'imagem';
    if (type === 'application/pdf') return 'pdf';

    return 'outro';
  });

  protected async downloadDocument(document: RequestDocument) {
    try {
      await this.api.download(`/documents/${document.id}/content`, document.fileName);
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível baixar o arquivo.'));
    }
  }

  protected async undoAccept(itemId: string) {
    this.acting.set(true);

    try {
      await this.service.undoAccept(itemId);
      this.toaster.success('Aceite desfeito.');
      this.request.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível desfazer o aceite.'));
    } finally {
      this.acting.set(false);
    }
  }

  protected openRejection(document: RequestDocument) {
    this.reason.set({ rejectionReason: '' });
    this.rejectingDocument.set(document);
  }

  /** Rejeitar aqui só MARCA: o email (e a rotação do link) acontecem no publicar. */
  protected reject() {
    const document = this.rejectingDocument();
    if (!document) return;

    return submit(this.rejectionForm, async (formTree) => {
      const rejectionReason = formTree().value().rejectionReason;

      if (document.requestItemId) {
        this.stagedRejections.update((current) =>
          new Map(current).set(document.id, rejectionReason),
        );
        this.stagedAccepts.update((current) => {
          const next = new Set(current);
          next.delete(document.requestItemId!);

          return next;
        });
      } else {
        this.extras.update((current) =>
          new Map(current).set(document.id, { decision: 'rejected', rejectionReason }),
        );
      }

      this.rejectingDocument.set(null);

      return undefined;
    });
  }

  protected async closeRequest() {
    this.acting.set(true);

    try {
      const closed = await this.service.closeRequest(this.requestId());
      this.toaster.success(closed.warning ?? 'Solicitação encerrada.');
      this.request.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível encerrar a solicitação.'));
    } finally {
      this.acting.set(false);
      this.confirmClose.set(false);
    }
  }

  protected async downloadZip() {
    const data = this.request.value();
    if (!data) return;

    try {
      await this.api.download(
        `/requests/${data.id}/zip`,
        `${slug(data.companyName)}-${data.referenceMonth.slice(0, 7)}.zip`,
      );
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
    }
  }
}
