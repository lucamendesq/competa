import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { accountant, accountingFirm, user } from '../../infra/database/schema/index.js';
import type { FirmScope } from './scope.js';

@Injectable()
export class AccountantRepository {
  constructor(private readonly db: Database) {}

  /** Contador da sessão + dados da Contabilidade. Filtra por `authUserId` E
   *  pelo escopo: uma Contabilidade pode ter vários Contadores (convite da
   *  Task 6), então só o escopo devolveria um Contador arbitrário da firm
   *  em vez de quem está logado. */
  async findBySession(scope: FirmScope, authUserId: string) {
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
      .where(and(eq(accountant.authUserId, authUserId), eq(accountant.accountingFirmId, scope)))
      .limit(1);

    return row;
  }
}
