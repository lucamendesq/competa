import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it } from 'vitest';
import { FORBIDDEN_ORIGIN, originAllowed, originCheck } from '../../../src/http/origin-check.js';

const allowed = ['https://app.competa.com.br'];

describe('originAllowed', () => {
  it('método não mutante passa com qualquer Origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(originAllowed(method, 'https://evil.com', allowed)).toBe(true);
    }
  });

  it('mutante sem Origin passa (curl, app nativo, rota por token)', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(originAllowed(method, undefined, allowed)).toBe(true);
    }
  });

  it('mutante com Origin da allowlist passa', () => {
    expect(originAllowed('POST', 'https://app.competa.com.br', allowed)).toBe(true);
  });

  it('mutante com Origin de fora é barrado', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(originAllowed(method, 'https://evil.com', allowed)).toBe(false);
    }
  });
});

const fakeExchange = (method: string, origin?: string) => {
  const written = { status: 0, headers: {} as Record<string, unknown>, body: '', next: false };
  const request = { method, headers: origin === undefined ? {} : { origin } } as IncomingMessage;
  const response = {
    writeHead(status: number, headers: Record<string, unknown>) {
      written.status = status;
      written.headers = headers;
      return this;
    },
    end(body: unknown) {
      written.body = String(body);
    },
  } as unknown as ServerResponse;

  originCheck(allowed)(request, response, () => {
    written.next = true;
  });

  return written;
};

describe('originCheck (middleware node)', () => {
  it('deixa passar o que originAllowed aprova', () => {
    expect(fakeExchange('GET', 'https://evil.com').next).toBe(true);
    expect(fakeExchange('POST').next).toBe(true);
    expect(fakeExchange('POST', 'https://app.competa.com.br').next).toBe(true);
  });

  it('recusa com o mesmo corpo do middleware Express', () => {
    const written = fakeExchange('POST', 'https://evil.com');

    expect(written.next).toBe(false);
    expect(written.status).toBe(403);
    expect(JSON.parse(written.body)).toEqual(FORBIDDEN_ORIGIN);
    expect(FORBIDDEN_ORIGIN).toEqual({
      error: { code: 'FORBIDDEN_ORIGIN', message: 'Origem não permitida.' },
    });
  });

  it('recusa carrega content-type com charset e ETag, como o res.json()', () => {
    const { headers } = fakeExchange('POST', 'https://evil.com');

    expect(headers['content-type']).toBe('application/json; charset=utf-8');
    expect(String(headers.etag)).toMatch(/^W\/"[0-9a-f]+-.{27}"$/);
  });
});
