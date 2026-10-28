import { whatsappOnboardSchema, whatsappTestSendSchema } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, route } from '../../http/platform.js';
import { AccountantsRepo } from '../auth/accountant.repo.js';
import { OnlyOwnerCanManageTeam } from '../auth/errors.js';
import type { FirmScope } from '../auth/scope.js';
import { MockWhatsappProvider } from '../messaging/providers/mock-whatsapp.provider.js';
import { WhatsappProvider } from '../messaging/providers/whatsapp.provider.js';
import { WhatsappCryptoService } from './whatsapp-crypto.service.js';
import { WhatsappRepo } from './whatsapp.repo.js';

/* As mesmas instâncias que o `WhatsappModule` montava, com a mesma escolha por NODE_ENV e o
 * crypto como singleton compartilhado com o provider de produção. Bug congelado #11: sem
 * `WHATSAPP_ENCRYPTION_KEY` o crypto cai numa chave de zeros conhecida — não tocar. */
const crypto = new WhatsappCryptoService();
const whatsapp =
  env.NODE_ENV === 'production' ? new WhatsappProvider(crypto) : new MockWhatsappProvider();

/* Stub do Embedded Signup: o `code` recebido nunca é trocado por token na Meta — o que vai
 * para o banco é credencial mock, com ou sem META_APP_ID/META_APP_SECRET no ambiente. */
const MOCK_INTEGRATION = {
  accessToken: 'mock_long_lived_token',
  wabaId: 'mock_waba_id',
  phoneNumberId: 'mock_phone_number_id',
  displayPhoneNumber: '5511999999999',
} as const;

const integrationOf = (scope: FirmScope) =>
  WhatsappRepo.use((repo) => repo.getIntegrationByFirm(scope));

/** `requireOwner` do controller: conectar e desconectar são atos do dono. */
const requireOwner = (scope: FirmScope, authUserId: string) =>
  Effect.gen(function* () {
    const owner = yield* AccountantsRepo.use((repo) => repo.isOwner(scope, authUserId));
    if (!owner) return yield* Effect.fail(new OnlyOwnerCanManageTeam());
  });

const getStatus = route(
  'GET',
  '/whatsapp/status',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      const integration = yield* integrationOf(scope);
      if (!integration) return { status: 'not_connected' };

      return {
        status: integration.status,
        displayPhoneNumber: integration.displayPhoneNumber,
        wabaId: integration.wabaId,
      };
    }),
  ),
  { auth: firmRoute() },
);

const onboard = route(
  'POST',
  '/whatsapp/onboard',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;
      /* O `code` é validado (422 quando falta) e descartado. O `@Body` do Nest corria antes
       * do corpo do método, então corpo inválido vence o 403 de não-dono. */
      yield* body(whatsappOnboardSchema);

      yield* requireOwner(scope, session.user.id);

      yield* WhatsappRepo.use((repo) =>
        repo.upsertIntegration(scope, {
          ...MOCK_INTEGRATION,
          accessToken: crypto.encrypt(MOCK_INTEGRATION.accessToken),
        }),
      );

      return {
        status: 'active',
        displayPhoneNumber: MOCK_INTEGRATION.displayPhoneNumber,
        wabaId: MOCK_INTEGRATION.wabaId,
      };
    }),
  ),
  { auth: firmRoute() },
);

/** Sem `requireOwner`: qualquer membro da equipe dispara o envio de teste (quirk congelado). */
const sendTest = route(
  'POST',
  '/whatsapp/test',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const input = yield* body(whatsappTestSendSchema);

      const integration = yield* integrationOf(scope);
      /* Bug congelado #10: `Error` cru, sem status — cai no fallback 500 INTERNAL_ERROR do
       * mapa de erros, que expõe a mensagem em `details`. Deveria ser 4xx tipado. */
      if (!integration || integration.status !== 'active') {
        return yield* Effect.die(new Error('Integração não ativa'));
      }

      yield* Effect.promise(() =>
        whatsapp
          .send({
            tenantId: scope,
            recipient: input.phone,
            subject: 'Teste de Integração WhatsApp',
            body: 'Olá! Esta é uma mensagem de teste da integração do Competa. Se você a recebeu, está tudo pronto para usar.',
            purpose: 'test',
          })
          .catch((error: unknown) => {
            throw new Error('Falha no envio de teste: ' + String(error));
          }),
      );

      // o id devolvido pelo provider é descartado: o teste não grava linha em `message`
      return { success: true };
    }),
  ),
  { auth: firmRoute() },
);

const disconnect = route(
  'DELETE',
  '/whatsapp',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;

      yield* requireOwner(scope, session.user.id);

      // idempotente: sem integração o DELETE também responde 200 `{success:true}`
      yield* WhatsappRepo.use((repo) => repo.deleteIntegration(scope));

      return { success: true };
    }),
  ),
  { auth: firmRoute() },
);

export const whatsappSettingsRoutes = Layer.mergeAll(getStatus, onboard, sendTest, disconnect);
