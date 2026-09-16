import * as z from 'zod';

if (z.locales?.pt) {
  z.config(z.locales.pt());
}

/** Um input de texto não produz `undefined`: vazio chega como `''`. Sem tratar isso, um
 *  campo opcional em branco reprova o schema e o `submit()` do formulário não faz nada —
 *  botão morto, sem erro visível. Mesmo tratamento do `blankAsMissing` do `config/env.ts`. */
export const optionalText = (max = 200) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );
