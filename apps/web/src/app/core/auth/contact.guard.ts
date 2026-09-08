import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const contactGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureLoaded('contact');

  return auth.contact() !== null || router.createUrlTree(['/minha-area/acesso']);
};
