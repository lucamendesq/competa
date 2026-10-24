/* Teto de Empresas por plano. Exercita o repositório real contra o banco real: o cadastro
 * avulso e a importação por planilha são caminhos de insert separados, e o que os tickets de
 * preço pedem garantir é que a planilha não fure o plano — nem conte de novo quem já está
 * cadastrado (o upsert por CNPJ não ocupa vaga nova) — que o teto conte só Empresa **ativa**,
 * e que a folga de 20% (D18 §7) deixe passar antes do muro. */
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import {
  PLANS,
  PLAN_NAMES,
  planAllows,
  planCompanyCap,
  planForCompanies,
  planSoftCap,
} from '@competa/contracts';

const { db } = await import('../infra/database/index.js');
const { accountingFirm, subscription, company } = await import('../infra/database/schema/index.js');
const { CompanyRepository } = await import('../modules/companies/company.repository.js');
const { toFirmScope } = await import('../modules/auth/scope.js');
const { PeriodRepository } = await import('../modules/periods/period.repository.js');

assert.equal(planCompanyCap('essencial'), 30);
assert.equal(planCompanyCap('profissional'), 80);
assert.equal(planCompanyCap('escritorio'), 200);
assert.equal(planCompanyCap('plano-que-nao-existe'), PLANS.trial.companyCap);

assert.equal(planAllows('essencial', 'branding'), false);
assert.equal(planAllows('essencial', 'reminderTuning'), false);
assert.equal(planAllows('essencial', 'periodZip'), false);
assert.equal(planAllows('profissional', 'periodZip'), true);
assert.equal(planAllows('escritorio', 'branding'), true);
assert.equal(planAllows('trial', 'periodZip'), true);
assert.equal(planAllows('xpto-inexistente', 'periodZip'), false);

assert.equal(planSoftCap(PLANS.essencial.companyCap), 36);
assert.equal(planSoftCap(PLANS.profissional.companyCap), 96);
assert.equal(planForCompanies(25), 'essencial');
assert.equal(planForCompanies(34), 'profissional');
assert.equal(planForCompanies(900), 'escritorio');
PLAN_NAMES.forEach((name) =>
  assert.equal(PLANS[name].priceYearly, PLANS[name].priceMonthly * 10, `anual de ${name}`),
);

const row = (n: number) => ({
  line: n,
  body: { name: `Empresa ${n}`, cnpj: String(n).padStart(14, '0'), flags: {} },
});

const rows = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => row(from + i));

async function run() {
  console.log('--- Teto de Empresas por plano ---\n');

  const firmId = uuidv7();
  const scope = toFirmScope(firmId);
  await db.insert(accountingFirm).values({ id: firmId, name: 'Contabilidade teto' });
  await db.insert(subscription).values({
    id: uuidv7(),
    accountingFirmId: firmId,
    planName: 'essencial',
    status: 'ACTIVE',
  });

  const repo = new CompanyRepository();
  const cap = PLANS.essencial.companyCap;
  const soft = planSoftCap(cap);

  const firstBatch = await repo.confirmImport(scope, rows(1, cap));
  assert.equal(firstBatch.activated, cap, 'as que cabem entram ativas');
  console.log(`planilha com ${cap} linhas entrou ativa no plano essencial ✔`);

  /* Carteira inteira como inativa: 1000 linhas no Essencial não ocupam vaga nenhuma. */
  const parked = await repo.confirmImport(scope, rows(500, 540), false);
  assert.equal(parked.activated, 0, 'importação desativada não ocupa vaga');
  assert.equal((await repo.usage(scope)).companiesActive, cap);
  console.log('importar como inativa não consome teto ✔');

  const bulk = await repo.activateMany(
    scope,
    (await repo.list(scope, { active: false, page: 1, perPage: 50 })).rows.map((r) => r.id),
  );
  assert.equal(bulk.activated, soft - cap, 'ativação em lote vai até a folga');
  assert.ok(bulk.reason?.includes('não entraram'), 'e explica quantas ficaram de fora');
  console.log(`ativação em lote sobe até a folga (${soft}) e explica o resto ✔`);

  const over = await repo.usage(scope);
  assert.equal(over.companiesActive, soft);
  assert.equal(over.overCap, true, 'acima do teto a firm fica em excedente');
  assert.equal(over.softCap, soft);
  assert.equal(over.recommendedPlan, 'profissional');
  console.log('passar do teto dentro da folga acende o excedente ✔');

  await assert.rejects(
    () => repo.create(scope, { name: 'Acima da folga', flags: {} }),
    new RegExp(`Seu plano permite ${cap} empresas ativas e você já tem ${soft}`),
    `cadastro avulso deveria recusar a ${soft + 1}ª empresa ativa`,
  );
  console.log(`cadastro avulso recusa a ${soft + 1}ª empresa ativa ✔`);

  /* A planilha nunca é recusada por teto: o que não cabe entra desativado. É o que permite
   * dizer "importe todos os seus clientes" sem pedir que ele se auto-promova de tier. */
  const overflow = await repo.confirmImport(scope, rows(soft + 1, soft + 5));
  assert.equal(overflow.created, 5);
  assert.equal(overflow.activated, 0, 'com o teto cheio, tudo entra desativado');
  console.log('planilha acima da folga entra desativada em vez de ser recusada ✔');

  await repo.confirmImport(scope, rows(1, cap));
  console.log('reenvio da planilha cheia continua passando ✔');

  const [desativada] = await db
    .select({ id: company.id })
    .from(company)
    .where(and(eq(company.accountingFirmId, firmId), eq(company.active, true)))
    .limit(1);

  await repo.deactivate(scope, desativada.id);
  await repo.create(scope, { name: 'Entrou no lugar da inativa', flags: {} });
  console.log('desativar libera vaga e o cadastro seguinte passa ✔');

  await assert.rejects(
    () => repo.update(scope, desativada.id, { active: true }),
    new RegExp(`Seu plano permite ${cap} empresas ativas`),
    'reativar com o teto estourado deveria ser recusado',
  );
  console.log('reativar acima da folga é recusado ✔');

  const [liberada] = await db
    .select({ id: company.id })
    .from(company)
    .where(and(eq(company.accountingFirmId, firmId), eq(company.active, true)))
    .limit(1);
  await repo.deactivate(scope, liberada.id);
  await repo.update(scope, desativada.id, { active: true });
  console.log('reativar com folga no teto funciona ✔');

  /* Regressão: Empresa inativa continua fora do fan-out da Competência. Sem isto, importar
   * a carteira inteira como inativa dispararia e-mail para todo mundo. */
  const periods = new PeriodRepository();
  const fannedOut = await periods.activeCompanies(scope);
  const activeNow = (await repo.usage(scope)).companiesActive;
  assert.equal(fannedOut.length, activeNow, 'o fan-out cobre exatamente as Empresas ativas');
  console.log('Empresa inativa continua fora do fan-out da Competência ✔');

  /* `company` não tem cascade da firm (ver registry.ts): apagar na ordem, como no runbook
   * de expurgo. */
  await db.delete(company).where(eq(company.accountingFirmId, firmId));
  await db.delete(accountingFirm).where(eq(accountingFirm.id, firmId));

  console.log('\nTudo certo.');
}

await run();
process.exit(0);
