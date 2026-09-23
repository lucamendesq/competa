import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { catchError, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/** URL absoluta = URL pré-assinada de storage (R2 em produção). Ela não pode levar cookie:
 *  o CORS do bucket recusaria a requisição com credenciais. */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//.test(req.url)) return next(req);

  return next(
    req.clone({
      url: `${environment.apiUrl}${req.url}`,
      withCredentials: true,
    }),
  ).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        (req.url === '/auth/me' || req.url === '/my/profile')
      ) {
        return of(new HttpResponse({ status: 200, body: { data: null } }));
      }
      return throwError(() => error);
    }),
  );
};
