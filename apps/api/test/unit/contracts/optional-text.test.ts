import { expect, test } from 'vitest';
import {
  AcceptContactInviteBody,
  ActivateContactAccessBody,
  optionalText,
} from '@contabilidade/contracts';

/** Campo opcional de texto vindo de formulário: o input entrega `''`, nunca `undefined`.
 *  Com `min(1).optional()` puro, o formulário em branco reprovava o schema e o `submit()`
 *  do Angular não chamava a ação — o botão "Ativar acesso" não fazia nada, sem erro na
 *  tela. O mesmo schema valida o pipe do Nest, então a rota também recusava `{ name: '' }`. */

/** `rest` são os campos obrigatórios de cada corpo: o convite pede senha (é de uso único),
 *  a ativação pelo Link de Upload não pede nada. */
const bodies = [
  ['AcceptContactInviteBody', AcceptContactInviteBody, { password: 'senha-forte-123' }],
  ['ActivateContactAccessBody', ActivateContactAccessBody, {}],
] as const;

test.each(bodies)('%s aceita nome em branco e trata como ausente', (_label, schema, rest) => {
  expect(schema.parse({ ...rest, name: '' }).name).toBeUndefined();
  expect(schema.parse({ ...rest, name: '   ' }).name).toBeUndefined();
  expect(schema.parse({ ...rest }).name).toBeUndefined();
});

test.each(bodies)(
  '%s preserva o nome preenchido, sem espaço nas pontas',
  (_label, schema, rest) => {
    expect(schema.parse({ ...rest, name: '  Ana Lima  ' }).name).toBe('Ana Lima');
  },
);

/** O convite exige senha; o Link de Upload é um toque e não aceita nem pede senha. */
test('só o convite cobra senha', () => {
  expect(AcceptContactInviteBody.safeParse({}).success).toBe(false);
  expect(AcceptContactInviteBody.safeParse({ password: 'curta' }).success).toBe(false);
  expect(ActivateContactAccessBody.safeParse({}).success).toBe(true);
});

test('optionalText recusa o que não é texto e respeita o limite', () => {
  expect(() => optionalText().parse({ name: 1 })).toThrow();
  expect(optionalText(3).safeParse('abcd').success).toBe(false);
  expect(optionalText(3).safeParse('abc').success).toBe(true);
});
