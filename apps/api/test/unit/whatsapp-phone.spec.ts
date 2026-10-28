import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../../src/modules/messaging/providers/whatsapp.provider.js';

describe('normalizePhone', () => {
  it('cadastro sem o 55 ganha o código do país — inclusive no DDD 55 (RS)', () => {
    expect(normalizePhone('(55) 99123-4567')).toBe('5555991234567');
    expect(normalizePhone('11 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('5533334444')).toBe('555533334444');
  });

  it('número que já tem o 55 do país fica como está', () => {
    expect(normalizePhone('+55 11 98888-7777')).toBe('5511988887777');
    expect(normalizePhone('555533334444')).toBe('555533334444');
  });
});
