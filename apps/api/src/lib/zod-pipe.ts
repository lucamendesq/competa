import * as z from 'zod';
import { ValidationError } from './app-error.js';

if (z.locales?.pt) {
  z.config(z.locales.pt());
}

export const zodParse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);

  if (!result.success) {
    /* `issues` e não `flattenError`: o cliente precisa do `path` para colar a mensagem
     * no campo do formulário — o formato achatado perde o caminho aninhado e a tela só
     * conseguia mostrar o banner genérico. */
    throw new ValidationError('Dados inválidos.', result.error.issues);
  }

  return result.data;
};
