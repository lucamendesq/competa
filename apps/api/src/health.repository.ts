import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Database } from './infra/database/database.js';

/** Repositório de uma linha só, mas repositório: `Database` não entra em controller (a
 *  regra existe para que toda consulta de negócio precise de um `FirmScope` na
 *  assinatura). Aqui não há escopo porque não há dado — é só "o pool responde?". */
@Injectable()
export class HealthRepository {
  constructor(private readonly db: Database) {}

  async ping() {
    await this.db.execute(sql`select 1`);
  }
}
