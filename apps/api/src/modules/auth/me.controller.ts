import { Controller, Get } from '@nestjs/common';
import { NotFound } from '../../lib/app-error.js';
import { AccountantRepository } from './accountant.repository.js';
import type { AuthSession } from './auth-provider.js';
import { CurrentScope } from './current-scope.decorator.js';
import type { FirmScope } from './scope.js';
import { Session } from './session.decorator.js';

@Controller('me')
export class MeController {
  constructor(private readonly accountantRepository: AccountantRepository) {}

  @Get()
  async me(@CurrentScope() scope: FirmScope, @Session() session: AuthSession) {
    const row = await this.accountantRepository.findBySession(scope, session.user.id);

    // defensivo: o TenantGuard já derivou `scope` do mesmo `accountant` casado
    // por `authUserId`, então este `and(...)` sempre acha a linha — não há
    // caminho conhecido que dispare este 404 hoje.
    if (!row) throw new NotFound();

    return {
      accountant: { id: row.accountantId, name: row.name, email: row.email },
      accountingFirm: { id: row.firmId, name: row.firmName },
    };
  }
}
