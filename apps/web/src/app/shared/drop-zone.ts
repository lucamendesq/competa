import { Directive, input, output, signal } from '@angular/core';

/** Arrastar-e-soltar nas áreas de envio. O `<label>` com input file não recebe arquivo
 *  solto por conta própria: sem `preventDefault` no dragover o navegador abre o PDF numa
 *  aba e o envio se perde. Mesma diretiva nas três telas de envio (link público, pendências
 *  e detalhe da competência) — o roteiro de upload já é o mesmo (ver shared/upload.ts). */
@Directive({
  selector: '[appDropZone]',
  host: {
    '[class.border-primary]': 'over()',
    '[class.bg-muted]': 'over()',
    '(dragenter)': 'enter($event)',
    '(dragover)': 'enter($event)',
    '(dragleave)': 'over.set(false)',
    '(drop)': 'drop($event)',
  },
})
export class DropZone {
  readonly dropDisabled = input(false);
  readonly dropped = output<File[]>();

  readonly over = signal(false);

  enter(event: DragEvent) {
    event.preventDefault();
    if (!this.dropDisabled()) this.over.set(true);
  }

  drop(event: DragEvent) {
    event.preventDefault();
    this.over.set(false);
    if (this.dropDisabled()) return;

    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) this.dropped.emit(files);
  }
}
