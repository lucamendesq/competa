import { describe, expect, it } from 'vitest';
import {
  closeImpact,
  deliveryProgress,
  statusCounts,
  toLines,
  visibleLines,
} from '@/features/periods/components/panel-lines';
import { panelRow } from '@/testing/factories/panel-row';

const rows = [
  panelRow({
    companyName: 'Ação Contábil',
    counts: { pending: 0, submitted: 1, accepted: 3, rejected: 0 },
    missing: [{ id: 'a', name: 'X', status: 'submitted', dueDate: null, resent: true }],
  }),
  panelRow({
    companyName: 'Zeta',
    requestStatus: 'closed',
    counts: { pending: 0, submitted: 0, accepted: 2, rejected: 0 },
    missing: [],
  }),
];

describe('panel-lines', () => {
  it('separa a enviar de a conferir e calcula o percentual', () => {
    const [first] = toLines(rows, new Map());

    expect(first?.awaiting).toHaveLength(0);
    expect(first?.toReview).toHaveLength(1);
    expect(first?.percent).toBe(75);
  });

  it('busca ignora acentos e combina com o status', () => {
    const lines = toLines(rows, new Map());

    expect(visibleLines(lines, { search: 'acao', status: 'all', accountant: 'all' })).toHaveLength(
      1,
    );
    expect(visibleLines(lines, { search: '', status: 'closed', accountant: 'all' })).toHaveLength(
      1,
    );
    expect(statusCounts(lines)).toMatchObject({ all: 2, pending: 1, complete: 1, closed: 1 });
  });

  it('progresso e impacto de encerrar contam só o que importa', () => {
    const lines = toLines(rows, new Map());

    expect(deliveryProgress(lines)).toEqual({ total: 6, accepted: 5, percent: 83 });
    expect(closeImpact(lines)).toEqual({ unaccepted: 1, companies: 1, toReview: 1 });
  });
});
