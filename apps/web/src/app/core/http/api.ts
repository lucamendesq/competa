import { HttpClient, httpResource, type HttpResourceRef } from '@angular/common/http';
import { Service, computed, inject } from '@angular/core';
import { firstValueFrom, map } from 'rxjs';

export type Envelope<T> = { data: T };
export type Meta = { page: number; perPage: number; total: number };
export type Page<T> = { data: T[]; meta: Meta };

type Params = Record<string, string | number | boolean>;

const clean = (params?: Params) =>
  Object.fromEntries(
    Object.entries(params ?? {}).filter(([, value]) => value !== '' && value != null),
  );

@Service()
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(url: string, params?: Params) {
    return firstValueFrom(
      this.http.get<Envelope<T>>(url, { params: clean(params) }).pipe(map((r) => r?.data)),
    );
  }

  page<T>(url: string, params?: Params) {
    return firstValueFrom(this.http.get<Page<T>>(url, { params: clean(params) }));
  }

  post<T>(url: string, body?: unknown, params?: Params) {
    return firstValueFrom(
      this.http
        .post<Envelope<T>>(url, body ?? {}, { params: clean(params) })
        .pipe(map((r) => r?.data)),
    );
  }

  patch<T>(url: string, body: unknown) {
    return firstValueFrom(this.http.patch<Envelope<T>>(url, body).pipe(map((r) => r?.data)));
  }

  put<T>(url: string, body: unknown) {
    return firstValueFrom(this.http.put<Envelope<T>>(url, body).pipe(map((r) => r?.data)));
  }

  /** Blob + objectURL em vez de apontar `<iframe src>` para a API: a rota exige sessão, e
   *  o cookie não viaja numa subrequisição cross-origin. Quem chama libera o URL. */
  async blobUrl(url: string) {
    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));

    return { objectUrl: URL.createObjectURL(blob), type: blob.type };
  }

  async download(url: string, fileName: string) {
    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();

    URL.revokeObjectURL(objectUrl);
  }

  delete<T>(url: string) {
    return firstValueFrom(this.http.delete<Envelope<T>>(url).pipe(map((r) => r?.data)));
  }
}

/** `resource.value()` LANÇA em estado de erro (Angular 22, `ResourceValueError`), e
 *  `computed`/`linkedSignal` rodam independentemente do ramo que o template mostra: uma
 *  requisição que falha derruba a detecção de mudanças e a tela congela no esqueleto, sem
 *  erro visível. Aqui o valor cai para `onError` e o `error()` continua disponível, então
 *  cada tela mostra o estado de erro que ela já tem. */
const valueOnError = <T>(resource: HttpResourceRef<T>, onError: () => T) => {
  const raw = resource.value;
  /* `raw` é capturado ANTES da troca: ler pelo recurso aqui recairia neste mesmo computed. */
  const guarded = computed(() => (resource.status() === 'error' ? onError() : raw()));

  Object.assign(guarded, { set: raw.set, update: raw.update, asReadonly: raw.asReadonly });
  (resource as { value: unknown }).value = guarded;

  /** `isLoading()` é true também em REFETCH (`status === 'reloading'`), e toda tela troca o
   *  conteúdo por esqueleto quando ele é true: depois de cada `reload()` a tela piscava.
   *  Aqui ele passa a significar "primeira carga", que é quando o esqueleto faz sentido —
   *  o refetch mantém o conteúdo anterior na tela até o novo chegar. */
  (resource as { isLoading: unknown }).isLoading = computed(() => resource.status() === 'loading');

  return resource;
};

export const apiResource = <T>(url: () => string | undefined, params?: () => Params) =>
  valueOnError(
    httpResource<T>(
      () => {
        const target = url();
        return target === undefined ? undefined : { url: target, params: clean(params?.()) };
      },
      { parse: (raw) => (raw as Envelope<T>).data },
    ),
    () => undefined,
  );

/** Lista vazia no erro, e não `undefined`: o tipo é `Page<T>` e as telas leem `.value().data`
 *  direto. Devolver `undefined` trocaria a tela congelada por um `TypeError`. */
export const pageResource = <T>(url: () => string | undefined, params?: () => Params) => {
  const empty = (): Page<T> => ({ data: [], meta: { page: 1, perPage: 20, total: 0 } });

  return valueOnError(
    httpResource<Page<T>>(
      () => {
        const target = url();
        return target === undefined ? undefined : { url: target, params: clean(params?.()) };
      },
      { defaultValue: empty() },
    ),
    empty,
  );
};
