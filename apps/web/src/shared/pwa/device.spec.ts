import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDeviceId, pingDeviceOnce } from '@/shared/pwa/device';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('device', () => {
  it('getDeviceId gera uma vez e reaproveita', () => {
    const first = getDeviceId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getDeviceId()).toBe(first);
  });

  it('pingDeviceOnce chama a API uma vez por sessão', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.patch(apiUrl('/auth/device'), async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(envelope({ ok: true }));
      }),
    );

    await pingDeviceOnce();
    await pingDeviceOnce();

    expect(bodies).toEqual([{ deviceId: getDeviceId(), platform: 'desktop', installed: false }]);
  });

  it('falha desfaz a marca e a próxima chamada tenta de novo', async () => {
    let calls = 0;
    server.use(
      http.patch(apiUrl('/auth/device'), () => {
        calls += 1;
        return calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json(envelope({ ok: true }));
      }),
    );

    await pingDeviceOnce();
    expect(sessionStorage.getItem('competa:device_pinged')).toBeNull();
    await pingDeviceOnce();

    expect(calls).toBe(2);
    expect(sessionStorage.getItem('competa:device_pinged')).toBe('1');
  });
});
