import { Directive, computed, inject } from '@angular/core';
import { BrnFieldControl, BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
import { BrnInput } from '@spartan-ng/brain/input';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmInput]',
  hostDirectives: [
    { directive: BrnInput, inputs: ['id', 'forceInvalid'] },
    BrnFieldControlDescribedBy,
  ],
  host: {
    'data-slot': 'input',
    '[attr.aria-invalid]': 'ariaInvalid() ? "true" : null',
  },
})

/** `BrnInput` liga `aria-invalid` só a `invalid()`: com validação por schema, todo campo
 *  obrigatório nasce inválido e o leitor de tela anunciava "inválido" antes da primeira
 *  tecla. `touched` é o mesmo critério que o anel vermelho já usa. Host binding daqui
 *  vence o do host directive. */
export class HlmInput {
  private readonly field = inject(BrnFieldControl, { optional: true, self: true });

  protected readonly ariaInvalid = computed(
    () => Boolean(this.field?.invalid()) && Boolean(this.field?.touched()),
  );

  constructor() {
    classes(
      () =>
        'dark:bg-input/30 border-input focus-visible:border-ring focus-visible:ring-ring/50 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 h-11 md:h-9 rounded-md border bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] file:h-7 file:text-sm file:font-medium focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm file:text-foreground placeholder:text-muted-foreground w-full min-w-0 outline-none file:inline-flex file:border-0 file:bg-transparent disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    );
  }
}
