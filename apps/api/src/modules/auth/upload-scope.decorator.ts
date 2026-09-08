import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import type { UploadScope } from './scope.js';

export const CurrentUploadScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UploadScope => {
    const scope = context.switchToHttp().getRequest<{ uploadScope?: UploadScope }>().uploadScope;

    if (!scope) throw new Unauthenticated();
    return scope;
  },
);
