import { Controller, Get } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  accountant,
  accountingFirm,
  user,
} from '../../infra/database/schema/index.js';
import { NotFound } from '../../lib/app-error.js';
import type { AuthSession } from './auth-provider.js';
import { CurrentScope } from './current-scope.decorator.js';
import type { FirmScope } from './scope.js';
import { Session } from './session.decorator.js';

@Controller('me')
export class MeController {
  constructor(private readonly db: Database) {}

  @Get()
  async me(@CurrentScope() scope: FirmScope, @Session() session: AuthSession) {
    const [row] = await this.db
      .select({
        accountantId: accountant.id,
        name: user.name,
        email: user.email,
        firmId: accountingFirm.id,
        firmName: accountingFirm.name,
      })
      .from(accountant)
      .innerJoin(user, eq(user.id, accountant.authUserId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, accountant.accountingFirmId))
      // filtra pelo usuário da sessão E pelo escopo: uma Contabilidade pode ter
      // vários Contadores (convite da Task 6), então só o escopo devolveria
      // um Contador arbitrário da firm em vez de quem está logado.
      .where(
        and(
          eq(accountant.authUserId, session.user.id),
          eq(accountant.accountingFirmId, scope),
        ),
      )
      .limit(1);

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
