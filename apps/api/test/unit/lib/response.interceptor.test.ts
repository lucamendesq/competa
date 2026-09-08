import { StreamableFile } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { expect, test } from 'vitest';
import { ResponseInterceptor, paginated } from '../../../src/lib/response.interceptor.js';

const interceptor = new ResponseInterceptor();

const run = (payload: unknown) => {
  const next: CallHandler = { handle: () => of(payload) };

  return firstValueFrom(interceptor.intercept({} as ExecutionContext, next));
};

test('resposta comum é envelopada em { data }', async () => {
  await expect(run({ id: 'abc' })).resolves.toEqual({ data: { id: 'abc' } });
  await expect(run([1, 2])).resolves.toEqual({ data: [1, 2] });
  await expect(run('texto')).resolves.toEqual({ data: 'texto' });
});

test('coleção paginada devolve { data, meta } — sem data dentro de data', async () => {
  const meta = { page: 2, perPage: 20, total: 57 };

  await expect(run(paginated([{ id: 'a' }], meta))).resolves.toEqual({
    data: [{ id: 'a' }],
    meta,
  });
});

test('StreamableFile (zip) passa direto, sem envelope que corromperia o download', async () => {
  const file = new StreamableFile(Buffer.from('PK zip'));

  await expect(run(file)).resolves.toBe(file);
});

test('null e undefined não são envelopados (204 continua sem corpo)', async () => {
  await expect(run(null)).resolves.toBeNull();
  await expect(run(undefined)).resolves.toBeUndefined();
});

test('o símbolo do envelope não escapa para o JSON da resposta', async () => {
  const response = await run(paginated([], { page: 1, perPage: 20, total: 0 }));

  expect(Object.keys(response as object).sort()).toEqual(['data', 'meta']);
  expect(Reflect.ownKeys(response as object)).toHaveLength(2);
});
