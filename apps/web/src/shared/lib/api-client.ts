import type * as z from 'zod';
import { env } from '@/shared/config/env';
import { ApiError, apiErrorCode } from '@/shared/lib/api-error';

export type Envelope<T> = { data: T };
export type Meta = { page: number; perPage: number; total: number };
export type Page<T> = { data: T[]; meta: Meta };

export type Params = Record<string, string | number | boolean | undefined | null>;

type RequestOptions = {
  body?: unknown;
  params?: Params | undefined;
  responseType?: 'json' | 'blob';
  signal?: AbortSignal | undefined;
};

type CallOptions = { params?: Params; signal?: AbortSignal };

const SESSION_PROBES = new Set(['/auth/me', '/my/profile']);

let sessionExpiredHandler: (() => void) | undefined;
let paymentRequiredHandler: (() => void) | undefined;

export const onSessionExpired = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

export const onPaymentRequired = (handler: () => void) => {
  paymentRequiredHandler = handler;
};

const cleanParams = (params?: Params): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!params) return result;
  for (const [key, value] of Object.entries(params)) {
    if (value !== '' && value != null) {
      result[key] = String(value);
    }
  }
  return result;
};

const buildUrl = (url: string, params?: Params) => {
  const isAbsolute = /^https?:\/\//.test(url);
  const base = isAbsolute ? url : `${env.apiUrl}${url}`;
  const query = new URLSearchParams(cleanParams(params)).toString();
  if (!query) return { isAbsolute, target: base };
  return { isAbsolute, target: `${base}${base.includes('?') ? '&' : '?'}${query}` };
};

const readErrorBody = async (response: Response) => {
  const text = await response.text().catch(() => '');
  if (!text) return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

async function send<T>(method: string, url: string, options: RequestOptions = {}): Promise<T> {
  const { isAbsolute, target } = buildUrl(url, options.params);
  const headers: Record<string, string> = {};
  const init: RequestInit = { method, headers };

  if (!isAbsolute) init.credentials = 'include';
  if (options.signal) init.signal = options.signal;
  if (options.body) {
    init.body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(target, init);

  if (!response.ok) {
    if (response.status === 401 && SESSION_PROBES.has(url)) {
      return { data: null } as T;
    }
    if (response.status === 401) sessionExpiredHandler?.();

    const body = await readErrorBody(response);
    if (import.meta.env.DEV && response.status >= 500) {
      console.error(`API ${response.status} ${method} ${url}`, body);
    }
    const error = new ApiError(response.status, body, `API Error ${response.status}`);
    if (response.status === 402 && apiErrorCode(error) === 'PAYMENT_REQUIRED') {
      paymentRequiredHandler?.();
    }
    throw error;
  }

  if (options.responseType === 'blob') return (await response.blob()) as T;

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

const unwrap = <T>(envelope: Envelope<T> | undefined) => envelope?.data as T;

const get = async <T>(url: string, { params, signal }: CallOptions = {}) =>
  unwrap(await send<Envelope<T>>('GET', url, { params, signal }));

const page = <T>(url: string, { params, signal }: CallOptions = {}) =>
  send<Page<T>>('GET', url, { params, signal });

const post = async <T>(url: string, body?: unknown, { params, signal }: CallOptions = {}) =>
  unwrap(await send<Envelope<T>>('POST', url, { body, params, signal }));

const patch = async <T>(url: string, body: unknown, { signal }: CallOptions = {}) =>
  unwrap(await send<Envelope<T>>('PATCH', url, { body, signal }));

const put = async <T>(url: string, body: unknown, { signal }: CallOptions = {}) =>
  unwrap(await send<Envelope<T>>('PUT', url, { body, signal }));

const remove = async <T>(url: string, { signal }: CallOptions = {}) =>
  unwrap(await send<Envelope<T>>('DELETE', url, { signal }));

const blobUrl = async (url: string, { signal }: CallOptions = {}) => {
  const blob = await send<Blob>('GET', url, { responseType: 'blob', signal });
  return { objectUrl: URL.createObjectURL(blob), type: blob.type };
};

const download = async (url: string, fileName: string, { signal }: CallOptions = {}) => {
  const blob = await send<Blob>('GET', url, { responseType: 'blob', signal });

  if (blob.size === 0) {
    throw new ApiError(
      404,
      { error: { code: 'EMPTY_DOWNLOAD', message: 'Nenhum documento para baixar.' } },
      'EMPTY_DOWNLOAD',
    );
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  /* Revogar no mesmo tick cancela o download que o navegador ainda não começou
   * (Firefox/Safari): o clique só agenda a gravação. */
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
};

export const api = { get, page, post, patch, put, delete: remove, blobUrl, download };

export const parsed =
  <Schema extends z.ZodType>(schema: Schema) =>
  (data: unknown): z.output<Schema> =>
    schema.parse(data);
