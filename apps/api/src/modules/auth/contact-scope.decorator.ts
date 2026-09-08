import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import type { ContactScope } from './scope.js';

export const CurrentContactScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): ContactScope => {
    const scope = context.switchToHttp().getRequest<{ contactScope?: ContactScope }>().contactScope;

    if (!scope) throw new Unauthenticated();
    return scope;
  },
);
