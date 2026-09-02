import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FirmScope } from './scope.js';

/** Injeta o FirmScope produzido pelo TenantGuard. */
export const CurrentScope = createParamDecorator(
  (_data: unknown, context: ExecutionContext): FirmScope =>
    context.switchToHttp().getRequest().firmScope,
);
