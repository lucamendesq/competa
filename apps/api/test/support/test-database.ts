/** A suíte trunca TODAS as tabelas do banco apontado por DB_NAME. Um `DB_NAME=competa`
 *  exportado no shell do dev apagaria o banco de desenvolvimento. */
export const assertTestDatabase = (name: string) => {
  if (!name.endsWith('_test')) {
    throw new Error(`DB_NAME="${name}" não termina em _test: a suíte se recusa a truncá-lo.`);
  }
};
