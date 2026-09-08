import { Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideInbox } from '@ng-icons/lucide';

@Component({
  selector: 'app-empty-state',
  imports: [NgIcon],
  providers: [provideIcons({ lucideInbox })],
  template: `
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span
        class="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full"
      >
        <ng-icon [name]="icon()" class="text-xl" aria-hidden="true" />
      </span>
      <p class="text-foreground text-base font-medium">{{ title() }}</p>
      @if (description()) {
        <p class="text-muted-foreground max-w-md text-sm">{{ description() }}</p>
      }
      <div class="mt-2 flex flex-wrap items-center justify-center gap-2">
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly icon = input('lucideInbox');
}
