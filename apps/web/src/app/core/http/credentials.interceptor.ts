import { HttpInterceptorFn } from '@angular/common/http';
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
  );
};
