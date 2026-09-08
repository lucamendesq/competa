import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import type { AuthSession } from './auth-provider.js';

export const Session = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession => {
    const session = context.switchToHttp().getRequest().session;
    if (!session) throw new Unauthenticated();
    return session as AuthSession;
  },
);
