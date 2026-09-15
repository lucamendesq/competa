import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Logo } from '../../shared/logo';

/** Casca comum das páginas legais: conteúdo entra por <ng-content>. */
@Component({
  selector: 'app-legal-page',
  imports: [RouterLink, Logo],
  template: `
    <main class="bg-muted/40 min-h-dvh p-4 sm:p-8">
      <div class="mx-auto flex max-w-2xl flex-col gap-6">
        <a routerLink="/" class="w-fit"><app-logo class="h-8" /></a>

        <article class="bg-card border-border rounded-xl border p-6 sm:p-8">
          <h1 class="text-xl font-semibold tracking-tight">{{ title() }}</h1>
          <p class="text-muted-foreground mt-1 text-xs">Última atualização: {{ updatedAt() }}</p>

          <div class="prose-legal mt-6 flex flex-col gap-4 text-sm leading-relaxed">
            <ng-content />
          </div>
        </article>
      </div>
    </main>
  `,
})
export class LegalPage {
  readonly title = input.required<string>();
  readonly updatedAt = input('11 de setembro de 2026');
}
