import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { accessWindowOf, longDate } from '@/features/billing/components/plan-status';

const now = new Date('2026-11-14T12:00:00.000Z');

beforeAll(() => {
  vi.stubEnv('TZ', 'America/Sao_Paulo');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('longDate', () => {
  it('sem fuso informado usa o fuso do navegador', () => {
    expect(longDate('2026-12-16T00:00:00.000Z')).toBe('15 de dezembro de 2026');
  });

  it('em UTC mostra o dia de calendário gravado', () => {
    expect(longDate('2026-12-16T00:00:00.000Z', 'UTC')).toBe('16 de dezembro de 2026');
  });

  it('sem data devolve null', () => {
    expect(longDate(null)).toBeNull();
  });
});

describe('accessWindowOf', () => {
  it('ACTIVE mostra até quando o período está pago, no dia gravado em UTC', () => {
    expect(accessWindowOf('ACTIVE', '2026-12-16T00:00:00.000Z', now)).toEqual({
      label: 'Período pago até',
      value: '16 de dezembro de 2026',
    });
  });

  it('CANCELED com período futuro mostra "Acesso até"', () => {
    expect(accessWindowOf('CANCELED', '2026-12-16T00:00:00.000Z', now)).toEqual({
      label: 'Acesso até',
      value: '16 de dezembro de 2026',
    });
  });

  it('CANCELED com período vencido diz que o acesso encerrou', () => {
    expect(accessWindowOf('CANCELED', '2026-11-01T00:00:00.000Z', now)).toEqual({
      label: 'Acesso',
      value: 'Encerrado em 01 de novembro de 2026',
    });
  });

  it('OVERDUE com período vencido diz que o acesso encerrou', () => {
    expect(accessWindowOf('OVERDUE', '2026-11-01T00:00:00.000Z', now)).toEqual({
      label: 'Acesso',
      value: 'Encerrado em 01 de novembro de 2026',
    });
  });

  it('CANCELED ou OVERDUE sem fim de período diz só que encerrou', () => {
    expect(accessWindowOf('CANCELED', null, now)).toEqual({ label: 'Acesso', value: 'Encerrado' });
    expect(accessWindowOf('OVERDUE', null, now)).toEqual({ label: 'Acesso', value: 'Encerrado' });
  });

  it('OVERDUE com período futuro e trial não mostram janela de acesso', () => {
    expect(accessWindowOf('OVERDUE', '2026-12-16T00:00:00.000Z', now)).toBeNull();
    expect(accessWindowOf('trialing', null, now)).toBeNull();
  });
});
