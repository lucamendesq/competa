import { Cnpj } from '@contabilidade/contracts';
import { expect, test } from 'vitest';

/** CNPJ é a chave que amarra a Empresa ao fisco: dígito verificador errado é dado sujo que
 *  só aparece na entrega, meses depois. */

test('aceita CNPJ válido com e sem máscara, guardando só os dígitos', () => {
  expect(Cnpj.parse('11.222.333/0001-81')).toBe('11222333000181');
  expect(Cnpj.parse('11222333000181')).toBe('11222333000181');
});

test('recusa dígito verificador errado', () => {
  const result = Cnpj.safeParse('11222333000144');

  expect(result.success).toBe(false);
  expect(result.error?.issues[0].message).toMatch(/dígitos verificadores/);
});

test('recusa tamanho diferente de 14', () => {
  expect(Cnpj.safeParse('112223330001').success).toBe(false);
  expect(Cnpj.safeParse('112223330001812').success).toBe(false);
});

test('recusa sequência de dígito repetido, que passa no módulo 11', () => {
  for (const cnpj of ['00000000000000', '11111111111111', '99999999999999']) {
    expect(Cnpj.safeParse(cnpj).success, cnpj).toBe(false);
  }
});
