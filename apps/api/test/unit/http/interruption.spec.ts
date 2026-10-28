import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import { HttpRouter, HttpServer, HttpServerResponse } from 'effect/http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppServicesWithoutDb } from '../../../src/effect/runtime.js';
import { publicRoute, route } from '../../../src/http/platform.js';

const finished: string[] = [];

const slow = (label: string) =>
  Effect.sleep('300 millis').pipe(
    Effect.andThen(Effect.sync(() => finished.push(label))),
    Effect.as(HttpServerResponse.empty({ status: 204 })),
  );

const boot = async () => {
  const runtime = ManagedRuntime.make(
    HttpRouter.serve(
      Layer.mergeAll(
        route('POST', '/slow', slow('POST'), { auth: publicRoute }),
        route('GET', '/slow', slow('GET'), { auth: publicRoute }),
      ),
      { disableLogger: true, disableListenLog: true },
    ).pipe(
      Layer.provideMerge(NodeHttpServer.layer(createServer, { port: 0 })),
      Layer.provide(AppServicesWithoutDb),
    ),
  );
  const server = Context.get(await runtime.context(), HttpServer.HttpServer);
  const url = HttpServer.formatAddress(server.address)
    .replace('[::]', '127.0.0.1')
    .replace('[::1]', '127.0.0.1');

  return { url, close: () => runtime.dispose() };
};

const abortAfter = async (url: string, method: string, ms: number) => {
  const controller = new AbortController();
  const pending = fetch(url, { method, signal: controller.signal }).catch(() => undefined);
  setTimeout(() => controller.abort(), ms);
  await pending;
};

describe('cliente que desconecta no meio da requisição', () => {
  let app: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    app = await boot();
  });

  afterAll(() => app.close());

  it('escrita roda até o fim', async () => {
    await abortAfter(`${app.url}/slow`, 'POST', 50);
    await Effect.runPromise(Effect.sleep('500 millis'));

    expect(finished).toContain('POST');
  });

  it('leitura é interrompida', async () => {
    await abortAfter(`${app.url}/slow`, 'GET', 50);
    await Effect.runPromise(Effect.sleep('500 millis'));

    expect(finished).not.toContain('GET');
  });
});
