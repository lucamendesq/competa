import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const accountantGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureLoaded();

  if (auth.accountant() !== null) return true;
  if (auth.contact() !== null) return router.createUrlTree(['/minha-area/pendencias']);

  return router.createUrlTree(['/entrar']);
};
