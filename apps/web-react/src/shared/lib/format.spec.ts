import { describe, expect, it } from 'vitest';
import {
  brl,
  cnpjInputMask,
  dateBr,
  fileSize,
  foldAccents,
  maskedCnpj,
  maskedPhone,
  monthLabel,
  monthShort,
  phoneInputMask,
  slug,
} from '@/shared/lib/format';

describe('maskedCnpj', () => {
  it('formata 14 dígitos', () => {
    expect(maskedCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('devolve o valor original quando não tem 14 dígitos e travessão quando vazio', () => {
    expect(maskedCnpj('123')).toBe('123');
    expect(maskedCnpj(null)).toBe('—');
  });
});

describe('cnpjInputMask', () => {
  it('insere separadores enquanto digita', () => {
    expect(cnpjInputMask('11')).toBe('11');
    expect(cnpjInputMask('11222')).toBe('11.222');
    expect(cnpjInputMask('112223330001')).toBe('11.222.333/0001');
    expect(cnpjInputMask('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('é idempotente e corta em 14 dígitos', () => {
    expect(cnpjInputMask('11.222.333/0001-81')).toBe('11.222.333/0001-81');
    expect(cnpjInputMask('1122233300018199')).toBe('11.222.333/0001-81');
  });
});

describe('phoneInputMask', () => {
  it('formata fixo com 4+4 e celular com 5+4', () => {
    expect(phoneInputMask('11')).toBe('11');
    expect(phoneInputMask('1133334444')).toBe('(11) 3333-4444');
    expect(phoneInputMask('11987654321')).toBe('(11) 98765-4321');
  });

  it('é idempotente', () => {
    expect(phoneInputMask('(11) 98765-4321')).toBe('(11) 98765-4321');
  });
});

describe('maskedPhone', () => {
  it('formata celular e tira o 55 do país', () => {
    expect(maskedPhone('5511987654321')).toBe('(11) 98765-4321');
    expect(maskedPhone(null)).toBe('—');
  });
});

describe('monthLabel e monthShort', () => {
  it('escreve o mês por extenso sem passar por Date', () => {
    expect(monthLabel('2026-07-01')).toBe('Julho/2026');
    expect(monthLabel('2026-12')).toBe('Dezembro/2026');
    expect(monthLabel(null)).toBe('—');
    expect(monthShort('2026-07-01')).toBe('07/2026');
  });
});

describe('brl', () => {
  it('formata em reais', () => {
    expect(brl(119)).toBe('R$ 119,00');
    expect(brl(1234.5)).toBe('R$ 1.234,50');
  });
});

describe('demais formatadores', () => {
  it('formata data, tamanho de arquivo, acentos e slug', () => {
    expect(dateBr('2026-11-12T10:00:00.000Z')).toBe('12/11/2026');
    expect(fileSize(193)).toBe('193 B');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(foldAccents('Ação Contábil')).toBe('acao contabil');
    expect(slug('Mercado Bom Preço')).toBe('mercado-bom-preco');
  });
});
