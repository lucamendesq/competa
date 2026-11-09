import { describe, expect, it } from 'vitest';
import { messageQueryOf, withFilter } from '@/features/messages/components/message-query';

describe('messageQueryOf', () => {
  it('lê os filtros da URL com o schema do contrato', () => {
    expect(
      messageQueryOf(new URLSearchParams('canal=whatsapp&tipo=reminder&status=failed&page=2')),
    ).toEqual({ page: 2, perPage: 20, channel: 'whatsapp', purpose: 'reminder', status: 'failed' });
  });

  it('valores inválidos caem no padrão sem quebrar', () => {
    expect(
      messageQueryOf(new URLSearchParams('page=abc&canal=fax&empresa=nao-e-uuid&tipo=')),
    ).toEqual({ page: 1, perPage: 20 });
  });
});

describe('withFilter', () => {
  it('trocar o tipo mantém os outros filtros e volta para a página 1 na mesma escrita', () => {
    const next = withFilter(new URLSearchParams('canal=whatsapp&page=3'), 'purpose', 'reminder');

    expect(Object.fromEntries(next)).toEqual({ canal: 'whatsapp', page: '1', tipo: 'reminder' });
  });

  it('limpar um filtro tira o parâmetro', () => {
    const next = withFilter(new URLSearchParams('canal=whatsapp&page=2'), 'channel', '');

    expect(Object.fromEntries(next)).toEqual({ page: '1' });
  });
});
