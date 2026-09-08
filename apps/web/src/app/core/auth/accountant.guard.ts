import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const accountantGuard: CanMatchFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureLoaded();

  return auth.accountant() !== null || router.createUrlTree(['/entrar']);
};
