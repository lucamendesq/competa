import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Unauthenticated } from '../../lib/app-error.js';
import type { FirmScope } from './scope.js';

export const CurrentScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): FirmScope => {
    const scope = context.switchToHttp().getRequest().firmScope;
    if (!scope) throw new Unauthenticated();
    return scope as FirmScope;
  },
);
