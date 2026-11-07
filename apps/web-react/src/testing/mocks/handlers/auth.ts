import { http, HttpResponse } from 'msw';
import { accountantSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';

export const authHandlers = [
  http.get(apiUrl('/auth/me'), () => HttpResponse.json(envelope(accountantSession()))),
  http.get(apiUrl('/my/profile'), () => new HttpResponse(null, { status: 401 })),
];
