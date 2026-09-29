import { ApiError } from './error';

export type Envelope<T> = { data: T };
export type Meta = { page: number; perPage: number; total: number };
export type Page<T> = { data: T[]; meta: Meta };

type Params = Record<string, string | number | boolean | undefined | null>;

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

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private async request<T>(
    method: string,
    url: string,
    options?: { body?: unknown; params?: Params; responseType?: 'json' | 'blob' },
  ): Promise<T> {
    const isAbsolute = /^https?:\/\//.test(url);
    let targetUrl = isAbsolute ? url : `${apiUrl}${url}`;

    if (options?.params) {
      const searchParams = new URLSearchParams(cleanParams(options.params));
      const qs = searchParams.toString();
      if (qs) {
        targetUrl += (targetUrl.includes('?') ? '&' : '?') + qs;
      }
    }

    const init: RequestInit = {
      method,
      headers: {},
    };

    if (!isAbsolute) {
      init.credentials = 'include';
    }

    if (options?.body) {
      init.body = JSON.stringify(options.body);
      (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(targetUrl, init);
    } catch (error) {
      // Fetch throws TypeError on network errors
      throw error;
    }

    if (!response.ok) {
      if (response.status === 401 && (url === '/auth/me' || url === '/my/profile')) {
        return { data: null } as unknown as T;
      }

      const text = await response.text().catch(() => '');
      let body: unknown = text;
      try {
        if (text) body = JSON.parse(text);
      } catch {}

      throw new ApiError(response.status, body, `API Error ${response.status}`);
    }

    if (options?.responseType === 'blob') {
      return response.blob() as unknown as T;
    }

    const text = await response.text();
    if (!text) return undefined as unknown as T;

    return JSON.parse(text) as T;
  }

  async get<T>(url: string, params?: Params) {
    const res = await this.request<Envelope<T>>('GET', url, { params });
    return res?.data;
  }

  async page<T>(url: string, params?: Params) {
    return this.request<Page<T>>('GET', url, { params });
  }

  async post<T>(url: string, body?: unknown, params?: Params) {
    const res = await this.request<Envelope<T>>('POST', url, { body, params });
    return res?.data;
  }

  async patch<T>(url: string, body: unknown) {
    const res = await this.request<Envelope<T>>('PATCH', url, { body });
    return res?.data;
  }

  async put<T>(url: string, body: unknown) {
    const res = await this.request<Envelope<T>>('PUT', url, { body });
    return res?.data;
  }

  async delete<T>(url: string) {
    const res = await this.request<Envelope<T>>('DELETE', url);
    return res?.data;
  }

  async blobUrl(url: string) {
    const blob = await this.request<Blob>('GET', url, { responseType: 'blob' });
    return { objectUrl: URL.createObjectURL(blob), type: blob.type };
  }

  async download(url: string, fileName: string) {
    const blob = await this.request<Blob>('GET', url, { responseType: 'blob' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();

    URL.revokeObjectURL(objectUrl);
  }
}

export const api = new ApiClient();
