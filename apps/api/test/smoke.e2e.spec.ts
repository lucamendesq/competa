import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp, type RunningApp } from './support/boot.js';

describe('smoke', () => {
  let app: RunningApp;

  beforeAll(async () => {
    app = await bootApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 com envelope { data }', async () => {
    const res = await fetch(`${app.url}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.status).toBe('ok');
  });

  it('rota inexistente → 404 com envelope { error }', async () => {
    const res = await fetch(`${app.url}/nao-existe`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
