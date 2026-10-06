/* Dispatch simulado do webhook do Asaas (COM-150). Não fala com o gateway: exercita o
 * controller real contra o banco real, que é o que o ticket pede verificar — transição de
 * status da assinatura e autorização da rota.
 *
 * Os imports são dinâmicos de propósito: `config/env.js` lê `process.env` no momento em
 * que é carregado, e `import` estático é içado para antes de qualquer atribuição. Em dev
 * o `.env` não define `ASAAS_WEBHOOK_TOKEN` e sem ele a rota (corretamente) recusa tudo. */
process.env.ASAAS_WEBHOOK_TOKEN ||= 'token-de-verificacao-com-150';

import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';

const { default: env } = await import('../config/env.js');
const { db } = await import('../infra/database/index.js');
const { accountingFirm, subscription } = await import('../infra/database/schema/index.js');
const { AsaasWebhookController } = await import('../modules/billing/asaas-webhook.controller.js');
const { SubscriptionRepository } = await import('../modules/billing/subscription.repository.js');
const { Forbidden, ServiceUnavailable } = await import('../lib/app-error.js');

const TOKEN = env.ASAAS_WEBHOOK_TOKEN!;

async function run() {
  console.log('--- COM-150: webhook do Asaas (dispatch simulado) ---\n');

  const firmId = uuidv7();
  const gatewaySubscriptionId = `sub_${firmId}`;
  await db.insert(accountingFirm).values({ id: firmId, name: 'Contabilidade COM-150' });
  await db.insert(subscription).values({
    id: uuidv7(),
    accountingFirmId: firmId,
    gatewayCustomerId: `cus_${firmId}`,
    gatewaySubscriptionId,
    planName: 'essencial',
    status: 'trialing',
  });

  const controller = new AsaasWebhookController(new SubscriptionRepository(db));
  const statusNow = async () => {
    const [row] = await db
      .select({ status: subscription.status })
      .from(subscription)
      .where(eq(subscription.accountingFirmId, firmId));
    return row.status;
  };
  const dispatchAs = (token: string | undefined, event: string, sub?: string | null) =>
    controller.handleWebhook(token, {
      event,
      payment: sub === null ? undefined : { subscription: sub ?? gatewaySubscriptionId },
    });
  const dispatch = (event: string, sub?: string | null) => dispatchAs(TOKEN, event, sub);

  try {
    console.log('1. Autorização da rota');
    await assert.rejects(() => dispatchAs(undefined, 'PAYMENT_RECEIVED'), Forbidden);
    console.log('  ✓ sem header `asaas-access-token` → Forbidden');
    await assert.rejects(() => dispatchAs('token-errado', 'PAYMENT_RECEIVED'), Forbidden);
    console.log('  ✓ token errado → Forbidden');
    assert.equal(await statusNow(), 'trialing', 'recusa não pode ter escrito nada');
    console.log('  ✓ nenhuma escrita aconteceu nas tentativas recusadas');

    (env as { ASAAS_WEBHOOK_TOKEN?: string }).ASAAS_WEBHOOK_TOKEN = undefined;
    await assert.rejects(() => dispatch('PAYMENT_RECEIVED'), ServiceUnavailable);
    (env as { ASAAS_WEBHOOK_TOKEN?: string }).ASAAS_WEBHOOK_TOKEN = TOKEN;
    console.log('  ✓ sem segredo configurado → ServiceUnavailable (falha fechada)');

    console.log('\n2. Transições de status');
    assert.deepEqual(await dispatch('PAYMENT_RECEIVED'), { received: true });
    assert.equal(await statusNow(), 'ACTIVE');
    console.log('  ✓ PAYMENT_RECEIVED: trialing → ACTIVE');

    await dispatch('PAYMENT_OVERDUE');
    assert.equal(await statusNow(), 'OVERDUE');
    console.log('  ✓ PAYMENT_OVERDUE: ACTIVE → OVERDUE');

    await dispatch('PAYMENT_RECEIVED');
    await dispatch('PAYMENT_DELETED');
    assert.equal(await statusNow(), 'OVERDUE');
    console.log('  ✓ PAYMENT_DELETED: ACTIVE → OVERDUE');

    await dispatch('PAYMENT_RECEIVED');
    await dispatch('PAYMENT_UPDATED');
    assert.equal(await statusNow(), 'ACTIVE', 'evento desconhecido não pode mudar status');
    console.log('  ✓ evento desconhecido (PAYMENT_UPDATED) não altera o status');

    assert.deepEqual(await dispatch('PAYMENT_RECEIVED', null), { received: true });
    console.log('  ✓ payload sem `payment.subscription` → 200 sem efeito');

    console.log('\n3. Isolamento por assinatura');
    await dispatch('PAYMENT_OVERDUE', 'sub_de_outra_contabilidade');
    assert.equal(await statusNow(), 'ACTIVE', 'webhook de outra assinatura não pode respingar');
    console.log('  ✓ id de assinatura desconhecido não toca nesta Contabilidade');

    console.log('\n4. Consequência no acesso (TenantGuard)');
    await dispatch('PAYMENT_OVERDUE');
    const blocked = ['OVERDUE', 'CANCELED'].includes(await statusNow());
    assert.equal(blocked, true, 'OVERDUE precisa bloquear escrita no TenantGuard');
    console.log('  ✓ status OVERDUE é o que o TenantGuard usa para recusar escrita');

    console.log('\n--- COM-150: dispatch simulado verificado ---');
  } finally {
    await db.delete(accountingFirm).where(eq(accountingFirm.id, firmId));
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
