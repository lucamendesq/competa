import { symbols } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger, requestLogger } from '../../src/lib/logger.js';

const captureLines = () => {
  const stream = (
    requestLogger().logger as unknown as Record<symbol, { write: (line: string) => void }>
  )[symbols.streamSym];
  const lines: string[] = [];
  vi.spyOn(stream, 'write').mockImplementation((line: string) => void lines.push(line));
  return lines;
};

describe('Logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('leva os argumentos extras para a linha em details', () => {
    const lines = captureLines();

    new Logger('X').error('falhou', { errors: [{ code: 'invalid' }] });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ context: 'X', msg: 'falhou' });
    expect(lines[0]).toContain('invalid');
  });

  it('serializa um Error com message e stack', () => {
    const lines = captureLines();

    new Logger('X').error('falhou', new Error('asaas fora do ar'));

    const [detail] = JSON.parse(lines[0]).details;
    expect(detail).toMatchObject({ name: 'Error', message: 'asaas fora do ar' });
    expect(detail.stack).toContain('logger.spec.ts');
  });

  it('sem argumentos extras a linha não ganha details', () => {
    const lines = captureLines();

    new Logger('X').error('falhou');

    expect(JSON.parse(lines[0])).not.toHaveProperty('details');
  });
});
