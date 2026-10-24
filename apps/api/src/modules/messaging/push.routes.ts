import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { handler } from '../../http/envelope.js';
import { route } from '../../http/platform.js';

/** A chave pública VAPID vem da API em vez de ser compilada no bundle do front: ela só faz
 *  sentido casada com a privada que vive aqui, e um build antigo com a chave antiga produz
 *  inscrições que o navegador aceita e o servidor nunca consegue usar. Vazia = push
 *  desligado (dev, ou produção sem as chaves) e a UI não oferece o recurso. */
const vapidKey = route(
  'GET',
  '/push/vapid-key',
  handler(
    'GET',
    Effect.sync(() => ({ key: env.VAPID_PUBLIC_KEY ?? '' })),
  ),
);

export const pushRoutes = Layer.mergeAll(vapidKey);
