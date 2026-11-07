import * as z from 'zod';

if (z.locales?.pt) {
  z.config(z.locales.pt());
}

/** O locale `pt` do zod traduz, mas fala como compilador ("esperado int, recebido número").
 *  Os casos que chegam à tela sem mensagem própria no schema ganham a voz do produto; o
 *  resto cai no locale. */
const productVoice: z.core.$ZodErrorMap = (issue) => {
  if (issue.code === 'invalid_type') {
    if (issue.input === undefined || issue.input === null || issue.input === '') {
      return 'Preencha este campo.';
    }
    if (issue.expected === 'int') return 'Informe um número inteiro.';
    if (issue.expected === 'number') return 'Informe um número.';
  }
  if (issue.code === 'too_small' && issue.origin === 'number') {
    return `Informe um número a partir de ${issue.minimum}.`;
  }
  if (issue.code === 'too_big' && issue.origin === 'number') {
    return `Informe um número até ${issue.maximum}.`;
  }
  if (issue.code === 'too_small' && issue.origin === 'string') {
    return issue.minimum === 1
      ? 'Preencha este campo.'
      : `Use pelo menos ${issue.minimum} caracteres.`;
  }
  if (issue.code === 'too_big' && issue.origin === 'string') {
    return `Use no máximo ${issue.maximum} caracteres.`;
  }
  return undefined;
};

z.config({ customError: productVoice });

export const intBetween = (min: number, max: number) => {
  const message = `Informe um número inteiro de ${min} a ${max}.`;
  return z.int({ error: message }).min(min, message).max(max, message);
};

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
 *  form deixa o zod ser a única autoridade sem rejeitar endereço válido.
 *
 *  Minúsculo na entrada: o e-mail é chave de busca ("Perdi meu link") e de identidade (trocar
 *  o e-mail do Responsável é trocar a pessoa), e `Ana@x.com` ≠ `ana@x.com` quebrava as duas. */
export const email = (message = 'E-mail inválido.') =>
  z.string().trim().toLowerCase().regex(z.regexes.html5Email, message);

/** Senha de conta nova. O teto é o `maxPasswordLength` padrão do Better Auth: acima dele a
 *  recusa vinha de lá, depois de o resto do cadastro já ter rodado. */
export const newPassword = (minMessage: string) =>
  z.string().min(8, minMessage).max(128, 'A senha pode ter no máximo 128 caracteres.');

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

/** Um PATCH tem de mudar alguma coisa. Sem isto, um corpo todo-opcional aceita `{}`, chega
 *  ao drizzle sem campo nenhum e estoura `No values to set` — 500 para o que é erro do
 *  cliente. Aplicado DEPOIS do `.partial()`. */
export const nonEmptyPatch = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((value) => Object.keys(value as object).length > 0, {
    message: 'Informe ao menos um campo para alterar.',
  });
