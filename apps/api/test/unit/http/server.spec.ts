import { request as nodeRequest, type ServerResponse } from 'node:http';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Context, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serverLayer } from '../../../src/http/server.js';

/* Sobe o servidor Effect sem Nest e sem banco: o que está sob teste é a pilha de
 * plataforma (helmet, origin-check, CORS, log, throttle, envelope, mapa de erros, ETag)
 * na rota /health, não o repositório. */
const boot = async (ping: () => Promise<void>) => {
  const runtime = ManagedRuntime.make(
    serverLayer({
      port: 0,
      trustProxy: true,
      ping,
      events: new EventEmitter2(),
      scanDeadlines: () => Promise.resolve({}),
      runReminders: () => Promise.resolve({}),
      fallback: (_request, response: ServerResponse) => {
        response.statusCode = 418;
        response.end();
      },
    }),
  );
  const server = Context.get(await runtime.context(), HttpServer.HttpServer);
  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return { url, close: () => runtime.dispose() };
};

/* `fetch` do undici tem cache próprio e engole o If-None-Match; o cliente cru não. */
const conditionalGet = (url: string, path: string, ifNoneMatch: string) =>
  new Promise<number>((resolve) => {
    const target = new URL(`${url}${path}`);
    const req = nodeRequest(
      {
        host: target.hostname,
        port: target.port,
        path: target.pathname,
        headers: { 'if-none-match': ifNoneMatch },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      },
    );
    req.end();
  });

describe('GET /health servido pelo shell Effect', () => {
  let app: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    app = await boot(() => Promise.resolve());
  });

  afterAll(() => app.close());

  it('200 com envelope { data } e charset do Express', async () => {
    const response = await fetch(`${app.url}/health`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect((await response.json()).data.status).toBe('ok');
  });

  it('carrega os headers do helmet', async () => {
    const response = await fetch(`${app.url}/health`);
    await response.text();

    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('strict-transport-security')).toBeTruthy();
  });

  it('reflete o CORS da allowlist', async () => {
    const origin = 'http://localhost:5173';
    const simple = await fetch(`${app.url}/health`, { headers: { origin } });
    await simple.text();

    expect(simple.headers.get('access-control-allow-origin')).toBe(origin);
    expect(simple.headers.get('access-control-allow-credentials')).toBe('true');
    expect(simple.headers.get('vary')).toContain('Origin');
  });

  /* `route()` registra só o método da rota, então o preflight continua caindo no
   * catch-all — onde o `cors()` do Nest responde exatamente o mesmo 204. Quando o
   * catch-all sair, alguém precisa registrar OPTIONS no shell Effect. */
  it('preflight ainda é do catch-all', async () => {
    const preflight = await fetch(`${app.url}/health`, {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
    });

    expect(preflight.status).toBe(418);
  });

  it('origem fora da allowlist não ganha o header de CORS', async () => {
    const response = await fetch(`${app.url}/health`, { headers: { origin: 'https://evil.com' } });
    await response.text();

    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('conta no balde `short` e não no `default` (equivalente ao @SkipThrottle())', async () => {
    const response = await fetch(`${app.url}/health`, {
      headers: { 'x-forwarded-for': '9.9.9.9' },
    });
    await response.text();

    expect(response.headers.get('x-ratelimit-limit-short')).toBe('30');
    expect(response.headers.get('x-ratelimit-reset-short')).toBe('10');
    expect(response.headers.get('x-ratelimit-limit')).toBeNull();
  });

  it('o balde é por cliente: outro X-Forwarded-For recomeça a contagem', async () => {
    const first = await fetch(`${app.url}/health`, { headers: { 'x-forwarded-for': '1.1.1.1' } });
    await first.text();
    const second = await fetch(`${app.url}/health`, { headers: { 'x-forwarded-for': '2.2.2.2' } });
    await second.text();

    expect(first.headers.get('x-ratelimit-remaining-short')).toBe('29');
    expect(second.headers.get('x-ratelimit-remaining-short')).toBe('29');
  });

  it('marca ETag e responde 304 em revalidação', async () => {
    const response = await fetch(`${app.url}/health`);
    const etag = response.headers.get('etag');
    await response.text();

    expect(etag).toMatch(/^W\//);
    expect(await conditionalGet(app.url, '/health', etag ?? '')).toBe(304);
  });

  it('tudo que não é /health cai cru na casca Nest', async () => {
    expect((await fetch(`${app.url}/nao-existe`)).status).toBe(418);
    expect((await fetch(`${app.url}/health`, { method: 'POST' })).status).toBe(418);
  });
});

describe('mapa de erros ligado na rota', () => {
  let app: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    app = await boot(() => Promise.reject(new Error('pool morto')));
  });

  afterAll(() => app.close());

  it('banco fora do ar vira 503 SERVICE_UNAVAILABLE, com a plataforma aplicada', async () => {
    const response = await fetch(`${app.url}/health`);

    expect(response.status).toBe(503);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('etag')).toMatch(/^W\//);
    expect(await response.json()).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Banco indisponível.' },
    });
  });
});

describe('throttle do shell Effect', () => {
  let app: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    app = await boot(() => Promise.resolve());
  });

  afterAll(() => app.close());

  it('31ª requisição do mesmo IP em 10s leva 429 com o corpo do ThrottlerException', async () => {
    const ip = '203.0.113.7';
    for (let hit = 0; hit < 30; hit += 1) {
      const ok = await fetch(`${app.url}/health`, { headers: { 'x-forwarded-for': ip } });
      await ok.text();
      expect(ok.status).toBe(200);
    }

    const blocked = await fetch(`${app.url}/health`, { headers: { 'x-forwarded-for': ip } });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after-short')).toBe('10');
    expect(await blocked.json()).toEqual({
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.',
      },
    });
  });
});
