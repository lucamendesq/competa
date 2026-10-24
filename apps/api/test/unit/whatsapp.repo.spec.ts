import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountingFirm,
  company,
  message,
  period,
  request,
  whatsappIntegration,
} from '../../src/infra/database/schema/index.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';
import { WhatsappRepo } from '../../src/modules/whatsapp/whatsapp.repo.js';

let seq = 0;
const next = () => ++seq;

const seedFirm = (label: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name: `Contabilidade ${label} ${next()}` })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedIntegration = (
  firmId: string,
  overrides: { phoneNumberId?: string; accessToken?: string; status?: string } = {},
) =>
  Effect.promise(async () => {
    const tag = next();
    const [row] = await db
      .insert(whatsappIntegration)
      .values({
        accountingFirmId: firmId,
        wabaId: `waba-${tag}`,
        phoneNumberId: overrides.phoneNumberId ?? `phone-${tag}`,
        displayPhoneNumber: `55119000000${tag % 10}`,
        accessToken: overrides.accessToken ?? `token-${tag}`,
        status: overrides.status ?? 'active',
      })
      .returning({ id: whatsappIntegration.id });

    return row.id;
  });

/** Caminho do join de `getIntegrationByRequestId`: request → period → firm. */
const seedRequest = (firmId: string) =>
  Effect.promise(async () => {
    const tag = next();

    const [companyRow] = await db
      .insert(company)
      .values({ accountingFirmId: firmId, name: `Empresa ${tag}` })
      .returning({ id: company.id });

    const [periodRow] = await db
      .insert(period)
      .values({
        accountingFirmId: firmId,
        referenceMonth: `20${20 + (tag % 50)}-0${1 + (tag % 9)}-01`,
        dueDate: '2030-05-10',
      })
      .returning({ id: period.id });

    const [requestRow] = await db
      .insert(request)
      .values({ periodId: periodRow.id, companyId: companyRow.id })
      .returning({ id: request.id });

    return requestRow.id;
  });

const seedMessage = (requestId: string, metaMessageId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(message)
      .values({
        requestId,
        channel: 'whatsapp',
        purpose: 'link_delivery',
        recipient: '5511999999999',
        status: 'sent',
        metaMessageId,
      })
      .returning({ id: message.id });

    return row.id;
  });

const messageRow = (messageId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select({
        status: message.status,
        error: message.error,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt,
      })
      .from(message)
      .where(eq(message.id, messageId))
      .limit(1);

    return row;
  });

const integrationRow = (firmId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select()
      .from(whatsappIntegration)
      .where(eq(whatsappIntegration.accountingFirmId, firmId))
      .limit(1);

    return row;
  });

layer(WhatsappRepo.layer)('WhatsappRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('getIntegrationByFirm: devolve a integração da firma e undefined sem integração', () =>
    Effect.gen(function* () {
      const repo = yield* WhatsappRepo;
      const connected = yield* seedFirm('status');
      const bare = yield* seedFirm('semwhats');
      yield* seedIntegration(connected, { phoneNumberId: 'phone-status' });

      const found = yield* repo.getIntegrationByFirm(connected);
      expect(found).toMatchObject({
        accountingFirmId: connected,
        phoneNumberId: 'phone-status',
        status: 'active',
      });

      expect(yield* repo.getIntegrationByFirm(bare)).toBeUndefined();
    }),
  );

  it.effect('getIntegrationByRequestId: chega na integração pelo caminho da Solicitação', () =>
    Effect.gen(function* () {
      const repo = yield* WhatsappRepo;
      const firm = yield* seedFirm('porrequest');
      yield* seedIntegration(firm, { accessToken: 'cipher-request', phoneNumberId: 'phone-req' });
      const requestId = yield* seedRequest(firm);

      expect(yield* repo.getIntegrationByRequestId(requestId)).toEqual({
        accessToken: 'cipher-request',
        phoneNumberId: 'phone-req',
        status: 'active',
      });

      const orphan = yield* seedFirm('requestsemwhats');
      const orphanRequest = yield* seedRequest(orphan);
      expect(yield* repo.getIntegrationByRequestId(orphanRequest)).toBeUndefined();
      expect(
        yield* repo.getIntegrationByRequestId('00000000-0000-7000-8000-000000000000'),
      ).toBeUndefined();
    }),
  );

  it.effect('upsertIntegration: insere na primeira vez e sobrescreve reativando na segunda', () =>
    Effect.gen(function* () {
      const repo = yield* WhatsappRepo;
      const firm = yield* seedFirm('upsert');

      yield* repo.upsertIntegration(firm, {
        wabaId: 'waba-primeiro',
        phoneNumberId: 'phone-primeiro',
        displayPhoneNumber: '5511911111111',
        accessToken: 'cipher-primeiro',
      });
      expect(yield* integrationRow(firm)).toMatchObject({
        wabaId: 'waba-primeiro',
        accessToken: 'cipher-primeiro',
        status: 'active',
      });

      yield* Effect.promise(async () => {
        await db
          .update(whatsappIntegration)
          .set({ status: 'disabled' })
          .where(eq(whatsappIntegration.accountingFirmId, firm));
      });

      yield* repo.upsertIntegration(firm, {
        wabaId: 'waba-segundo',
        phoneNumberId: 'phone-segundo',
        displayPhoneNumber: '5511922222222',
        accessToken: 'cipher-segundo',
      });
      expect(yield* integrationRow(firm)).toMatchObject({
        wabaId: 'waba-segundo',
        phoneNumberId: 'phone-segundo',
        displayPhoneNumber: '5511922222222',
        accessToken: 'cipher-segundo',
        status: 'active',
      });
    }),
  );

  it.effect('deleteIntegration: apaga a linha da firma e é no-op sem integração', () =>
    Effect.gen(function* () {
      const repo = yield* WhatsappRepo;
      const firm = yield* seedFirm('delete');
      const other = yield* seedFirm('deleteoutra');
      yield* seedIntegration(firm);
      yield* seedIntegration(other);

      yield* repo.deleteIntegration(firm);
      expect(yield* integrationRow(firm)).toBeUndefined();
      expect(yield* integrationRow(other)).toBeDefined();

      yield* repo.deleteIntegration(firm);
      expect(yield* integrationRow(firm)).toBeUndefined();
    }),
  );

  it.effect('getIntegrationByTenantId: mesma linha pelo id cru do tenant', () =>
    Effect.gen(function* () {
      const repo = yield* WhatsappRepo;
      const firm = yield* seedFirm('tenant');
      yield* seedIntegration(firm, { accessToken: 'cipher-tenant', status: 'pending_phone' });

      expect(yield* repo.getIntegrationByTenantId(firm)).toMatchObject({
        accountingFirmId: firm,
        accessToken: 'cipher-tenant',
        status: 'pending_phone',
      });

      expect(
        yield* repo.getIntegrationByTenantId('00000000-0000-7000-8000-000000000000'),
      ).toBeUndefined();
    }),
  );

  it.effect(
    'updateMessageDeliveryStatus: carimba entrega, leitura e falha por meta_message_id',
    () =>
      Effect.gen(function* () {
        const repo = yield* WhatsappRepo;
        const firm = yield* seedFirm('entrega');
        const requestId = yield* seedRequest(firm);
        const delivered = yield* seedMessage(requestId, 'meta-delivered');
        const read = yield* seedMessage(requestId, 'meta-read');
        const failed = yield* seedMessage(requestId, 'meta-failed');
        const silent = yield* seedMessage(requestId, 'meta-silent');
        const at = new Date('2026-03-04T05:06:07.000Z');

        yield* repo.updateMessageDeliveryStatus('meta-delivered', {
          status: 'delivered',
          date: at,
        });
        expect(yield* messageRow(delivered)).toMatchObject({
          status: 'sent',
          deliveredAt: at,
          readAt: null,
        });

        yield* repo.updateMessageDeliveryStatus('meta-read', { status: 'read', date: at });
        expect(yield* messageRow(read)).toMatchObject({
          status: 'sent',
          deliveredAt: null,
          readAt: at,
        });

        yield* repo.updateMessageDeliveryStatus('meta-failed', { status: 'failed' });
        expect(yield* messageRow(failed)).toMatchObject({
          status: 'failed',
          error: 'Unknown error',
        });

        yield* repo.updateMessageDeliveryStatus('meta-failed', {
          status: 'failed',
          error: 'Numero invalido',
        });
        expect(yield* messageRow(failed)).toMatchObject({ error: 'Numero invalido' });

        expect(yield* messageRow(silent)).toMatchObject({
          status: 'sent',
          error: null,
          deliveredAt: null,
          readAt: null,
        });
      }),
  );
});
