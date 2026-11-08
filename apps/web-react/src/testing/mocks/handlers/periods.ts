import { http, HttpResponse } from 'msw';
import { apiUrl } from '@/testing/mocks/api';

export const periodHandlers = [
  http.get(apiUrl('/periods'), () =>
    HttpResponse.json({ data: [], meta: { page: 1, perPage: 20, total: 0 } }),
  ),
];
