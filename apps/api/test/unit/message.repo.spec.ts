import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { and, eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountingFirm,
  company,
  contact,
  document,
  message,
  period,
  pushSubscription,
  request,
  requestItem,
  subscription,
  uploadLink,
} from '../../src/infra/database/schema/index.js';
import { toContactScope, toFirmScope, toUploadScope } from '../../src/modules/auth/scope.js';
import { MessagesRepo, type MessagePurpose } from '../../src/modules/messaging/message.repo.js';
import {
  MessageProvider,
  type MessageToSend,
} from '../../src/modules/messaging/providers/message.provider.js';
import { InvalidTransition } from '../../src/modules/requests/errors.js';

let seq = 0;
const next = () => ++seq;

const GHOST_ID = '00000000-0000-7000-8000-0000000000ff';

/** Captura o payload que chegaria ao canal — o único jeito de observar remetente e logo,
 *  que `brandOf` resolve dentro do `deliver`. */
class RecordingProvider extends MessageProvider {
  readonly received: MessageToSend[] = [];

  async send(payload: MessageToSend) {
    this.received.push(payload);
    return `meta-${this.received.length}`;
  }
}

class FailingProvider extends MessageProvider {
  override readonly channel: string;

  constructor(channel = 'email') {
    super();
    this.channel = channel;
  }

  async send(): Promise<never> {
    throw new Error('canal fora do ar');
  }
}

type BoxOptions = {
  requestStatus?: string;
  planName?: string;
  logoUrl?: string;
  linkExpiresAt?: Date;
};

const openBox = (label: string, opts: BoxOptions = {}) =>
  Effect.promise(async () => {
    const tag = next();

    const [firm] = await db
      .insert(accountingFirm)
      .values({ name: `Firma ${label} ${tag}`, logoUrl: opts.logoUrl ?? null })
      .returning({ id: accountingFirm.id });

    await db
      .insert(subscription)
      .values({ accountingFirmId: firm.id, planName: opts.planName ?? 'trial' });

    const [companyRow] = await db
      .insert(company)
      .values({ accountingFirmId: firm.id, name: `Empresa ${label} ${tag}` })
      .returning({ id: company.id });

    const contactEmail = `owner-${label}-${tag}@example.com`;
    const [contactRow] = await db
      .insert(contact)
      .values({ companyId: companyRow.id, name: `Resp ${label} ${tag}`, email: contactEmail })
      .returning({ id: contact.id });

    const [periodRow] = await db
      .insert(period)
      .values({
        accountingFirmId: firm.id,
        referenceMonth: '2031-07-01',
        dueDate: '2031-08-10',
      })
      .returning({ id: period.id });

    const [requestRow] = await db
      .insert(request)
      .values({
        periodId: periodRow.id,
        companyId: companyRow.id,
        status: opts.requestStatus ?? 'open',
      })
      .returning({ id: request.id });

    const linkExpiresAt = opts.linkExpiresAt ?? new Date('2031-09-01T00:00:00Z');
    await db.insert(uploadLink).values({
      requestId: requestRow.id,
      contactId: contactRow.id,
      tokenHash: `hash-${label}-${tag}`,
      expiresAt: linkExpiresAt,
    });

    return {
      tag,
      firmId: toFirmScope(firm.id),
      companyId: companyRow.id,
      contactId: contactRow.id,
      contactEmail,
      periodId: periodRow.id,
      requestId: requestRow.id,
      linkExpiresAt,
      contactScope: toContactScope([{ contactId: contactRow.id, companyId: companyRow.id }]),
      uploadScope: toUploadScope(requestRow.id, contactRow.id),
    };
  });

const seedItem = (requestId: string, name: string, status = 'pending') =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(requestItem)
      .values({ requestId, name, status, acceptedFormats: ['pdf'] })
      .returning({ id: requestItem.id });

    return row.id;
  });

const seedMessage = (
  requestId: string,
  values: {
    channel?: string;
    purpose: MessagePurpose;
    recipient: string;
    status?: string;
    error?: string;
  },
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(message)
      .values({
        requestId,
        channel: values.channel ?? 'email',
        purpose: values.purpose,
        recipient: values.recipient,
        status: values.status ?? 'sent',
        error: values.error,
      })
      .returning({ id: message.id });

    return row.id;
  });

const seedSubscriptionRow = (contactId: string, endpoint: string, expiresAt: Date | null = null) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(pushSubscription)
      .values({ contactId, endpoint, keys: { p256dh: endpoint, auth: endpoint }, expiresAt })
      .returning({ id: pushSubscription.id });

    return row.id;
  });

const messageRows = (requestId: string) =>
  Effect.promise(async () =>
    db
      .select({
        id: message.id,
        channel: message.channel,
        purpose: message.purpose,
        recipient: message.recipient,
        status: message.status,
        error: message.error,
        metaMessageId: message.metaMessageId,
      })
      .from(message)
      .where(eq(message.requestId, requestId)),
  );

const subscriptionRows = (contactId: string) =>
  Effect.promise(async () =>
    db
      .select({ endpoint: pushSubscription.endpoint, expiresAt: pushSubscription.expiresAt })
      .from(pushSubscription)
      .where(eq(pushSubscription.contactId, contactId)),
  );

layer(MessagesRepo.layer)('MessagesRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('savePushSubscription: sessão não expira, Link de Upload herda a validade', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('savepush');

      const fromSession = yield* repo.savePushSubscription(box.contactScope, {
        endpoint: `https://push.example.com/session-${box.tag}`,
        keys: { p256dh: 'first', auth: 'first' },
      });
      expect(fromSession.endpoint).toBe(`https://push.example.com/session-${box.tag}`);

      yield* repo.savePushSubscription(box.uploadScope, {
        endpoint: `https://push.example.com/link-${box.tag}`,
        keys: { p256dh: 'second', auth: 'second' },
      });

      const rows = yield* subscriptionRows(box.contactId);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.endpoint.includes('session'))!.expiresAt).toBeNull();
      expect(rows.find((row) => row.endpoint.includes('link'))!.expiresAt?.toISOString()).toBe(
        box.linkExpiresAt.toISOString(),
      );
    }),
  );

  it.effect('savePushSubscription: o mesmo endpoint atualiza as chaves em vez de duplicar', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('upsertpush');
      const endpoint = `https://push.example.com/upsert-${box.tag}`;

      yield* repo.savePushSubscription(box.contactScope, {
        endpoint,
        keys: { p256dh: 'old', auth: 'old' },
      });
      yield* repo.savePushSubscription(box.contactScope, {
        endpoint,
        keys: { p256dh: 'new', auth: 'new' },
      });

      const rows = yield* Effect.promise(async () =>
        db
          .select({ keys: pushSubscription.keys })
          .from(pushSubscription)
          .where(eq(pushSubscription.contactId, box.contactId)),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].keys).toEqual({ p256dh: 'new', auth: 'new' });
    }),
  );

  it.effect('deletePushSubscription: só o endpoint do escopo; alheio devolve undefined', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('delpush');
      const endpoint = `https://push.example.com/drop-${box.tag}`;
      yield* seedSubscriptionRow(box.contactId, endpoint);

      const removed = yield* repo.deletePushSubscription(box.contactScope, endpoint);
      expect(removed).toBeDefined();
      expect(yield* subscriptionRows(box.contactId)).toEqual([]);

      const again = yield* repo.deletePushSubscription(box.contactScope, endpoint);
      expect(again).toBeUndefined();
    }),
  );

  it.effect('deletePushSubscriptionByEndpoint: apaga o endpoint de todos os contatos', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('delendpoint');
      const endpoint = `https://push.example.com/gone-${box.tag}`;
      const [other] = yield* Effect.promise(async () =>
        db
          .insert(contact)
          .values({
            companyId: box.companyId,
            name: `Segundo ${box.tag}`,
            email: `second-${box.tag}@example.com`,
          })
          .returning({ id: contact.id }),
      );
      yield* seedSubscriptionRow(box.contactId, endpoint);
      yield* seedSubscriptionRow(other.id, endpoint);

      yield* repo.deletePushSubscriptionByEndpoint(endpoint);

      expect(yield* subscriptionRows(box.contactId)).toEqual([]);
      expect(yield* subscriptionRows(other.id)).toEqual([]);
    }),
  );

  it.effect('subscriptionsForRequest: um por endpoint e sem as inscrições vencidas', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('subsrequest');
      const shared = `https://push.example.com/shared-${box.tag}`;
      const [twin] = yield* Effect.promise(async () =>
        db
          .insert(contact)
          .values({
            companyId: box.companyId,
            name: `Gemeo ${box.tag}`,
            email: `twin-${box.tag}@example.com`,
          })
          .returning({ id: contact.id }),
      );
      yield* seedSubscriptionRow(box.contactId, shared);
      yield* seedSubscriptionRow(twin.id, shared);
      yield* seedSubscriptionRow(
        box.contactId,
        `https://push.example.com/expired-${box.tag}`,
        new Date('2020-01-01T00:00:00Z'),
      );

      const found = yield* repo.subscriptionsForRequest(box.requestId);
      expect(found.map((row) => row.endpoint)).toEqual([shared]);
    }),
  );

  it.effect('sendWithoutLog: entrega pelo provedor do ambiente e não grava linha', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('withoutlog');

      const delivered = yield* repo.sendWithoutLog({
        recipient: box.contactEmail,
        subject: `Convite ${box.tag}`,
        body: `<a href="https://app.example.com/convite/${box.tag}">abrir</a>`,
      });

      expect(delivered).toBe(true);
      expect(yield* messageRows(box.requestId)).toEqual([]);
    }),
  );

  it.effect('deliverPush: grava queued e carimba sent com o resultado do canal', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('deliverpush');

      const result = yield* repo.deliverPush(
        box.requestId,
        'reminder',
        `https://push.example.com/ok-${box.tag}`,
        async () => ({ sent: 2, failed: 0, gone: [] as string[] }),
      );

      expect(result).toEqual({ sent: 2, failed: 0, gone: [] });
      const rows = yield* messageRows(box.requestId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ channel: 'push', purpose: 'reminder', status: 'sent' });
    }),
  );

  it.effect(
    'deliverPush: nenhuma inscrição aceita vira failed; canal que lança devolve undefined',
    () =>
      Effect.gen(function* () {
        const repo = yield* MessagesRepo;
        const box = yield* openBox('pushfail');

        const refused = yield* repo.deliverPush(
          box.requestId,
          'rejection',
          `https://push.example.com/refused-${box.tag}`,
          async () => ({ sent: 0, failed: 3, gone: [] as string[] }),
        );
        expect(refused).toEqual({ sent: 0, failed: 3, gone: [] });

        const broken = yield* repo.deliverPush(
          box.requestId,
          'rejection',
          `https://push.example.com/broken-${box.tag}`,
          async () => {
            throw new Error('canal de push caiu');
          },
        );
        expect(broken).toBeUndefined();

        const rows = yield* messageRows(box.requestId);
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.status).sort()).toEqual(['failed', 'failed']);
        expect(rows.find((row) => row.error === 'canal de push caiu')).toBeDefined();
        expect(
          rows.find((row) => row.error === 'nenhuma inscrição aceitou (3 falhas)'),
        ).toBeDefined();
      }),
  );

  it.effect('deliver: registra o envio e leva remetente e logo do plano com branding', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('deliverbrand', {
        planName: 'escritorio',
        logoUrl: 'https://cdn.example.com/logo-brand.png',
      });
      const channel = new RecordingProvider();

      const delivered = yield* repo.deliver({
        requestId: box.requestId,
        purpose: 'link_delivery',
        recipient: box.contactEmail,
        subject: `Documentos ${box.tag}`,
        body: 'corpo do email',
        provider: channel,
      });

      expect(delivered).toBe(true);
      expect(channel.received).toHaveLength(1);
      expect(channel.received[0]).toMatchObject({
        recipient: box.contactEmail,
        senderName: `Firma deliverbrand ${box.tag}`,
        brandLogoUrl: 'https://cdn.example.com/logo-brand.png',
      });

      const rows = yield* messageRows(box.requestId);
      expect(rows[0]).toMatchObject({ status: 'sent', channel: 'email', metaMessageId: 'meta-1' });
    }),
  );

  it.effect('deliver: plano sem a capability branding não leva o logo', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('deliverplain', {
        planName: 'essencial',
        logoUrl: 'https://cdn.example.com/logo-plain.png',
      });
      const channel = new RecordingProvider();

      yield* repo.deliver({
        requestId: box.requestId,
        purpose: 'reminder',
        recipient: box.contactEmail,
        subject: `Lembrete ${box.tag}`,
        body: 'corpo do lembrete',
        provider: channel,
      });

      expect(channel.received[0].brandLogoUrl).toBeNull();
      expect(channel.received[0].senderName).toBe(`Firma deliverplain ${box.tag}`);
    }),
  );

  it.effect('deliver: canal que lança grava failed e degrada para o canal de reserva', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('deliverfallback');
      const backup = new RecordingProvider();

      const delivered = yield* repo.deliver({
        requestId: box.requestId,
        purpose: 'deadline_missed',
        recipient: `+5511${900000000 + box.tag}`,
        subject: `Prazo ${box.tag}`,
        body: 'corpo do aviso',
        provider: new FailingProvider('whatsapp'),
        fallbackProvider: backup,
      });

      expect(delivered).toBe(true);
      // o destinatário de reserva sai do Link de Upload, não do payload
      expect(backup.received[0].recipient).toBe(box.contactEmail);

      const rows = yield* messageRows(box.requestId);
      expect(rows).toHaveLength(2);
      expect(rows.find((row) => row.channel === 'whatsapp')).toMatchObject({
        status: 'failed',
        error: 'canal fora do ar',
      });
      expect(rows.find((row) => row.channel === 'email')).toMatchObject({ status: 'sent' });
    }),
  );

  it.effect('deliver: sem canal de reserva o envio falhado devolve false', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('deliverdead');

      const delivered = yield* repo.deliver({
        requestId: box.requestId,
        purpose: 'completion',
        recipient: box.contactEmail,
        subject: `Conclusao ${box.tag}`,
        body: 'corpo da conclusao',
        provider: new FailingProvider(),
      });

      expect(delivered).toBe(false);
      expect(yield* messageRows(box.requestId)).toMatchObject([{ status: 'failed' }]);
    }),
  );

  it.effect('list: filtra por canal e propósito, pagina e devolve o total', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('listmsg');
      yield* seedMessage(box.requestId, { purpose: 'link_delivery', recipient: box.contactEmail });
      yield* seedMessage(box.requestId, { purpose: 'reminder', recipient: box.contactEmail });
      yield* seedMessage(box.requestId, {
        channel: 'push',
        purpose: 'reminder',
        recipient: `https://push.example.com/list-${box.tag}`,
      });

      const all = yield* repo.list(box.firmId, { page: 1, perPage: 10 });
      expect(all.total).toBe(3);
      expect(all.rows).toHaveLength(3);
      expect(all.rows[0].companyName).toBe(`Empresa listmsg ${box.tag}`);

      const reminders = yield* repo.list(box.firmId, {
        page: 1,
        perPage: 10,
        purpose: 'reminder',
      });
      expect(reminders.total).toBe(2);

      const push = yield* repo.list(box.firmId, { page: 1, perPage: 10, channel: 'push' });
      expect(push.rows).toHaveLength(1);

      const firstPage = yield* repo.list(box.firmId, { page: 1, perPage: 2 });
      const secondPage = yield* repo.list(box.firmId, { page: 2, perPage: 2 });
      expect(firstPage.rows).toHaveLength(2);
      expect(secondPage.rows).toHaveLength(1);
      expect(secondPage.total).toBe(3);
    }),
  );

  it.effect('list: a mensagem de outra Contabilidade some mesmo apontando os ids', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const mine = yield* openBox('listmine');
      const theirs = yield* openBox('listtheirs');
      yield* seedMessage(theirs.requestId, {
        purpose: 'link_delivery',
        recipient: theirs.contactEmail,
      });

      const leaked = yield* repo.list(mine.firmId, {
        page: 1,
        perPage: 10,
        requestId: theirs.requestId,
      });
      expect(leaked).toEqual({ rows: [], total: 0 });
    }),
  );

  it.effect('resend: id desconhecido devolve undefined e purpose=resend não tem branch', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('resendnone');

      expect(yield* repo.resend(box.firmId, GHOST_ID)).toBeUndefined();

      const orphanId = yield* seedMessage(box.requestId, {
        purpose: 'resend',
        recipient: box.contactEmail,
      });
      expect(yield* repo.resend(box.firmId, orphanId)).toEqual({ sent: false });
      expect(yield* messageRows(box.requestId)).toHaveLength(1);
    }),
  );

  it.effect('resend: link_delivery reenvia por email sem olhar o status da mensagem', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('resendlink');
      const sentId = yield* seedMessage(box.requestId, {
        purpose: 'link_delivery',
        recipient: box.contactEmail,
        status: 'sent',
      });

      expect(yield* repo.resend(box.firmId, sentId)).toEqual({ sent: true });

      const rows = yield* messageRows(box.requestId);
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.status === 'sent')).toHaveLength(2);
    }),
  );

  it.effect('resend: reminder, rejection e deadline_missed geram uma entrega cada', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('resendkinds');
      const itemId = yield* seedItem(box.requestId, `Balancete ${box.tag}`, 'rejected');
      yield* Effect.promise(async () => {
        await db.insert(document).values({
          requestId: box.requestId,
          requestItemId: itemId,
          storageKey: `unit-msg/${box.requestId}/recusado.pdf`,
          fileName: 'recusado.pdf',
          contentType: 'application/pdf',
          sizeBytes: 64,
          uploadStatus: 'uploaded',
          reviewStatus: 'rejected',
          rejectionReason: 'Pagina ilegivel',
        });
      });

      const reminderId = yield* seedMessage(box.requestId, {
        purpose: 'reminder',
        recipient: box.contactEmail,
      });
      const rejectionId = yield* seedMessage(box.requestId, {
        purpose: 'rejection',
        recipient: box.contactEmail,
      });
      const deadlineId = yield* seedMessage(box.requestId, {
        purpose: 'deadline_missed',
        recipient: box.contactEmail,
      });

      expect(yield* repo.resend(box.firmId, reminderId)).toEqual({ sent: true });
      expect(yield* repo.resend(box.firmId, rejectionId)).toEqual({ sent: true });
      expect(yield* repo.resend(box.firmId, deadlineId)).toEqual({ sent: true });

      const rows = yield* messageRows(box.requestId);
      expect(rows).toHaveLength(6);
      expect(rows.filter((row) => row.purpose === 'reminder')).toHaveLength(2);
      expect(rows.filter((row) => row.purpose === 'rejection')).toHaveLength(2);
      expect(rows.filter((row) => row.purpose === 'deadline_missed')).toHaveLength(2);
    }),
  );

  it.effect('resend: Solicitação encerrada barra o link (409) mas deixa completion passar', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('resendclosed', { requestStatus: 'closed' });
      const linkId = yield* seedMessage(box.requestId, {
        purpose: 'link_delivery',
        recipient: box.contactEmail,
      });
      const completionId = yield* seedMessage(box.requestId, {
        purpose: 'completion',
        recipient: box.contactEmail,
      });

      const refused = yield* repo.resend(box.firmId, linkId).pipe(Effect.flip);
      expect(refused).toBeInstanceOf(InvalidTransition);

      expect(yield* repo.resend(box.firmId, completionId)).toEqual({ sent: true });
    }),
  );

  it.effect('resend: push sem inscrição devolve { sent: false } ANTES do 409 da encerrada', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('resendpushdead', { requestStatus: 'closed' });
      const pushId = yield* seedMessage(box.requestId, {
        channel: 'push',
        purpose: 'reminder',
        recipient: `https://push.example.com/dead-${box.tag}`,
      });

      expect(yield* repo.resend(box.firmId, pushId)).toEqual({ sent: false });
      expect(yield* messageRows(box.requestId)).toHaveLength(1);
    }),
  );

  it.effect('resend: push com inscrição entrega e grava a linha mirando o endpoint', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('resendpushok');
      const endpoint = `https://push.example.com/live-${box.tag}`;
      yield* seedSubscriptionRow(box.contactId, endpoint);
      const pushId = yield* seedMessage(box.requestId, {
        channel: 'push',
        purpose: 'link_delivery',
        recipient: endpoint,
      });

      expect(yield* repo.resend(box.firmId, pushId)).toEqual({ sent: true });

      const rows = yield* messageRows(box.requestId);
      expect(rows).toHaveLength(2);
      expect(rows.filter((row) => row.channel === 'push' && row.status === 'sent')).toHaveLength(2);
      expect(rows.every((row) => row.recipient === endpoint)).toBe(true);
    }),
  );

  it.effect('failuresByPeriod: só as falhas da competência; período desconhecido devolve []', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('failures');
      yield* seedMessage(box.requestId, {
        purpose: 'reminder',
        recipient: box.contactEmail,
        status: 'failed',
        error: 'caixa postal cheia',
      });
      yield* seedMessage(box.requestId, { purpose: 'reminder', recipient: box.contactEmail });

      const failures = yield* repo.failuresByPeriod(box.firmId, box.periodId);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({
        requestId: box.requestId,
        error: 'caixa postal cheia',
      });

      expect(yield* repo.failuresByPeriod(box.firmId, GHOST_ID)).toEqual([]);
    }),
  );

  it.effect('reminderSettingsByFirm: devolve os knobs crus e mapa vazio sem ids', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('knobs');
      yield* Effect.promise(async () => {
        await db
          .update(accountingFirm)
          .set({ reminderMax: 4, reminderDueSoonDays: 6, reminderGapDays: 2 })
          .where(eq(accountingFirm.id, box.firmId));
      });

      const settings = yield* repo.reminderSettingsByFirm([box.firmId]);
      expect(settings.get(box.firmId)).toEqual({
        reminderMax: 4,
        reminderDueSoonDays: 6,
        reminderGapDays: 2,
      });

      expect((yield* repo.reminderSettingsByFirm([])).size).toBe(0);
    }),
  );

  it.effect('reminderCandidates: agrupa pendências por Solicitação e respeita o escopo', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const mine = yield* openBox('candidates');
      const theirs = yield* openBox('candidatesalheia');
      yield* seedItem(mine.requestId, `Extrato ${mine.tag}`);
      yield* seedItem(mine.requestId, `Nota ${mine.tag}`, 'rejected');
      yield* seedItem(mine.requestId, `Aceito ${mine.tag}`, 'accepted');
      yield* seedItem(theirs.requestId, `Extrato ${theirs.tag}`);
      yield* seedMessage(mine.requestId, {
        purpose: 'reminder',
        recipient: mine.contactEmail,
        status: 'sent',
      });
      yield* seedMessage(mine.requestId, {
        purpose: 'reminder',
        recipient: mine.contactEmail,
        status: 'failed',
      });

      const scoped = yield* repo.reminderCandidates(mine.firmId);
      expect(scoped).toHaveLength(1);
      expect(scoped[0]).toMatchObject({
        requestId: mine.requestId,
        accountingFirmId: mine.firmId,
        contactEmail: mine.contactEmail,
        reminderCount: 1,
      });
      expect(scoped[0].pendingItems.map((row) => row.name).sort()).toEqual(
        [`Extrato ${mine.tag}`, `Nota ${mine.tag}`].sort(),
      );

      const global = yield* repo.reminderCandidates();
      expect(global.map((row) => row.requestId)).toContain(theirs.requestId);
    }),
  );

  it.effect('reminderCandidates: Solicitação encerrada e sem Link de Upload ficam de fora', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const closed = yield* openBox('candclosed', { requestStatus: 'closed' });
      yield* seedItem(closed.requestId, `Pendente ${closed.tag}`);

      const linkless = yield* openBox('candlinkless');
      yield* seedItem(linkless.requestId, `Pendente ${linkless.tag}`);
      yield* Effect.promise(async () => {
        await db.delete(uploadLink).where(eq(uploadLink.requestId, linkless.requestId));
      });

      expect(yield* repo.reminderCandidates(closed.firmId)).toEqual([]);
      expect(yield* repo.reminderCandidates(linkless.firmId)).toEqual([]);
    }),
  );

  it.effect('reminderCandidates: competência fechada não entra na varredura', () =>
    Effect.gen(function* () {
      const repo = yield* MessagesRepo;
      const box = yield* openBox('candperiod');
      yield* seedItem(box.requestId, `Pendente ${box.tag}`);
      yield* Effect.promise(async () => {
        await db
          .update(period)
          .set({ status: 'closed' })
          .where(and(eq(period.id, box.periodId), eq(period.accountingFirmId, box.firmId)));
      });

      expect(yield* repo.reminderCandidates(box.firmId)).toEqual([]);
    }),
  );
});
