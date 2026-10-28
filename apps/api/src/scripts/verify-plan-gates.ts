/* Os três gates do segundo eixo (D18 §3). Exercita o guard, a resolução de cadência do cron
 * e o cabeçalho de e-mail contra o banco real — o que quebra aqui é exatamente o que faria um
 * plano Essencial ganhar recurso de Profissional (ou o contrário) sem ninguém notar. */
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { planAllows, planGateMessage, type PlanCapability } from '@competa/contracts';

const { db } = await import('../infra/database/index.js');
const { accountingFirm, subscription } = await import('../infra/database/schema/index.js');
const { PlanCapabilityRequired } = await import('../modules/auth/errors.js');
const { emailLayout } = await import('../modules/messaging/email-layout.js');
const { RequestsRepo } = await import('../modules/requests/request.repo.js');
const { run } = await import('../effect/runtime.js');
const { DEFAULT_REMINDER_SETTINGS } = await import('../modules/messaging/reminder-rules.js');

/* O mesmo teste do `resolveFirm` em `src/http/middleware/auth.ts`: rota sem capability
 * passa, e a que exige uma só passa se `planAllows` deixar. */
const gate = (requires: PlanCapability | undefined, planName: string) => {
  if (requires !== undefined && !planAllows(planName, requires)) {
    throw new PlanCapabilityRequired(requires);
  }
  return true;
};

function checkGuard() {
  console.log('1. Gate de capability');

  assert.equal(gate(undefined, 'essencial'), true, 'rota sem capability passa em qualquer plano');

  for (const plan of ['profissional', 'escritorio', 'trial']) {
    assert.equal(gate('periodZip', plan), true, `${plan} deveria baixar o zip da competência`);
  }

  assert.throws(
    () => gate('periodZip', 'essencial'),
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
    () => gate('periodZip', 'plano-fantasma'),
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

  const resolve = () =>
    run(RequestsRepo.use((repo) => repo.reminderSettingsByFirm(Object.values(firms))));

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
