/* RLS: todas as tabelas têm `ENABLE ROW LEVEL SECURITY` e NENHUMA política — e isso é
 * deliberado, não esquecimento. Hoje existe um role só (`competa_api`, veja
 * docs/conventions.md), que é dono das tabelas e portanto passa por cima de RLS: política
 * nenhuma mudaria o que a aplicação enxerga. O isolamento por Contabilidade é inteiramente
 * dos repositórios (`FirmScope`), não do banco. Não leia o `enableRLS()` como rede de
 * segurança: ligá-la de verdade exige um role de runtime separado do dono + `FORCE ROW
 * LEVEL SECURITY` + políticas por tenant alimentadas por `set_config` em cada transação. */

export * from './auth.js';
export * from './registry.js';
export * from './collection.js';
export * from './messaging.js';
export * from './relations.js';
