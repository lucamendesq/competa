import { TransactionRollbackError } from 'drizzle-orm';
import { db } from '../infra/database/index.js';
import type { Database } from '../infra/database/database.js';

export const withRollback = async (fn: (tx: Database) => Promise<void>) => {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) {
      throw error;
    }
  }
};
