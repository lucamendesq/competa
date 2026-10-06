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

/** Mesma régua do `input[type=email]` do navegador (WHATWG). O validador padrão do zod é
 *  mais estrito e reprova endereços que o browser aceita — `=` no local part, por exemplo
 *  —, e o formulário então não enviava nada. Com as duas réguas iguais, `novalidate` no
 *  form deixa o zod ser a única autoridade sem rejeitar endereço válido. */
export const email = (message = 'E-mail inválido.') =>
  z.string().trim().regex(z.regexes.html5Email, message);

/* Nome que vai parar em assunto/corpo de email, em nome de arquivo dentro do zip e em
 * tela: quebra de linha é injeção de cabeçalho (OPS/SEC), caractere de controle corrompe
 * o nome no storage, e `<`, `>` e `"` só aparecem em tentativa de marcação. É bloqueio,
 * não allowlist: razão social brasileira usa `&`, `.`, `-`, `/`, `'` e acentos à vontade,
 * e uma allowlist reprovaria cadastro legítimo. */
const CONTROL_OR_MARKUP = /[\r\n<>"\u0000-\u001f]/;

export const NAME_CHARSET_MESSAGE =
  'Nome não pode conter quebras de linha, caracteres de controle ou os símbolos <, > e ".';

export const plainName = (max: number, requiredMessage: string, maxMessage: string) =>
  z
    .string()
    .trim()
    .min(1, requiredMessage)
    .max(max, maxMessage)
    .refine((value) => !CONTROL_OR_MARKUP.test(value), { message: NAME_CHARSET_MESSAGE });
