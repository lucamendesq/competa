import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import { AuthProvider } from './auth-provider.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthProvider) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const session = await this.auth.getSession(request.headers);
    if (!session) throw new Unauthenticated();

    request.session = session;
    return true;
  }
}
