import { SetMetadata } from '@nestjs/common';
import type { PlanCapability } from '@competa/contracts';

export const REQUIRES_PLAN = 'REQUIRES_PLAN';

export const RequiresPlan = (capability: PlanCapability) => SetMetadata(REQUIRES_PLAN, capability);
