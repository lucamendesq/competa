import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthRepository } from './health.repository.js';
import { ServiceUnavailable } from './lib/app-error.js';

/** O que um balanceador/orquestrador consulta antes de mandar tráfego. Toca o banco de
 *  propósito: processo vivo com pool morto responde 200 em qualquer healthcheck que só
 *  olhe o HTTP, e o deploy segue para uma instância que não atende ninguém. */
@Controller('health')
@AllowAnonymous()
// sonda bate a cada poucos segundos: o balde global de 30/10s a derrubaria em 429
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthRepository) {}

  @Get()
  async check() {
    try {
      await this.health.ping();
    } catch {
      throw new ServiceUnavailable('Banco indisponível.');
    }

    return { status: 'ok' as const };
  }
}
