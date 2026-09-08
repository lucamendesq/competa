import { describe, expect, it } from 'vitest';
import {
  isOverdue,
  maskedCnpj,
  monthLabel,
  defaultReferenceMonth,
  dateBr,
  slug,
  fileSize,
  maskedPhone,
} from './format';

describe('competencia', () => {
  it('mostra o mês em português a partir do primeiro dia', () => {
    expect(monthLabel('2026-07-01')).toBe('Julho/2026');
    expect(monthLabel('2026-12-01')).toBe('Dezembro/2026');
  });

  /** Sem `Date`: com fuso negativo, `new Date('2026-01-01')` volta para dezembro. */
  it('não escorrega de mês por fuso', () => {
    expect(monthLabel('2026-01-01')).toBe('Janeiro/2026');
  });

  it('lida com ausência', () => {
    expect(monthLabel(null)).toBe('—');
  });
});

describe('dataBr', () => {
  it('formata DD/MM/AAAA', () => {
    expect(dateBr('2026-08-10')).toBe('10/08/2026');
  });

  it('aceita timestamp e usa só a data', () => {
    expect(dateBr('2026-08-10T23:30:00.000Z')).toBe('10/08/2026');
  });

  it('lida com ausência', () => {
    expect(dateBr(null)).toBe('—');
  });
});

describe('atrasado', () => {
  const today = new Date();
  const iso = (dayOffset: number) => {
    const data = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
    return `${data.getFullYear()}-${`${data.getMonth() + 1}`.padStart(2, '0')}-${`${data.getDate()}`.padStart(2, '0')}`;
  };

  it('ontem está atrasado', () => {
    expect(isOverdue(iso(-1))).toBe(true);
  });

  it('hoje ainda não está atrasado', () => {
    expect(isOverdue(iso(0))).toBe(false);
  });

  it('amanhã não está atrasado', () => {
    expect(isOverdue(iso(1))).toBe(false);
  });

  it('sem prazo nunca está atrasado', () => {
    expect(isOverdue(null)).toBe(false);
  });
});

describe('competenciaPadrao', () => {
  it('sugere o mês anterior no formato do input de mês', () => {
    expect(defaultReferenceMonth()).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);

    const now = new Date();
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const expected = `${previous.getFullYear()}-${`${previous.getMonth() + 1}`.padStart(2, '0')}`;

    expect(defaultReferenceMonth()).toBe(expected);
  });
});

describe('cnpjMascarado', () => {
  it('aplica a máscara', () => {
    expect(maskedCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('devolve como veio quando não tem 14 dígitos', () => {
    expect(maskedCnpj('123')).toBe('123');
  });
});

describe('telefoneMascarado', () => {
  it('formata celular com nove dígitos e ignora o +55', () => {
    expect(maskedPhone('5511988887777')).toBe('(11) 98888-7777');
  });

  it('formata fixo de oito dígitos', () => {
    expect(maskedPhone('1133334444')).toBe('(11) 3333-4444');
  });
});

describe('tamanhoArquivo', () => {
  it('usa a unidade que o Responsável entende', () => {
    expect(fileSize(500)).toBe('500 B');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(fileSize(120 * 1024 * 1024)).toBe('120 MB');
  });
});

describe('slug', () => {
  it('tira acento em vez de trocar por hífen', () => {
    expect(slug('Padaria Pão Quente Ltda')).toBe('padaria-pao-quente-ltda');
    expect(slug('Consultoria & Cia.')).toBe('consultoria-cia');
  });
});
