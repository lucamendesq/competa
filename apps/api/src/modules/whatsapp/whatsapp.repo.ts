import { Context, Effect, Layer } from 'effect';
import { eq } from 'drizzle-orm';
import { Db } from '../../infra/database/effect.js';
import {
  whatsappIntegration,
  accountingFirm,
  period,
  request,
  message,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';

const make = Effect.gen(function* () {
  const db = yield* Db;

  const getIntegrationByFirm = Effect.fn('WhatsappRepo.getIntegrationByFirm')(function* (
    scope: FirmScope,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select()
        .from(whatsappIntegration)
        .where(eq(whatsappIntegration.accountingFirmId, scope))
        .limit(1),
    );

    return row;
  });

  const getIntegrationByRequestId = Effect.fn('WhatsappRepo.getIntegrationByRequestId')(function* (
    requestId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({
          accessToken: whatsappIntegration.accessToken,
          phoneNumberId: whatsappIntegration.phoneNumberId,
          status: whatsappIntegration.status,
        })
        .from(whatsappIntegration)
        .innerJoin(accountingFirm, eq(accountingFirm.id, whatsappIntegration.accountingFirmId))
        .innerJoin(period, eq(period.accountingFirmId, accountingFirm.id))
        .innerJoin(request, eq(request.periodId, period.id))
        .where(eq(request.id, requestId))
        .limit(1),
    );

    return row;
  });

  const upsertIntegration = Effect.fn('WhatsappRepo.upsertIntegration')(function* (
    scope: FirmScope,
    data: {
      wabaId: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
      accessToken: string;
    },
  ) {
    yield* db.use((d) =>
      d
        .insert(whatsappIntegration)
        .values({
          accountingFirmId: scope,
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
          displayPhoneNumber: data.displayPhoneNumber,
          accessToken: data.accessToken,
          status: 'active',
        })
        .onConflictDoUpdate({
          target: whatsappIntegration.accountingFirmId,
          set: {
            wabaId: data.wabaId,
            phoneNumberId: data.phoneNumberId,
            displayPhoneNumber: data.displayPhoneNumber,
            accessToken: data.accessToken,
            status: 'active',
          },
        }),
    );
  });

  const deleteIntegration = Effect.fn('WhatsappRepo.deleteIntegration')(function* (
    scope: FirmScope,
  ) {
    yield* db.use((d) =>
      d.delete(whatsappIntegration).where(eq(whatsappIntegration.accountingFirmId, scope)),
    );
  });

  const getIntegrationByTenantId = Effect.fn('WhatsappRepo.getIntegrationByTenantId')(function* (
    tenantId: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select()
        .from(whatsappIntegration)
        .where(eq(whatsappIntegration.accountingFirmId, tenantId))
        .limit(1),
    );

    return row;
  });

  const updateMessageDeliveryStatus = Effect.fn('WhatsappRepo.updateMessageDeliveryStatus')(
    function* (
      metaMessageId: string,
      payload: { status: 'delivered' | 'read' | 'failed'; error?: string; date?: Date },
    ) {
      const at = payload.date ?? new Date();

      yield* db.use(async (d) => {
        if (payload.status === 'delivered') {
          await d
            .update(message)
            .set({ deliveredAt: at })
            .where(eq(message.metaMessageId, metaMessageId));
        } else if (payload.status === 'read') {
          await d
            .update(message)
            .set({ readAt: at })
            .where(eq(message.metaMessageId, metaMessageId));
        } else if (payload.status === 'failed') {
          await d
            .update(message)
            .set({ status: 'failed', error: payload.error ?? 'Unknown error' })
            .where(eq(message.metaMessageId, metaMessageId));
        }
      });
    },
  );

  return {
    getIntegrationByFirm,
    getIntegrationByRequestId,
    upsertIntegration,
    deleteIntegration,
    getIntegrationByTenantId,
    updateMessageDeliveryStatus,
  };
});

export class WhatsappRepo extends Context.Service<WhatsappRepo, Effect.Success<typeof make>>()(
  'competa/api/whatsapp/WhatsappRepo',
) {
  static readonly layerNoDeps = Layer.effect(WhatsappRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
