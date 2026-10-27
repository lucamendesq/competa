import type { Effect } from 'effect';
import { Db } from './effect.js';

/** A unidade de trabalho que uma rota pode abrir sem tocar o banco: os repositórios chamados
 *  dentro entram na transação, e consulta continua só podendo sair de um repositório. */
export const withTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Db.use((db) => db.withTransaction(effect));
