import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { planAllows, type PlanCapability } from '@competa/contracts';
import { Unauthenticated } from '../../lib/app-error.js';
import { PlanCapabilityRequired } from './errors.js';
import { REQUIRES_PLAN } from './requires-plan.decorator.js';

/** Gate de capability por plano. Roda depois do `TenantGuard`, que já resolveu escopo e
 *  plano na mesma consulta de sessão — o gate não acrescenta query nenhuma.
 *
 *  A negação é logada de propósito: é o sinal de que um gate está sendo batido, e a única
 *  matéria-prima da revisão do segundo eixo (`docs/metricas-plano.md`). */
@Injectable()
export class PlanGuard implements CanActivate {
  private readonly logger = new Logger(PlanGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const capability = this.reflector.getAllAndOverride<PlanCapability | undefined>(REQUIRES_PLAN, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!capability) return true;

    const request = context.switchToHttp().getRequest();
    if (!request.firmScope) throw new Unauthenticated();

    if (planAllows(request.planName ?? 'trial', capability)) return true;

    const denied =
      `402 PLAN_CAPABILITY_REQUIRED firm=${request.firmScope} capability=${capability} ` +
      `plan=${request.planName} route=${request.method} ${request.route?.path ?? request.url}`;

    this.logger.warn(denied);
    Sentry.captureMessage(denied, 'warning');

    throw new PlanCapabilityRequired(capability);
  }
}
