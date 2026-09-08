import type { INestApplication } from '@nestjs/common';
import {
  MessageProvider,
  type MessageToSend,
} from '../../../src/modules/messaging/providers/message.provider.js';

/** O canal é o único ponto que fala com fora. Em vez de montar outra app com
 *  `overrideProvider` (o repo não tem `@nestjs/testing` instalado), tomamos a instância do
 *  container e trocamos o `send`: o `MessageRepository` guarda a MESMA referência, então o
 *  dublê vale para a app real montada por `createTestApp`.
 *
 *  Deveria subir para o harness (`test/app.ts`): qualquer teste que queira ver o que saiu
 *  por email precisa disso. */
export const spyProvider = (app: INestApplication) => {
  const provider = app.get(MessageProvider, { strict: false });
  const sent: MessageToSend[] = [];
  let failWith: string | null = null;

  provider.send = async (message: MessageToSend) => {
    if (failWith) throw new Error(failWith);
    sent.push(message);
  };

  return {
    sent,
    /** provider quebrado: `send` lança, como um canal fora do ar */
    breakChannel: (reason = 'canal fora do ar') => {
      failWith = reason;
    },
    healChannel: () => {
      failWith = null;
    },
    reset: () => {
      sent.length = 0;
      failWith = null;
    },
    lastTo: (recipient: string) => sent.filter((m) => m.recipient === recipient).at(-1),
  };
};

/** Os listeners de evento são `async` e o `EventEmitter2` não espera por eles: a resposta
 *  HTTP pode chegar antes da linha em `message`. Esperar a condição (em vez de dormir um
 *  tempo fixo) é o que mantém o teste determinístico.
 *
 *  Deveria subir para o harness: todo teste que observa efeito de evento precisa. */
export const waitFor = async <T>(
  check: () => Promise<T | undefined | null | false>,
  message = 'condição não aconteceu no tempo esperado',
  timeoutMs = 5_000,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const result = await check();
    if (result) return result;
    if (Date.now() > deadline) throw new Error(`waitFor: ${message}`);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
};
