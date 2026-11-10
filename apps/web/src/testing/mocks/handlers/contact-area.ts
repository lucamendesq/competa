import { http, HttpResponse } from 'msw';
import { apiUrl, envelope } from '@/testing/mocks/api';

export const contactAreaHandlers = [
  http.get(apiUrl('/my/pending'), () => HttpResponse.json(envelope([]))),
  http.patch(apiUrl('/auth/device'), () => HttpResponse.json(envelope({ ok: true }))),
];
