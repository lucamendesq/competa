import { Component, input, model, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideSearch } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { CATEGORY_LABEL } from './format';

export type CatalogDocument = {
  id: string;
  name: string;
  category: string;
  acceptedFormats: string[];
};

/** Busca + lista do catálogo de tipos de documento. Existia duplicada no template do
 *  modelo e no checklist da empresa — o mesmo bloco de 25 linhas, com dois ids diferentes
 *  para o mesmo campo de busca. */
@Component({
  selector: 'app-catalog-picker',
  imports: [NgIcon, HlmButtonImports, HlmInputImports],
  providers: [provideIcons({ lucideSearch })],
  template: `
    <div class="relative">
      <label class="sr-only" [for]="searchId()">Buscar documento no catálogo</label>
      <input
        hlmInput
        [id]="searchId()"
        type="search"
        class="pl-9"
        placeholder="Buscar documento"
        [value]="search()"
        (input)="search.set($any($event.target).value)"
      />
      <ng-icon
        name="lucideSearch"
        class="text-muted-foreground pointer-events-none absolute top-3 left-3 text-base md:top-2.5"
        aria-hidden="true"
      />
    </div>

    @if (!documents().length) {
      <p class="text-muted-foreground mt-4 text-sm">{{ emptyLabel() }}</p>
    } @else {
      <ul class="divide-border mt-4 divide-y" role="list">
        @for (document of documents(); track document.id) {
          <li class="flex flex-wrap items-center justify-between gap-3 py-3">
            <div class="min-w-0">
              <p class="text-sm font-medium">{{ document.name }}</p>
              <p class="text-muted-foreground mt-0.5 text-xs">
                {{ CATEGORY_LABEL[document.category] ?? document.category }} ·
                {{ document.acceptedFormats.join(', ') }}
              </p>
            </div>
            <button
              hlmBtn
              variant="outline"
              size="sm"
              [disabled]="acting()"
              (click)="add.emit(document)"
            >
              Adicionar
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class CatalogPicker {
  readonly documents = input.required<readonly CatalogDocument[]>();
  readonly search = model.required<string>();
  readonly searchId = input('search-catalog');
  readonly emptyLabel = input('Nenhum documento do catálogo fora desta lista.');
  readonly acting = input(false);

  readonly add = output<CatalogDocument>();

  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
}
