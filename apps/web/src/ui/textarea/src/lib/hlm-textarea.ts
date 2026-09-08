import { Directive, computed, inject } from '@angular/core';
import { BrnFieldControl, BrnFieldControlDescribedBy } from '@spartan-ng/brain/field';
import { BrnTextarea } from '@spartan-ng/brain/textarea';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
  selector: '[hlmTextarea]',
  hostDirectives: [
    { directive: BrnTextarea, inputs: ['id', 'forceInvalid'] },
    BrnFieldControlDescribedBy,
  ],
  host: {
    'data-slot': 'textarea',
    '[attr.aria-invalid]': 'ariaInvalid() ? "true" : null',
  },
})

/** `BrnInput` liga `aria-invalid` só a `invalid()`: com validação por schema, todo campo
 *  obrigatório nasce inválido e o leitor de tela anunciava "inválido" antes da primeira
 *  tecla. `touched` é o mesmo critério que o anel vermelho já usa. Host binding daqui
 *  vence o do host directive. */
export class HlmTextarea {
  private readonly field = inject(BrnFieldControl, { optional: true, self: true });

  protected readonly ariaInvalid = computed(
    () => Boolean(this.field?.invalid()) && Boolean(this.field?.touched()),
  );

  constructor() {
    classes(
      () =>
        'border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 data-[matches-spartan-invalid=true]:ring-destructive/20 dark:data-[matches-spartan-invalid=true]:ring-destructive/40 data-[matches-spartan-invalid=true]:border-destructive dark:data-[matches-spartan-invalid=true]:border-destructive/50 rounded-md border bg-transparent px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] focus-visible:ring-3 data-[matches-spartan-invalid=true]:ring-3 md:text-sm placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full outline-none disabled:cursor-not-allowed disabled:opacity-50',
    );
  }
}
