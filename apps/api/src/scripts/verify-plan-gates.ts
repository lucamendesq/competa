/* Os três gates do segundo eixo (D18 §3). Exercita o guard, a resolução de cadência do cron
 * e o cabeçalho de e-mail contra o banco real — o que quebra aqui é exatamente o que faria um
 * plano Essencial ganhar recurso de Profissional (ou o contrário) sem ninguém notar. */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { Reflector } from '@nestjs/core';
import { planGateMessage } from '@competa/contracts';

const { db } = await import('../infra/database/index.js');
const { accountingFirm, subscription } = await import('../infra/database/schema/index.js');
const { PlanGuard } = await import('../modules/auth/plan.guard.js');
const { REQUIRES_PLAN } = await import('../modules/auth/requires-plan.decorator.js');
const { PlanCapabilityRequired } = await import('../modules/auth/errors.js');
const { emailLayout } = await import('../modules/messaging/email-layout.js');
const { RequestRepository } = await import('../modules/requests/request.repository.js');
const { DEFAULT_REMINDER_SETTINGS } = await import('../modules/messaging/reminder-rules.js');

const contextFor = (capability: string | undefined, request: Record<string, unknown>) =>
  ({
    getHandler: () => 'handler',
    getClass: () => 'class',
    switchToHttp: () => ({ getRequest: () => request }),
  }) as never;

const guardFor = (capability: string | undefined) => {
  const reflector = {
    getAllAndOverride: (key: string) => (key === REQUIRES_PLAN ? capability : undefined),
  } as unknown as Reflector;

  return new PlanGuard(reflector);
};

const requestOn = (planName: string) => ({
  firmScope: 'firm-1',
  planName,
  method: 'GET',
  url: '/periods/abc/zip',
  route: { path: '/periods/:id/zip' },
});

function checkGuard() {
  console.log('1. Guard de capability');

  assert.equal(
    guardFor(undefined).canActivate(contextFor(undefined, requestOn('essencial'))),
    true,
    'rota sem @RequiresPlan passa em qualquer plano',
  );

  for (const plan of ['profissional', 'escritorio', 'trial']) {
    assert.equal(
      guardFor('periodZip').canActivate(contextFor('periodZip', requestOn(plan))),
      true,
      `${plan} deveria baixar o zip da competência`,
    );
  }

  assert.throws(
    () => guardFor('periodZip').canActivate(contextFor('periodZip', requestOn('essencial'))),
    (error: unknown) => {
      assert.ok(error instanceof PlanCapabilityRequired);
      assert.equal(error.status, 402);
      assert.deepEqual(error.details, { capability: 'periodZip', requiredPlan: 'profissional' });
      assert.equal(error.message, planGateMessage('periodZip'));
      return true;
    },
    'essencial deveria tomar 402 com capability e plano recomendado',
  );

  /* Plano desconhecido no banco não pode virar "tudo liberado" — e cair no trial seria
   * exatamente isso, porque o trial tem as três capabilities. */
  assert.throws(
    () => guardFor('periodZip').canActivate(contextFor('periodZip', requestOn('plano-fantasma'))),
    PlanCapabilityRequired,
    'plano desconhecido deveria negar',
  );

  console.log('  ✓ 402 só no Essencial, com capability e requiredPlan no corpo');
}

function checkEmailHeader() {
  console.log('\n2. Cabeçalho do e-mail');

  const logo = 'https://cdn.exemplo.com/logo.png';
  const branded = emailLayout('<p>oi</p>', 'Contabilidade Alfa', logo);

  assert.ok(branded.includes(`src="${logo}"`), 'o logo deveria entrar no src');
  assert.ok(
    branded.includes('alt="Contabilidade Alfa"'),
    'imagem bloqueada tem que mostrar o nome do escritório no alt',
  );

  const plain = emailLayout('<p>oi</p>', 'Contabilidade Alfa', null);
  assert.ok(!plain.includes('<img'), 'sem logo não pode sobrar imagem quebrada');
  assert.ok(plain.includes('Contabilidade Alfa'), 'sem logo o cabeçalho mostra o nome');

  for (const hostile of ['javascript:alert(1)', 'http://cdn.exemplo.com/logo.png']) {
    const out = emailLayout('<p>oi</p>', 'Alfa', hostile);
    assert.ok(!out.includes('<img'), `${hostile} não pode virar src de imagem`);
  }

  console.log('  ✓ logo só com https, alt com o nome do escritório, fallback sem <img>');
}

async function checkReminderCadence() {
  console.log('\n3. Cadência de lembretes (cron, sem guard HTTP)');

  const firms = { essencial: uuidv7(), profissional: uuidv7() };
  const custom = { reminderMax: 5, reminderDueSoonDays: 7, reminderGapDays: 1 };

  for (const [planName, id] of Object.entries(firms)) {
    await db.insert(accountingFirm).values({ id, name: `Cadência ${planName}`, ...custom });
    await db
      .insert(subscription)
      .values({ id: uuidv7(), accountingFirmId: id, planName, status: 'ACTIVE' });
  }

  const requests = new RequestRepository(db);
  const resolve = () => requests.reminderSettingsByFirm(Object.values(firms));

  let settings = await resolve();
  assert.deepEqual(
    settings.get(firms.essencial),
    DEFAULT_REMINDER_SETTINGS,
    'Essencial roda no padrão mesmo com valores gravados',
  );
  assert.deepEqual(settings.get(firms.profissional), custom, 'Profissional respeita os knobs');
  console.log('  ✓ Essencial ignora as colunas; Profissional aplica');

  /* Downgrade não pode zerar as colunas: subir de plano de novo restaura o que estava lá. */
  await db
    .update(subscription)
    .set({ planName: 'essencial' })
    .where(eq(subscription.accountingFirmId, firms.profissional));

  settings = await resolve();
  assert.deepEqual(settings.get(firms.profissional), DEFAULT_REMINDER_SETTINGS);

  await db
    .update(subscription)
    .set({ planName: 'profissional' })
    .where(eq(subscription.accountingFirmId, firms.profissional));

  settings = await resolve();
  assert.deepEqual(settings.get(firms.profissional), custom, 're-upgrade restaura os valores');
  console.log('  ✓ downgrade preserva as colunas e re-upgrade restaura');

  for (const id of Object.values(firms)) {
    await db.delete(accountingFirm).where(eq(accountingFirm.id, id));
  }
}

console.log('--- Gates de plano (segundo eixo da D18) ---\n');
checkGuard();
checkEmailHeader();
await checkReminderCadence();
console.log('\nTudo certo.');
process.exit(0);
