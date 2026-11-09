import { http, HttpResponse } from 'msw';
import { accountantSession, contactSession } from '@/testing/factories/session';
import { apiUrl, envelope } from '@/testing/mocks/api';
import { server } from '@/testing/mocks/server';

const unauthorized = () => new HttpResponse(null, { status: 401 });

export const mockSessionAs = (who: 'accountant' | 'contact' | 'guest') => {
  server.use(
    http.get(apiUrl('/auth/me'), () =>
      who === 'accountant' ? HttpResponse.json(envelope(accountantSession())) : unauthorized(),
    ),
    http.get(apiUrl('/my/profile'), () =>
      who === 'contact' ? HttpResponse.json(envelope(contactSession())) : unauthorized(),
    ),
  );
};
