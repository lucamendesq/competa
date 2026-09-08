import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiResource, pageResource } from './api';

/** A regressão que isto trava: `resource.value()` LANÇA em estado de erro (Angular 22), e
 *  as telas leem o valor dentro de `computed`. Uma requisição que falha derrubava a
 *  detecção de mudanças e a tela congelava no esqueleto — sem erro visível. */
describe('recurso da API em estado de erro', () => {
  let http: HttpTestingController;
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    injector = TestBed.inject(Injector);
  });

  /** O `httpResource` dispara a requisição num effect: um tick deixa o effect rodar,
   *  outro deixa o valor/erro assentar. */
  const settle = async (
    url: string,
    respond: (req: ReturnType<HttpTestingController['expectOne']>) => void,
  ) => {
    TestBed.tick();
    respond(http.expectOne(url));
    await Promise.resolve();
    TestBed.tick();
  };

  it('apiResource devolve undefined em vez de lançar', async () => {
    const resource = runInInjectionContext(injector, () => apiResource<{ id: string }>(() => '/x'));

    await settle('/x', (req) =>
      req.flush({ error: { code: 'NOT_FOUND' } }, { status: 404, statusText: 'Not Found' }),
    );

    expect(() => resource.value()).not.toThrow();
    expect(resource.value()).toBeUndefined();
    // o erro continua disponível: é dele que a tela monta o estado de erro
    expect(resource.error()).toBeInstanceOf(HttpErrorResponse);
  });

  it('pageResource cai numa página vazia — as telas leem .value().data direto', async () => {
    const resource = runInInjectionContext(injector, () =>
      pageResource<{ id: string }>(() => '/y'),
    );

    await settle('/y', (req) => req.flush(null, { status: 500, statusText: 'Server Error' }));

    expect(() => resource.value().data).not.toThrow();
    expect(resource.value().data).toEqual([]);
    expect(resource.error()).toBeInstanceOf(HttpErrorResponse);
  });

  it('no caminho feliz o valor real passa intacto', async () => {
    const resource = runInInjectionContext(injector, () => apiResource<{ id: string }>(() => '/z'));

    await settle('/z', (req) => req.flush({ data: { id: 'abc' } }));

    expect(resource.value()).toEqual({ id: 'abc' });
    expect(resource.error()).toBeUndefined();
  });
});
