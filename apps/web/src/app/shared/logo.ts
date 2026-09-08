import { Component, input } from '@angular/core';

/** A marca, com o arquivo certo para o fundo. Os SVGs vivem em `public/brand`; qual usar é
 *  decisão de UMA linha aqui, e não de cada tela:
 *
 *  - `surface="auto"` (padrão): fundo do tema — navy no claro, branco no escuro. A troca é
 *    CSS (`dark:`), não JS, então não pisca no primeiro paint.
 *  - `surface="dark"`: fundo navy fixo (sidebar, header do Responsável, link público), que
 *    não muda com o tema.
 *
 *  Altura vem de fora (`<app-logo class="h-8" />`); a largura acompanha. */
@Component({
  selector: 'app-logo',
  host: { class: 'inline-block' },
  template: `
    @if (surface() === 'dark') {
      <img [src]="file('white')" [alt]="alt()" class="h-full w-auto" />
    } @else {
      <img [src]="file('navy')" [alt]="alt()" class="h-full w-auto dark:hidden" />
      <img [src]="file('white')" [alt]="alt()" class="hidden h-full w-auto dark:block" />
    }
  `,
})
export class Logo {
  readonly variant = input<'icon' | 'horizontal'>('horizontal');
  readonly surface = input<'auto' | 'dark'>('auto');
  /** vazio quando a marca é decorativa (o nome já está escrito ao lado) */
  readonly alt = input('Competa');

  protected file(tone: 'navy' | 'white') {
    return `brand/logo-${this.variant()}-${tone}.svg`;
  }
}
